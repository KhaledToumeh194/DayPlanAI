const Database = require("better-sqlite3");

const SCHEMA_VERSION = 1;

function createDatabase(databasePath) {
  const db = new Database(databasePath);

  try {
    db.pragma("foreign_keys = ON");

    const initialize = db.transaction(() => {
      const currentVersion = db.pragma("user_version", {
        simple: true,
      });

      if (currentVersion > SCHEMA_VERSION) {
        throw new Error(`Unsupported database schema version: ${currentVersion}`);
      }

      if (currentVersion === SCHEMA_VERSION) {
        verifySchema(db);
        return;
      }

      validateUpgradeableSchema(db);

      // -------------------------
      // TASKS
      // -------------------------

      db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    title TEXT NOT NULL,
    description TEXT,

    priority TEXT NOT NULL DEFAULT 'medium'
      CHECK (priority IN ('low', 'medium', 'high')),

    due_date TEXT,

    estimated_minutes INTEGER,

    estimate_source TEXT
      CHECK (
        estimate_source IS NULL
        OR estimate_source IN ('ai', 'user')
      ),

    flexibility TEXT NOT NULL DEFAULT 'flexible'
      CHECK (
        flexibility IN (
          'fixed',
          'important',
          'flexible',
          'optional'
        )
      ),

    status TEXT NOT NULL DEFAULT 'active'
      CHECK (
        status IN (
          'active',
          'completed',
          'blocked'
        )
      ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

      // -------------------------
      // PLANS
      // -------------------------

      db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    plan_date TEXT NOT NULL,
    input_text TEXT NOT NULL,

    workload_estimate_minutes INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

      // -------------------------
      // PLAN ITEMS
      // -------------------------

      db.exec(`
  CREATE TABLE IF NOT EXISTS plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    plan_id INTEGER NOT NULL,
    task_id INTEGER,

    title TEXT NOT NULL,
    detail TEXT,

    estimated_minutes INTEGER,
    actual_minutes INTEGER,

    estimate_source TEXT
      CHECK (
        estimate_source IS NULL
        OR estimate_source IN ('ai', 'user')
      ),

    user_modified INTEGER NOT NULL DEFAULT 0,

    position INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'planned'
      CHECK (
        status IN (
          'planned',
          'completed',
          'partial',
          'skipped',
          'moved',
          'blocked'
        )
      ),

    reason TEXT,

    FOREIGN KEY (plan_id)
      REFERENCES plans(id)
      ON DELETE CASCADE,

    FOREIGN KEY (task_id)
      REFERENCES tasks(id)
      ON DELETE SET NULL
  )
`);

      migrateLegacySchema(db);

      // -------------------------
      // DAILY REVIEWS
      // -------------------------

      db.exec(`
  CREATE TABLE IF NOT EXISTS daily_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    plan_id INTEGER NOT NULL,

    workload_rating TEXT NOT NULL
      CHECK (
        workload_rating IN (
          'too_light',
          'about_right',
          'too_much'
        )
      ),

    note TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (plan_id)
      REFERENCES plans(id)
      ON DELETE CASCADE
  )
`);

      // -------------------------
      // USER PREFERENCES
      // -------------------------

      db.exec(`
  CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    preferred_work_block_minutes INTEGER,
    preferred_break_minutes INTEGER,

    preferred_time_of_day TEXT
      CHECK (
        preferred_time_of_day IS NULL
        OR preferred_time_of_day IN (
          'morning',
          'afternoon',
          'evening',
          'none'
        )
      ),

    planning_style TEXT NOT NULL DEFAULT 'balanced'
      CHECK (
        planning_style IN (
          'relaxed',
          'balanced',
          'ambitious'
        )
      ),

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

      db.prepare(
        `
  INSERT OR IGNORE INTO user_preferences (
    id,
    planning_style
  )
  VALUES (1, 'balanced')
`,
      ).run();

      // -------------------------
      // INDEXES
      // -------------------------

      db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks(status);

  CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON tasks(due_date);

  CREATE INDEX IF NOT EXISTS idx_plans_date
  ON plans(plan_date);

  CREATE INDEX IF NOT EXISTS idx_plan_items_plan
  ON plan_items(plan_id);

  CREATE INDEX IF NOT EXISTS idx_plan_items_task
  ON plan_items(task_id);
`);

      verifySchema(db);
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
    });

    initialize();

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function validateUpgradeableSchema(db) {
  validateFoundationalTable(db, "tasks", ["id", "title", "priority", "due_date"]);
  validateFoundationalTable(db, "plans", ["id", "plan_date", "input_text", "created_at"]);
  validateFoundationalTable(db, "plan_items", [
    "id",
    "plan_id",
    "task_id",
    "title",
    "detail",
    "estimated_minutes",
    "position",
    "reason",
  ]);

  if (tableExists(db, "plan_items")) {
    verifyPlanItemForeignKeys(db);
  }
}

function validateFoundationalTable(db, tableName, requiredColumns) {
  if (!tableExists(db, tableName)) {
    return;
  }

  const columns = getTableColumns(db, tableName);
  const missingColumns = requiredColumns.filter((column) => !columns.has(column));

  if (missingColumns.length > 0) {
    throw new Error(`Incompatible ${tableName} table: missing ${missingColumns.join(", ")}`);
  }

  if (columns.get("id").pk !== 1) {
    throw new Error(`Incompatible ${tableName} table: id is not the primary key`);
  }
}

function migrateLegacySchema(db) {
  const taskColumns = getTableColumns(db, "tasks");
  const taskStatusAdded = !taskColumns.has("status");

  addColumnIfMissing(db, "tasks", taskColumns, "description", "TEXT");
  addColumnIfMissing(db, "tasks", taskColumns, "estimated_minutes", "INTEGER");
  addColumnIfMissing(
    db,
    "tasks",
    taskColumns,
    "estimate_source",
    "TEXT CHECK (estimate_source IS NULL OR estimate_source IN ('ai', 'user'))",
  );
  addColumnIfMissing(
    db,
    "tasks",
    taskColumns,
    "flexibility",
    "TEXT NOT NULL DEFAULT 'flexible' CHECK (flexibility IN ('fixed', 'important', 'flexible', 'optional'))",
  );
  addColumnIfMissing(
    db,
    "tasks",
    taskColumns,
    "status",
    "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'blocked'))",
  );
  addColumnIfMissing(db, "tasks", taskColumns, "created_at", "TEXT");
  addColumnIfMissing(db, "tasks", taskColumns, "updated_at", "TEXT");

  if (taskStatusAdded && taskColumns.has("completed")) {
    db.exec(`
      UPDATE tasks
      SET status = CASE
        WHEN completed = 1 THEN 'completed'
        ELSE 'active'
      END
    `);
  }

  db.exec(`
    UPDATE tasks
    SET priority = 'medium'
    WHERE priority IS NULL
       OR priority NOT IN ('low', 'medium', 'high');

    UPDATE tasks
    SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
        updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
    WHERE created_at IS NULL OR updated_at IS NULL;
  `);

  const planColumns = getTableColumns(db, "plans");
  addColumnIfMissing(db, "plans", planColumns, "workload_estimate_minutes", "INTEGER");

  const planItemColumns = getTableColumns(db, "plan_items");
  const planItemStatusAdded = !planItemColumns.has("status");

  addColumnIfMissing(db, "plan_items", planItemColumns, "actual_minutes", "INTEGER");
  addColumnIfMissing(
    db,
    "plan_items",
    planItemColumns,
    "estimate_source",
    "TEXT CHECK (estimate_source IS NULL OR estimate_source IN ('ai', 'user'))",
  );
  addColumnIfMissing(
    db,
    "plan_items",
    planItemColumns,
    "user_modified",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "plan_items",
    planItemColumns,
    "status",
    "TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'partial', 'skipped', 'moved', 'blocked'))",
  );

  if (planItemStatusAdded && planItemColumns.has("completed")) {
    db.exec(`
      UPDATE plan_items
      SET status = CASE
        WHEN completed = 1 THEN 'completed'
        ELSE 'planned'
      END
    `);
  }
}

function addColumnIfMissing(db, tableName, columns, columnName, definition) {
  if (columns.has(columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  columns.set(columnName, { name: columnName });
}

function verifySchema(db) {
  verifyRequiredTable(db, "tasks", [
    "id",
    "title",
    "description",
    "priority",
    "due_date",
    "estimated_minutes",
    "estimate_source",
    "flexibility",
    "status",
    "created_at",
    "updated_at",
  ]);
  verifyRequiredTable(db, "plans", [
    "id",
    "plan_date",
    "input_text",
    "workload_estimate_minutes",
    "created_at",
  ]);
  verifyRequiredTable(db, "plan_items", [
    "id",
    "plan_id",
    "task_id",
    "title",
    "detail",
    "estimated_minutes",
    "actual_minutes",
    "estimate_source",
    "user_modified",
    "position",
    "status",
    "reason",
  ]);
  verifyRequiredTable(db, "daily_reviews", [
    "id",
    "plan_id",
    "workload_rating",
    "note",
    "created_at",
  ]);
  verifyRequiredTable(db, "user_preferences", [
    "id",
    "preferred_work_block_minutes",
    "preferred_break_minutes",
    "preferred_time_of_day",
    "planning_style",
    "updated_at",
  ]);

  verifyPlanItemForeignKeys(db);
  verifyDailyReviewForeignKey(db);

  const requiredIndexes = [
    "idx_tasks_status",
    "idx_tasks_due_date",
    "idx_plans_date",
    "idx_plan_items_plan",
    "idx_plan_items_task",
  ];

  for (const indexName of requiredIndexes) {
    const index = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(indexName);

    if (!index) {
      throw new Error(`Incompatible database schema: missing index ${indexName}`);
    }
  }

  const foreignKeyViolations = db.pragma("foreign_key_check");
  if (foreignKeyViolations.length > 0) {
    throw new Error("Database foreign key verification failed");
  }
}

function verifyRequiredTable(db, tableName, requiredColumns) {
  if (!tableExists(db, tableName)) {
    throw new Error(`Incompatible database schema: missing table ${tableName}`);
  }

  const columns = getTableColumns(db, tableName);
  const missingColumns = requiredColumns.filter((column) => !columns.has(column));

  if (missingColumns.length > 0) {
    throw new Error(`Incompatible ${tableName} table: missing ${missingColumns.join(", ")}`);
  }

  if (columns.get("id").pk !== 1) {
    throw new Error(`Incompatible ${tableName} table: id is not the primary key`);
  }
}

function verifyPlanItemForeignKeys(db) {
  const foreignKeys = db.pragma("foreign_key_list(plan_items)");
  const hasPlanForeignKey = foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === "plan_id" &&
      foreignKey.table === "plans" &&
      foreignKey.to === "id" &&
      foreignKey.on_delete.toUpperCase() === "CASCADE",
  );
  const hasTaskForeignKey = foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === "task_id" &&
      foreignKey.table === "tasks" &&
      foreignKey.to === "id" &&
      foreignKey.on_delete.toUpperCase() === "SET NULL",
  );

  if (!hasPlanForeignKey || !hasTaskForeignKey) {
    throw new Error("Incompatible plan_items foreign keys");
  }
}

function verifyDailyReviewForeignKey(db) {
  const foreignKeys = db.pragma("foreign_key_list(daily_reviews)");
  const hasPlanForeignKey = foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === "plan_id" &&
      foreignKey.table === "plans" &&
      foreignKey.to === "id" &&
      foreignKey.on_delete.toUpperCase() === "CASCADE",
  );

  if (!hasPlanForeignKey) {
    throw new Error("Incompatible daily_reviews foreign key");
  }
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName),
  );
}

function getTableColumns(db, tableName) {
  return new Map(db.pragma(`table_info(${tableName})`).map((column) => [column.name, column]));
}

module.exports = { createDatabase };
