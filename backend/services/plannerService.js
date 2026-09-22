const { AiProviderError, AiResponseError } = require("./aiService");

const MAX_PLAN_ITEMS = 20;
const MAX_TITLE_LENGTH = 500;
const MAX_DETAIL_LENGTH = 5000;
const MAX_REASON_LENGTH = 2000;
const MAX_ESTIMATED_MINUTES = 1440;

const PLANNER_SYSTEM_INSTRUCTION = [
  "You are DayPlan, a planning assistant. DayPlan suggests; the user decides.",
  "Create a practical plan from the user's input and the limited task context provided.",
  "Return only the requested structured JSON.",
  "Set createsTask to true only for actionable work that belongs in Tasks.",
  "Set createsTask to false for breaks, transitions, reviews, and other non-task plan items.",
  "Treat estimates as editable suggestions and do not imply monitoring or automatic completion.",
].join(" ");

const PLANNER_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: MAX_PLAN_ITEMS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          estimatedMinutes: {
            type: "integer",
            minimum: 0,
            maximum: MAX_ESTIMATED_MINUTES,
          },
          createsTask: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["title", "detail", "estimatedMinutes", "createsTask", "reason"],
      },
    },
  },
  required: ["items"],
};

class PlannerError extends Error {
  constructor(message, { statusCode, publicMessage, cause } = {}) {
    super(message, { cause });
    this.name = "PlannerError";
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

function createPlannerService({ aiService }) {
  if (!aiService || typeof aiService.generateStructured !== "function") {
    throw new TypeError("aiService.generateStructured is required");
  }

  return {
    async generatePlan({ inputText, tasks }) {
      let response;

      try {
        response = await aiService.generateStructured({
          input: { inputText, tasks },
          systemInstruction: PLANNER_SYSTEM_INSTRUCTION,
          responseSchema: PLANNER_RESPONSE_SCHEMA,
        });
      } catch (error) {
        if (error instanceof AiResponseError) {
          throw new PlannerError("AI provider returned an invalid planner response", {
            statusCode: 502,
            publicMessage: "AI planner returned an invalid response",
            cause: error,
          });
        }

        throw new PlannerError("AI provider failed", {
          statusCode: 503,
          publicMessage: "AI planner is temporarily unavailable",
          cause: error instanceof AiProviderError ? error : undefined,
        });
      }

      try {
        return validatePlannerResponse(response);
      } catch (error) {
        throw new PlannerError("AI provider returned an invalid planner response", {
          statusCode: 502,
          publicMessage: "AI planner returned an invalid response",
          cause: error,
        });
      }
    },
  };
}

function validatePlannerResponse(response) {
  assertPlainObject(response, "response");
  assertExactKeys(response, ["items"], "response");

  if (!Array.isArray(response.items) || response.items.length < 1) {
    throw new TypeError("response.items must be a non-empty array");
  }

  if (response.items.length > MAX_PLAN_ITEMS) {
    throw new TypeError(`response.items must contain no more than ${MAX_PLAN_ITEMS} items`);
  }

  return {
    items: response.items.map((item, index) => validatePlannerItem(item, index)),
  };
}

function validatePlannerItem(item, index) {
  const path = `response.items[${index}]`;
  assertPlainObject(item, path);
  assertExactKeys(item, ["title", "detail", "estimatedMinutes", "createsTask", "reason"], path);

  const title = validateText(item.title, `${path}.title`, MAX_TITLE_LENGTH, false);
  const detail = validateText(item.detail, `${path}.detail`, MAX_DETAIL_LENGTH, false);
  const reason = validateText(item.reason, `${path}.reason`, MAX_REASON_LENGTH, true);

  if (
    !Number.isInteger(item.estimatedMinutes) ||
    item.estimatedMinutes < 0 ||
    item.estimatedMinutes > MAX_ESTIMATED_MINUTES
  ) {
    throw new TypeError(
      `${path}.estimatedMinutes must be an integer from 0 to ${MAX_ESTIMATED_MINUTES}`,
    );
  }

  if (typeof item.createsTask !== "boolean") {
    throw new TypeError(`${path}.createsTask must be a boolean`);
  }

  return {
    title,
    detail,
    estimatedMinutes: item.estimatedMinutes,
    createsTask: item.createsTask,
    reason,
  };
}

function validateText(value, path, maxLength, allowEmpty) {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }

  const trimmed = value.trim();

  if (!allowEmpty && !trimmed) {
    throw new TypeError(`${path} must not be empty`);
  }

  if (trimmed.length > maxLength) {
    throw new TypeError(`${path} is too long`);
  }

  return trimmed;
}

function assertPlainObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, path) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new TypeError(`${path} contains unexpected or missing fields`);
  }
}

module.exports = {
  PLANNER_RESPONSE_SCHEMA,
  PLANNER_SYSTEM_INSTRUCTION,
  PlannerError,
  createPlannerService,
  validatePlannerResponse,
};
