const path = require("path");

const { createApp } = require("./app");
const { createDatabase } = require("./database");

const PORT = 3001;
const databasePath = path.join(__dirname, "dayplan.db");

const db = createDatabase(databasePath);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`DayPlan backend running on http://localhost:${PORT}`);
});
