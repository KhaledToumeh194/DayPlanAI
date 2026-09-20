import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createApp } = require("../app");
const { createDatabase } = require("../database");

const { getLocalCalendarDate } = require("../services/calendarDate");
export function createTestContext(databasePath = ":memory:") {
  const db = createDatabase(databasePath);

  return {
    app: createApp(db),
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
