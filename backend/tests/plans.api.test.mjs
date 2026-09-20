import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  createTemporaryDatabase,
  createTestContext,
  insertPlan,
  insertPlanItem,
  todayLocal,
} from "./helpers.mjs";

describe("plan API", () => {
  let app;
  let db;

  beforeEach(() => {
    ({ app, db } = createTestContext());
  });

  afterEach(() => {
    db.close();
  });

  it("returns null when no plan is saved for today", async () => {
    const response = await request(app).get("/api/plans/today").expect(200);

    expect(response.body).toBeNull();
  });

  it("rejects missing or blank plan input", async () => {
    for (const body of [{}, { inputText: null }, { inputText: "   " }]) {
      const response = await request(app).post("/api/plans/generate").send(body).expect(400);

      expect(response.body).toEqual({ error: "inputText is required" });
    }
  });

  it("generates and returns the current saved plan without changing its contract", async () => {
    const generated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  Finish the release and plan tomorrow  " })
      .expect(201);

    expect(generated.body).toEqual({
      id: expect.any(Number),
      planDate: todayLocal(),
      inputText: "Finish the release and plan tomorrow",
      workloadEstimateMinutes: 135,
      createdAt: expect.any(String),
      items: [
        {
          id: expect.any(Number),
          taskId: expect.any(Number),
          title: "Work on your most urgent task",
          detail: "Start with the closest important deadline.",
          estimatedMinutes: 60,
          actualMinutes: null,
          estimateSource: "ai",
          userModified: false,
          position: 1,
          status: "planned",
          completed: false,
          reason: "Urgent work should receive attention first.",
        },
        {
          id: expect.any(Number),
          taskId: expect.any(Number),
          title: "Continue an important ongoing task",
          detail: "Make measurable progress without overloading the day.",
          estimatedMinutes: 45,
          actualMinutes: null,
          estimateSource: "ai",
          userModified: false,
          position: 2,
          status: "planned",
          completed: false,
          reason: "Keeps longer-term work moving.",
        },
        {
          id: expect.any(Number),
          taskId: expect.any(Number),
          title: "Review and prepare for tomorrow",
          detail: "Finish with a short review of upcoming commitments.",
          estimatedMinutes: 30,
          actualMinutes: null,
          estimateSource: "ai",
          userModified: false,
          position: 3,
          status: "planned",
          completed: false,
          reason: "Reduces tomorrow's planning pressure.",
        },
      ],
    });

    const todayResponse = await request(app).get("/api/plans/today").expect(200);
    expect(todayResponse.body).toEqual(generated.body);

    const tasks = db
      .prepare(
        `
        SELECT
          id,
          title,
          estimated_minutes,
          estimate_source,
          priority,
          flexibility,
          status
        FROM tasks
        ORDER BY id ASC
      `,
      )
      .all();

    expect(tasks).toEqual([
      {
        id: generated.body.items[0].taskId,
        title: "Work on your most urgent task",
        estimated_minutes: 60,
        estimate_source: "ai",
        priority: "medium",
        flexibility: "flexible",
        status: "active",
      },
      {
        id: generated.body.items[1].taskId,
        title: "Continue an important ongoing task",
        estimated_minutes: 45,
        estimate_source: "ai",
        priority: "medium",
        flexibility: "flexible",
        status: "active",
      },
      {
        id: generated.body.items[2].taskId,
        title: "Review and prepare for tomorrow",
        estimated_minutes: 30,
        estimate_source: "ai",
        priority: "medium",
        flexibility: "flexible",
        status: "active",
      },
    ]);
    expect(new Set(generated.body.items.map((item) => item.taskId)).size).toBe(3);
  });

  it("reuses a matching non-completed task without overwriting user fields", async () => {
    const existingTask = db
      .prepare(
        `
        INSERT INTO tasks (
          title,
          priority,
          estimated_minutes,
          estimate_source,
          flexibility,
          status,
          created_at,
          updated_at
        )
        VALUES (?, 'high', 95, 'user', 'important', 'blocked', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      )
      .run("  WORK ON YOUR MOST URGENT TASK  ");
    const existingTaskId = Number(existingTask.lastInsertRowid);

    const generated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Reuse existing work" })
      .expect(201);

    expect(generated.body.items[0].taskId).toBe(existingTaskId);
    expect(generated.body.items.every((item) => Number.isInteger(item.taskId))).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS count FROM tasks").get()).toEqual({
      count: 3,
    });
    expect(
      db
        .prepare(
          `
          SELECT priority, estimated_minutes, estimate_source, flexibility, status
          FROM tasks
          WHERE id = ?
        `,
        )
        .get(existingTaskId),
    ).toEqual({
      priority: "high",
      estimated_minutes: 95,
      estimate_source: "user",
      flexibility: "important",
      status: "blocked",
    });
  });

  it("does not reuse a completed task with a matching normalized title", async () => {
    const completedTask = db
      .prepare(
        `
        INSERT INTO tasks (
          title,
          priority,
          flexibility,
          status,
          created_at,
          updated_at
        )
        VALUES (?, 'medium', 'flexible', 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      )
      .run("Work on your most urgent task");
    const completedTaskId = Number(completedTask.lastInsertRowid);

    const generated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Create active work" })
      .expect(201);

    expect(generated.body.items[0].taskId).not.toBe(completedTaskId);
    expect(db.prepare("SELECT COUNT(*) AS count FROM tasks").get()).toEqual({
      count: 4,
    });
    expect(
      db
        .prepare("SELECT title, status FROM tasks WHERE id = ?")
        .get(generated.body.items[0].taskId),
    ).toEqual({
      title: "Work on your most urgent task",
      status: "active",
    });
  });

  it("returns the latest same-day plan for the same normalized input without growing history", async () => {
    const first = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  Finish The Release  " })
      .expect(201);

    const repeated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "finish the release" })
      .expect(200);

    expect(repeated.body).toEqual(first.body);
    expect(first.body.inputText).toBe("Finish The Release");
    expect(db.prepare("SELECT COUNT(*) AS count FROM plans").get()).toEqual({
      count: 1,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM plan_items").get()).toEqual({
      count: 3,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM tasks").get()).toEqual({
      count: 3,
    });

    const history = await request(app).get("/api/plans/history").expect(200);
    expect(history.body).toEqual([first.body]);
  });

  it("creates a new same-day plan when the normalized input is different", async () => {
    const first = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Finish the release" })
      .expect(201);

    const second = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Plan tomorrow" })
      .expect(201);

    expect(second.body.id).not.toBe(first.body.id);
    expect(db.prepare("SELECT COUNT(*) AS count FROM plans").get()).toEqual({
      count: 2,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM plan_items").get()).toEqual({
      count: 6,
    });

    const history = await request(app).get("/api/plans/history").expect(200);
    expect(history.body).toHaveLength(2);
  });

  it("creates a new plan for the same normalized input on a different day", async () => {
    const previousPlanId = insertPlan(db, {
      planDate: "2000-01-01",
      inputText: "Finish The Release",
      createdAt: "2000-01-01 08:00:00",
    });
    insertPlanItem(db, previousPlanId, {
      title: "Previous-day item",
    });

    const generated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  finish the release  " })
      .expect(201);

    expect(generated.body.id).not.toBe(previousPlanId);
    expect(generated.body.planDate).toBe(todayLocal());
    expect(db.prepare("SELECT COUNT(*) AS count FROM plans").get()).toEqual({
      count: 2,
    });

    const history = await request(app).get("/api/plans/history").expect(200);
    expect(history.body).toHaveLength(2);
  });

  it("returns the latest plan for today and ignores plans from other dates", async () => {
    insertPlan(db, {
      planDate: "2000-01-01",
      inputText: "Other date",
      createdAt: "2099-01-01 00:00:00",
    });
    insertPlan(db, {
      inputText: "Older today",
      createdAt: "2026-01-01 08:00:00",
    });
    const firstLatestId = insertPlan(db, {
      inputText: "First at latest timestamp",
      createdAt: "2026-01-01 10:00:00",
    });
    const latestId = insertPlan(db, {
      inputText: "Latest today",
      createdAt: "2026-01-01 10:00:00",
    });
    insertPlanItem(db, firstLatestId, { title: "Not selected" });
    insertPlanItem(db, latestId, { title: "Selected item" });

    const response = await request(app).get("/api/plans/today").expect(200);

    expect(response.body).toMatchObject({
      id: latestId,
      planDate: todayLocal(),
      inputText: "Latest today",
    });
    expect(response.body.items.map((item) => item.title)).toEqual(["Selected item"]);
  });

  it("returns full plan item content ordered by position", async () => {
    const planId = insertPlan(db, {
      inputText: "Content contract",
      workloadEstimateMinutes: 75,
    });
    const secondId = insertPlanItem(db, planId, {
      taskId: null,
      title: "Second item",
      detail: null,
      estimatedMinutes: null,
      actualMinutes: 12,
      estimateSource: null,
      userModified: 1,
      position: 2,
      status: "partial",
      reason: null,
    });
    const firstId = insertPlanItem(db, planId, {
      title: "First item",
      detail: "Details",
      estimatedMinutes: 75,
      actualMinutes: 70,
      estimateSource: "user",
      userModified: 1,
      position: 1,
      status: "completed",
      reason: "Important",
    });

    const response = await request(app).get("/api/plans/today").expect(200);

    expect(response.body.items).toEqual([
      {
        id: firstId,
        taskId: null,
        title: "First item",
        detail: "Details",
        estimatedMinutes: 75,
        actualMinutes: 70,
        estimateSource: "user",
        userModified: true,
        position: 1,
        status: "completed",
        completed: true,
        reason: "Important",
      },
      {
        id: secondId,
        taskId: null,
        title: "Second item",
        detail: null,
        estimatedMinutes: null,
        actualMinutes: 12,
        estimateSource: null,
        userModified: true,
        position: 2,
        status: "partial",
        completed: false,
        reason: null,
      },
    ]);
  });

  it.each(["planned", "completed", "partial", "skipped", "moved", "blocked"])(
    "persists the %s plan item status in today and history",
    async (status) => {
      const generated = await request(app)
        .post("/api/plans/generate")
        .send({ inputText: `Status ${status}` })
        .expect(201);
      const itemId = generated.body.items[0].id;

      const updated = await request(app)
        .patch(`/api/plan-items/${itemId}`)
        .send({ status })
        .expect(200);

      expect(updated.body.status).toBe(status);

      const todayResponse = await request(app).get("/api/plans/today").expect(200);
      expect(todayResponse.body.items[0].status).toBe(status);

      const historyResponse = await request(app).get("/api/plans/history").expect(200);
      expect(historyResponse.body[0].items[0].status).toBe(status);
    },
  );

  it("persists actual time and marks user-edited estimates as user modified", async () => {
    const generated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Estimate metadata" })
      .expect(201);
    const itemId = generated.body.items[0].id;

    const actualTimeUpdate = await request(app)
      .patch(`/api/plan-items/${itemId}`)
      .send({ actualMinutes: 42 })
      .expect(200);
    expect(actualTimeUpdate.body).toMatchObject({
      actualMinutes: 42,
      estimatedMinutes: 60,
      estimateSource: "ai",
      userModified: false,
    });

    const estimateUpdate = await request(app)
      .patch(`/api/plan-items/${itemId}`)
      .send({ estimatedMinutes: 75 })
      .expect(200);
    expect(estimateUpdate.body).toMatchObject({
      actualMinutes: 42,
      estimatedMinutes: 75,
      estimateSource: "user",
      userModified: true,
    });

    const todayResponse = await request(app).get("/api/plans/today").expect(200);
    expect(todayResponse.body.items[0]).toMatchObject({
      actualMinutes: 42,
      estimatedMinutes: 75,
      estimateSource: "user",
      userModified: true,
    });
  });

  it.each([
    [
      { status: "cancelled" },
      "status must be planned, completed, partial, skipped, moved, or blocked",
    ],
    [{ estimatedMinutes: -1 }, "estimatedMinutes must be a non-negative integer or null"],
    [{ estimatedMinutes: 1.5 }, "estimatedMinutes must be a non-negative integer or null"],
    [{ actualMinutes: -1 }, "actualMinutes must be a non-negative integer or null"],
    [{ actualMinutes: "12" }, "actualMinutes must be a non-negative integer or null"],
  ])("rejects invalid plan-item updates without changing data", async (payload, error) => {
    const generated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Keep this item valid" })
      .expect(201);
    const itemId = generated.body.items[0].id;

    const response = await request(app)
      .patch(`/api/plan-items/${itemId}`)
      .send(payload)
      .expect(400)
      .expect("Content-Type", /json/);

    expect(response.body).toEqual({ error });

    const todayResponse = await request(app).get("/api/plans/today").expect(200);
    expect(todayResponse.body.items[0]).toMatchObject({
      status: "planned",
      completed: false,
      estimatedMinutes: 60,
      actualMinutes: null,
    });
  });

  it("returns the existing missing-plan-item error", async () => {
    const response = await request(app)
      .patch("/api/plan-items/99999")
      .send({ status: "completed" })
      .expect(404);

    expect(response.body).toEqual({ error: "Plan item not found" });
  });
});

describe("plan history API", () => {
  let app;
  let db;

  beforeEach(() => {
    ({ app, db } = createTestContext());
  });

  afterEach(() => {
    db.close();
  });

  it("starts with empty history", async () => {
    const response = await request(app).get("/api/plans/history").expect(200);
    expect(response.body).toEqual([]);
  });

  it("deletes only the selected plan and its dependent rows while retaining linked tasks", async () => {
    const taskResult = db
      .prepare(
        `
        INSERT INTO tasks (
          title,
          priority,
          flexibility,
          status,
          created_at,
          updated_at
        )
        VALUES (?, 'medium', 'flexible', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      )
      .run("Shared linked task");
    const taskId = Number(taskResult.lastInsertRowid);

    const deletedPlanId = insertPlan(db, {
      planDate: "2026-09-19",
      inputText: "Delete this plan",
    });
    const retainedPlanId = insertPlan(db, {
      planDate: "2026-09-18",
      inputText: "Keep this plan",
    });
    const deletedItemId = insertPlanItem(db, deletedPlanId, {
      taskId,
      title: "Deleted plan item",
    });
    const retainedItemId = insertPlanItem(db, retainedPlanId, {
      taskId,
      title: "Retained plan item",
    });

    db.prepare(
      `
      INSERT INTO daily_reviews (plan_id, workload_rating, note)
      VALUES (?, 'about_right', ?)
    `,
    ).run(deletedPlanId, "Delete this review");
    db.prepare(
      `
      INSERT INTO daily_reviews (plan_id, workload_rating, note)
      VALUES (?, 'too_light', ?)
    `,
    ).run(retainedPlanId, "Keep this review");

    await request(app).delete(`/api/plans/${deletedPlanId}`).expect(204);

    expect(db.prepare("SELECT id FROM plans WHERE id = ?").get(deletedPlanId)).toBeUndefined();
    expect(db.prepare("SELECT id FROM plan_items WHERE id = ?").get(deletedItemId)).toBeUndefined();
    expect(
      db.prepare("SELECT id FROM daily_reviews WHERE plan_id = ?").get(deletedPlanId),
    ).toBeUndefined();

    expect(db.prepare("SELECT id FROM tasks WHERE id = ?").get(taskId)).toEqual({ id: taskId });
    expect(db.prepare("SELECT id FROM plans WHERE id = ?").get(retainedPlanId)).toEqual({
      id: retainedPlanId,
    });
    expect(db.prepare("SELECT id FROM plan_items WHERE id = ?").get(retainedItemId)).toEqual({
      id: retainedItemId,
    });
    expect(
      db.prepare("SELECT note FROM daily_reviews WHERE plan_id = ?").get(retainedPlanId),
    ).toEqual({ note: "Keep this review" });

    const history = await request(app).get("/api/plans/history").expect(200);
    expect(history.body.map((plan) => plan.id)).toEqual([retainedPlanId]);
  });

  it("returns JSON 404 when deleting an unknown plan", async () => {
    const response = await request(app)
      .delete("/api/plans/99999")
      .expect(404)
      .expect("Content-Type", /json/);

    expect(response.body).toEqual({ error: "Plan not found" });
  });

  it("orders history by date, timestamp, and id", async () => {
    const newestDateId = insertPlan(db, {
      planDate: "2026-09-20",
      inputText: "Newest date",
      createdAt: "2026-01-01 08:00:00",
    });
    insertPlan(db, {
      planDate: "2026-09-19",
      inputText: "Older timestamp",
      createdAt: "2026-01-01 08:00:00",
    });
    const firstTieId = insertPlan(db, {
      planDate: "2026-09-19",
      inputText: "First tie",
      createdAt: "2026-01-01 10:00:00",
    });
    const lastTieId = insertPlan(db, {
      planDate: "2026-09-19",
      inputText: "Last tie",
      createdAt: "2026-01-01 10:00:00",
    });

    const response = await request(app).get("/api/plans/history").expect(200);

    expect(response.body.map((plan) => plan.id)).toEqual([
      newestDateId,
      lastTieId,
      firstTieId,
      expect.any(Number),
    ]);
  });

  it("returns only the latest 30 plans with each plan's ordered items", async () => {
    const planIds = [];
    for (let day = 1; day <= 32; day += 1) {
      planIds.push(
        insertPlan(db, {
          planDate: `2026-08-${String(day).padStart(2, "0")}`,
          inputText: `Plan ${day}`,
          workloadEstimateMinutes: day,
          createdAt: "2026-01-01 09:00:00",
        }),
      );
    }

    insertPlanItem(db, planIds[31], { title: "Position two", position: 2 });
    insertPlanItem(db, planIds[31], {
      title: "Position one",
      position: 1,
      status: "blocked",
    });

    const response = await request(app).get("/api/plans/history").expect(200);

    expect(response.body).toHaveLength(30);
    expect(response.body.map((plan) => plan.inputText)).toEqual(
      Array.from({ length: 30 }, (_, index) => `Plan ${32 - index}`),
    );
    expect(response.body[0].items.map((item) => item.title)).toEqual([
      "Position one",
      "Position two",
    ]);
    expect(response.body[0].items[0].status).toBe("blocked");
    expect(response.body.some((plan) => plan.inputText === "Plan 2")).toBe(false);
    expect(response.body.some((plan) => plan.inputText === "Plan 1")).toBe(false);
  });
});

describe("saved plan database persistence", () => {
  it("retains plan item status and estimate metadata after a temporary database reopen", async () => {
    const temporary = createTemporaryDatabase();
    let firstDb;
    let reopenedDb;

    try {
      const firstContext = createTestContext(temporary.databasePath);
      firstDb = firstContext.db;
      const generated = await request(firstContext.app)
        .post("/api/plans/generate")
        .send({ inputText: "Persist this plan" })
        .expect(201);
      const itemId = generated.body.items[0].id;

      await request(firstContext.app)
        .patch(`/api/plan-items/${itemId}`)
        .send({
          status: "partial",
          estimatedMinutes: 80,
          actualMinutes: 35,
        })
        .expect(200);

      firstDb.close();
      firstDb = undefined;

      const reopenedContext = createTestContext(temporary.databasePath);
      reopenedDb = reopenedContext.db;
      const todayResponse = await request(reopenedContext.app).get("/api/plans/today").expect(200);
      const historyResponse = await request(reopenedContext.app)
        .get("/api/plans/history")
        .expect(200);

      expect(todayResponse.body.inputText).toBe("Persist this plan");
      expect(todayResponse.body.items[0]).toMatchObject({
        id: itemId,
        status: "partial",
        estimatedMinutes: 80,
        actualMinutes: 35,
        estimateSource: "user",
        userModified: true,
      });
      expect(historyResponse.body).toEqual([todayResponse.body]);
    } finally {
      if (firstDb?.open) firstDb.close();
      if (reopenedDb?.open) reopenedDb.close();
      temporary.cleanup();
    }
  });
});
