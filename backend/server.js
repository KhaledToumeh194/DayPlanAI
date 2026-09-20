const path = require("path");

const { createApp } = require("./app");
const { createDatabase } = require("./database");

const PORT = Number(process.env.PORT || 3001);
const databasePath = process.env.DAYPLAN_DATABASE_PATH || path.join(__dirname, "dayplan.db");

const db = createDatabase(databasePath);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`DayPlan backend running on http://localhost:${PORT}`);
});
