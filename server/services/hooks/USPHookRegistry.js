/**
 * USP Hook Registry
 * Sprint 75: USP Hook Layer
 *
 * Hook registration system for pipeline step hooks
 * Supports pre/post hooks at each pipeline step
 */

import { v4 as uuidv4 } from 'uuid';

// Pipeline steps where hooks can be registered
export const HOOK_POINTS = {
  DISCOVERY: 'discovery',
  ENRICHMENT: 'enrichment',
  SCORING: 'scoring',
  RANKING: 'ranking',
  OUTREACH: 'outreach'
};

// Hook timing
export const HOOK_TIMING = {
  PRE: 'pre',
  POST: 'post'
};

/**
 * Hook interface definition
 * @typedef {Object} HookDefinition
 * @property {string} id - Unique hook ID
 * @property {string} name - Human-readable name
 * @property {string} step - Pipeline step (from HOOK_POINTS)
 * @property {string} timing - pre or post
 * @property {number} priority - Execution order (lower = earlier)
 * @property {Function} execute - Hook execution function
 * @property {boolean} enabled - Whether hook is enabled
 * @property {Object} config - Hook configuration
 */

class USPHookRegistry {
  constructor() {
    // Map of step -> timing -> hooks[]
    this.hooks = new Map();
    this.hookInstances = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the registry
   */
  initialize() {
    if (this.initialized) return;

    // Initialize hook storage for each step and timing
    for (const step of Object.values(HOOK_POINTS)) {
      this.hooks.set(`${step}:${HOOK_TIMING.PRE}`, []);
      this.hooks.set(`${step}:${HOOK_TIMING.POST}`, []);
    }

    this.initialized = true;
    console.log('[USPHookRegistry] Initialized');
  }

  /**
   * Register a hook
   * @param {Object} hookDefinition - Hook definition
   * @returns {string} Hook ID
   */
  register(hookDefinition) {
    this.initialize();

    const {
      name,
      step,
      timing = HOOK_TIMING.POST,
      priority = 100,
      execute,
      enabled = true,
      config = {}
    } = hookDefinition;

    if (!Object.values(HOOK_POINTS).includes(step)) {
      throw new Error(`Invalid hook step: ${step}`);
    }

    if (!Object.values(HOOK_TIMING).includes(timing)) {
      throw new Error(`Invalid hook timing: ${timing}`);
    }

    if (typeof execute !== 'function') {
      throw new Error('Hook execute must be a function');
    }

    const hookId = uuidv4();
    const hook = {
      id: hookId,
      name,
      step,
      timing,
      priority,
      execute,
      enabled,
      config,
      registeredAt: new Date()
    };

    const key = `${step}:${timing}`;
    const hooks = this.hooks.get(key) || [];
    hooks.push(hook);
    hooks.sort((a, b) => a.priority - b.priority);
    this.hooks.set(key, hooks);

    this.hookInstances.set(hookId, hook);

    console.log(`[USPHookRegistry] Registered hook: ${name} (${step}:${timing})`);

    return hookId;
  }

  /**
   * Unregister a hook
   * @param {string} hookId - Hook ID
   * @returns {boolean} Success
   */
  unregister(hookId) {
    const hook = this.hookInstances.get(hookId);
    if (!hook) return false;

    const key = `${hook.step}:${hook.timing}`;
    const hooks = this.hooks.get(key) || [];
    const index = hooks.findIndex(h => h.id === hookId);

    if (index >= 0) {
      hooks.splice(index, 1);
      this.hooks.set(key, hooks);
    }

    this.hookInstances.delete(hookId);
    console.log(`[USPHookRegistry] Unregistered hook: ${hook.name}`);

    return true;
  }

  /**
   * Enable/disable a hook
   * @param {string} hookId - Hook ID
   * @param {boolean} enabled - Enabled state
   */
  setEnabled(hookId, enabled) {
    const hook = this.hookInstances.get(hookId);
    if (hook) {
      hook.enabled = enabled;
    }
  }

  /**
   * Get hooks for a step and timing
   * @param {string} step - Pipeline step
   * @param {string} timing - pre or post
   * @returns {Object[]} Hooks
   */
  getHooks(step, timing) {
    const key = `${step}:${timing}`;
    return (this.hooks.get(key) || []).filter(h => h.enabled);
  }

  /**
   * Get hook by ID
   * @param {string} hookId - Hook ID
   * @returns {Object|null} Hook
   */
  getHook(hookId) {
    return this.hookInstances.get(hookId) || null;
  }

  /**
   * List all registered hooks
   * @returns {Object[]} All hooks
   */
  listHooks() {
    return Array.from(this.hookInstances.values());
  }

  /**
   * Get hook statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const stats = {
      total: this.hookInstances.size,
      enabled: 0,
      disabled: 0,
      byStep: {},
      byTiming: {
        pre: 0,
        post: 0
      }
    };

    for (const hook of this.hookInstances.values()) {
      if (hook.enabled) {
        stats.enabled++;
      } else {
        stats.disabled++;
      }

      stats.byStep[hook.step] = (stats.byStep[hook.step] || 0) + 1;
      stats.byTiming[hook.timing]++;
    }

    return stats;
  }

  /**
   * Clear all hooks
   */
  clear() {
    for (const key of this.hooks.keys()) {
      this.hooks.set(key, []);
    }
    this.hookInstances.clear();
    console.log('[USPHookRegistry] Cleared all hooks');
  }
}

// Singleton instance
export const uspHookRegistry = new USPHookRegistry();
export default uspHookRegistry;
