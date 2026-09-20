const express = require("express");

const PLAN_ITEM_STATUSES = new Set([
  "planned",
  "completed",
  "partial",
  "skipped",
  "moved",
  "blocked",
]);

module.exports = function createPlanItemRoutes(db) {
  const router = express.Router();

  router.patch("/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Plan item id must be a positive integer",
      });
    }

    const current = db
      .prepare(
        `
        SELECT *
        FROM plan_items
        WHERE id = ?
      `,
      )
      .get(id);

    if (!current) {
      return res.status(404).json({
        error: "Plan item not found",
      });
    }

    const validationError = validatePlanItemFields(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const {
      status = current.status,
      estimatedMinutes = current.estimated_minutes,
      actualMinutes = current.actual_minutes,
    } = req.body;

    const estimateChanged = estimatedMinutes !== current.estimated_minutes;

    db.prepare(
      `
      UPDATE plan_items
      SET
        status = ?,
        estimated_minutes = ?,
        actual_minutes = ?,
        estimate_source = CASE
          WHEN ? = 1 THEN 'user'
          ELSE estimate_source
        END,
        user_modified = CASE
          WHEN ? = 1 THEN 1
          ELSE user_modified
        END
      WHERE id = ?
    `,
    ).run(
      status,
      estimatedMinutes,
      actualMinutes,
      estimateChanged ? 1 : 0,
      estimateChanged ? 1 : 0,
      id,
    );

    const updated = db
      .prepare(
        `
        SELECT *
        FROM plan_items
        WHERE id = ?
      `,
      )
      .get(id);

    res.json({
      id: updated.id,
      taskId: updated.task_id,
      title: updated.title,
      detail: updated.detail,
      estimatedMinutes: updated.estimated_minutes,
      actualMinutes: updated.actual_minutes,
      estimateSource: updated.estimate_source,
      userModified: Boolean(updated.user_modified),
      position: updated.position,
      status: updated.status,
      // Deprecated compatibility field. Prefer status for new consumers.
      completed: updated.status === "completed",
      reason: updated.reason,
    });
  });

  return router;

  function validatePlanItemFields(body) {
    if (
      Object.prototype.hasOwnProperty.call(body, "status") &&
      !PLAN_ITEM_STATUSES.has(body.status)
    ) {
      return "status must be planned, completed, partial, skipped, moved, or blocked";
    }

    for (const field of ["estimatedMinutes", "actualMinutes"]) {
      if (
        Object.prototype.hasOwnProperty.call(body, field) &&
        !isNonNegativeIntegerOrNull(body[field])
      ) {
        return `${field} must be a non-negative integer or null`;
      }
    }

    return null;
  }

  function isNonNegativeIntegerOrNull(value) {
    return value === null || (Number.isInteger(value) && value >= 0);
  }
};
