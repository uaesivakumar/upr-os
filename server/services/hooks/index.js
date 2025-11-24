/**
 * USP Hook Layer - Main Export
 * Sprint 75: USP Hook Layer
 *
 * SIVA-X hooks, Reasoning Pack interface, Enterprise Intelligence Metrics
 */

export { uspHookRegistry, HOOK_POINTS, HOOK_TIMING, default as USPHookRegistry } from './USPHookRegistry.js';
export { hookExecutionEngine, default as HookExecutionEngine } from './HookExecutionEngine.js';
export { SIVAXHook, createSIVAXHook } from './SIVAXHook.js';
export {
  ReasoningPack,
  BankingReasoningPack,
  InsuranceReasoningPack,
  SaaSReasoningPack,
  createReasoningPack
} from './ReasoningPack.js';

/**
 * Initialize all default hooks
 * @param {Object} config - Configuration options
 */
export function initializeHooks(config = {}) {
  const { enableSIVAX = true, enableReasoningPacks = true, verticals = [] } = config;

  if (enableSIVAX) {
    const { createSIVAXHook } = require('./SIVAXHook.js');
    createSIVAXHook(config.sivaConfig);
  }

  if (enableReasoningPacks) {
    const { createReasoningPack } = require('./ReasoningPack.js');

    // Register packs for specified verticals
    const defaultVerticals = ['banking_employee', 'insurance_individual', 'saas_b2b'];
    const activeVerticals = verticals.length > 0 ? verticals : defaultVerticals;

    for (const verticalId of activeVerticals) {
      const pack = createReasoningPack(verticalId, config.packConfig);
      pack.register();
    }
  }

  console.log('[Hooks] Initialized default hooks');
}
