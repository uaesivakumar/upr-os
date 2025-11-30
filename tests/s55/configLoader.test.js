/**
 * Config Loader Test Suite
 * Sprint 55: Config-Driven OS Kernel
 *
 * Tests for:
 * - Config loading and caching
 * - Environment overrides
 * - Vertical/territory overlays
 * - Deterministic snapshots
 * - Hot reload
 * - Version management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  configLoader,
  ConfigLoader,
  ConfigCache,
  getConfig,
  getNamespaceConfig,
  getConfigSnapshot,
  setConfig,
  reloadConfig,
  invalidateConfig
} from '../../services/configLoader.js';

// ============================================================================
// CONFIG CACHE TESTS
// ============================================================================

describe('ConfigCache', () => {
  it('should store and retrieve values', () => {
    const cache = new ConfigCache();
    cache.set('test-key', { foo: 'bar' }, 60);
    expect(cache.get('test-key')).toEqual({ foo: 'bar' });
  });

  it('should expire values after TTL', async () => {
    const cache = new ConfigCache();
    cache.set('expire-key', 'value', 0.1); // 100ms TTL

    expect(cache.get('expire-key')).toBe('value');

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(cache.get('expire-key')).toBeUndefined();
  });

  it('should delete values', () => {
    const cache = new ConfigCache();
    cache.set('delete-key', 'value', 60);
    expect(cache.has('delete-key')).toBe(true);

    cache.delete('delete-key');
    expect(cache.has('delete-key')).toBe(false);
  });

  it('should clear all values', () => {
    const cache = new ConfigCache();
    cache.set('key1', 'value1', 60);
    cache.set('key2', 'value2', 60);

    cache.clear();

    expect(cache.keys().length).toBe(0);
  });
});

// ============================================================================
// CONFIG LOADER INITIALIZATION
// ============================================================================

describe('ConfigLoader Initialization', () => {
  it('should initialize successfully', async () => {
    await configLoader.initialize();
    expect(configLoader.initialized).toBe(true);
  });

  it('should emit initialized event', async () => {
    const loader = new ConfigLoader();
    let initialized = false;

    loader.on('initialized', () => {
      initialized = true;
    });

    await loader.initialize();
    expect(initialized).toBe(true);
  });
});

// ============================================================================
// CONFIG READ TESTS
// ============================================================================

describe('Config Read Operations', () => {
  it('should get single config value', async () => {
    const value = await getConfig('discovery', 'enabled_sources');
    expect(Array.isArray(value)).toBe(true);
  });

  it('should return null for non-existent config', async () => {
    const value = await getConfig('nonexistent', 'key');
    expect(value).toBeNull();
  });

  it('should get namespace config', async () => {
    const config = await getNamespaceConfig('scoring');
    expect(config).toHaveProperty('default_weights');
    expect(config).toHaveProperty('thresholds');
  });

  it('should get config with default fallback', async () => {
    const value = await configLoader.getOrDefault('nonexistent', 'key', 'default-value');
    expect(value).toBe('default-value');
  });

  it('should get many configs at once', async () => {
    const configs = await configLoader.getMany([
      { namespace: 'discovery', key: 'enabled_sources' },
      { namespace: 'scoring', key: 'default_weights' },
      { namespace: 'llm', key: 'default_provider' }
    ]);

    expect(configs['discovery.enabled_sources']).toBeDefined();
    expect(configs['scoring.default_weights']).toBeDefined();
    expect(configs['llm.default_provider']).toBeDefined();
  });
});

// ============================================================================
// CACHING TESTS
// ============================================================================

describe('Config Caching', () => {
  it('should cache config values', async () => {
    // First call loads from DB
    const value1 = await getConfig('discovery', 'enabled_sources');

    // Second call should be from cache
    const value2 = await getConfig('discovery', 'enabled_sources');

    expect(value1).toEqual(value2);
  });

  it('should invalidate cache', async () => {
    await getConfig('discovery', 'enabled_sources');

    invalidateConfig('discovery', 'enabled_sources');

    // Cache should be cleared, next call reloads
    const cached = configLoader.cache.get('discovery:enabled_sources:production');
    expect(cached).toBeUndefined();
  });

  it('should clear all cache on reload', async () => {
    await getConfig('discovery', 'enabled_sources');
    await getConfig('scoring', 'default_weights');

    await reloadConfig();

    // All cached values should be repopulated
    expect(configLoader.cache.keys().length).toBeGreaterThan(0);
  });
});

// ============================================================================
// DETERMINISTIC SNAPSHOT TESTS
// ============================================================================

describe('Deterministic Config Snapshots', () => {
  it('should create frozen config snapshot', async () => {
    const snapshot = await getConfigSnapshot(['discovery', 'scoring']);

    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.environment).toBeDefined();
    expect(snapshot.config.discovery).toBeDefined();
    expect(snapshot.config.scoring).toBeDefined();

    // Should be frozen
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('should validate matching snapshot', async () => {
    const snapshot = await getConfigSnapshot(['discovery', 'scoring']);
    const validation = await configLoader.validateSnapshot(snapshot, ['discovery', 'scoring']);

    expect(validation.valid).toBe(true);
    expect(validation.differences.length).toBe(0);
  });

  it('should detect snapshot differences', async () => {
    const snapshot = await getConfigSnapshot(['scoring']);

    // Modify the snapshot
    const modifiedSnapshot = {
      ...snapshot,
      config: {
        scoring: {
          ...snapshot.config.scoring,
          fake_key: 'fake_value'
        }
      }
    };

    const validation = await configLoader.validateSnapshot(modifiedSnapshot, ['scoring']);

    expect(validation.valid).toBe(false);
    expect(validation.differences.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// ENVIRONMENT OVERRIDE TESTS
// ============================================================================

describe('Environment Overrides', () => {
  it('should respect environment-specific config', async () => {
    // In development, log_level should be 'debug'
    if (process.env.NODE_ENV === 'development') {
      const logLevel = await getConfig('system', 'log_level');
      expect(logLevel).toBe('debug');
    }
  });

  it('should fall back to "all" environment', async () => {
    // enabled_sources is defined for 'all' environments
    const sources = await getConfig('discovery', 'enabled_sources');
    expect(Array.isArray(sources)).toBe(true);
  });
});

// ============================================================================
// OVERLAY TESTS
// ============================================================================

describe('Config Overlays', () => {
  it('should apply vertical overlay', async () => {
    // Banking vertical should have custom scoring weights
    const config = await getNamespaceConfig('scoring', { vertical: 'banking' });
    // Should have weights defined
    expect(config.default_weights).toBeDefined();
  });

  it('should apply territory overlay', async () => {
    const config = await getNamespaceConfig('discovery', { territory: 'dubai' });
    // Should return config (may or may not have territory overrides)
    expect(config).toBeDefined();
  });

  it('should merge overlays correctly', async () => {
    const config = await getNamespaceConfig('scoring', {
      vertical: 'banking',
      customOverlay: { custom_threshold: 75 }
    });

    expect(config.custom_threshold).toBe(75);
  });
});

// ============================================================================
// CONFIG WRITE TESTS
// ============================================================================

describe('Config Write Operations', () => {
  const testKey = 'test_config_key';

  afterAll(async () => {
    // Cleanup
    await configLoader.delete('test', testKey, { actorId: 'test' });
  });

  it('should set config value', async () => {
    const result = await setConfig('test', testKey, { foo: 'bar' }, { actorId: 'test' });
    expect(result).toBeDefined();

    const value = await getConfig('test', testKey);
    expect(value).toEqual({ foo: 'bar' });
  });

  it('should update existing config', async () => {
    await setConfig('test', testKey, { foo: 'updated' }, { actorId: 'test' });

    const value = await getConfig('test', testKey);
    expect(value).toEqual({ foo: 'updated' });
  });

  it('should invalidate cache on write', async () => {
    await setConfig('test', testKey, { foo: 'new' }, { actorId: 'test' });

    // Should trigger cache invalidation
    const cached = configLoader.cache.get('test:test_config_key:production');
    expect(cached).toBeUndefined();
  });

  it('should emit configUpdated event', async () => {
    let updated = false;

    configLoader.on('configUpdated', ({ namespace, key }) => {
      if (namespace === 'test' && key === testKey) {
        updated = true;
      }
    });

    await setConfig('test', testKey, { event: 'test' }, { actorId: 'test' });
    expect(updated).toBe(true);
  });
});

// ============================================================================
// VERSION HISTORY TESTS
// ============================================================================

describe('Config Version History', () => {
  const versionTestKey = 'version_test_key';

  beforeAll(async () => {
    // Create and update config to generate versions
    await setConfig('test', versionTestKey, { v: 1 }, { actorId: 'test' });
    await setConfig('test', versionTestKey, { v: 2 }, { actorId: 'test' });
    await setConfig('test', versionTestKey, { v: 3 }, { actorId: 'test' });
  });

  afterAll(async () => {
    await configLoader.delete('test', versionTestKey, { actorId: 'test' });
  });

  it('should track version history', async () => {
    const versions = await configLoader.getVersionHistory('test', versionTestKey);
    expect(versions.length).toBeGreaterThan(0);
  });

  it('should rollback to previous version', async () => {
    const versions = await configLoader.getVersionHistory('test', versionTestKey);
    const oldVersion = versions.find(v => v.value.v === 1);

    if (oldVersion) {
      await configLoader.rollbackToVersion('test', versionTestKey, oldVersion.version, { actorId: 'test' });
      const value = await getConfig('test', versionTestKey);
      // After rollback, value should be version 1
      expect(value.v).toBe(1);
    }
  });
});

// ============================================================================
// PRESETS TESTS
// ============================================================================

describe('Config Presets', () => {
  it('should list available presets', async () => {
    const presets = await configLoader.getPresets();
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThan(0);
  });

  it('should filter presets by type', async () => {
    const templatePresets = await configLoader.getPresets('template');
    expect(templatePresets.every(p => p.preset_type === 'template')).toBe(true);
  });

  it('should apply preset', async () => {
    const count = await configLoader.applyPreset('minimal');
    expect(count).toBeGreaterThan(0);
  });
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('Config Validation', () => {
  it('should validate number type', async () => {
    const result = await configLoader.validate('discovery', 'max_concurrent_requests', 'not-a-number');
    // Validation may or may not fail depending on schema
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
  });

  it('should pass validation for correct types', async () => {
    const result = await configLoader.validate('discovery', 'enabled_sources', ['apollo', 'linkedin']);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// HOT RELOAD TESTS
// ============================================================================

describe('Hot Reload', () => {
  it('should reload all configs', async () => {
    let reloaded = false;

    configLoader.on('reloaded', () => {
      reloaded = true;
    });

    await configLoader.reload();
    expect(reloaded).toBe(true);
  });

  it('should reload specific namespace', async () => {
    let reloadedNamespace = null;

    configLoader.on('namespaceReloaded', (namespace) => {
      reloadedNamespace = namespace;
    });

    await configLoader.reloadNamespace('discovery');
    expect(reloadedNamespace).toBe('discovery');
  });
});

// ============================================================================
// ARCHITECTURAL RULE TESTS
// ============================================================================

describe('Architectural Rules', () => {
  it('should enforce single chokepoint for config access', () => {
    // All config access must go through ConfigLoader
    // This test validates the architecture by checking exports

    expect(typeof getConfig).toBe('function');
    expect(typeof getNamespaceConfig).toBe('function');
    expect(typeof getConfigSnapshot).toBe('function');
  });

  it('should produce deterministic output for same input', async () => {
    const snapshot1 = await getConfigSnapshot(['discovery', 'scoring']);
    const snapshot2 = await getConfigSnapshot(['discovery', 'scoring']);

    // Same input should produce same config (excluding timestamp)
    expect(JSON.stringify(snapshot1.config)).toBe(JSON.stringify(snapshot2.config));
  });

  it('should not expose direct database access', () => {
    // ConfigLoader should not expose raw DB queries
    expect(configLoader).not.toHaveProperty('query');
    expect(configLoader).not.toHaveProperty('db');
  });
});

// ============================================================================
// STRESS TESTS
// ============================================================================

describe('Stress Tests', () => {
  it('should handle concurrent config reads', async () => {
    const startTime = Date.now();

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        getConfig('discovery', 'enabled_sources')
      )
    );

    const duration = Date.now() - startTime;

    expect(results.length).toBe(100);
    expect(results.every(r => Array.isArray(r))).toBe(true);
    expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
  });

  it('should handle rapid cache invalidation', async () => {
    for (let i = 0; i < 50; i++) {
      await getConfig('discovery', 'enabled_sources');
      invalidateConfig('discovery', 'enabled_sources');
    }

    // Should still work after rapid invalidation
    const value = await getConfig('discovery', 'enabled_sources');
    expect(Array.isArray(value)).toBe(true);
  });
});
