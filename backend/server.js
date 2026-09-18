const express = require("express");
const cors = require("cors");
const db = require("./database");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Root test
app.get("/", (req, res) => {
  res.send("DayPlan backend works");
});

// API test
app.get("/api/hello", (req, res) => {
  res.json({
    message: "DayPlan API works",
  });
});

// GET all tasks from SQLite
app.get("/api/tasks", (req, res) => {
  const rows = db
    .prepare(`
      SELECT
        id,
        title,
        due_date,
        priority,
        completed
      FROM tasks
      ORDER BY id DESC
    `)
    .all();

  const tasks = rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    priority: row.priority,
    completed: Boolean(row.completed),
  }));

  res.json(tasks);
});

// CREATE task in SQLite
app.post("/api/tasks", (req, res) => {
  const { title, dueDate, priority } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({
      error: "Title is required",
    });
  }

  const result = db
    .prepare(`
      INSERT INTO tasks (
        title,
        due_date,
        priority,
        completed
      )
      VALUES (?, ?, ?, 0)
    `)
    .run(
      title.trim(),
      dueDate || null,
      priority || "medium"
    );

  const newTask = db
    .prepare(`
      SELECT
        id,
        title,
        due_date,
        priority,
        completed
      FROM tasks
      WHERE id = ?
    `)
    .get(result.lastInsertRowid);

  res.status(201).json({
    id: newTask.id,
    title: newTask.title,
    dueDate: newTask.due_date,
    priority: newTask.priority,
    completed: Boolean(newTask.completed),
  });
});

// PATCH task
app.patch("/api/tasks/:id", (req, res) => {
  const id = Number(req.params.id);

  const task = db
    .prepare(`
      SELECT *
      FROM tasks
      WHERE id = ?
    `)
    .get(id);

  if (!task) {
    return res.status(404).json({
      error: "Task not found",
    });
  }

  const {
    title = task.title,
    dueDate = task.due_date,
    priority = task.priority,
    completed = Boolean(task.completed),
  } = req.body;

  db.prepare(`
    UPDATE tasks
    SET
      title = ?,
      due_date = ?,
      priority = ?,
      completed = ?
    WHERE id = ?
  `).run(
    title,
    dueDate,
    priority,
    completed ? 1 : 0,
    id
  );

  const updatedTask = db
    .prepare(`
      SELECT
        id,
        title,
        due_date,
        priority,
        completed
      FROM tasks
      WHERE id = ?
    `)
    .get(id);

  res.json({
    id: updatedTask.id,
    title: updatedTask.title,
    dueDate: updatedTask.due_date,
    priority: updatedTask.priority,
    completed: Boolean(updatedTask.completed),
  });
});

// DELETE task
app.delete("/api/tasks/:id", (req, res) => {
  const id = Number(req.params.id);

  const result = db
    .prepare(`
      DELETE FROM tasks
      WHERE id = ?
    `)
    .run(id);

  if (result.changes === 0) {
    return res.status(404).json({
      error: "Task not found",
    });
  }

  res.status(204).end();
});
app.post("/api/plans/generate", (req, res) => {
  const { inputText } = req.body;

  if (!inputText || !inputText.trim()) {
    return res.status(400).json({
      error: "inputText is required",
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  const planResult = db
    .prepare(`
      INSERT INTO plans (
        plan_date,
        input_text
      )
      VALUES (?, ?)
    `)
    .run(today, inputText.trim());

  const planId = Number(planResult.lastInsertRowid);

  const fakePlanItems = [
    {
      title: "Work on university project",
      detail: "Focus on the unfinished results section.",
      estimatedMinutes: 90,
      position: 1,
      reason: "High priority and deadline is close",
    },
    {
      title: "Apply for one job",
      detail: "Complete one focused application.",
      estimatedMinutes: 45,
      position: 2,
      reason: "Keeps weekly job-search progress moving",
    },
    {
      title: "Review React course",
      detail: "Continue the current course module.",
      estimatedMinutes: 60,
      position: 3,
      reason: "Important, but less urgent than the project",
    },
  ];

  const insertItem = db.prepare(`
    INSERT INTO plan_items (
      plan_id,
      task_id,
      title,
      detail,
      estimated_minutes,
      position,
      completed,
      reason
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `);

  for (const item of fakePlanItems) {
    insertItem.run(
      planId,
      null,
      item.title,
      item.detail,
      item.estimatedMinutes,
      item.position,
      item.reason
    );
  }

  const savedPlan = db
    .prepare(`
      SELECT
        id,
        plan_date,
        input_text,
        created_at
      FROM plans
      WHERE id = ?
    `)
    .get(planId);

  const savedItems = db
    .prepare(`
      SELECT
        id,
        title,
        detail,
        estimated_minutes,
        position,
        completed,
        reason
      FROM plan_items
      WHERE plan_id = ?
      ORDER BY position ASC
    `)
    .all(planId);

  res.status(201).json({
    id: savedPlan.id,
    planDate: savedPlan.plan_date,
    inputText: savedPlan.input_text,
    createdAt: savedPlan.created_at,
    items: savedItems.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      estimatedMinutes: item.estimated_minutes,
      position: item.position,
      completed: Boolean(item.completed),
      reason: item.reason,
    })),
  });
});
// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});