import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import {
  createDeterministicAiService,
  createTestContext,
  deterministicPlan,
  insertPlan,
  todayLocal,
} from "./helpers.mjs";
const require = createRequire(import.meta.url);
const { createGeminiAiProvider } = require("../services/geminiAiProvider");
const {
  MAX_PLANNER_CONTEXT_BYTES,
  MAX_PLANNING_TASKS,
  NEAR_TERM_DUE_DAYS,
} = require("../services/planningContext");

function tableCounts(db) {
  return {
    plans: db.prepare("SELECT COUNT(*) AS count FROM plans").get().count,
    planItems: db.prepare("SELECT COUNT(*) AS count FROM plan_items").get().count,
    tasks: db.prepare("SELECT COUNT(*) AS count FROM tasks").get().count,
  };
}

describe("AI-backed plan generation", () => {
  const databases = [];

  afterEach(() => {
    while (databases.length > 0) {
      const db = databases.pop();
      if (db?.open) db.close();
    }
    vi.restoreAllMocks();
  });

  function contextWith(aiService) {
    const context = createTestContext(":memory:", { aiService });
    databases.push(context.db);
    return context;
  }

  it("stores a valid structured response and creates tasks only for actionable items", async () => {
    const { app, db } = contextWith(
      createDeterministicAiService({
        items: [
          {
            title: "Draft the launch note",
            detail: "Write a concise first draft.",
            estimatedMinutes: 40,
            createsTask: true,
            reason: "Moves the launch forward.",
          },
          {
            title: "Take a short break",
            detail: "Step away before the next focus block.",
            estimatedMinutes: 10,
            createsTask: false,
            reason: "Creates a sustainable pace.",
          },
        ],
      }),
    );

    const response = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  Prepare the launch  " })
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(Number),
      inputText: "Prepare the launch",
      workloadEstimateMinutes: 50,
      createdAt: expect.any(String),
      items: [
        {
          id: expect.any(Number),
          taskId: expect.any(Number),
          title: "Draft the launch note",
          detail: "Write a concise first draft.",
          estimatedMinutes: 40,
          actualMinutes: null,
          estimateSource: "ai",
          userModified: false,
          position: 1,
          status: "planned",
          completed: false,
          reason: "Moves the launch forward.",
        },
        {
          id: expect.any(Number),
          taskId: null,
          title: "Take a short break",
          detail: "Step away before the next focus block.",
          estimatedMinutes: 10,
          actualMinutes: null,
          estimateSource: "ai",
          userModified: false,
          position: 2,
          status: "planned",
          completed: false,
          reason: "Creates a sustainable pace.",
        },
      ],
    });
    expect(db.prepare("SELECT title FROM tasks").all()).toEqual([
      { title: "Draft the launch note" },
    ]);
    expect(tableCounts(db)).toEqual({ plans: 1, planItems: 2, tasks: 1 });
  });

  it("reuses an active matching task but never reuses a completed matching task", async () => {
    const { app, db } = contextWith(
      createDeterministicAiService({
        items: [
          {
            title: "  REUSE THIS TASK  ",
            detail: "Use the current task.",
            estimatedMinutes: 25,
            createsTask: true,
            reason: "It is already active.",
          },
          {
            title: "Completed title",
            detail: "Create fresh actionable work.",
            estimatedMinutes: 20,
            createsTask: true,
            reason: "Completed work should stay complete.",
          },
        ],
      }),
    );
    const activeId = Number(
      db
        .prepare(
          "INSERT INTO tasks (title, priority, flexibility, status) VALUES (?, 'high', 'fixed', 'active')",
        )
        .run("Reuse this task").lastInsertRowid,
    );
    const completedId = Number(
      db
        .prepare(
          "INSERT INTO tasks (title, priority, flexibility, status) VALUES (?, 'medium', 'flexible', 'completed')",
        )
        .run("Completed title").lastInsertRowid,
    );

    const response = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Respect task lifecycle" })
      .expect(201);

    expect(response.body.items[0].taskId).toBe(activeId);
    expect(response.body.items[1].taskId).not.toBe(completedId);
    expect(db.prepare("SELECT COUNT(*) AS count FROM tasks").get()).toEqual({ count: 3 });
  });

  it.each([
    ["missing items", {}],
    [
      "missing createsTask",
      {
        items: [
          {
            title: "Invalid item",
            detail: "Missing a required field.",
            estimatedMinutes: 15,
            reason: "Invalid.",
          },
        ],
      },
    ],
    [
      "negative estimate",
      {
        items: [
          {
            title: "Invalid estimate",
            detail: "Negative time is invalid.",
            estimatedMinutes: -1,
            createsTask: true,
            reason: "Invalid.",
          },
        ],
      },
    ],
    [
      "unexpected field",
      {
        items: [
          {
            title: "Extra data",
            detail: "Contains an unapproved field.",
            estimatedMinutes: 15,
            createsTask: true,
            reason: "Invalid.",
            internalId: 42,
          },
        ],
      },
    ],
  ])("rejects malformed AI output (%s) without partial writes", async (_label, output) => {
    const { app, db } = contextWith(createDeterministicAiService(output));

    const response = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Do not store malformed output" })
      .expect(502);

    expect(response.body).toEqual({ error: "AI planner returned an invalid response" });
    expect(tableCounts(db)).toEqual({ plans: 0, planItems: 0, tasks: 0 });
  });

  it("returns a safe provider error and writes nothing when generation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, db } = contextWith({
      async generateStructured() {
        throw new Error("provider details must not reach the client");
      },
    });

    const response = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Provider failure" })
      .expect(503);

    expect(response.body).toEqual({ error: "AI planner is temporarily unavailable" });
    expect(JSON.stringify(response.body)).not.toContain("provider details");
    expect(tableCounts(db)).toEqual({ plans: 0, planItems: 0, tasks: 0 });
  });

  it("writes nothing when the Gemini request times out, even if the provider resolves later", async () => {
    let resolveProvider;
    const providerResult = new Promise((resolve) => {
      resolveProvider = resolve;
    });
    const aiService = createGeminiAiProvider({
      client: {
        interactions: {
          create() {
            return providerResult;
          },
        },
      },
      timeoutMs: 10,
    });
    const { app, db } = contextWith(aiService);

    const response = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Do not persist a timed-out plan" })
      .expect(503);

    expect(response.body).toEqual({ error: "AI planner is temporarily unavailable" });
    expect(tableCounts(db)).toEqual({ plans: 0, planItems: 0, tasks: 0 });

    resolveProvider({ output_text: JSON.stringify(deterministicPlan) });
    await new Promise((resolve) => setImmediate(resolve));
    expect(tableCounts(db)).toEqual({ plans: 0, planItems: 0, tasks: 0 });
  });

  it("sends only bounded active and blocked task context to the provider", async () => {
    let receivedRequest;
    const { app, db } = contextWith({
      async generateStructured(request) {
        receivedRequest = request;
        return structuredClone(deterministicPlan);
      },
    });

    const insertTask = db.prepare(`
      INSERT INTO tasks (
        title, description, priority, due_date, estimated_minutes,
        estimate_source, flexibility, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, ?)
    `);
    insertTask.run(
      "Active bounded task",
      "Private active description",
      "high",
      "2026-10-01",
      35,
      "fixed",
      "active",
      "2000-01-01 01:02:03",
      "2000-01-02 01:02:03",
    );
    insertTask.run(
      "Blocked bounded task",
      "Private blocked description",
      "low",
      null,
      null,
      "optional",
      "blocked",
      "2000-01-03 01:02:03",
      "2000-01-04 01:02:03",
    );
    insertTask.run(
      "Completed secret task",
      "Must never be sent",
      "medium",
      "2026-10-02",
      60,
      "flexible",
      "completed",
      "2000-01-05 01:02:03",
      "2000-01-06 01:02:03",
    );
    insertPlan(db, { inputText: "Private historical plan" });

    await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  Plan with bounded context  " })
      .expect(201);

    expect(Object.keys(receivedRequest).sort()).toEqual([
      "input",
      "responseSchema",
      "systemInstruction",
    ]);
    expect(receivedRequest.systemInstruction).toContain("DayPlan suggests; the user decides.");
    expect(receivedRequest.responseSchema).toMatchObject({ type: "object" });
    expect(receivedRequest.input.inputText).toBe("Plan with bounded context");
    expect(receivedRequest.input.tasks).toHaveLength(2);
    expect(receivedRequest.input.tasks).toEqual(
      expect.arrayContaining([
        {
          title: "Active bounded task",
          status: "active",
          priority: "high",
          dueDate: "2026-10-01",
          estimatedMinutes: 35,
          flexibility: "fixed",
        },
        {
          title: "Blocked bounded task",
          status: "blocked",
          priority: "low",
          dueDate: null,
          estimatedMinutes: null,
          flexibility: "optional",
        },
      ]),
    );
    expect(Object.keys(receivedRequest.input).sort()).toEqual(["inputText", "tasks"]);
    for (const task of receivedRequest.input.tasks) {
      expect(Object.keys(task).sort()).toEqual([
        "dueDate",
        "estimatedMinutes",
        "flexibility",
        "priority",
        "status",
        "title",
      ]);
    }
    const serialized = JSON.stringify(receivedRequest.input);
    expect(serialized).not.toContain("Completed secret task");
    expect(serialized).not.toContain("Private active description");
    expect(serialized).not.toContain("Private blocked description");
    expect(serialized).not.toContain("Private historical plan");
    expect(serialized).not.toContain("2000-01");
  });
  it("keeps overdue and near-term work first without letting far-future tasks crowd out urgent undated work", async () => {
    let receivedTasks;
    const { app, db } = contextWith({
      async generateStructured(request) {
        receivedTasks = structuredClone(request.input.tasks);
        return {
          items: [
            {
              title: "Ranking-only plan item",
              detail: "Capture context ordering without creating another task.",
              estimatedMinutes: 10,
              createsTask: false,
              reason: "Keeps the captured context isolated.",
            },
          ],
        };
      },
    });

    const currentDate = todayLocal();
    const dateOffset = db.prepare("SELECT date(?, ?) AS value");
    const nearDate = dateOffset.get(currentDate, `+${NEAR_TERM_DUE_DAYS} days`).value;
    const farDate = dateOffset.get(currentDate, "+365 days").value;
    const insertTask = db.prepare(`
      INSERT INTO tasks (title, priority, due_date, flexibility, status)
      VALUES (?, ?, ?, 'flexible', ?)
    `);

    const overdueTitle = "Overdue low-priority work";
    const nearTitle = "Near-term low-priority work";
    insertTask.run(overdueTitle, "low", "2000-01-01", "active");
    insertTask.run(nearTitle, "low", nearDate, "active");
    for (let index = 0; index < MAX_PLANNING_TASKS; index += 1) {
      insertTask.run(`Far-future low ${String(index).padStart(3, "0")}`, "low", farDate, "active");
    }
    const blockedTitle = "Undated high-priority blocked work";
    const activeHighTitle = "Undated high-priority active work";
    insertTask.run(activeHighTitle, "high", null, "active");
    insertTask.run(blockedTitle, "high", null, "blocked");

    await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Rank relevant work" })
      .expect(201);

    expect(receivedTasks).toHaveLength(MAX_PLANNING_TASKS);
    expect(receivedTasks.slice(0, 4).map(({ title }) => title)).toEqual([
      overdueTitle,
      nearTitle,
      blockedTitle,
      activeHighTitle,
    ]);
    expect(receivedTasks.map(({ title }) => title)).toEqual(
      expect.arrayContaining([blockedTitle, activeHighTitle]),
    );
    expect(receivedTasks.map(({ title }) => title)).not.toContain("Far-future low 099");
  });

  it("bounds oversized context deterministically and retains the most relevant tasks first", async () => {
    const receivedInputs = [];
    const { app, db } = contextWith({
      async generateStructured(request) {
        receivedInputs.push(structuredClone(request.input));
        return {
          items: [
            {
              title: "Context-only plan item",
              detail: "Avoid creating tasks that would affect the second captured context.",
              estimatedMinutes: 10,
              createsTask: false,
              reason: "Keeps both provider requests comparable.",
            },
          ],
        };
      },
    });

    const longTitle = (label) => `${label} ${"x".repeat(2_200)}`;
    const insertTask = db.prepare(`
      INSERT INTO tasks (
        title, description, priority, due_date, estimated_minutes,
        estimate_source, flexibility, status
      ) VALUES (?, 'excluded description', ?, ?, 30, 'user', 'flexible', ?)
    `);
    const dueTitle = longTitle("due-first");
    const blockedHighTitle = longTitle("blocked-high-second");
    const activeHighTitle = longTitle("active-high-third");
    insertTask.run(dueTitle, "low", "2026-01-01", "active");
    insertTask.run(blockedHighTitle, "high", null, "blocked");
    insertTask.run(activeHighTitle, "high", null, "active");
    for (let index = 0; index < 20; index += 1) {
      insertTask.run(
        longTitle(`lower-relevance-${String(index).padStart(2, "0")}`),
        "low",
        null,
        "active",
      );
    }
    insertTask.run(longTitle("completed-secret"), "high", "2025-01-01", "completed");

    await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Bounded pass A" })
      .expect(201);
    await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Bounded pass B" })
      .expect(201);

    expect(receivedInputs).toHaveLength(2);
    for (const input of receivedInputs) {
      expect(Buffer.byteLength(JSON.stringify(input), "utf8")).toBeLessThanOrEqual(
        MAX_PLANNER_CONTEXT_BYTES,
      );
      expect(input.tasks.slice(0, 3).map(({ title }) => title)).toEqual([
        dueTitle,
        blockedHighTitle,
        activeHighTitle,
      ]);
      expect(JSON.stringify(input)).not.toContain("completed-secret");
      expect(JSON.stringify(input)).not.toContain("excluded description");
      expect(JSON.stringify(input)).not.toContain("lower-relevance-19");
    }
    expect(receivedInputs[0].tasks).toEqual(receivedInputs[1].tasks);
  });

  it("rejects input that alone exceeds the provider context budget before calling Gemini", async () => {
    const generateStructured = vi.fn(async () => structuredClone(deterministicPlan));
    const { app, db } = contextWith({ generateStructured });

    const response = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "x".repeat(MAX_PLANNER_CONTEXT_BYTES + 1) })
      .expect(400);

    expect(response.body).toEqual({ error: "inputText is too long" });
    expect(generateStructured).not.toHaveBeenCalled();
    expect(tableCounts(db)).toEqual({ plans: 0, planItems: 0, tasks: 0 });
  });

  it("does not call the provider for an identical latest same-day plan", async () => {
    const generateStructured = vi.fn(async () => structuredClone(deterministicPlan));
    const { app, db } = contextWith({ generateStructured });

    const first = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  Same Day Input  " })
      .expect(201);
    const repeated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "same day input" })
      .expect(200);

    expect(repeated.body).toEqual(first.body);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(tableCounts(db)).toEqual({ plans: 1, planItems: 3, tasks: 3 });
  });

  it("deduplicates identical requests again inside the write transaction", async () => {
    let releaseProvider;
    let startedCalls = 0;
    let markBothStarted;
    const bothStarted = new Promise((resolve) => {
      markBothStarted = resolve;
    });
    const providerGate = new Promise((resolve) => {
      releaseProvider = resolve;
    });
    const { app, db } = contextWith({
      async generateStructured() {
        startedCalls += 1;
        if (startedCalls === 2) markBothStarted();
        await providerGate;
        return structuredClone(deterministicPlan);
      },
    });

    const firstRequest = request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Concurrent duplicate" })
      .then((response) => response);
    const secondRequest = request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  concurrent DUPLICATE  " })
      .then((response) => response);

    await Promise.race([
      bothStarted,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Both provider calls did not start")), 2_000),
      ),
    ]);
    releaseProvider();

    const responses = await Promise.all([firstRequest, secondRequest]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(startedCalls).toBe(2);
    expect(tableCounts(db)).toEqual({ plans: 1, planItems: 3, tasks: 3 });
  });
});
