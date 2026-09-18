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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});