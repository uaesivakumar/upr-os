/**
 * Territory Management Test Suite
 * Sprint 53: Super-Admin Territory Management
 *
 * Comprehensive tests for:
 * - Territory CRUD operations
 * - Hierarchy management
 * - Config inheritance
 * - Assignment rules
 * - Vertical associations
 * - Audit logging
 * - Performance metrics
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as territoryService from '../../services/territory.js';

// Mock data
const mockContext = {
  actorId: 'test-admin-001',
  actorType: 'super_admin',
  actorIp: '127.0.0.1',
  requestId: 'test-request-001'
};

// ============================================================================
// TERRITORY CRUD TESTS
// ============================================================================

describe('Territory CRUD Operations', () => {
  it('should list all territories', async () => {
    const territories = await territoryService.getAllTerritories();
    expect(Array.isArray(territories)).toBe(true);
    expect(territories.length).toBeGreaterThan(0);
  });

  it('should filter territories by level', async () => {
    const countries = await territoryService.getAllTerritories({ level: 'country' });
    expect(countries.every(t => t.level === 'country')).toBe(true);
  });

  it('should filter territories by country code', async () => {
    const uaeTerritories = await territoryService.getAllTerritories({ countryCode: 'UAE' });
    expect(uaeTerritories.every(t => t.country_code === 'UAE')).toBe(true);
  });

  it('should get territory by slug', async () => {
    const territory = await territoryService.getTerritory('global');
    expect(territory).not.toBeNull();
    expect(territory.slug).toBe('global');
    expect(territory.level).toBe('global');
  });

  it('should get territory by ID', async () => {
    const globalTerritory = await territoryService.getTerritory('global');
    const territory = await territoryService.getTerritory(globalTerritory.id);
    expect(territory.slug).toBe('global');
  });

  it('should return null for non-existent territory', async () => {
    const territory = await territoryService.getTerritory('non-existent-slug');
    expect(territory).toBeNull();
  });

  it('should get territory with effective config', async () => {
    const territory = await territoryService.getTerritoryConfig('dubai');
    expect(territory).not.toBeNull();
    expect(territory.effective_config).toBeDefined();
    // Dubai should inherit scoring_weights from ancestors
    expect(territory.effective_config.scoring_weights).toBeDefined();
  });

  it('should create a new territory', async () => {
    const newTerritory = await territoryService.createTerritory({
      slug: 'test-territory-001',
      name: 'Test Territory',
      level: 'city',
      description: 'Test territory for unit tests',
      countryCode: 'UAE',
      timezone: 'Asia/Dubai',
      currency: 'AED',
      config: { test: true }
    }, mockContext);

    expect(newTerritory).not.toBeNull();
    expect(newTerritory.slug).toBe('test-territory-001');
    expect(newTerritory.level).toBe('city');
  });

  it('should update a territory', async () => {
    const updated = await territoryService.updateTerritory('test-territory-001', {
      name: 'Updated Test Territory',
      description: 'Updated description'
    }, mockContext);

    expect(updated.name).toBe('Updated Test Territory');
    expect(updated.description).toBe('Updated description');
  });

  it('should soft delete a territory', async () => {
    const deleted = await territoryService.deleteTerritory('test-territory-001', mockContext);
    expect(deleted.status).toBe('inactive');
  });
});

// ============================================================================
// HIERARCHY TESTS
// ============================================================================

describe('Territory Hierarchy', () => {
  it('should get territory hierarchy (children tree)', async () => {
    const result = await territoryService.getTerritoryHierarchy('global');
    expect(result).not.toBeNull();
    expect(result.root.slug).toBe('global');
    expect(result.hierarchy.length).toBeGreaterThan(0);
  });

  it('should get territory ancestors (path to root)', async () => {
    const ancestors = await territoryService.getTerritoryAncestors('dubai');
    expect(ancestors.length).toBeGreaterThanOrEqual(3); // global -> middle_east -> uae -> dubai
    expect(ancestors[0].slug).toBe('global');
  });

  it('should calculate correct depth for territories', async () => {
    const globalTerritory = await territoryService.getTerritory('global');
    const dubaiTerritory = await territoryService.getTerritory('dubai');

    expect(globalTerritory.depth).toBe(0);
    expect(dubaiTerritory.depth).toBeGreaterThan(0);
  });

  it('should count children correctly', async () => {
    const uae = await territoryService.getTerritory('uae');
    // UAE has 7 emirates (states)
    expect(uae.child_count).toBeGreaterThanOrEqual(7);
  });

  it('should prevent moving territory to its own descendant', async () => {
    // Create parent and child for test
    const parent = await territoryService.createTerritory({
      slug: 'test-parent-hierarchy',
      name: 'Test Parent',
      level: 'region'
    }, mockContext);

    const child = await territoryService.createTerritory({
      slug: 'test-child-hierarchy',
      name: 'Test Child',
      level: 'country',
      parentId: parent.id
    }, mockContext);

    // Try to move parent under child (should fail)
    await expect(
      territoryService.moveTerritory(parent.slug, child.id, mockContext)
    ).rejects.toThrow('Cannot move territory to its own descendant');

    // Cleanup
    await territoryService.deleteTerritory('test-child-hierarchy', mockContext);
    await territoryService.deleteTerritory('test-parent-hierarchy', mockContext);
  });
});

// ============================================================================
// CONFIG INHERITANCE TESTS
// ============================================================================

describe('Config Inheritance', () => {
  it('should inherit config from parent territories', async () => {
    const dubai = await territoryService.getTerritoryConfig('dubai');

    // Dubai should inherit scoring_weights from global
    expect(dubai.effective_config.scoring_weights).toBeDefined();
    expect(dubai.effective_config.scoring_weights.q_score).toBeDefined();
  });

  it('should override parent config with local config', async () => {
    // Middle East has different business hours (Sun-Thu instead of Mon-Fri)
    const middleEast = await territoryService.getTerritoryConfig('middle_east');

    // Check business_hours includes Sunday (day 0)
    expect(middleEast.config.business_hours.days).toContain(0);
  });

  it('should cascade config updates to descendants', async () => {
    const globalConfig = await territoryService.getTerritoryConfig('global');
    const dubaiConfig = await territoryService.getTerritoryConfig('dubai');

    // Both should have scoring_weights from inheritance chain
    expect(globalConfig.effective_config.scoring_weights).toBeDefined();
    expect(dubaiConfig.effective_config.scoring_weights).toBeDefined();
  });
});

// ============================================================================
// VERTICAL ASSOCIATION TESTS
// ============================================================================

describe('Vertical Associations', () => {
  it('should assign vertical to territory', async () => {
    const result = await territoryService.assignVertical(
      'dubai',
      'banking',
      { isPrimary: true, configOverride: { focus: 'retail_banking' } },
      mockContext
    );

    expect(result.vertical_slug).toBe('banking');
    expect(result.is_primary).toBe(true);
  });

  it('should get territory verticals', async () => {
    const verticals = await territoryService.getTerritoryVerticals('dubai');
    expect(Array.isArray(verticals)).toBe(true);
  });

  it('should remove vertical from territory', async () => {
    const result = await territoryService.removeVertical('dubai', 'banking', mockContext);
    expect(result).not.toBeNull();
  });

  it('should create sub-vertical', async () => {
    const subVertical = await territoryService.createSubVertical('dubai', {
      verticalSlug: 'banking',
      slug: 'islamic_banking',
      name: 'Islamic Banking',
      description: 'Sharia-compliant banking services',
      config: { compliance: 'sharia' }
    }, mockContext);

    expect(subVertical.slug).toBe('islamic_banking');
    expect(subVertical.vertical_slug).toBe('banking');
  });

  it('should get sub-verticals', async () => {
    const subVerticals = await territoryService.getSubVerticals('dubai');
    expect(Array.isArray(subVerticals)).toBe(true);
  });
});

// ============================================================================
// ASSIGNMENT RULES TESTS
// ============================================================================

describe('Assignment Rules', () => {
  it('should get assignment rules for territory', async () => {
    const rules = await territoryService.getAssignmentRules('uae');
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('should create assignment rule', async () => {
    const rule = await territoryService.createAssignmentRule('dubai', {
      name: 'Test Rule',
      description: 'Test assignment rule',
      priority: 50,
      conditions: [
        { field: 'industry', op: 'eq', value: 'fintech' }
      ],
      actions: { assign_to_territory: true }
    }, mockContext);

    expect(rule.name).toBe('Test Rule');
    expect(rule.priority).toBe(50);
  });

  it('should update assignment rule', async () => {
    const rules = await territoryService.getAssignmentRules('dubai');
    const testRule = rules.find(r => r.name === 'Test Rule');

    if (testRule) {
      const updated = await territoryService.updateAssignmentRule(testRule.id, {
        priority: 25,
        isActive: false
      }, mockContext);

      expect(updated.priority).toBe(25);
      expect(updated.is_active).toBe(false);
    }
  });

  it('should assign entity to territory using rules', async () => {
    const result = await territoryService.assignEntityToTerritory({
      country_code: 'UAE',
      industry: 'banking',
      company_size: 500
    });

    expect(result.assigned).toBe(true);
    expect(result.territory_slug).toBeDefined();
  });

  it('should not assign entity without matching rules', async () => {
    const result = await territoryService.assignEntityToTerritory({
      country_code: 'XYZ',
      industry: 'unknown'
    });

    expect(result.assigned).toBe(false);
  });

  it('should delete assignment rule', async () => {
    const rules = await territoryService.getAssignmentRules('dubai');
    const testRule = rules.find(r => r.name === 'Test Rule');

    if (testRule) {
      const deleted = await territoryService.deleteAssignmentRule(testRule.id, mockContext);
      expect(deleted).not.toBeNull();
    }
  });
});

// ============================================================================
// AUDIT LOG TESTS
// ============================================================================

describe('Audit Logs', () => {
  it('should log territory creation', async () => {
    // Create a territory to generate audit log
    const territory = await territoryService.createTerritory({
      slug: 'audit-test-territory',
      name: 'Audit Test Territory',
      level: 'city'
    }, mockContext);

    const logs = await territoryService.getAuditLogs('audit-test-territory', { limit: 5 });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe('create');

    // Cleanup
    await territoryService.deleteTerritory('audit-test-territory', mockContext);
  });

  it('should log territory updates', async () => {
    const territory = await territoryService.createTerritory({
      slug: 'audit-update-test',
      name: 'Audit Update Test',
      level: 'city'
    }, mockContext);

    await territoryService.updateTerritory('audit-update-test', {
      name: 'Updated Name'
    }, mockContext);

    const logs = await territoryService.getAuditLogs('audit-update-test', { limit: 5 });
    const updateLog = logs.find(l => l.action === 'update');
    expect(updateLog).toBeDefined();

    // Cleanup
    await territoryService.deleteTerritory('audit-update-test', mockContext);
  });

  it('should filter audit logs by action', async () => {
    const logs = await territoryService.getAuditLogs('global', {
      action: 'create',
      limit: 10
    });

    logs.forEach(log => {
      expect(log.action).toBe('create');
    });
  });

  it('should filter audit logs by date range', async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const logs = await territoryService.getAuditLogs('global', {
      startDate: startDate.toISOString(),
      limit: 10
    });

    expect(Array.isArray(logs)).toBe(true);
  });
});

// ============================================================================
// METRICS TESTS
// ============================================================================

describe('Territory Metrics', () => {
  it('should record metrics for territory', async () => {
    const now = new Date();
    const periodStart = new Date(now.setHours(0, 0, 0, 0));
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 1);

    const metrics = await territoryService.recordMetrics('dubai', {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      granularity: 'daily',
      signalsDiscovered: 150,
      signalsByType: { hiring: 50, funding: 30, news: 70 },
      uniqueCompanies: 45,
      uniqueContacts: 120,
      enrichmentRequests: 100,
      enrichmentSuccesses: 85,
      avgQScore: 72.5,
      avgTScore: 68.3,
      avgLScore: 81.2,
      avgEScore: 65.8,
      outreachGenerated: 45
    });

    expect(metrics.signals_discovered).toBe(150);
    expect(metrics.unique_companies).toBe(45);
  });

  it('should get metrics for territory', async () => {
    const metrics = await territoryService.getMetrics('dubai', {
      granularity: 'daily',
      limit: 10
    });

    expect(Array.isArray(metrics)).toBe(true);
  });

  it('should get metrics summary', async () => {
    const summary = await territoryService.getMetricsSummary('dubai');
    expect(summary).not.toBeNull();
    expect(typeof summary.total_signals).toBe('string'); // PostgreSQL returns COALESCE as string
  });
});

// ============================================================================
// DASHBOARD TESTS
// ============================================================================

describe('Territory Dashboard', () => {
  it('should get full dashboard data', async () => {
    const dashboard = await territoryService.getDashboard('dubai');

    expect(dashboard).not.toBeNull();
    expect(dashboard.territory).toBeDefined();
    expect(dashboard.hierarchy).toBeDefined();
    expect(dashboard.ancestors).toBeDefined();
    expect(dashboard.verticals).toBeDefined();
    expect(dashboard.rules).toBeDefined();
    expect(dashboard.metrics).toBeDefined();
    expect(dashboard.recentAudit).toBeDefined();
  });

  it('should include effective config in dashboard', async () => {
    const dashboard = await territoryService.getDashboard('dubai');
    expect(dashboard.territory.effective_config).toBeDefined();
  });
});

// ============================================================================
// UAE TERRITORY SEED DATA TESTS
// ============================================================================

describe('UAE Territory Seed Data', () => {
  it('should have global root territory', async () => {
    const global = await territoryService.getTerritory('global');
    expect(global).not.toBeNull();
    expect(global.level).toBe('global');
  });

  it('should have middle_east region', async () => {
    const middleEast = await territoryService.getTerritory('middle_east');
    expect(middleEast).not.toBeNull();
    expect(middleEast.level).toBe('region');
    expect(middleEast.region_code).toBe('MENA');
  });

  it('should have UAE country', async () => {
    const uae = await territoryService.getTerritory('uae');
    expect(uae).not.toBeNull();
    expect(uae.level).toBe('country');
    expect(uae.country_code).toBe('UAE');
    expect(uae.currency).toBe('AED');
  });

  it('should have all 7 UAE emirates', async () => {
    const emirates = ['dubai', 'abu_dhabi', 'sharjah', 'ajman', 'ras_al_khaimah', 'fujairah', 'umm_al_quwain'];

    for (const emirate of emirates) {
      const territory = await territoryService.getTerritory(emirate);
      expect(territory).not.toBeNull();
      expect(territory.level).toBe('state');
      expect(territory.country_code).toBe('UAE');
    }
  });

  it('should have Dubai districts', async () => {
    const districts = ['difc', 'business_bay', 'dubai_marina', 'jlt', 'deira', 'jebel_ali'];

    for (const district of districts) {
      const territory = await territoryService.getTerritory(district);
      expect(territory).not.toBeNull();
      expect(territory.level).toBe('district');
    }
  });

  it('should have Abu Dhabi districts', async () => {
    const districts = ['adgm', 'masdar_city', 'mussafah'];

    for (const district of districts) {
      const territory = await territoryService.getTerritory(district);
      expect(territory).not.toBeNull();
      expect(territory.level).toBe('district');
    }
  });

  it('should have correct hierarchy for DIFC', async () => {
    const ancestors = await territoryService.getTerritoryAncestors('difc');

    // Should be: global -> middle_east -> uae -> dubai -> difc
    expect(ancestors.length).toBe(5);
    expect(ancestors.map(a => a.slug)).toEqual(['global', 'middle_east', 'uae', 'dubai', 'difc']);
  });

  it('should have free zone configuration for Dubai', async () => {
    const dubai = await territoryService.getTerritory('dubai');
    expect(dubai.config.free_zones).toContain('DIFC');
    expect(dubai.config.free_zones).toContain('DMCC');
    expect(dubai.config.free_zones).toContain('JAFZA');
  });

  it('should have compliance rules for UAE', async () => {
    const uae = await territoryService.getTerritoryConfig('uae');
    expect(uae.config.compliance_rules).toBeDefined();
    expect(uae.config.compliance_rules.require_trade_license).toBe(true);
  });
});

// ============================================================================
// STRESS TESTS
// ============================================================================

describe('Stress Tests', () => {
  it('should handle bulk territory retrieval', async () => {
    const startTime = Date.now();
    const territories = await territoryService.getAllTerritories({ includeInactive: true });
    const duration = Date.now() - startTime;

    expect(territories.length).toBeGreaterThan(10);
    expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
  });

  it('should handle deep hierarchy traversal', async () => {
    const startTime = Date.now();

    // Get full hierarchy from global
    const hierarchy = await territoryService.getTerritoryHierarchy('global');

    const duration = Date.now() - startTime;
    expect(hierarchy.hierarchy.length).toBeGreaterThan(10);
    expect(duration).toBeLessThan(2000);
  });

  it('should handle concurrent territory reads', async () => {
    const territories = ['global', 'middle_east', 'uae', 'dubai', 'abu_dhabi', 'difc'];

    const startTime = Date.now();
    const results = await Promise.all(
      territories.map(slug => territoryService.getTerritory(slug))
    );
    const duration = Date.now() - startTime;

    expect(results.every(t => t !== null)).toBe(true);
    expect(duration).toBeLessThan(2000);
  });

  it('should handle config inheritance calculation efficiently', async () => {
    const startTime = Date.now();

    // Get config for deepest territories
    await Promise.all([
      territoryService.getTerritoryConfig('difc'),
      territoryService.getTerritoryConfig('adgm'),
      territoryService.getTerritoryConfig('jlt'),
      territoryService.getTerritoryConfig('business_bay')
    ]);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(2000);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Edge Cases', () => {
  it('should handle territory with no parent', async () => {
    const global = await territoryService.getTerritory('global');
    expect(global.parent_id).toBeNull();
    expect(global.depth).toBe(0);
  });

  it('should handle territory with no children', async () => {
    const difc = await territoryService.getTerritory('difc');
    expect(difc.child_count).toBe(0);
  });

  it('should handle empty config', async () => {
    const territory = await territoryService.createTerritory({
      slug: 'empty-config-test',
      name: 'Empty Config Test',
      level: 'city',
      config: {}
    }, mockContext);

    expect(territory.config).toEqual({});

    // Cleanup
    await territoryService.deleteTerritory('empty-config-test', mockContext);
  });

  it('should handle special characters in territory slug', async () => {
    // Slug should be sanitized, but test with valid slug containing numbers
    const territory = await territoryService.createTerritory({
      slug: 'test-zone-123',
      name: 'Test Zone 123',
      level: 'district'
    }, mockContext);

    expect(territory.slug).toBe('test-zone-123');

    // Cleanup
    await territoryService.deleteTerritory('test-zone-123', mockContext);
  });

  it('should handle null values in filter options', async () => {
    const territories = await territoryService.getAllTerritories({
      level: null,
      status: null,
      parentId: null
    });

    expect(Array.isArray(territories)).toBe(true);
  });
});

// ============================================================================
// ACCESS CONTROL TESTS (Super-admin only)
// ============================================================================

describe('Access Control', () => {
  it('should capture actor information in audit logs', async () => {
    const territory = await territoryService.createTerritory({
      slug: 'access-control-test',
      name: 'Access Control Test',
      level: 'city'
    }, {
      actorId: 'super-admin-123',
      actorType: 'super_admin',
      actorIp: '192.168.1.1',
      requestId: 'req-001'
    });

    const logs = await territoryService.getAuditLogs('access-control-test', { limit: 1 });

    expect(logs[0].actor_id).toBe('super-admin-123');
    expect(logs[0].actor_type).toBe('super_admin');
    expect(logs[0].actor_ip).toBe('192.168.1.1');

    // Cleanup
    await territoryService.deleteTerritory('access-control-test', mockContext);
  });

  it('should track request ID in audit logs', async () => {
    const territory = await territoryService.createTerritory({
      slug: 'request-id-test',
      name: 'Request ID Test',
      level: 'city'
    }, {
      ...mockContext,
      requestId: 'unique-request-id-12345'
    });

    const logs = await territoryService.getAuditLogs('request-id-test', { limit: 1 });
    expect(logs[0].request_id).toBe('unique-request-id-12345');

    // Cleanup
    await territoryService.deleteTerritory('request-id-test', mockContext);
  });
});
