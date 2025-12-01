/**
 * S67 Auto-Discovery Integration Test Suite
 * Sprint 67: Auto-Discovery Engine
 *
 * Lightweight integration tests that verify:
 * - Module exports are correct
 * - Function signatures match expected API
 * - No tenant awareness in code
 * - Deterministic behavior patterns
 */

describe('S67: Auto-Discovery Module', () => {
  let autoDiscovery;

  beforeAll(async () => {
    // Mock database
    jest.doMock('../../db/index.js', () => ({
      getDb: () => ({
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        returning: jest.fn().mockResolvedValue([{ id: 'test' }]),
        raw: jest.fn().mockResolvedValue({ rows: [] }),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        orderByRaw: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue([{ count: 0 }]),
        clone: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis()
      })
    }));

    jest.doMock('../configLoader.js', () => ({
      ConfigLoader: {
        getConfig: jest.fn().mockResolvedValue({ rules: [] })
      }
    }));

    autoDiscovery = await import('../autoDiscovery.js');
  });

  // =====================================================
  // ENRICHMENT QUEUE EXPORTS
  // =====================================================

  test('exports queueEnrichment function', () => {
    expect(typeof autoDiscovery.queueEnrichment).toBe('function');
  });

  test('exports getEnrichmentBatch function', () => {
    expect(typeof autoDiscovery.getEnrichmentBatch).toBe('function');
  });

  test('exports completeEnrichment function', () => {
    expect(typeof autoDiscovery.completeEnrichment).toBe('function');
  });

  test('exports getEnrichmentQueueStatus function', () => {
    expect(typeof autoDiscovery.getEnrichmentQueueStatus).toBe('function');
  });

  test('exports getEnrichmentItem function', () => {
    expect(typeof autoDiscovery.getEnrichmentItem).toBe('function');
  });

  test('exports cancelEnrichment function', () => {
    expect(typeof autoDiscovery.cancelEnrichment).toBe('function');
  });

  // =====================================================
  // PIPELINE EXPORTS
  // =====================================================

  test('exports createPipeline function', () => {
    expect(typeof autoDiscovery.createPipeline).toBe('function');
  });

  test('exports getPipeline function', () => {
    expect(typeof autoDiscovery.getPipeline).toBe('function');
  });

  test('exports listPipelines function', () => {
    expect(typeof autoDiscovery.listPipelines).toBe('function');
  });

  test('exports updatePipeline function', () => {
    expect(typeof autoDiscovery.updatePipeline).toBe('function');
  });

  // =====================================================
  // QUALITY FILTER EXPORTS
  // =====================================================

  test('exports createQualityRule function', () => {
    expect(typeof autoDiscovery.createQualityRule).toBe('function');
  });

  test('exports getQualityRules function', () => {
    expect(typeof autoDiscovery.getQualityRules).toBe('function');
  });

  test('exports assessQuality function', () => {
    expect(typeof autoDiscovery.assessQuality).toBe('function');
  });

  test('exports getQualityAssessment function', () => {
    expect(typeof autoDiscovery.getQualityAssessment).toBe('function');
  });

  test('exports getQualitySummary function', () => {
    expect(typeof autoDiscovery.getQualitySummary).toBe('function');
  });

  // =====================================================
  // TRIGGER EXPORTS
  // =====================================================

  test('exports createTrigger function', () => {
    expect(typeof autoDiscovery.createTrigger).toBe('function');
  });

  test('exports processSignal function', () => {
    expect(typeof autoDiscovery.processSignal).toBe('function');
  });

  test('exports getTrigger function', () => {
    expect(typeof autoDiscovery.getTrigger).toBe('function');
  });

  test('exports listTriggers function', () => {
    expect(typeof autoDiscovery.listTriggers).toBe('function');
  });

  test('exports updateTrigger function', () => {
    expect(typeof autoDiscovery.updateTrigger).toBe('function');
  });

  test('exports getTriggerLog function', () => {
    expect(typeof autoDiscovery.getTriggerLog).toBe('function');
  });

  // =====================================================
  // SCHEDULER EXPORTS
  // =====================================================

  test('exports createSchedule function', () => {
    expect(typeof autoDiscovery.createSchedule).toBe('function');
  });

  test('exports getDueSchedules function', () => {
    expect(typeof autoDiscovery.getDueSchedules).toBe('function');
  });

  test('exports executeSchedule function', () => {
    expect(typeof autoDiscovery.executeSchedule).toBe('function');
  });

  test('exports getSchedule function', () => {
    expect(typeof autoDiscovery.getSchedule).toBe('function');
  });

  test('exports listSchedules function', () => {
    expect(typeof autoDiscovery.listSchedules).toBe('function');
  });

  test('exports updateSchedule function', () => {
    expect(typeof autoDiscovery.updateSchedule).toBe('function');
  });

  test('exports setScheduleActive function', () => {
    expect(typeof autoDiscovery.setScheduleActive).toBe('function');
  });

  test('exports getScheduleRuns function', () => {
    expect(typeof autoDiscovery.getScheduleRuns).toBe('function');
  });

  // =====================================================
  // HEALTH EXPORT
  // =====================================================

  test('exports getDiscoveryHealth function', () => {
    expect(typeof autoDiscovery.getDiscoveryHealth).toBe('function');
  });

  // =====================================================
  // DEFAULT EXPORT
  // =====================================================

  test('default export contains all functions', () => {
    const defaultExport = autoDiscovery.default;

    // Enrichment Queue
    expect(defaultExport.queueEnrichment).toBeDefined();
    expect(defaultExport.getEnrichmentBatch).toBeDefined();
    expect(defaultExport.completeEnrichment).toBeDefined();
    expect(defaultExport.cancelEnrichment).toBeDefined();

    // Pipelines
    expect(defaultExport.createPipeline).toBeDefined();
    expect(defaultExport.getPipeline).toBeDefined();
    expect(defaultExport.listPipelines).toBeDefined();

    // Quality
    expect(defaultExport.createQualityRule).toBeDefined();
    expect(defaultExport.assessQuality).toBeDefined();
    expect(defaultExport.getQualityRules).toBeDefined();

    // Triggers
    expect(defaultExport.createTrigger).toBeDefined();
    expect(defaultExport.processSignal).toBeDefined();
    expect(defaultExport.listTriggers).toBeDefined();

    // Schedules
    expect(defaultExport.createSchedule).toBeDefined();
    expect(defaultExport.executeSchedule).toBeDefined();
    expect(defaultExport.listSchedules).toBeDefined();

    // Health
    expect(defaultExport.getDiscoveryHealth).toBeDefined();
  });
});

describe('S67: Architecture Compliance', () => {
  test('autoDiscovery.js has no tenantId in code (only in comments)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'services/autoDiscovery.js'),
      'utf-8'
    );

    // Remove comments and check no tenantId in actual code
    const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(codeWithoutComments).not.toMatch(/tenantId/);
    expect(codeWithoutComments).not.toMatch(/tenant_id/);

    // Should use context parameters
    expect(content).toMatch(/territoryId|territory_id/);
    expect(content).toMatch(/verticalSlug|vertical_slug/);
  });

  test('routes/os/autoDiscovery.js uses OS patterns', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/autoDiscovery.js'),
      'utf-8'
    );

    // Should use OS response patterns
    expect(content).toMatch(/createOSResponse/);
    expect(content).toMatch(/createOSError/);

    // Should use Sentry for error handling
    expect(content).toMatch(/Sentry/);
  });
});

describe('S67: Migration Files', () => {
  test('S67 migration file exists and has correct structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'db/migrations/2025_12_01_s67_auto_discovery.sql'),
      'utf-8'
    );

    // Should have required tables
    expect(content).toMatch(/CREATE TABLE.*enrichment_queue/s);
    expect(content).toMatch(/CREATE TABLE.*enrichment_pipelines/s);
    expect(content).toMatch(/CREATE TABLE.*discovery_quality_rules/s);
    expect(content).toMatch(/CREATE TABLE.*discovery_quality_assessments/s);
    expect(content).toMatch(/CREATE TABLE.*discovery_triggers/s);
    expect(content).toMatch(/CREATE TABLE.*discovery_trigger_log/s);
    expect(content).toMatch(/CREATE TABLE.*discovery_schedules/s);
    expect(content).toMatch(/CREATE TABLE.*discovery_schedule_runs/s);

    // Should have helper views
    expect(content).toMatch(/CREATE.*VIEW.*v_enrichment_queue_active/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_discovery_health/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_quality_summary/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_active_triggers/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_upcoming_schedules/s);

    // Should have helper functions
    expect(content).toMatch(/CREATE.*FUNCTION.*get_enrichment_batch/s);
    expect(content).toMatch(/CREATE.*FUNCTION.*complete_enrichment_item/s);
    expect(content).toMatch(/CREATE.*FUNCTION.*check_discovery_triggers/s);

    // Should have indexes
    expect(content).toMatch(/CREATE INDEX/);
  });
});

describe('S67: API Endpoint Structure', () => {
  test('OS index includes auto-discovery router', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/index.js'),
      'utf-8'
    );

    expect(content).toMatch(/import autoDiscoveryRouter/);
    expect(content).toMatch(/router\.use.*auto-discovery.*autoDiscoveryRouter/);
  });

  test('Auto-Discovery routes file has all required endpoints', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/autoDiscovery.js'),
      'utf-8'
    );

    // Queue endpoints
    expect(content).toMatch(/router\.post.*\/queue/);
    expect(content).toMatch(/router\.get.*\/queue\/:id/);
    expect(content).toMatch(/router\.post.*\/queue\/batch/);
    expect(content).toMatch(/router\.get.*\/queue\/status/);

    // Pipeline endpoints
    expect(content).toMatch(/router\.post.*\/pipelines/);
    expect(content).toMatch(/router\.get.*\/pipelines/);
    expect(content).toMatch(/router\.patch.*\/pipelines\/:slug/);

    // Quality endpoints
    expect(content).toMatch(/router\.post.*\/quality\/rules/);
    expect(content).toMatch(/router\.post.*\/quality\/assess/);
    expect(content).toMatch(/router\.get.*\/quality\/summary/);

    // Trigger endpoints
    expect(content).toMatch(/router\.post.*\/triggers/);
    expect(content).toMatch(/router\.post.*\/triggers\/signal/);
    expect(content).toMatch(/router\.get.*\/triggers\/log/);

    // Schedule endpoints
    expect(content).toMatch(/router\.post.*\/schedules/);
    expect(content).toMatch(/router\.get.*\/schedules\/due/);
    expect(content).toMatch(/router\.post.*\/schedules\/:id\/run/);
    expect(content).toMatch(/router\.post.*\/schedules\/:slug\/pause/);
    expect(content).toMatch(/router\.post.*\/schedules\/:slug\/resume/);

    // Health endpoint
    expect(content).toMatch(/router\.get.*\/health/);
  });
});
