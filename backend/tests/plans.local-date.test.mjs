import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createTestContext, insertPlan } from "./helpers.mjs";

describe("plan API local calendar dates", () => {
  const originalTimezone = process.env.TZ;

  let app;
  let db;

  beforeAll(() => {
    process.env.TZ = "Pacific/Kiritimati";
  });

  beforeEach(() => {
    vi.setSystemTime(new Date("2026-01-01T10:30:00.000Z"));
    ({ app, db } = createTestContext());
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  afterAll(() => {
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  });

  it("returns the plan for the local day when it differs from the UTC day", async () => {
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-01-01");

    insertPlan(db, {
      planDate: "2026-01-01",
      inputText: "UTC-day plan",
    });
    const localPlanId = insertPlan(db, {
      planDate: "2026-01-02",
      inputText: "Local-day plan",
    });

    const response = await request(app).get("/api/plans/today").expect(200);

    expect(response.body).toMatchObject({
      id: localPlanId,
      planDate: "2026-01-02",
      inputText: "Local-day plan",
    });

    const history = await request(app).get("/api/plans/history").expect(200);
    expect(history.body.map((plan) => plan.planDate)).toEqual(["2026-01-02", "2026-01-01"]);
  });

  it("deduplicates on the same local day and creates a plan on the next local day", async () => {
    const first = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  Finish The Local Day  " })
      .expect(201);

    expect(first.body.planDate).toBe("2026-01-02");

    vi.setSystemTime(new Date("2026-01-01T20:30:00.000Z"));
    const repeated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "finish the local day" })
      .expect(200);

    expect(repeated.body.id).toBe(first.body.id);

    vi.setSystemTime(new Date("2026-01-02T10:30:00.000Z"));
    const nextDay = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "finish the local day" })
      .expect(201);

    expect(nextDay.body.id).not.toBe(first.body.id);
    expect(nextDay.body.planDate).toBe("2026-01-03");
    expect(db.prepare("SELECT COUNT(*) AS count FROM plans").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM tasks").get()).toEqual({ count: 3 });

    const history = await request(app).get("/api/plans/history").expect(200);
    expect(history.body.map((plan) => plan.planDate)).toEqual(["2026-01-03", "2026-01-02"]);
  });

  it("uses the completion local day when generation crosses midnight and deduplicates there", async () => {
    vi.setSystemTime(new Date("2026-01-01T09:59:00.000Z"));

    let releaseProvider;
    let markProviderStarted;
    const providerStarted = new Promise((resolve) => {
      markProviderStarted = resolve;
    });
    const providerGate = new Promise((resolve) => {
      releaseProvider = resolve;
    });
    const generateStructured = vi.fn(async () => {
      markProviderStarted();
      await providerGate;
      return {
        items: [
          {
            title: "Finish after midnight",
            detail: "Persist this work on the local day when generation completes.",
            estimatedMinutes: 25,
            createsTask: true,
            reason: "Keeps the generated plan on its intended current day.",
          },
        ],
      };
    });

    db.close();
    ({ app, db } = createTestContext(":memory:", {
      aiService: { generateStructured },
    }));

    const pendingGeneration = request(app)
      .post("/api/plans/generate")
      .send({ inputText: "Cross local midnight" })
      .then((response) => response);

    await providerStarted;
    vi.setSystemTime(new Date("2026-01-01T10:01:00.000Z"));
    releaseProvider();

    const generated = await pendingGeneration;
    expect(generated.status).toBe(201);
    expect(generated.body.planDate).toBe("2026-01-02");

    const today = await request(app).get("/api/plans/today").expect(200);
    expect(today.body.id).toBe(generated.body.id);
    expect(today.body.planDate).toBe("2026-01-02");

    const repeated = await request(app)
      .post("/api/plans/generate")
      .send({ inputText: "  cross LOCAL midnight  " })
      .expect(200);

    expect(repeated.body).toEqual(generated.body);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT plan_date AS planDate FROM plans").all()).toEqual([
      { planDate: "2026-01-02" },
    ]);
  });
});
