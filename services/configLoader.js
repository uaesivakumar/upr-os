/**
 * Config Loader Service
 * Sprint 55: Config-Driven OS Kernel
 *
 * ARCHITECTURAL RULES:
 * ════════════════════════════════════════════════════════════════════════════
 * 1. All OS kernel modules MUST read configs ONLY via this Config Loader service.
 *    Direct DB access for config is FORBIDDEN.
 *
 *    Architecture: OS Kernel ← ConfigLoaderAPI ← SaaS Tenant Config
 *
 * 2. OS kernel logic MUST be deterministic:
 *    Given the same config + input → it MUST yield the same output.
 *    This is critical for:
 *    - Autonomous mode (deterministic steps)
 *    - Journey replay (reproducibility)
 *    - Predictive intelligence validation
 *    - Enterprise-grade debugging
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Centralized config access (single chokepoint)
 * - In-memory caching with TTL
 * - Environment-aware config resolution
 * - Vertical/territory config overlays
 * - Hot reload support
 * - Deterministic config resolution
 */

import { query } from '../db/index.js';
import { EventEmitter } from 'events';

// ============================================================================
// CONFIG CACHE
// ============================================================================

class ConfigCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }

  get(key) {
    const expiry = this.ttl.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.ttl.delete(key);
      return undefined;
    }
    return this.cache.get(key);
  }

  set(key, value, ttlSeconds = 300) {
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttlSeconds * 1000);
  }

  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  clear() {
    this.cache.clear();
    this.ttl.clear();
  }

  has(key) {
    const value = this.get(key);
    return value !== undefined;
  }

  keys() {
    return Array.from(this.cache.keys());
  }
}

// ============================================================================
// CONFIG LOADER
// ============================================================================

class ConfigLoader extends EventEmitter {
  constructor() {
    super();
    this.cache = new ConfigCache();
    this.environment = process.env.NODE_ENV || 'production';
    this.initialized = false;
    this.defaultTTL = 300; // 5 minutes
  }

  /**
   * Initialize config loader (load essential configs)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Pre-load essential namespaces
      const essentialNamespaces = ['system', 'discovery', 'enrichment', 'scoring', 'llm', 'pipeline'];
      await Promise.all(
        essentialNamespaces.map(ns => this.loadNamespace(ns))
      );

      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize config loader:', error);
      throw error;
    }
  }

  // ==========================================================================
  // CORE CONFIG ACCESS (SINGLE CHOKEPOINT)
  // ==========================================================================

  /**
   * Get a single config value
   * @param {string} namespace - Config namespace (e.g., 'discovery')
   * @param {string} key - Config key
   * @param {object} context - Optional context for overlays (vertical, territory)
   * @returns {any} Config value
   */
  async get(namespace, key, context = {}) {
    const cacheKey = this._buildCacheKey(namespace, key, context);

    // Check cache first
    let value = this.cache.get(cacheKey);
    if (value !== undefined) {
      return this._parseValue(value);
    }

    // Load from database
    value = await this._loadConfig(namespace, key, context);
    return this._parseValue(value);
  }

  /**
   * Get all configs for a namespace
   * @param {string} namespace - Config namespace
   * @param {object} context - Optional context for overlays
   * @returns {object} All config key-value pairs
   */
  async getNamespace(namespace, context = {}) {
    const cacheKey = `ns:${namespace}:${this.environment}:${JSON.stringify(context)}`;

    let configs = this.cache.get(cacheKey);
    if (configs !== undefined) {
      return this._parseNamespaceValues(configs);
    }

    configs = await this.loadNamespace(namespace, context);
    return this._parseNamespaceValues(configs);
  }

  /**
   * Get multiple config values at once (batch)
   * @param {Array<{namespace: string, key: string}>} keys - Array of namespace/key pairs
   * @param {object} context - Optional context for overlays
   * @returns {object} Config values keyed by "namespace.key"
   */
  async getMany(keys, context = {}) {
    const results = {};

    await Promise.all(
      keys.map(async ({ namespace, key }) => {
        const value = await this.get(namespace, key, context);
        results[`${namespace}.${key}`] = value;
      })
    );

    return results;
  }

  /**
   * Get config with default fallback (deterministic)
   * @param {string} namespace - Config namespace
   * @param {string} key - Config key
   * @param {any} defaultValue - Default value if not found
   * @param {object} context - Optional context
   * @returns {any} Config value or default
   */
  async getOrDefault(namespace, key, defaultValue, context = {}) {
    const value = await this.get(namespace, key, context);
    return value !== null && value !== undefined ? value : defaultValue;
  }

  // ==========================================================================
  // NAMESPACE LOADING
  // ==========================================================================

  async loadNamespace(namespace, context = {}) {
    const sql = `SELECT get_namespace_config($1, $2) as config`;
    const result = await query(sql, [namespace, this.environment]);
    const configs = result.rows[0]?.config || {};

    // Apply overlays if context provided
    const finalConfigs = await this._applyOverlays(namespace, configs, context);

    // Cache the namespace
    const cacheKey = `ns:${namespace}:${this.environment}:${JSON.stringify(context)}`;
    this.cache.set(cacheKey, finalConfigs, this.defaultTTL);

    return finalConfigs;
  }

  // ==========================================================================
  // DETERMINISTIC CONFIG RESOLUTION
  // ==========================================================================

  /**
   * Get deterministic config snapshot for a given context.
   * This ensures reproducibility for journey replay and debugging.
   *
   * @param {Array<string>} namespaces - Namespaces to include
   * @param {object} context - Context (vertical, territory, etc.)
   * @returns {object} Frozen config snapshot
   */
  async getSnapshot(namespaces, context = {}) {
    const snapshot = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      context: { ...context },
      config: {}
    };

    for (const namespace of namespaces) {
      snapshot.config[namespace] = await this.getNamespace(namespace, context);
    }

    // Freeze for immutability (determinism)
    return Object.freeze(snapshot);
  }

  /**
   * Validate config snapshot matches current config.
   * Used for journey replay validation.
   */
  async validateSnapshot(snapshot, namespaces) {
    const currentSnapshot = await this.getSnapshot(namespaces, snapshot.context);

    const differences = [];
    for (const namespace of namespaces) {
      const snapshotConfig = snapshot.config[namespace] || {};
      const currentConfig = currentSnapshot.config[namespace] || {};

      for (const key of new Set([...Object.keys(snapshotConfig), ...Object.keys(currentConfig)])) {
        if (JSON.stringify(snapshotConfig[key]) !== JSON.stringify(currentConfig[key])) {
          differences.push({
            namespace,
            key,
            snapshotValue: snapshotConfig[key],
            currentValue: currentConfig[key]
          });
        }
      }
    }

    return {
      valid: differences.length === 0,
      differences
    };
  }

  // ==========================================================================
  // OVERLAYS (VERTICAL, TERRITORY, CUSTOM)
  // ==========================================================================

  async _applyOverlays(namespace, baseConfig, context) {
    let config = { ...baseConfig };

    // Apply vertical overlay
    if (context.vertical) {
      const verticalOverlay = await this._getVerticalOverlay(namespace, context.vertical);
      config = this._mergeConfig(config, verticalOverlay);
    }

    // Apply territory overlay
    if (context.territory) {
      const territoryOverlay = await this._getTerritoryOverlay(namespace, context.territory);
      config = this._mergeConfig(config, territoryOverlay);
    }

    // Apply custom overlay
    if (context.customOverlay) {
      config = this._mergeConfig(config, context.customOverlay);
    }

    return config;
  }

  async _getVerticalOverlay(namespace, verticalSlug) {
    const sql = `
      SELECT config FROM os_kernel_config_presets
      WHERE vertical_slug = $1 AND preset_type = 'vertical' AND is_active = true
    `;
    const result = await query(sql, [verticalSlug]);
    if (!result.rows[0]) return {};

    const presetConfig = result.rows[0].config;
    const overlay = {};

    for (const [fullKey, value] of Object.entries(presetConfig)) {
      const [ns, ...keyParts] = fullKey.split('.');
      if (ns === namespace) {
        overlay[keyParts.join('.')] = value;
      }
    }

    return overlay;
  }

  async _getTerritoryOverlay(namespace, territorySlug) {
    const sql = `
      SELECT config, inherited_config FROM territories WHERE slug = $1
    `;
    const result = await query(sql, [territorySlug]);
    if (!result.rows[0]) return {};

    const territory = result.rows[0];
    const effectiveConfig = { ...territory.inherited_config, ...territory.config };

    // Extract namespace-specific config
    const overlay = {};
    for (const [key, value] of Object.entries(effectiveConfig)) {
      if (key.startsWith(`${namespace}_`) || key.startsWith(`${namespace}.`)) {
        const configKey = key.replace(`${namespace}_`, '').replace(`${namespace}.`, '');
        overlay[configKey] = value;
      }
    }

    return overlay;
  }

  _mergeConfig(base, overlay) {
    const result = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        result[key] = this._mergeConfig(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // ==========================================================================
  // HOT RELOAD
  // ==========================================================================

  /**
   * Reload all configs (hot reload)
   */
  async reload() {
    this.cache.clear();
    await this.initialize();
    this.emit('reloaded');
  }

  /**
   * Reload specific namespace
   */
  async reloadNamespace(namespace) {
    // Clear all cached entries for this namespace
    for (const key of this.cache.keys()) {
      if (key.startsWith(`ns:${namespace}:`) || key.startsWith(`${namespace}:`)) {
        this.cache.delete(key);
      }
    }
    await this.loadNamespace(namespace);
    this.emit('namespaceReloaded', namespace);
  }

  /**
   * Invalidate cache for specific config
   */
  invalidate(namespace, key) {
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.includes(`${namespace}:${key}`) || cacheKey.startsWith(`ns:${namespace}:`)) {
        this.cache.delete(cacheKey);
      }
    }
    this.emit('invalidated', { namespace, key });
  }

  // ==========================================================================
  // CONFIG UPDATES (FOR SUPER-ADMIN)
  // ==========================================================================

  /**
   * Set config value (through proper API, not direct DB)
   */
  async set(namespace, key, value, context = {}) {
    const sql = `
      INSERT INTO os_kernel_config (namespace, key, value, environment, updated_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (namespace, key, environment)
      DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
      RETURNING *
    `;

    const result = await query(sql, [
      namespace,
      key,
      JSON.stringify(value),
      context.environment || this.environment,
      context.actorId || 'system'
    ]);

    // Invalidate cache
    this.invalidate(namespace, key);

    this.emit('configUpdated', { namespace, key, value });
    return result.rows[0];
  }

  /**
   * Delete config
   */
  async delete(namespace, key, context = {}) {
    const sql = `
      UPDATE os_kernel_config
      SET is_active = false, updated_by = $3, updated_at = NOW()
      WHERE namespace = $1 AND key = $2
      RETURNING *
    `;

    const result = await query(sql, [namespace, key, context.actorId || 'system']);

    this.invalidate(namespace, key);
    this.emit('configDeleted', { namespace, key });

    return result.rows[0];
  }

  // ==========================================================================
  // VERSION MANAGEMENT
  // ==========================================================================

  /**
   * Get config version history
   */
  async getVersionHistory(namespace, key, limit = 10) {
    const sql = `
      SELECT v.*, c.environment
      FROM os_kernel_config_versions v
      JOIN os_kernel_config c ON v.config_id = c.id
      WHERE v.namespace = $1 AND v.key = $2
      ORDER BY v.version DESC
      LIMIT $3
    `;

    const result = await query(sql, [namespace, key, limit]);
    return result.rows;
  }

  /**
   * Rollback to specific version
   */
  async rollbackToVersion(namespace, key, version, context = {}) {
    // Find config ID
    const configSql = `SELECT id FROM os_kernel_config WHERE namespace = $1 AND key = $2`;
    const configResult = await query(configSql, [namespace, key]);

    if (!configResult.rows[0]) {
      throw new Error(`Config not found: ${namespace}.${key}`);
    }

    const sql = `SELECT rollback_config_to_version($1, $2, $3) as success`;
    const result = await query(sql, [
      configResult.rows[0].id,
      version,
      context.actorId || 'system'
    ]);

    if (!result.rows[0]?.success) {
      throw new Error(`Failed to rollback ${namespace}.${key} to version ${version}`);
    }

    this.invalidate(namespace, key);
    this.emit('configRolledBack', { namespace, key, version });

    return true;
  }

  // ==========================================================================
  // PRESETS
  // ==========================================================================

  /**
   * Apply preset configuration
   */
  async applyPreset(presetSlug, context = {}) {
    const sql = `SELECT apply_config_preset($1, $2, $3) as count`;
    const result = await query(sql, [
      presetSlug,
      context.environment || this.environment,
      context.actorId || 'system'
    ]);

    // Clear all caches after applying preset
    this.cache.clear();
    this.emit('presetApplied', { preset: presetSlug, count: result.rows[0]?.count });

    return result.rows[0]?.count || 0;
  }

  /**
   * Get all presets
   */
  async getPresets(type = null) {
    let sql = `SELECT * FROM os_kernel_config_presets WHERE is_active = true`;
    const params = [];

    if (type) {
      sql += ` AND preset_type = $1`;
      params.push(type);
    }

    sql += ` ORDER BY preset_type, name`;

    const result = await query(sql, params);
    return result.rows;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate config value against schema
   */
  async validate(namespace, key, value) {
    const sql = `SELECT schema, data_type FROM os_kernel_config WHERE namespace = $1 AND key = $2`;
    const result = await query(sql, [namespace, key]);

    if (!result.rows[0]) {
      return { valid: true, errors: [] }; // No schema defined
    }

    const { schema, data_type } = result.rows[0];
    const errors = [];

    // Basic type validation
    if (data_type === 'number' && typeof value !== 'number') {
      errors.push(`Expected number, got ${typeof value}`);
    }
    if (data_type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Expected boolean, got ${typeof value}`);
    }
    if (data_type === 'string' && typeof value !== 'string') {
      errors.push(`Expected string, got ${typeof value}`);
    }
    if (data_type === 'array' && !Array.isArray(value)) {
      errors.push(`Expected array, got ${typeof value}`);
    }

    // JSON Schema validation (if schema defined)
    if (schema && errors.length === 0) {
      // TODO: Implement full JSON Schema validation
      // For now, basic validation is sufficient
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  _buildCacheKey(namespace, key, context) {
    const parts = [namespace, key, this.environment];
    if (context.vertical) parts.push(`v:${context.vertical}`);
    if (context.territory) parts.push(`t:${context.territory}`);
    return parts.join(':');
  }

  async _loadConfig(namespace, key, context) {
    const sql = `SELECT get_config_value($1, $2, $3) as value`;
    const result = await query(sql, [namespace, key, this.environment]);
    let value = result.rows[0]?.value;

    // Apply overlays
    if (value && context.vertical) {
      const overlay = await this._getVerticalOverlay(namespace, context.vertical);
      if (overlay[key] !== undefined) {
        value = overlay[key];
      }
    }

    if (value && context.territory) {
      const overlay = await this._getTerritoryOverlay(namespace, context.territory);
      if (overlay[key] !== undefined) {
        value = overlay[key];
      }
    }

    // Cache the result
    const cacheKey = this._buildCacheKey(namespace, key, context);
    this.cache.set(cacheKey, value, this.defaultTTL);

    return value;
  }

  _parseValue(value) {
    if (value === null || value === undefined) return null;
    // JSONB already parsed by pg driver
    return value;
  }

  _parseNamespaceValues(configs) {
    // JSONB already parsed by pg driver
    return configs;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const configLoader = new ConfigLoader();

// ============================================================================
// EXPORTS
// ============================================================================

export {
  configLoader,
  ConfigLoader,
  ConfigCache
};

// Convenience exports
export const getConfig = (namespace, key, context) => configLoader.get(namespace, key, context);
export const getNamespaceConfig = (namespace, context) => configLoader.getNamespace(namespace, context);
export const getConfigSnapshot = (namespaces, context) => configLoader.getSnapshot(namespaces, context);
export const setConfig = (namespace, key, value, context) => configLoader.set(namespace, key, value, context);
export const reloadConfig = () => configLoader.reload();
export const invalidateConfig = (namespace, key) => configLoader.invalidate(namespace, key);
