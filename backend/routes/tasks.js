const express = require("express");

const TASK_PRIORITIES = new Set(["low", "medium", "high"]);
const TASK_FLEXIBILITIES = new Set(["fixed", "important", "flexible", "optional"]);
const TASK_STATUSES = new Set(["active", "completed", "blocked"]);
const ESTIMATE_SOURCES = new Set(["ai", "user"]);

module.exports = function createTaskRoutes(db) {
  const router = express.Router();

  // GET all tasks
  router.get("/", (req, res) => {
    const rows = db
      .prepare(
        `
        SELECT
          id,
          title,
          description,
          priority,
          due_date,
          estimated_minutes,
          estimate_source,
          flexibility,
          status,
          created_at,
          updated_at
        FROM tasks
        ORDER BY
          CASE status
            WHEN 'active' THEN 1
            WHEN 'blocked' THEN 2
            WHEN 'completed' THEN 3
            ELSE 4
          END,
          CASE priority
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END,
          due_date ASC,
          id DESC
      `,
      )
      .all();

    const tasks = rows.map(mapTask);

    res.json(tasks);
  });

  // CREATE task
  router.post("/", (req, res) => {
    const {
      title,
      description = null,
      priority = "medium",
      dueDate = null,
      estimatedMinutes = null,
      estimateSource = null,
      flexibility = "flexible",
    } = req.body;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        error: "Title is required",
      });
    }

    const validationError = validateTaskFields(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const result = db
      .prepare(
        `
        INSERT INTO tasks (
          title,
          description,
          priority,
          due_date,
          estimated_minutes,
          estimate_source,
          flexibility,
          status,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `,
      )
      .run(
        title.trim(),
        description,
        priority,
        dueDate,
        estimatedMinutes,
        estimateSource,
        flexibility,
      );

    const row = db
      .prepare(
        `
        SELECT *
        FROM tasks
        WHERE id = ?
      `,
      )
      .get(result.lastInsertRowid);

    res.status(201).json(mapTask(row));
  });

  // UPDATE task
  router.patch("/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Task id must be a positive integer",
      });
    }

    const current = db
      .prepare(
        `
        SELECT *
        FROM tasks
        WHERE id = ?
      `,
      )
      .get(id);

    if (!current) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    const validationError = validateTaskFields(req.body, true);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const {
      title = current.title,
      description = current.description,
      priority = current.priority,
      dueDate = current.due_date,
      estimatedMinutes = current.estimated_minutes,
      estimateSource = current.estimate_source,
      flexibility = current.flexibility,
    } = req.body;

    const hasStatus = Object.prototype.hasOwnProperty.call(req.body, "status");
    const hasCompleted = Object.prototype.hasOwnProperty.call(req.body, "completed");
    const status = hasStatus
      ? req.body.status
      : hasCompleted
        ? req.body.completed
          ? "completed"
          : "active"
        : current.status;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        error: "Title is required",
      });
    }

    db.prepare(
      `
      UPDATE tasks
      SET
        title = ?,
        description = ?,
        priority = ?,
        due_date = ?,
        estimated_minutes = ?,
        estimate_source = ?,
        flexibility = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(
      title.trim(),
      description,
      priority,
      dueDate,
      estimatedMinutes,
      estimateSource,
      flexibility,
      status,
      id,
    );

    const updated = db
      .prepare(
        `
        SELECT *
        FROM tasks
        WHERE id = ?
      `,
      )
      .get(id);

    res.json(mapTask(updated));
  });

  // DELETE task
  router.delete("/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Task id must be a positive integer",
      });
    }

    const result = db
      .prepare(
        `
        DELETE FROM tasks
        WHERE id = ?
      `,
      )
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    res.status(204).end();
  });

  return router;
};

function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueDate: row.due_date,
    estimatedMinutes: row.estimated_minutes,
    estimateSource: row.estimate_source,
    flexibility: row.flexibility,
    status: row.status,
    // Deprecated compatibility field. Prefer status for new consumers.
    completed: row.status === "completed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function validateTaskFields(body, allowStatus = false) {
  if (
    Object.prototype.hasOwnProperty.call(body, "priority") &&
    !TASK_PRIORITIES.has(body.priority)
  ) {
    return "priority must be low, medium, or high";
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "flexibility") &&
    !TASK_FLEXIBILITIES.has(body.flexibility)
  ) {
    return "flexibility must be fixed, important, flexible, or optional";
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "estimateSource") &&
    body.estimateSource !== null &&
    !ESTIMATE_SOURCES.has(body.estimateSource)
  ) {
    return "estimateSource must be ai, user, or null";
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "estimatedMinutes") &&
    !isNonNegativeIntegerOrNull(body.estimatedMinutes)
  ) {
    return "estimatedMinutes must be a non-negative integer or null";
  }

  if (allowStatus && Object.prototype.hasOwnProperty.call(body, "status")) {
    if (!TASK_STATUSES.has(body.status)) {
      return "status must be active, completed, or blocked";
    }
  }

  if (allowStatus && Object.prototype.hasOwnProperty.call(body, "completed")) {
    if (typeof body.completed !== "boolean") {
      return "completed must be a boolean";
    }
  }

  return null;
}

function isNonNegativeIntegerOrNull(value) {
  return value === null || (Number.isInteger(value) && value >= 0);
}
