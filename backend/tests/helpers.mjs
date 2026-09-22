import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createApp } = require("../app");
const { createDatabase } = require("../database");

const { getLocalCalendarDate } = require("../services/calendarDate");

export const deterministicPlan = {
  items: [
    {
      title: "Work on your most urgent task",
      detail: "Start with the closest important deadline.",
      estimatedMinutes: 60,
      createsTask: true,
      reason: "Urgent work should receive attention first.",
    },
    {
      title: "Continue an important ongoing task",
      detail: "Make measurable progress without overloading the day.",
      estimatedMinutes: 45,
      createsTask: true,
      reason: "Keeps longer-term work moving.",
    },
    {
      title: "Review and prepare for tomorrow",
      detail: "Finish with a short review of upcoming commitments.",
      estimatedMinutes: 30,
      createsTask: true,
      reason: "Reduces tomorrow's planning pressure.",
    },
  ],
};

export function createDeterministicAiService(plan = deterministicPlan) {
  return {
    async generateStructured() {
      return structuredClone(plan);
    },
  };
}

export function createTestContext(databasePath = ":memory:", options = {}) {
  const db = createDatabase(databasePath);

  return {
    app: createApp(db, {
      aiService: createDeterministicAiService(),
      ...options,
    }),
    db,
  };
}

export function createTemporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "dayplan-api-test-"));

  return {
    databasePath: join(directory, "test.db"),
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function todayLocal() {
  return getLocalCalendarDate();
}

export function insertPlan(
  db,
  {
    planDate = todayLocal(),
    inputText = "Seeded plan",
    workloadEstimateMinutes = 30,
    createdAt = "2026-01-01 09:00:00",
  } = {},
) {
  const result = db
    .prepare(
      `
      INSERT INTO plans (
        plan_date,
        input_text,
        workload_estimate_minutes,
        created_at
      )
      VALUES (?, ?, ?, ?)
    `,
    )
    .run(planDate, inputText, workloadEstimateMinutes, createdAt);

  return Number(result.lastInsertRowid);
}

export function insertPlanItem(
  db,
  planId,
  {
    taskId = null,
    title = "Seeded item",
    detail = "Seeded detail",
    estimatedMinutes = 30,
    actualMinutes = null,
    estimateSource = "ai",
    userModified = 0,
    position = 1,
    status = "planned",
    reason = "Seeded reason",
  } = {},
) {
  const result = db
    .prepare(
      `
      INSERT INTO plan_items (
        plan_id,
        task_id,
        title,
        detail,
        estimated_minutes,
        actual_minutes,
        estimate_source,
        user_modified,
        position,
        status,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      planId,
      taskId,
      title,
      detail,
      estimatedMinutes,
      actualMinutes,
      estimateSource,
      userModified,
      position,
      status,
      reason,
    );

  return Number(result.lastInsertRowid);
}
