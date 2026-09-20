import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createTemporaryDatabase, createTestContext } from "./helpers.mjs";

describe("task API", () => {
  let app;
  let db;

  beforeEach(() => {
    ({ app, db } = createTestContext());
  });

  afterEach(() => {
    db.close();
  });

  it("starts with an empty task list", async () => {
    const response = await request(app).get("/api/tasks").expect(200);

    expect(response.body).toEqual([]);
  });

  it("creates a task with existing defaults and trims its title", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .send({ title: "  Write status update  " })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(Number),
      title: "Write status update",
      description: null,
      priority: "medium",
      dueDate: null,
      estimatedMinutes: null,
      estimateSource: null,
      flexibility: "flexible",
      status: "active",
      completed: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const listResponse = await request(app).get("/api/tasks").expect(200);
    expect(listResponse.body).toEqual([response.body]);
  });

  it("round-trips all editable task fields", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({
        title: "Initial task",
        description: "Initial description",
        priority: "low",
        dueDate: "2026-09-25",
        estimatedMinutes: 25,
        estimateSource: "ai",
        flexibility: "optional",
      })
      .expect(201);

    const updated = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .send({
        title: "  Updated task  ",
        description: "Updated description",
        priority: "high",
        dueDate: "2026-09-21",
        estimatedMinutes: 40,
        estimateSource: "user",
        flexibility: "fixed",
        status: "blocked",
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: created.body.id,
      title: "Updated task",
      description: "Updated description",
      priority: "high",
      dueDate: "2026-09-21",
      estimatedMinutes: 40,
      estimateSource: "user",
      flexibility: "fixed",
      status: "blocked",
    });

    const listResponse = await request(app).get("/api/tasks").expect(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toEqual(updated.body);
  });

  it("keeps the existing status, priority, due date, and id ordering", async () => {
    const createTask = async (task) => request(app).post("/api/tasks").send(task).expect(201);

    const completed = await createTask({ title: "Completed", priority: "high" });
    const blocked = await createTask({ title: "Blocked", priority: "high" });
    await createTask({ title: "Active low", priority: "low" });
    await createTask({
      title: "Active high later",
      priority: "high",
      dueDate: "2026-09-30",
    });
    await createTask({
      title: "Active high sooner",
      priority: "high",
      dueDate: "2026-09-21",
    });
    await createTask({ title: "Active medium older", priority: "medium" });
    await createTask({ title: "Active medium newer", priority: "medium" });

    await request(app)
      .patch(`/api/tasks/${completed.body.id}`)
      .send({ status: "completed" })
      .expect(200);
    await request(app)
      .patch(`/api/tasks/${blocked.body.id}`)
      .send({ status: "blocked" })
      .expect(200);

    const response = await request(app).get("/api/tasks").expect(200);

    expect(response.body.map((task) => task.title)).toEqual([
      "Active high sooner",
      "Active high later",
      "Active medium newer",
      "Active medium older",
      "Active low",
      "Blocked",
      "Completed",
    ]);
  });

  it.each([
    [undefined, "missing"],
    [null, "null"],
    ["   ", "blank"],
  ])("rejects a %s title when creating a task", async (title) => {
    const body = title === undefined ? {} : { title };
    const response = await request(app).post("/api/tasks").send(body).expect(400);

    expect(response.body).toEqual({ error: "Title is required" });
  });

  it("rejects a blank title when updating a task", async () => {
    const created = await request(app).post("/api/tasks").send({ title: "Keep me" }).expect(201);

    const response = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .send({ title: " " })
      .expect(400);

    expect(response.body).toEqual({ error: "Title is required" });
    const stored = await request(app).get("/api/tasks").expect(200);
    expect(stored.body[0].title).toBe("Keep me");
  });

  it.each([
    ["priority", { priority: "urgent" }, "priority must be low, medium, or high"],
    [
      "flexibility",
      { flexibility: "rigid" },
      "flexibility must be fixed, important, flexible, or optional",
    ],
    ["estimate source", { estimateSource: "machine" }, "estimateSource must be ai, user, or null"],
    [
      "negative estimate",
      { estimatedMinutes: -1 },
      "estimatedMinutes must be a non-negative integer or null",
    ],
    [
      "fractional estimate",
      { estimatedMinutes: 1.5 },
      "estimatedMinutes must be a non-negative integer or null",
    ],
  ])("rejects invalid %s values without creating a task", async (label, fields, error) => {
    const response = await request(app)
      .post("/api/tasks")
      .send({ title: `Invalid ${label}`, ...fields })
      .expect(400)
      .expect("Content-Type", /json/);

    expect(response.body).toEqual({ error });
    expect((await request(app).get("/api/tasks")).body).toEqual([]);
  });

  it("rejects invalid task updates and preserves stored values", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({ title: "Stable task" })
      .expect(201);

    for (const [payload, error] of [
      [{ status: "cancelled" }, "status must be active, completed, or blocked"],
      [{ estimatedMinutes: -5 }, "estimatedMinutes must be a non-negative integer or null"],
      [{ completed: "yes" }, "completed must be a boolean"],
    ]) {
      const response = await request(app)
        .patch(`/api/tasks/${created.body.id}`)
        .send(payload)
        .expect(400);
      expect(response.body).toEqual({ error });
    }

    const stored = await request(app).get("/api/tasks").expect(200);
    expect(stored.body[0]).toMatchObject({
      status: "active",
      completed: false,
      estimatedMinutes: null,
    });
  });

  it("supports the deprecated completed update alias while status takes precedence", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({ title: "Compatibility task" })
      .expect(201);

    const completed = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .send({ completed: true })
      .expect(200);
    expect(completed.body).toMatchObject({ status: "completed", completed: true });

    const blocked = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .send({ status: "blocked", completed: true })
      .expect(200);
    expect(blocked.body).toMatchObject({ status: "blocked", completed: false });
  });

  it("returns a generic JSON 500 without leaking SQLite details", async () => {
    db.exec(`
      CREATE TRIGGER reject_task_insert
      BEFORE INSERT ON tasks
      BEGIN
        SELECT RAISE(ABORT, 'secret sqlite path detail');
      END
    `);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await request(app)
        .post("/api/tasks")
        .send({ title: "Trigger an internal error" })
        .expect(500)
        .expect("Content-Type", /json/);

      expect(response.body).toEqual({ error: "Internal server error" });
      expect(JSON.stringify(response.body)).not.toContain("secret sqlite path detail");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns the existing not-found errors", async () => {
    const updateResponse = await request(app)
      .patch("/api/tasks/99999")
      .send({ title: "Missing" })
      .expect(404);
    expect(updateResponse.body).toEqual({ error: "Task not found" });

    const deleteResponse = await request(app).delete("/api/tasks/99999").expect(404);
    expect(deleteResponse.body).toEqual({ error: "Task not found" });
  });

  it("deletes a task and leaves the list empty", async () => {
    const created = await request(app).post("/api/tasks").send({ title: "Delete me" }).expect(201);

    await request(app).delete(`/api/tasks/${created.body.id}`).expect(204);

    const listResponse = await request(app).get("/api/tasks").expect(200);
    expect(listResponse.body).toEqual([]);
  });
});

describe("task database persistence", () => {
  it("retains task changes after a temporary database is closed and reopened", async () => {
    const temporary = createTemporaryDatabase();
    let firstDb;
    let reopenedDb;

    try {
      const firstContext = createTestContext(temporary.databasePath);
      firstDb = firstContext.db;

      const created = await request(firstContext.app)
        .post("/api/tasks")
        .send({
          title: "Persistent task",
          estimatedMinutes: 50,
          estimateSource: "user",
          flexibility: "important",
        })
        .expect(201);

      await request(firstContext.app)
        .patch(`/api/tasks/${created.body.id}`)
        .send({ status: "completed" })
        .expect(200);

      firstDb.close();
      firstDb = undefined;

      const reopenedContext = createTestContext(temporary.databasePath);
      reopenedDb = reopenedContext.db;
      const response = await request(reopenedContext.app).get("/api/tasks").expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: created.body.id,
        title: "Persistent task",
        estimatedMinutes: 50,
        estimateSource: "user",
        flexibility: "important",
        status: "completed",
      });
    } finally {
      if (firstDb?.open) firstDb.close();
      if (reopenedDb?.open) reopenedDb.close();
      temporary.cleanup();
    }
  });
});
