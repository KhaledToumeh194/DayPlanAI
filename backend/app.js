const express = require("express");
const cors = require("cors");

const createTaskRoutes = require("./routes/tasks");
const createPlanRoutes = require("./routes/plans");
const createPlanItemRoutes = require("./routes/planItems");

function createApp(db) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/", (req, res) => {
    res.send("DayPlan backend works");
  });

  app.get("/api/hello", (req, res) => {
    res.json({
      message: "DayPlan API works",
    });
  });

  app.use("/api/tasks", createTaskRoutes(db));
  app.use("/api/plans", createPlanRoutes(db));
  app.use("/api/plan-items", createPlanItemRoutes(db));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof SyntaxError && error.status === 400) {
      return res.status(400).json({
        error: "Invalid JSON body",
      });
    }

    console.error("Unhandled request error", error);

    return res.status(500).json({
      error: "Internal server error",
    });
  });

  return app;
}

module.exports = { createApp };
