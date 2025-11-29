/**
 * Anthropic Provider Adapter
 * Sprint 51: LLM Engine Routing
 *
 * Adapter for Anthropic Claude API (Claude 3 Opus, Sonnet, Haiku)
 */

import { BaseLLMProvider } from './base.js';

const ANTHROPIC_MODELS = {
  'claude-3-5-sonnet-20241022': {
    maxInputTokens: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: false // Use tool_use instead
  },
  'claude-3-5-haiku-20241022': {
    maxInputTokens: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: false
  },
  'claude-3-opus-20240229': {
    maxInputTokens: 200000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: false
  },
  'claude-3-sonnet-20240229': {
    maxInputTokens: 200000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: false
  },
  'claude-3-haiku-20240307': {
    maxInputTokens: 200000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: false
  }
};

export class AnthropicProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.providerType = 'anthropic';
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    this.defaultModel = config.defaultModel || 'claude-3-5-sonnet-20241022';
    this.apiVersion = config.apiVersion || '2023-06-01';
  }

  /**
   * Normalize messages for Anthropic format
   * Anthropic uses a different message format than OpenAI
   */
  normalizeMessages(messages) {
    // Separate system message from conversation
    let systemMessage = '';
    const conversationMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessage += (systemMessage ? '\n\n' : '') + msg.content;
      } else {
        const normalized = {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        };

        // Handle vision content
        if (msg.images && msg.images.length > 0) {
          normalized.content = [
            { type: 'text', text: msg.content },
            ...msg.images.map(img => ({
              type: 'image',
              source: {
                type: img.type || 'base64',
                media_type: img.mediaType || 'image/jpeg',
                data: img.data || img.url
              }
            }))
          ];
        }

        conversationMessages.push(normalized);
      }
    }

    return { systemMessage, conversationMessages };
  }

  /**
   * Convert OpenAI-style tools to Anthropic format
   */
  convertTools(tools) {
    if (!tools) return undefined;

    return tools.map(tool => {
      if (tool.type === 'function') {
        return {
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        };
      }
      return tool;
    });
  }

  /**
   * Generate a completion using Anthropic API
   */
  async complete(model, messages, options = {}) {
    const startTime = Date.now();

    const { systemMessage, conversationMessages } = this.normalizeMessages(messages);

    const requestBody = {
      model,
      messages: conversationMessages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stop_sequences: options.stop
    };

    // Add system message if present
    if (systemMessage) {
      requestBody.system = systemMessage;
    }

    // Add tools if provided
    const tools = this.convertTools(options.tools);
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      if (options.toolChoice) {
        requestBody.tool_choice = this.convertToolChoice(options.toolChoice);
      }
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error?.message || `Anthropic API error: ${response.status}`);
      error.status = response.status;
      error.type = errorData.error?.type;
      throw error;
    }

    const data = await response.json();

    // Extract text content and tool use
    let content = '';
    let toolCalls = [];

    for (const block of data.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        });
      }
    }

    return {
      content,
      model: data.model,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      finishReason: this.mapStopReason(data.stop_reason),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      latencyMs: Date.now() - startTime
    };
  }

  /**
   * Generate a streaming completion
   */
  async *streamComplete(model, messages, options = {}) {
    const { systemMessage, conversationMessages } = this.normalizeMessages(messages);

    const requestBody = {
      model,
      messages: conversationMessages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stop_sequences: options.stop,
      stream: true
    };

    if (systemMessage) {
      requestBody.system = systemMessage;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Anthropic API error: ${response.status}`);
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

              // Handle different event types
              if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta;
                if (delta?.type === 'text_delta' && delta.text) {
                  yield delta.text;
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Convert tool choice format
   */
  convertToolChoice(toolChoice) {
    if (typeof toolChoice === 'string') {
      if (toolChoice === 'auto') return { type: 'auto' };
      if (toolChoice === 'none') return { type: 'any' }; // Anthropic doesn't have 'none'
      if (toolChoice === 'required') return { type: 'any' };
    }
    if (toolChoice?.type === 'function') {
      return { type: 'tool', name: toolChoice.function.name };
    }
    return { type: 'auto' };
  }

  /**
   * Map Anthropic stop_reason to OpenAI finish_reason
   */
  mapStopReason(stopReason) {
    const mapping = {
      'end_turn': 'stop',
      'max_tokens': 'length',
      'stop_sequence': 'stop',
      'tool_use': 'tool_calls'
    };
    return mapping[stopReason] || stopReason;
  }

  /**
   * Count tokens (Anthropic-specific tokenization)
   */
  async countTokens(text, model) {
    // Claude uses a different tokenizer, roughly 3.5 chars per token
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Check if model supports a capability
   */
  supportsCapability(model, capability) {
    const info = ANTHROPIC_MODELS[model] || ANTHROPIC_MODELS['claude-3-5-sonnet-20241022'];

    switch (capability) {
      case 'vision': return info.supportsVision;
      case 'functions': return info.supportsFunctions;
      case 'json': return false; // Use structured output via tools
      case 'streaming': return true;
      default: return false;
    }
  }

  /**
   * Get model info
   */
  getModelInfo(model) {
    const info = ANTHROPIC_MODELS[model] || ANTHROPIC_MODELS['claude-3-5-sonnet-20241022'];
    return {
      model,
      provider: 'anthropic',
      ...info
    };
  }

  /**
   * Parse rate limit error
   */
  parseRateLimitError(error) {
    if (error.status === 429 || error.type === 'rate_limit_error') {
      return {
        isRateLimited: true,
        retryAfterMs: 60000 // Default 1 minute
      };
    }
    return { isRateLimited: false };
  }
}

export default AnthropicProvider;
