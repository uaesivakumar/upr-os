/**
 * Base LLM Provider Adapter
 * Sprint 51: LLM Engine Routing
 *
 * Abstract base class for all LLM provider adapters.
 * Each provider (OpenAI, Anthropic, Vertex) extends this.
 */

/**
 * @typedef {Object} LLMMessage
 * @property {'system' | 'user' | 'assistant'} role
 * @property {string} content
 * @property {string} [name]
 */

/**
 * @typedef {Object} LLMCompletionOptions
 * @property {number} [temperature=0.7]
 * @property {number} [maxTokens]
 * @property {number} [topP]
 * @property {string[]} [stop]
 * @property {boolean} [stream=false]
 * @property {Object} [responseFormat]
 * @property {Object[]} [tools]
 */

/**
 * @typedef {Object} LLMCompletionResult
 * @property {string} content
 * @property {string} model
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {string} [finishReason]
 * @property {Object[]} [toolCalls]
 * @property {number} latencyMs
 */

/**
 * Base class for LLM provider adapters
 */
export class BaseLLMProvider {
  constructor(config = {}) {
    this.providerType = 'base';
    this.config = config;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.defaultModel;
    this.timeout = config.timeout || 60000;
  }

  /**
   * Get provider type identifier
   * @returns {string}
   */
  getProviderType() {
    return this.providerType;
  }

  /**
   * Check if provider is configured and ready
   * @returns {boolean}
   */
  isReady() {
    return !!this.apiKey;
  }

  /**
   * Normalize messages to provider-specific format
   * @param {LLMMessage[]} messages
   * @returns {any[]}
   */
  normalizeMessages(messages) {
    // Override in subclass
    return messages;
  }

  /**
   * Generate a completion
   * @param {string} model
   * @param {LLMMessage[]} messages
   * @param {LLMCompletionOptions} options
   * @returns {Promise<LLMCompletionResult>}
   */
  async complete(model, messages, options = {}) {
    throw new Error('complete() must be implemented by subclass');
  }

  /**
   * Generate a streaming completion
   * @param {string} model
   * @param {LLMMessage[]} messages
   * @param {LLMCompletionOptions} options
   * @returns {AsyncGenerator<string>}
   */
  async *streamComplete(model, messages, options = {}) {
    throw new Error('streamComplete() must be implemented by subclass');
  }

  /**
   * Count tokens in text (approximate if provider doesn't support)
   * @param {string} text
   * @param {string} [model]
   * @returns {Promise<number>}
   */
  async countTokens(text, model) {
    // Default rough estimate: 4 chars per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if model supports a specific capability
   * @param {string} model
   * @param {'vision' | 'functions' | 'json' | 'streaming'} capability
   * @returns {boolean}
   */
  supportsCapability(model, capability) {
    return false;
  }

  /**
   * Get model info
   * @param {string} model
   * @returns {Object}
   */
  getModelInfo(model) {
    return {
      model,
      provider: this.providerType,
      maxInputTokens: 128000,
      maxOutputTokens: 4096
    };
  }

  /**
   * Health check for the provider
   * @returns {Promise<{healthy: boolean, latencyMs: number, error?: string}>}
   */
  async healthCheck() {
    const startTime = Date.now();
    try {
      // Simple completion test
      const result = await this.complete(this.defaultModel, [
        { role: 'user', content: 'Say "ok"' }
      ], { maxTokens: 5 });

      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
        model: this.defaultModel
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Handle rate limit errors
   * @param {Error} error
   * @returns {{isRateLimited: boolean, retryAfterMs?: number}}
   */
  parseRateLimitError(error) {
    return { isRateLimited: false };
  }
}

export default BaseLLMProvider;
