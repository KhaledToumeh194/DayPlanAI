const Database = require("better-sqlite3");

const db = new Database("dayplan.db");

db.pragma("foreign_keys = ON");

// TASKS
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    completed INTEGER NOT NULL DEFAULT 0
  )
`);

// PLANS
db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_date TEXT NOT NULL,
    input_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

// PLAN ITEMS
db.exec(`
  CREATE TABLE IF NOT EXISTS plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    plan_id INTEGER NOT NULL,
    task_id INTEGER,

    title TEXT NOT NULL,
    detail TEXT,
    estimated_minutes INTEGER,

    position INTEGER NOT NULL,

    completed INTEGER NOT NULL DEFAULT 0,

    reason TEXT,

    FOREIGN KEY (plan_id)
      REFERENCES plans(id)
      ON DELETE CASCADE,

    FOREIGN KEY (task_id)
      REFERENCES tasks(id)
      ON DELETE SET NULL
  )
`);

module.exports = db;