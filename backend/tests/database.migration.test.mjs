import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const { createDatabase } = require("../database");

describe("database migrations", () => {
  it("atomically upgrades the exact legacy schema and preserves its data", () => {
    withTemporaryDatabase((databasePath) => {
      createLegacyDatabase(databasePath);

      let db = createDatabase(databasePath);

      expect(db.pragma("user_version", { simple: true })).toBe(1);
      expect(columnNames(db, "tasks")).toEqual(
        expect.arrayContaining([
          "completed",
          "description",
          "estimated_minutes",
          "estimate_source",
          "flexibility",
          "status",
          "created_at",
          "updated_at",
        ]),
      );
      expect(columnNames(db, "plan_items")).toEqual(
        expect.arrayContaining([
          "completed",
          "actual_minutes",
          "estimate_source",
          "user_modified",
          "status",
        ]),
      );

      expect(db.prepare("SELECT id, priority, status FROM tasks ORDER BY id").all()).toEqual([
        { id: 7, priority: "high", status: "completed" },
        { id: 8, priority: "medium", status: "active" },
      ]);
      expect(
        db.prepare("SELECT id, plan_id, task_id, status FROM plan_items ORDER BY id").all(),
      ).toEqual([
        { id: 11, plan_id: 3, task_id: 7, status: "completed" },
        { id: 12, plan_id: 3, task_id: 8, status: "planned" },
      ]);
      expect(db.prepare("SELECT COUNT(*) AS count FROM user_preferences").get()).toEqual({
        count: 1,
      });
      expect(db.pragma("foreign_key_check")).toEqual([]);

      db.prepare("DELETE FROM tasks WHERE id = ?").run(7);
      expect(db.prepare("SELECT task_id FROM plan_items WHERE id = ?").get(11)).toEqual({
        task_id: null,
      });

      db.close();
      db = createDatabase(databasePath);
      expect(db.pragma("user_version", { simple: true })).toBe(1);
      expect(db.prepare("SELECT COUNT(*) AS count FROM user_preferences").get()).toEqual({
        count: 1,
      });
      db.close();
    });
  });

  it("adopts an already-current unversioned database idempotently", () => {
    withTemporaryDatabase((databasePath) => {
      let db = createDatabase(databasePath);
      db.prepare("INSERT INTO tasks (title) VALUES (?)").run("Keep me");
      db.pragma("user_version = 0");
      db.close();

      db = createDatabase(databasePath);
      expect(db.pragma("user_version", { simple: true })).toBe(1);
      expect(db.prepare("SELECT title FROM tasks").all()).toEqual([{ title: "Keep me" }]);
      expect(db.prepare("SELECT COUNT(*) AS count FROM user_preferences").get()).toEqual({
        count: 1,
      });
      db.close();

      db = createDatabase(databasePath);
      expect(db.prepare("SELECT COUNT(*) AS count FROM tasks").get()).toEqual({
        count: 1,
      });
      db.close();
    });
  });

  it("rejects unsupported and incompatible versioned schemas", () => {
    withTemporaryDatabase((databasePath) => {
      let db = new Database(databasePath);
      db.pragma("user_version = 2");
      db.close();

      expect(() => createDatabase(databasePath)).toThrow("Unsupported database schema version: 2");

      db = new Database(databasePath);
      db.pragma("user_version = 1");
      db.close();

      expect(() => createDatabase(databasePath)).toThrow("missing table tasks");
    });
  });

  it("rejects a daily reviews table without its cascading plan foreign key", () => {
    withTemporaryDatabase((databasePath) => {
      let db = createDatabase(databasePath);
      db.exec(`
        DROP TABLE daily_reviews;
        CREATE TABLE daily_reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_id INTEGER NOT NULL,
          workload_rating TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.pragma("user_version = 0");
      db.close();

      expect(() => createDatabase(databasePath)).toThrow("Incompatible daily_reviews foreign key");

      db = new Database(databasePath, {
        readonly: true,
        fileMustExist: true,
      });
      expect(db.pragma("user_version", { simple: true })).toBe(0);
      expect(db.pragma("foreign_key_list(daily_reviews)")).toEqual([]);
      db.close();

      db = new Database(databasePath);
      db.pragma("user_version = 1");
      db.close();

      expect(() => createDatabase(databasePath)).toThrow("Incompatible daily_reviews foreign key");
    });
  });

  it("rolls back every migration write when a late step fails", () => {
    withTemporaryDatabase((databasePath) => {
      createLegacyDatabase(databasePath, { brokenPreferences: true });

      expect(() => createDatabase(databasePath)).toThrow();

      const db = new Database(databasePath, {
        readonly: true,
        fileMustExist: true,
      });

      expect(db.pragma("user_version", { simple: true })).toBe(0);
      expect(columnNames(db, "tasks")).toEqual([
        "id",
        "title",
        "due_date",
        "priority",
        "completed",
      ]);
      expect(db.prepare("SELECT priority FROM tasks WHERE id = 8").get()).toEqual({
        priority: "urgent",
      });
      expect(tableNames(db)).not.toContain("daily_reviews");
      expect(indexNames(db)).not.toContain("idx_tasks_status");
      db.close();
    });
  });
});

function createLegacyDatabase(databasePath, { brokenPreferences = false } = {}) {
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL,
      input_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      task_id INTEGER,
      title TEXT NOT NULL,
      detail TEXT,
      estimated_minutes INTEGER,
      position INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    INSERT INTO tasks (id, title, due_date, priority, completed)
    VALUES
      (7, 'Completed legacy task', '2026-09-20', 'high', 1),
      (8, 'Unknown-priority task', NULL, 'urgent', 0);

    INSERT INTO plans (id, plan_date, input_text, created_at)
    VALUES (3, '2026-09-20', 'Legacy plan', '2026-09-20 08:00:00');

    INSERT INTO plan_items (
      id, plan_id, task_id, title, detail, estimated_minutes,
      position, completed, reason
    )
    VALUES
      (11, 3, 7, 'Completed legacy item', 'Done', 30, 1, 1, 'Important'),
      (12, 3, 8, 'Planned legacy item', NULL, NULL, 2, 0, NULL);
  `);

  if (brokenPreferences) {
    db.exec("CREATE TABLE user_preferences (id INTEGER PRIMARY KEY)");
  }

  db.close();
}

function withTemporaryDatabase(callback) {
  const directory = mkdtempSync(join(tmpdir(), "dayplan-migration-test-"));
  const databasePath = join(directory, "test.db");

  try {
    callback(databasePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function columnNames(db, tableName) {
  return db.pragma(`table_info(${tableName})`).map((column) => column.name);
}

function tableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map(({ name }) => name);
}

function indexNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
    .all()
    .map(({ name }) => name);
}
