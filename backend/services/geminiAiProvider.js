const { GoogleGenAI } = require("@google/genai");

const { AiProviderError, AiResponseError } = require("./aiService");

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_GEMINI_TIMEOUT_MS = 30_000;
const MAX_GEMINI_TIMEOUT_MS = 300_000;

function createGeminiAiProvider({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  timeoutMs = process.env.GEMINI_TIMEOUT_MS || DEFAULT_GEMINI_TIMEOUT_MS,
  client,
} = {}) {
  let geminiClient = client;

  return {
    async generateStructured({ input, systemInstruction, responseSchema }) {
      let resolvedTimeoutMs;

      try {
        resolvedTimeoutMs = parseTimeoutMs(timeoutMs);
      } catch (error) {
        throw new AiProviderError("GEMINI_TIMEOUT_MS is invalid", { cause: error });
      }

      if (!geminiClient) {
        if (!apiKey) {
          throw new AiProviderError("GEMINI_API_KEY is not configured");
        }

        geminiClient = new GoogleGenAI({ apiKey });
      }

      try {
        const abortController = new AbortController();
        let timeoutId;

        const providerRequest = geminiClient.interactions.create(
          {
            model,
            input: typeof input === "string" ? input : JSON.stringify(input),
            system_instruction: systemInstruction,
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: responseSchema,
            },
            store: false,
          },
          {
            timeout_ms: resolvedTimeoutMs,
            signal: abortController.signal,
          },
        );

        const timeout = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            abortController.abort();
            reject(new AiProviderError("Gemini request timed out"));
          }, resolvedTimeoutMs);
        });

        let interaction;
        try {
          interaction = await Promise.race([providerRequest, timeout]);
        } finally {
          clearTimeout(timeoutId);
        }

        if (typeof interaction.output_text !== "string" || !interaction.output_text.trim()) {
          throw new AiResponseError("Gemini returned no text output");
        }

        try {
          return JSON.parse(interaction.output_text);
        } catch (error) {
          throw new AiResponseError("Gemini returned invalid JSON", { cause: error });
        }
      } catch (error) {
        if (error instanceof AiProviderError || error instanceof AiResponseError) {
          throw error;
        }

        throw new AiProviderError("Gemini request failed", { cause: error });
      }
    },
  };
}

function parseTimeoutMs(value) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_GEMINI_TIMEOUT_MS) {
    throw new TypeError(
      `Gemini timeout must be an integer from 1 to ${MAX_GEMINI_TIMEOUT_MS} milliseconds`,
    );
  }

  return parsed;
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  MAX_GEMINI_TIMEOUT_MS,
  createGeminiAiProvider,
  parseTimeoutMs,
};
