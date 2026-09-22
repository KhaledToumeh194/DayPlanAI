const MAX_PLANNING_TASKS = 100;
const MAX_PLANNER_CONTEXT_BYTES = 16 * 1024;
const NEAR_TERM_DUE_DAYS = 7;

class PlanningContextTooLargeError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanningContextTooLargeError";
  }
}

function buildBoundedPlanningContext({ inputText, tasks, maxBytes = MAX_PLANNER_CONTEXT_BYTES }) {
  const context = {
    inputText,
    tasks: [],
  };

  if (serializedSizeInBytes(context) > maxBytes) {
    throw new PlanningContextTooLargeError("Planner input exceeds the context size limit");
  }

  for (const task of tasks.slice(0, MAX_PLANNING_TASKS)) {
    const candidate = {
      inputText,
      tasks: [...context.tasks, task],
    };

    if (serializedSizeInBytes(candidate) <= maxBytes) {
      context.tasks.push(task);
    }
  }

  return context;
}

function serializedSizeInBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

module.exports = {
  MAX_PLANNER_CONTEXT_BYTES,
  MAX_PLANNING_TASKS,
  NEAR_TERM_DUE_DAYS,
  PlanningContextTooLargeError,
  buildBoundedPlanningContext,
  serializedSizeInBytes,
};
