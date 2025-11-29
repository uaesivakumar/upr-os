/**
 * Vertex AI Provider Adapter
 * Sprint 51: LLM Engine Routing
 *
 * Adapter for Google Vertex AI (Gemini models)
 */

import { BaseLLMProvider } from './base.js';

const VERTEX_MODELS = {
  'gemini-1.5-pro': {
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true
  },
  'gemini-1.5-flash': {
    maxInputTokens: 1000000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsFunctions: true,
    supportsJson: true
  },
  'gemini-1.0-pro': {
    maxInputTokens: 30720,
    maxOutputTokens: 2048,
    supportsVision: false,
    supportsFunctions: true,
    supportsJson: true
  },
  'gemini-1.0-pro-vision': {
    maxInputTokens: 12288,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsFunctions: false,
    supportsJson: false
  }
};

export class VertexAIProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.providerType = 'vertex';
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT;
    this.location = config.location || process.env.VERTEX_AI_LOCATION || 'us-central1';
    this.defaultModel = config.defaultModel || 'gemini-1.5-pro';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get access token for Vertex AI
   * Uses Application Default Credentials
   */
  async getAccessToken() {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Use Google Auth Library or gcloud CLI
    try {
      // Try using gcloud CLI for token (development)
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('gcloud auth print-access-token');
      this.accessToken = stdout.trim();
      this.tokenExpiry = Date.now() + 3500000; // ~58 minutes

      return this.accessToken;
    } catch (error) {
      // In production, use metadata server or service account
      try {
        const response = await fetch(
          'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
          { headers: { 'Metadata-Flavor': 'Google' } }
        );

        if (response.ok) {
          const data = await response.json();
          this.accessToken = data.access_token;
          this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
          return this.accessToken;
        }
      } catch {
        // Fall through to error
      }

      throw new Error('Unable to obtain Vertex AI access token');
    }
  }

  /**
   * Get the API endpoint for a model
   */
  getEndpoint(model) {
    return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}:generateContent`;
  }

  /**
   * Get streaming endpoint
   */
  getStreamEndpoint(model) {
    return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}:streamGenerateContent`;
  }

  /**
   * Normalize messages for Gemini format
   */
  normalizeMessages(messages) {
    let systemInstruction = null;
    const contents = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        const parts = [];

        // Add text content
        if (msg.content) {
          parts.push({ text: msg.content });
        }

        // Add image content
        if (msg.images && msg.images.length > 0) {
          for (const img of msg.images) {
            if (img.data) {
              parts.push({
                inline_data: {
                  mime_type: img.mediaType || 'image/jpeg',
                  data: img.data
                }
              });
            } else if (img.url) {
              parts.push({
                file_data: {
                  mime_type: img.mediaType || 'image/jpeg',
                  file_uri: img.url
                }
              });
            }
          }
        }

        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        });
      }
    }

    return { systemInstruction, contents };
  }

  /**
   * Convert tools to Gemini format
   */
  convertTools(tools) {
    if (!tools || tools.length === 0) return undefined;

    return [{
      function_declarations: tools.map(tool => {
        if (tool.type === 'function') {
          return {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          };
        }
        return tool;
      })
    }];
  }

  /**
   * Generate a completion using Vertex AI
   */
  async complete(model, messages, options = {}) {
    const startTime = Date.now();

    const accessToken = await this.getAccessToken();
    const { systemInstruction, contents } = this.normalizeMessages(messages);

    const requestBody = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens || 8192,
        topP: options.topP,
        stopSequences: options.stop
      }
    };

    // Add system instruction if present
    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    // Add JSON response format if requested
    if (options.responseFormat?.type === 'json_object') {
      requestBody.generationConfig.responseMimeType = 'application/json';
    }

    // Add tools if provided
    const tools = this.convertTools(options.tools);
    if (tools) {
      requestBody.tools = tools;
    }

    const response = await fetch(this.getEndpoint(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error?.message || `Vertex AI error: ${response.status}`);
      error.status = response.status;
      error.code = errorData.error?.code;
      throw error;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];

    // Extract content and tool calls
    let content = '';
    let toolCalls = [];

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          content += part.text;
        } else if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args)
            }
          });
        }
      }
    }

    // Calculate tokens from usage metadata
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

    return {
      content,
      model,
      inputTokens,
      outputTokens,
      finishReason: this.mapFinishReason(candidate?.finishReason),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      latencyMs: Date.now() - startTime
    };
  }

  /**
   * Generate a streaming completion
   */
  async *streamComplete(model, messages, options = {}) {
    const accessToken = await this.getAccessToken();
    const { systemInstruction, contents } = this.normalizeMessages(messages);

    const requestBody = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens || 8192,
        topP: options.topP,
        stopSequences: options.stop
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    const response = await fetch(this.getStreamEndpoint(model) + '?alt=sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Vertex AI error: ${response.status}`);
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
            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                yield text;
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
   * Map Gemini finish reason to OpenAI format
   */
  mapFinishReason(reason) {
    const mapping = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };
    return mapping[reason] || reason;
  }

  /**
   * Check readiness (need project ID)
   */
  isReady() {
    return !!this.projectId;
  }

  /**
   * Count tokens
   */
  async countTokens(text, model) {
    // Gemini uses roughly 4 chars per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check capabilities
   */
  supportsCapability(model, capability) {
    const info = VERTEX_MODELS[model] || VERTEX_MODELS['gemini-1.5-pro'];

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
    const info = VERTEX_MODELS[model] || VERTEX_MODELS['gemini-1.5-pro'];
    return {
      model,
      provider: 'vertex',
      ...info
    };
  }

  /**
   * Parse rate limit error
   */
  parseRateLimitError(error) {
    if (error.status === 429 || error.code === 'RESOURCE_EXHAUSTED') {
      return {
        isRateLimited: true,
        retryAfterMs: 60000
      };
    }
    return { isRateLimited: false };
  }
}

export default VertexAIProvider;
