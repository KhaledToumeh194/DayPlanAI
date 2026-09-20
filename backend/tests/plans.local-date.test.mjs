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
});
