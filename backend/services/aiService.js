class AiResponseError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "AiResponseError";
  }
}

class AiProviderError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "AiProviderError";
  }
}

module.exports = {
  AiProviderError,
  AiResponseError,
};
