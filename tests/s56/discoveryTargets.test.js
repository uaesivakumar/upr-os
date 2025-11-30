/**
 * Discovery Target Types Test Suite
 * Sprint 56: Discovery Target Types
 *
 * Tests for:
 * - Target type CRUD
 * - Source management
 * - Strategy management
 * - Execution tracking
 * - Deterministic behavior
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as discoveryTargets from '../../services/discoveryTargets.js';

// ============================================================================
// TARGET TYPES TESTS
// ============================================================================

describe('Target Types', () => {
  it('should list all target types', async () => {
    const targetTypes = await discoveryTargets.getAllTargetTypes();
    expect(Array.isArray(targetTypes)).toBe(true);
    expect(targetTypes.length).toBeGreaterThan(0);
  });

  it('should filter by category', async () => {
    const companyTypes = await discoveryTargets.getAllTargetTypes({ category: 'company' });
    expect(companyTypes.every(t => t.category === 'company')).toBe(true);
  });

  it('should filter by entity type', async () => {
    const signalTypes = await discoveryTargets.getAllTargetTypes({ entityType: 'signal' });
    expect(signalTypes.every(t => t.entity_type === 'signal')).toBe(true);
  });

  it('should get target type by slug', async () => {
    const targetType = await discoveryTargets.getTargetType('company_search');
    expect(targetType).not.toBeNull();
    expect(targetType.slug).toBe('company_search');
    expect(targetType.category).toBe('company');
  });

  it('should get target type with config', async () => {
    const config = await discoveryTargets.getTargetTypeConfig('company_search');
    expect(config).not.toBeNull();
    expect(config.sources).toBeDefined();
    expect(config.strategies).toBeDefined();
    expect(config.effectiveConfig).toBeDefined();
  });

  it('should create custom target type', async () => {
    const targetType = await discoveryTargets.createTargetType({
      slug: 'test_target_type',
      name: 'Test Target Type',
      description: 'Test target type for unit tests',
      category: 'company',
      entityType: 'company',
      discoveryConfig: { sources: ['apollo'] }
    });

    expect(targetType).not.toBeNull();
    expect(targetType.slug).toBe('test_target_type');
  });

  it('should update target type', async () => {
    const updated = await discoveryTargets.updateTargetType('test_target_type', {
      name: 'Updated Test Target Type',
      discoveryConfig: { sources: ['apollo', 'linkedin'] }
    });

    expect(updated.name).toBe('Updated Test Target Type');
  });

  it('should not modify system target types', async () => {
    await expect(
      discoveryTargets.updateTargetType('company_search', { name: 'Modified' })
    ).rejects.toThrow('Cannot modify system-defined target type');
  });

  it('should soft delete target type', async () => {
    const deleted = await discoveryTargets.deleteTargetType('test_target_type');
    expect(deleted.is_active).toBe(false);
  });
});

// ============================================================================
// SEED DATA TESTS
// ============================================================================

describe('Seed Data', () => {
  it('should have company target types', async () => {
    const types = await discoveryTargets.getAllTargetTypes({ category: 'company' });
    expect(types.length).toBeGreaterThanOrEqual(3);

    const slugs = types.map(t => t.slug);
    expect(slugs).toContain('company_search');
    expect(slugs).toContain('company_similar');
    expect(slugs).toContain('company_technographic');
  });

  it('should have contact target types', async () => {
    const types = await discoveryTargets.getAllTargetTypes({ category: 'contact' });
    expect(types.length).toBeGreaterThanOrEqual(2);

    const slugs = types.map(t => t.slug);
    expect(slugs).toContain('contact_search');
    expect(slugs).toContain('contact_decision_makers');
  });

  it('should have signal target types', async () => {
    const types = await discoveryTargets.getAllTargetTypes({ category: 'signal' });
    expect(types.length).toBeGreaterThanOrEqual(4);

    const slugs = types.map(t => t.slug);
    expect(slugs).toContain('signal_hiring');
    expect(slugs).toContain('signal_funding');
    expect(slugs).toContain('signal_news');
  });
});

// ============================================================================
// SOURCES TESTS
// ============================================================================

describe('Discovery Sources', () => {
  it('should list all sources', async () => {
    const sources = await discoveryTargets.getAllSources();
    expect(Array.isArray(sources)).toBe(true);
    expect(sources.length).toBeGreaterThan(0);
  });

  it('should filter by source type', async () => {
    const apiSources = await discoveryTargets.getAllSources({ sourceType: 'api' });
    expect(apiSources.every(s => s.source_type === 'api')).toBe(true);
  });

  it('should get source by slug', async () => {
    const source = await discoveryTargets.getSource('linkedin');
    expect(source).not.toBeNull();
    expect(source.slug).toBe('linkedin');
    expect(source.capabilities).toBeDefined();
  });

  it('should have required sources', async () => {
    const sources = await discoveryTargets.getAllSources();
    const slugs = sources.map(s => s.slug);

    expect(slugs).toContain('linkedin');
    expect(slugs).toContain('apollo');
    expect(slugs).toContain('crunchbase');
    expect(slugs).toContain('clearbit');
  });

  it('should get sources for target type', async () => {
    const targetType = await discoveryTargets.getTargetType('company_search');
    const sources = await discoveryTargets.getTargetTypeSources(targetType.id);

    expect(Array.isArray(sources)).toBe(true);
  });

  it('should update source health', async () => {
    const source = await discoveryTargets.updateSourceHealth('linkedin', 'healthy');
    expect(source.health_status).toBe('healthy');
    expect(source.last_health_check).not.toBeNull();
  });
});

// ============================================================================
// SOURCE ASSOCIATION TESTS
// ============================================================================

describe('Source Associations', () => {
  let testTargetTypeId;
  let testSourceId;

  beforeAll(async () => {
    const targetType = await discoveryTargets.createTargetType({
      slug: 'test_association_target',
      name: 'Test Association Target',
      category: 'company',
      entityType: 'company'
    });
    testTargetTypeId = targetType.id;

    const source = await discoveryTargets.getSource('apollo');
    testSourceId = source.id;
  });

  afterAll(async () => {
    await discoveryTargets.deleteTargetType('test_association_target');
  });

  it('should associate source with target type', async () => {
    const association = await discoveryTargets.associateSource(
      testTargetTypeId,
      testSourceId,
      { priority: 10, weight: 0.9, isPrimary: true }
    );

    expect(association.priority).toBe(10);
    expect(parseFloat(association.weight)).toBe(0.9);
    expect(association.is_primary).toBe(true);
  });

  it('should get associated sources', async () => {
    const sources = await discoveryTargets.getTargetTypeSources(testTargetTypeId);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some(s => s.slug === 'apollo')).toBe(true);
  });

  it('should disassociate source', async () => {
    const result = await discoveryTargets.disassociateSource(testTargetTypeId, testSourceId);
    expect(result.is_active).toBe(false);
  });
});

// ============================================================================
// STRATEGIES TESTS
// ============================================================================

describe('Discovery Strategies', () => {
  let testTargetTypeId;

  beforeAll(async () => {
    const targetType = await discoveryTargets.getTargetType('company_search');
    testTargetTypeId = targetType.id;
  });

  it('should get strategies for target type', async () => {
    const strategies = await discoveryTargets.getTargetTypeStrategies(testTargetTypeId);
    expect(Array.isArray(strategies)).toBe(true);
  });

  it('should create strategy', async () => {
    const strategy = await discoveryTargets.createStrategy(testTargetTypeId, {
      name: 'Test Strategy',
      strategyType: 'search',
      config: { query_template: 'test' },
      priority: 50
    });

    expect(strategy.name).toBe('Test Strategy');
    expect(strategy.strategy_type).toBe('search');
    expect(strategy.priority).toBe(50);
  });

  it('should update strategy', async () => {
    const strategies = await discoveryTargets.getTargetTypeStrategies(testTargetTypeId);
    const testStrategy = strategies.find(s => s.name === 'Test Strategy');

    if (testStrategy) {
      const updated = await discoveryTargets.updateStrategy(testStrategy.id, {
        priority: 25
      });
      expect(updated.priority).toBe(25);
    }
  });

  it('should select best strategy for context', async () => {
    const strategy = await discoveryTargets.selectStrategy('company_search', {
      industry: 'technology'
    });

    expect(strategy).not.toBeNull();
    expect(strategy.strategy_type).toBeDefined();
  });

  it('should delete strategy', async () => {
    const strategies = await discoveryTargets.getTargetTypeStrategies(testTargetTypeId);
    const testStrategy = strategies.find(s => s.name === 'Test Strategy');

    if (testStrategy) {
      const deleted = await discoveryTargets.deleteStrategy(testStrategy.id);
      expect(deleted.is_active).toBe(false);
    }
  });
});

// ============================================================================
// DETERMINISTIC BEHAVIOR TESTS
// ============================================================================

describe('Deterministic Behavior', () => {
  it('should select same strategy for same context', async () => {
    const context = { industry: 'technology', company_size: 100 };

    const strategy1 = await discoveryTargets.selectStrategy('company_search', context);
    const strategy2 = await discoveryTargets.selectStrategy('company_search', context);

    // Same context should always select the same strategy
    if (strategy1 && strategy2) {
      expect(strategy1.id).toBe(strategy2.id);
    }
  });

  it('should return sources in consistent order', async () => {
    const targetType = await discoveryTargets.getTargetType('company_search');

    const sources1 = await discoveryTargets.getTargetTypeSources(targetType.id);
    const sources2 = await discoveryTargets.getTargetTypeSources(targetType.id);

    // Same order every time
    expect(sources1.map(s => s.slug)).toEqual(sources2.map(s => s.slug));
  });

  it('should produce deterministic config', async () => {
    const config1 = await discoveryTargets.getTargetTypeConfig('company_search');
    const config2 = await discoveryTargets.getTargetTypeConfig('company_search');

    expect(JSON.stringify(config1.discovery_config)).toBe(JSON.stringify(config2.discovery_config));
  });
});

// ============================================================================
// EXECUTION TRACKING TESTS
// ============================================================================

describe('Execution Tracking', () => {
  let testRun;

  it('should create discovery run', async () => {
    const targetType = await discoveryTargets.getTargetType('company_search');
    const strategies = await discoveryTargets.getTargetTypeStrategies(targetType.id);

    testRun = await discoveryTargets.createRun(
      targetType.id,
      strategies[0]?.id,
      { query: 'test' },
      'test-user'
    );

    expect(testRun.status).toBe('pending');
    expect(testRun.input_params.query).toBe('test');
  });

  it('should start run', async () => {
    const startedRun = await discoveryTargets.startRun(testRun.id);
    expect(startedRun.status).toBe('running');
    expect(startedRun.started_at).not.toBeNull();
  });

  it('should complete run', async () => {
    const completedRun = await discoveryTargets.completeRun(testRun.id, {
      resultsCount: 50,
      entitiesCreated: 45,
      entitiesUpdated: 5,
      errorsCount: 0,
      sourcesUsed: ['apollo', 'linkedin']
    });

    expect(completedRun.status).toBe('completed');
    expect(completedRun.results_count).toBe(50);
    expect(completedRun.duration_ms).toBeGreaterThan(0);
  });

  it('should get run history', async () => {
    const runs = await discoveryTargets.getRunHistory({ limit: 10 });
    expect(Array.isArray(runs)).toBe(true);
    expect(runs.some(r => r.id === testRun.id)).toBe(true);
  });

  it('should handle failed runs', async () => {
    const targetType = await discoveryTargets.getTargetType('company_search');

    const failRun = await discoveryTargets.createRun(targetType.id, null, { fail: true });
    await discoveryTargets.startRun(failRun.id);
    const failed = await discoveryTargets.failRun(failRun.id, { message: 'Test failure' });

    expect(failed.status).toBe('failed');
    expect(failed.error_details.message).toBe('Test failure');
  });
});

// ============================================================================
// DASHBOARD TESTS
// ============================================================================

describe('Dashboard', () => {
  it('should return dashboard data', async () => {
    const dashboard = await discoveryTargets.getDashboard();

    expect(dashboard.targetTypes).toBeDefined();
    expect(dashboard.targetTypes.total).toBeGreaterThan(0);
    expect(dashboard.targetTypes.byCategory).toBeDefined();

    expect(dashboard.sources).toBeDefined();
    expect(dashboard.sources.total).toBeGreaterThan(0);

    expect(dashboard.recentRuns).toBeDefined();
    expect(Array.isArray(dashboard.recentRuns)).toBe(true);

    expect(dashboard.runStats).toBeDefined();
  });
});

// ============================================================================
// STRESS TESTS
// ============================================================================

describe('Stress Tests', () => {
  it('should handle concurrent reads', async () => {
    const startTime = Date.now();

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        discoveryTargets.getAllTargetTypes()
      )
    );

    const duration = Date.now() - startTime;

    expect(results.length).toBe(50);
    expect(results.every(r => Array.isArray(r))).toBe(true);
    expect(duration).toBeLessThan(2000);
  });

  it('should handle rapid strategy selection', async () => {
    const contexts = [
      { industry: 'technology' },
      { industry: 'finance' },
      { industry: 'healthcare' },
      { company_size: 100 },
      { company_size: 1000 }
    ];

    const startTime = Date.now();

    const results = await Promise.all(
      contexts.flatMap(ctx =>
        Array.from({ length: 10 }, () =>
          discoveryTargets.selectStrategy('company_search', ctx)
        )
      )
    );

    const duration = Date.now() - startTime;

    expect(results.length).toBe(50);
    expect(duration).toBeLessThan(2000);
  });
});

// ============================================================================
// ARCHITECTURAL COMPLIANCE TESTS
// ============================================================================

describe('Architectural Compliance', () => {
  it('should use Config Loader for config access', async () => {
    // getTargetTypeConfig should merge with configs from Config Loader
    const config = await discoveryTargets.getTargetTypeConfig('company_search');
    expect(config.effectiveConfig).toBeDefined();
  });

  it('should not expose tenant-specific logic', () => {
    // Check that the service doesn't have tenant-related functions
    expect(discoveryTargets.getTargetTypeForTenant).toBeUndefined();
    expect(discoveryTargets.createTenantTargetType).toBeUndefined();
  });

  it('should accept context via parameters', async () => {
    // Context should be passed, not stored
    const config = await discoveryTargets.getTargetTypeConfig('company_search', {
      vertical: 'banking',
      territory: 'dubai'
    });

    expect(config).toBeDefined();
  });
});
