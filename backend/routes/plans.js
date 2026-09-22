const express = require("express");

const { getLocalCalendarDate } = require("../services/calendarDate");
const {
  MAX_PLANNING_TASKS,
  NEAR_TERM_DUE_DAYS,
  PlanningContextTooLargeError,
  buildBoundedPlanningContext,
} = require("../services/planningContext");
const { PlannerError } = require("../services/plannerService");

module.exports = function createPlanRoutes(db, { plannerService }) {
  const router = express.Router();

  // --------------------------------------------------
  // GET TODAY'S LATEST PLAN
  // --------------------------------------------------

  router.get("/today", (req, res) => {
    const today = getLocalCalendarDate();

    const plan = db
      .prepare(
        `
        SELECT *
        FROM plans
        WHERE plan_date = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      )
      .get(today);

    if (!plan) {
      return res.json(null);
    }

    const items = getPlanItems(db, plan.id);

    res.json(formatPlan(plan, items));
  });

  // --------------------------------------------------
  // GET PLAN HISTORY
  // --------------------------------------------------

  router.get("/history", (req, res) => {
    const plans = db
      .prepare(
        `
        SELECT *
        FROM plans
        ORDER BY plan_date DESC, created_at DESC, id DESC
        LIMIT 30
      `,
      )
      .all();

    const history = plans.map((plan) => {
      const items = getPlanItems(db, plan.id);

      return formatPlan(plan, items);
    });

    res.json(history);
  });

  // --------------------------------------------------
  // GENERATE PLAN
  // --------------------------------------------------

  router.post("/generate", async (req, res, next) => {
    const { inputText } = req.body;

    if (typeof inputText !== "string" || !inputText.trim()) {
      return res.status(400).json({
        error: "inputText is required",
      });
    }

    const trimmedInput = inputText.trim();
    const normalizedInput = normalizePlanInput(trimmedInput);
    const today = getLocalCalendarDate();

    const latestPlan = db
      .prepare(
        `
        SELECT *
        FROM plans
        WHERE plan_date = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      )
      .get(today);

    if (latestPlan && normalizePlanInput(latestPlan.input_text) === normalizedInput) {
      const existingItems = getPlanItems(db, latestPlan.id);

      return res.status(200).json(formatPlan(latestPlan, existingItems));
    }

    let planningContext;

    try {
      planningContext = buildBoundedPlanningContext({
        inputText: trimmedInput,
        tasks: getPlanningTasks(db, today),
      });
    } catch (error) {
      if (error instanceof PlanningContextTooLargeError) {
        return res.status(400).json({
          error: "inputText is too long",
        });
      }

      return next(error);
    }

    let generatedPlan;

    try {
      generatedPlan = await plannerService.generatePlan(planningContext);
    } catch (error) {
      if (error instanceof PlannerError) {
        return res.status(error.statusCode).json({
          error: error.publicMessage,
        });
      }

      return next(error);
    }

    const planDate = getLocalCalendarDate();
    const generatedItems = generatedPlan.items;

    const createPlan = db.transaction(() => {
      const duplicatePlan = db
        .prepare(
          `
          SELECT *
          FROM plans
          WHERE plan_date = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
        )
        .get(planDate);

      if (duplicatePlan && normalizePlanInput(duplicatePlan.input_text) === normalizedInput) {
        return {
          planId: duplicatePlan.id,
          created: false,
        };
      }

      const totalMinutes = generatedItems.reduce((total, item) => total + item.estimatedMinutes, 0);

      const planResult = db
        .prepare(
          `
          INSERT INTO plans (
            plan_date,
            input_text,
            workload_estimate_minutes
          )
          VALUES (?, ?, ?)
        `,
        )
        .run(planDate, trimmedInput, totalMinutes);

      const planId = Number(planResult.lastInsertRowid);

      const findReusableTask = db.prepare(`
        SELECT id
        FROM tasks
        WHERE status <> 'completed'
          AND LOWER(TRIM(title)) = ?
        ORDER BY
          CASE status
            WHEN 'active' THEN 1
            WHEN 'blocked' THEN 2
            ELSE 3
          END,
          id ASC
        LIMIT 1
      `);

      const insertTask = db.prepare(`
        INSERT INTO tasks (
          title,
          estimated_minutes,
          estimate_source,
          priority,
          flexibility,
          status,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, 'ai', 'medium', 'flexible', 'active',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      const insertItem = db.prepare(`
        INSERT INTO plan_items (
          plan_id,
          task_id,
          title,
          detail,
          estimated_minutes,
          estimate_source,
          user_modified,
          position,
          status,
          reason
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          'ai',
          0,
          ?,
          'planned',
          ?
        )
      `);

      generatedItems.forEach((item, index) => {
        let taskId = null;

        if (item.createsTask) {
          const normalizedTitle = normalizeTaskTitle(item.title);
          const reusableTask = findReusableTask.get(normalizedTitle);
          taskId = reusableTask
            ? reusableTask.id
            : Number(insertTask.run(item.title, item.estimatedMinutes).lastInsertRowid);
        }

        insertItem.run(
          planId,
          taskId,
          item.title,
          item.detail,
          item.estimatedMinutes,
          index + 1,
          item.reason,
        );
      });

      return {
        planId,
        created: true,
      };
    });

    const result = createPlan();

    const plan = db
      .prepare(
        `
        SELECT *
        FROM plans
        WHERE id = ?
      `,
      )
      .get(result.planId);

    const items = getPlanItems(db, plan.id);

    res.status(result.created ? 201 : 200).json(formatPlan(plan, items));
  });

  // --------------------------------------------------
  // DELETE PLAN
  // --------------------------------------------------

  router.delete("/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Plan id must be a positive integer",
      });
    }

    const result = db
      .prepare(
        `
        DELETE FROM plans
        WHERE id = ?
      `,
      )
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({
        error: "Plan not found",
      });
    }

    return res.status(204).end();
  });

  return router;
};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function normalizePlanInput(inputText) {
  return inputText.trim().toLowerCase();
}

function normalizeTaskTitle(title) {
  return title.trim().toLowerCase();
}

function getPlanningTasks(db, currentDate) {
  return db
    .prepare(
      `
      SELECT
        title,
        status,
        priority,
        due_date AS dueDate,
        estimated_minutes AS estimatedMinutes,
        flexibility
      FROM tasks
      WHERE status IN ('active', 'blocked')
      ORDER BY
        CASE
          WHEN due_date IS NOT NULL AND due_date <= ? THEN 1
          WHEN due_date IS NOT NULL AND due_date <= date(?, '+' || ? || ' days') THEN 2
          ELSE 3
        END,
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        CASE status
          WHEN 'blocked' THEN 1
          WHEN 'active' THEN 2
          ELSE 3
        END,
        CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
        due_date ASC,
        id ASC
      LIMIT ?
    `,
    )
    .all(currentDate, currentDate, NEAR_TERM_DUE_DAYS, MAX_PLANNING_TASKS);
}

function getPlanItems(db, planId) {
  return db
    .prepare(
      `
      SELECT *
      FROM plan_items
      WHERE plan_id = ?
      ORDER BY position ASC
    `,
    )
    .all(planId);
}

function formatPlan(plan, items) {
  return {
    id: plan.id,
    planDate: plan.plan_date,
    inputText: plan.input_text,

    workloadEstimateMinutes: plan.workload_estimate_minutes,

    createdAt: plan.created_at,

    items: items.map((item) => ({
      id: item.id,
      taskId: item.task_id,

      title: item.title,
      detail: item.detail,

      estimatedMinutes: item.estimated_minutes,

      actualMinutes: item.actual_minutes,

      estimateSource: item.estimate_source,

      userModified: Boolean(item.user_modified),

      position: item.position,

      status: item.status,
      // Deprecated compatibility field. Prefer status for new consumers.
      completed: item.status === "completed",

      reason: item.reason,
    })),
  };
}
