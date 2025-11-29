/**
 * LLM Provider Index
 * Sprint 51: LLM Engine Routing
 *
 * Exports all available LLM provider adapters
 */

export { BaseLLMProvider } from './base.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { VertexAIProvider } from './vertex.js';

// Provider type to class mapping
export const PROVIDER_CLASSES = {
  openai: (await import('./openai.js')).OpenAIProvider,
  anthropic: (await import('./anthropic.js')).AnthropicProvider,
  vertex: (await import('./vertex.js')).VertexAIProvider,
  azure: (await import('./openai.js')).OpenAIProvider // Azure uses OpenAI-compatible API
};

/**
 * Create a provider instance by type
 * @param {string} providerType
 * @param {Object} config
 * @returns {BaseLLMProvider}
 */
export function createProvider(providerType, config = {}) {
  const ProviderClass = PROVIDER_CLASSES[providerType];
  if (!ProviderClass) {
    throw new Error(`Unknown provider type: ${providerType}`);
  }
  return new ProviderClass(config);
}

/**
 * Get all available provider types
 * @returns {string[]}
 */
export function getAvailableProviders() {
  return Object.keys(PROVIDER_CLASSES);
}
