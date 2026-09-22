import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { AiProviderError, AiResponseError } = require("../services/aiService");
const {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  MAX_GEMINI_TIMEOUT_MS,
  createGeminiAiProvider,
} = require("../services/geminiAiProvider");
const {
  PLANNER_RESPONSE_SCHEMA,
  PLANNER_SYSTEM_INSTRUCTION,
} = require("../services/plannerService");

const validResponse = {
  items: [
    {
      title: "Draft the proposal",
      detail: "Create a concise first draft.",
      estimatedMinutes: 45,
      createsTask: true,
      reason: "Moves the work forward.",
    },
  ],
};

function structuredRequest(input = { inputText: "Plan", tasks: [] }) {
  return {
    input,
    systemInstruction: PLANNER_SYSTEM_INSTRUCTION,
    responseSchema: PLANNER_RESPONSE_SCHEMA,
  };
}

describe("Gemini AI provider", () => {
  it("translates the generic request to a non-stored structured Interactions request", async () => {
    const create = vi.fn(async () => ({ output_text: JSON.stringify(validResponse) }));
    const provider = createGeminiAiProvider({
      apiKey: "test-only-key",
      model: "test-model",
      client: { interactions: { create } },
    });
    const planningContext = {
      inputText: "Prepare the proposal",
      tasks: [
        {
          title: "Review notes",
          status: "active",
          priority: "high",
          dueDate: null,
          estimatedMinutes: 20,
          flexibility: "important",
        },
      ],
    };

    await expect(provider.generateStructured(structuredRequest(planningContext))).resolves.toEqual(
      validResponse,
    );
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      {
        model: "test-model",
        input: JSON.stringify(planningContext),
        system_instruction: PLANNER_SYSTEM_INSTRUCTION,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: PLANNER_RESPONSE_SCHEMA,
        },
        store: false,
      },
      {
        timeout_ms: DEFAULT_GEMINI_TIMEOUT_MS,
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("uses the documented default model and supports the GEMINI_MODEL override", async () => {
    const originalModel = process.env.GEMINI_MODEL;
    const create = vi.fn(async () => ({ output_text: JSON.stringify(validResponse) }));

    try {
      delete process.env.GEMINI_MODEL;
      const defaultProvider = createGeminiAiProvider({
        client: { interactions: { create } },
      });
      await defaultProvider.generateStructured(structuredRequest());
      expect(create.mock.calls[0][0].model).toBe(DEFAULT_GEMINI_MODEL);

      process.env.GEMINI_MODEL = "gemini-test-override";
      const overriddenProvider = createGeminiAiProvider({
        client: { interactions: { create } },
      });
      await overriddenProvider.generateStructured(structuredRequest());
      expect(create.mock.calls[1][0].model).toBe("gemini-test-override");
    } finally {
      if (originalModel === undefined) {
        delete process.env.GEMINI_MODEL;
      } else {
        process.env.GEMINI_MODEL = originalModel;
      }
    }
  });

  it.each([
    ["missing output", {}],
    ["blank output", { output_text: "   " }],
    ["malformed JSON", { output_text: "{not-json" }],
  ])("classifies %s as an invalid AI response", async (_label, interaction) => {
    const provider = createGeminiAiProvider({
      client: {
        interactions: {
          async create() {
            return interaction;
          },
        },
      },
    });

    await expect(provider.generateStructured(structuredRequest())).rejects.toBeInstanceOf(
      AiResponseError,
    );
  });

  it("classifies SDK failures without exposing provider details", async () => {
    const provider = createGeminiAiProvider({
      client: {
        interactions: {
          async create() {
            throw new Error("sensitive provider response");
          },
        },
      },
    });

    let error;
    try {
      await provider.generateStructured(structuredRequest());
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.message).toBe("Gemini request failed");
    expect(error.message).not.toContain("sensitive provider response");
  });

  it("times out a hanging Gemini request and aborts the supplied SDK signal", async () => {
    let suppliedSignal;
    const create = vi.fn((_request, options) => {
      suppliedSignal = options.signal;
      return new Promise(() => {});
    });
    const provider = createGeminiAiProvider({
      client: { interactions: { create } },
      timeoutMs: 10,
    });

    const startedAt = Date.now();
    await expect(provider.generateStructured(structuredRequest())).rejects.toBeInstanceOf(
      AiProviderError,
    );
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(suppliedSignal).toBeInstanceOf(AbortSignal);
    expect(suppliedSignal.aborted).toBe(true);
  });

  it("uses GEMINI_TIMEOUT_MS as the configurable request timeout", async () => {
    const originalTimeout = process.env.GEMINI_TIMEOUT_MS;
    const create = vi.fn(async () => ({ output_text: JSON.stringify(validResponse) }));

    try {
      process.env.GEMINI_TIMEOUT_MS = "1234";
      const provider = createGeminiAiProvider({
        client: { interactions: { create } },
      });

      await provider.generateStructured(structuredRequest());

      expect(create.mock.calls[0][1]).toMatchObject({
        timeout_ms: 1234,
        signal: expect.any(AbortSignal),
      });
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.GEMINI_TIMEOUT_MS;
      } else {
        process.env.GEMINI_TIMEOUT_MS = originalTimeout;
      }
    }
  });

  it.each([0, -1, MAX_GEMINI_TIMEOUT_MS + 1, 1.5, "not-a-number"])(
    "rejects invalid Gemini timeout %j before calling the SDK",
    async (timeoutMs) => {
      const create = vi.fn(async () => ({ output_text: JSON.stringify(validResponse) }));
      const provider = createGeminiAiProvider({
        client: { interactions: { create } },
        timeoutMs,
      });

      await expect(provider.generateStructured(structuredRequest())).rejects.toMatchObject({
        name: "AiProviderError",
        message: "GEMINI_TIMEOUT_MS is invalid",
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("requires an environment-provided credential when no client is injected", async () => {
    const provider = createGeminiAiProvider({ apiKey: "", client: null });

    await expect(provider.generateStructured(structuredRequest())).rejects.toMatchObject({
      name: "AiProviderError",
      message: "GEMINI_API_KEY is not configured",
    });
  });
});
