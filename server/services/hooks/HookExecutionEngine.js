/**
 * Hook Execution Engine
 * Sprint 75: USP Hook Layer
 *
 * Executes hooks with timeout, error handling, and performance measurement
 */

import { uspHookRegistry, HOOK_TIMING } from './USPHookRegistry.js';

// Default hook timeout (5 seconds)
const DEFAULT_TIMEOUT_MS = 5000;

class HookExecutionEngine {
  constructor() {
    this.executionStats = new Map();
    this.errorCounts = new Map();
  }

  /**
   * Execute all hooks for a pipeline step
   * @param {string} step - Pipeline step
   * @param {Object} context - Execution context
   * @param {Object} data - Data to pass to hooks
   * @returns {Promise<Object>}
   */
  async executeHooks(step, context, data) {
    const preResults = await this._executeHooksForTiming(step, HOOK_TIMING.PRE, context, data);
    const postResults = await this._executeHooksForTiming(step, HOOK_TIMING.POST, context, data);

    return {
      step,
      pre_hooks: preResults,
      post_hooks: postResults,
      total_hooks_executed: preResults.executed + postResults.executed,
      total_time_ms: preResults.total_time_ms + postResults.total_time_ms,
      had_errors: preResults.had_errors || postResults.had_errors
    };
  }

  /**
   * Execute pre-hooks only
   * @param {string} step - Pipeline step
   * @param {Object} context - Execution context
   * @param {Object} data - Data to pass to hooks
   * @returns {Promise<Object>}
   */
  async executePreHooks(step, context, data) {
    return this._executeHooksForTiming(step, HOOK_TIMING.PRE, context, data);
  }

  /**
   * Execute post-hooks only
   * @param {string} step - Pipeline step
   * @param {Object} context - Execution context
   * @param {Object} data - Data to pass to hooks
   * @returns {Promise<Object>}
   */
  async executePostHooks(step, context, data) {
    return this._executeHooksForTiming(step, HOOK_TIMING.POST, context, data);
  }

  /**
   * Execute hooks for specific timing
   * @private
   */
  async _executeHooksForTiming(step, timing, context, data) {
    const hooks = uspHookRegistry.getHooks(step, timing);
    const results = {
      timing,
      executed: 0,
      skipped: 0,
      errors: 0,
      had_errors: false,
      total_time_ms: 0,
      hook_results: []
    };

    for (const hook of hooks) {
      const hookResult = await this._executeHook(hook, context, data);

      results.hook_results.push(hookResult);
      results.total_time_ms += hookResult.execution_time_ms;

      if (hookResult.success) {
        results.executed++;
      } else if (hookResult.skipped) {
        results.skipped++;
      } else {
        results.errors++;
        results.had_errors = true;
      }
    }

    return results;
  }

  /**
   * Execute single hook with timeout and error handling
   * @private
   */
  async _executeHook(hook, context, data) {
    const startTime = Date.now();
    const timeout = hook.config?.timeout || DEFAULT_TIMEOUT_MS;

    const result = {
      hook_id: hook.id,
      hook_name: hook.name,
      success: false,
      skipped: false,
      error: null,
      result: null,
      execution_time_ms: 0
    };

    try {
      // Check if hook should run based on context
      if (hook.config?.shouldRun && typeof hook.config.shouldRun === 'function') {
        const shouldRun = await hook.config.shouldRun(context, data);
        if (!shouldRun) {
          result.skipped = true;
          result.execution_time_ms = Date.now() - startTime;
          return result;
        }
      }

      // Execute with timeout
      const hookPromise = hook.execute(context, data);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Hook timeout after ${timeout}ms`)), timeout);
      });

      result.result = await Promise.race([hookPromise, timeoutPromise]);
      result.success = true;

    } catch (error) {
      result.error = error.message;
      this._recordError(hook.id, error);
      console.error(`[HookExecutionEngine] Hook ${hook.name} failed:`, error.message);
    }

    result.execution_time_ms = Date.now() - startTime;
    this._recordExecution(hook.id, result.execution_time_ms, result.success);

    return result;
  }

  /**
   * Handle hook failure (for external error handling)
   * @param {Object} hook - Hook that failed
   * @param {Error} error - Error that occurred
   */
  handleHookFailure(hook, error) {
    this._recordError(hook.id, error);

    // Check if hook should be disabled after too many failures
    const errorCount = this.errorCounts.get(hook.id) || 0;
    const maxErrors = hook.config?.maxErrors || 10;

    if (errorCount >= maxErrors) {
      console.warn(`[HookExecutionEngine] Disabling hook ${hook.name} after ${errorCount} errors`);
      uspHookRegistry.setEnabled(hook.id, false);
    }
  }

  /**
   * Measure hook performance
   * @param {string} hookId - Hook ID
   * @returns {Object} Performance statistics
   */
  measureHookPerformance(hookId) {
    const stats = this.executionStats.get(hookId);

    if (!stats || stats.executions === 0) {
      return {
        hook_id: hookId,
        executions: 0,
        avg_time_ms: 0,
        min_time_ms: 0,
        max_time_ms: 0,
        success_rate: 0,
        error_count: this.errorCounts.get(hookId) || 0
      };
    }

    return {
      hook_id: hookId,
      executions: stats.executions,
      avg_time_ms: Math.round(stats.total_time / stats.executions),
      min_time_ms: stats.min_time,
      max_time_ms: stats.max_time,
      success_rate: Math.round((stats.successes / stats.executions) * 100),
      error_count: this.errorCounts.get(hookId) || 0
    };
  }

  /**
   * Get all hook performance stats
   * @returns {Object[]}
   */
  getAllPerformanceStats() {
    const hooks = uspHookRegistry.listHooks();
    return hooks.map(hook => ({
      ...this.measureHookPerformance(hook.id),
      hook_name: hook.name,
      step: hook.step,
      timing: hook.timing,
      enabled: hook.enabled
    }));
  }

  /**
   * Record execution statistics
   * @private
   */
  _recordExecution(hookId, timeMs, success) {
    let stats = this.executionStats.get(hookId);

    if (!stats) {
      stats = {
        executions: 0,
        successes: 0,
        total_time: 0,
        min_time: Infinity,
        max_time: 0
      };
    }

    stats.executions++;
    stats.total_time += timeMs;
    stats.min_time = Math.min(stats.min_time, timeMs);
    stats.max_time = Math.max(stats.max_time, timeMs);

    if (success) {
      stats.successes++;
    }

    this.executionStats.set(hookId, stats);
  }

  /**
   * Record error
   * @private
   */
  _recordError(hookId, error) {
    const count = (this.errorCounts.get(hookId) || 0) + 1;
    this.errorCounts.set(hookId, count);
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.executionStats.clear();
    this.errorCounts.clear();
  }
}

// Singleton instance
export const hookExecutionEngine = new HookExecutionEngine();
export default hookExecutionEngine;
