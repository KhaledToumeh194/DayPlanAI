import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const developmentDatabasePath = resolve(rootDirectory, "backend/dayplan.db");
const databasePath = process.env.DAYPLAN_DATABASE_PATH;
const port = Number(process.env.PORT);

if (!databasePath || !Number.isInteger(port) || port <= 0) {
  throw new Error("The E2E backend requires DAYPLAN_DATABASE_PATH and PORT.");
}

if (resolve(databasePath) === developmentDatabasePath) {
  throw new Error("The E2E backend must not use backend/dayplan.db.");
}

const { createApp } = require("../backend/app");
const { createDatabase } = require("../backend/database");

const deterministicAiService = {
  async generateStructured() {
    return {
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
  },
};

const db = createDatabase(databasePath);
const app = createApp(db, { aiService: deterministicAiService });
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`DayPlan E2E backend running on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => {
    if (db.open) db.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

server.once("error", (error) => {
  if (db.open) db.close();
  throw error;
});
