/**
 * OpenAI Provider Adapter
 * Sprint 51: LLM Engine Routing
 *
 * Adapter for OpenAI API (GPT-4, GPT-4o, etc.)
 */

import { BaseLLMProvider } from './base.js';

const OPENAI_MODELS = {
  'gpt-4o': {
    maxInputTokens: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true
  },
  'gpt-4o-mini': {
    maxInputTokens: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true
  },
  'gpt-4-turbo': {
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true
  },
  'gpt-4': {
    maxInputTokens: 8192,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true
  },
  'gpt-3.5-turbo': {
    maxInputTokens: 16385,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true
  }
};

export class OpenAIProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.providerType = 'openai';
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.defaultModel = config.defaultModel || 'gpt-4o';
    this.organization = config.organization || process.env.OPENAI_ORG_ID;
  }

  /**
   * Normalize messages for OpenAI format
   */
  normalizeMessages(messages) {
    return messages.map(msg => {
      const normalized = {
        role: msg.role,
        content: msg.content
      };

      if (msg.name) {
        normalized.name = msg.name;
      }

      // Handle vision content
      if (msg.images && msg.images.length > 0) {
        normalized.content = [
          { type: 'text', text: msg.content },
          ...msg.images.map(img => ({
            type: 'image_url',
            image_url: { url: img.url, detail: img.detail || 'auto' }
          }))
        ];
      }

      return normalized;
    });
  }

  /**
   * Generate a completion using OpenAI API
   */
  async complete(model, messages, options = {}) {
    const startTime = Date.now();

    const normalizedMessages = this.normalizeMessages(messages);

    const requestBody = {
      model,
      messages: normalizedMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stop: options.stop,
      stream: false
    };

    // Add JSON mode if requested
    if (options.responseFormat?.type === 'json_object') {
      requestBody.response_format = { type: 'json_object' };
    }

    // Add tools/functions if provided
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      if (options.toolChoice) {
        requestBody.tool_choice = options.toolChoice;
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
      error.status = response.status;
      error.code = errorData.error?.code;
      throw error;
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message.content || '',
      model: data.model,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      finishReason: choice.finish_reason,
      toolCalls: choice.message.tool_calls,
      latencyMs: Date.now() - startTime
    };
  }

  /**
   * Generate a streaming completion
   */
  async *streamComplete(model, messages, options = {}) {
    const normalizedMessages = this.normalizeMessages(messages);

    const requestBody = {
      model,
      messages: normalizedMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stop: options.stop,
      stream: true,
      stream_options: { include_usage: true }
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Count tokens using tiktoken approximation
   */
  async countTokens(text, model = 'gpt-4o') {
    // Rough approximation: ~4 characters per token for GPT models
    // More accurate would be to use tiktoken library
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if model supports a capability
   */
  supportsCapability(model, capability) {
    const info = OPENAI_MODELS[model] || OPENAI_MODELS['gpt-4o'];

    switch (capability) {
      case 'vision': return info.supportsVision;
      case 'functions': return info.supportsFunctions;
      case 'json': return info.supportsJson;
      case 'streaming': return true;
      default: return false;
    }
  }

  /**
   * Get model info
   */
  getModelInfo(model) {
    const info = OPENAI_MODELS[model] || OPENAI_MODELS['gpt-4o'];
    return {
      model,
      provider: 'openai',
      ...info
    };
  }

  /**
   * Parse rate limit error
   */
  parseRateLimitError(error) {
    if (error.status === 429) {
      // Try to parse retry-after header
      const retryAfter = error.headers?.get?.('retry-after');
      return {
        isRateLimited: true,
        retryAfterMs: retryAfter ? parseInt(retryAfter) * 1000 : 60000
      };
    }
    return { isRateLimited: false };
  }
}

export default OpenAIProvider;
