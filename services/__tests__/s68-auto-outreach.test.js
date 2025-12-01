/**
 * S68 Auto-Outreach Integration Test Suite
 * Sprint 68: Auto-Outreach Engine
 *
 * Lightweight integration tests that verify:
 * - Module exports are correct
 * - Function signatures match expected API
 * - No tenant awareness in code
 * - Deterministic behavior patterns
 */

describe('S68: Auto-Outreach Module', () => {
  let autoOutreach;

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
        ignore: jest.fn().mockReturnThis(),
        merge: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        orderByRaw: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue([{ count: 0 }]),
        clone: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis()
      })
    }));

    jest.doMock('../configLoader.js', () => ({
      ConfigLoader: {
        getConfig: jest.fn().mockResolvedValue({ rules: [] })
      }
    }));

    autoOutreach = await import('../autoOutreach.js');
  });

  // =====================================================
  // QUEUE EXPORTS
  // =====================================================

  test('exports queueOutreach function', () => {
    expect(typeof autoOutreach.queueOutreach).toBe('function');
  });

  test('exports getOutreachBatch function', () => {
    expect(typeof autoOutreach.getOutreachBatch).toBe('function');
  });

  test('exports recordOutreachEvent function', () => {
    expect(typeof autoOutreach.recordOutreachEvent).toBe('function');
  });

  test('exports getOutreachItem function', () => {
    expect(typeof autoOutreach.getOutreachItem).toBe('function');
  });

  test('exports getOutreachQueueStatus function', () => {
    expect(typeof autoOutreach.getOutreachQueueStatus).toBe('function');
  });

  test('exports cancelOutreach function', () => {
    expect(typeof autoOutreach.cancelOutreach).toBe('function');
  });

  // =====================================================
  // CHANNEL EXPORTS
  // =====================================================

  test('exports getChannel function', () => {
    expect(typeof autoOutreach.getChannel).toBe('function');
  });

  test('exports listChannels function', () => {
    expect(typeof autoOutreach.listChannels).toBe('function');
  });

  test('exports updateChannel function', () => {
    expect(typeof autoOutreach.updateChannel).toBe('function');
  });

  // =====================================================
  // SEND TIME OPTIMIZATION EXPORTS
  // =====================================================

  test('exports calculateOptimalSendTime function', () => {
    expect(typeof autoOutreach.calculateOptimalSendTime).toBe('function');
  });

  test('exports updateSendTimePattern function', () => {
    expect(typeof autoOutreach.updateSendTimePattern).toBe('function');
  });

  test('exports getSendTimePatterns function', () => {
    expect(typeof autoOutreach.getSendTimePatterns).toBe('function');
  });

  test('exports getOptimalSendTimes function', () => {
    expect(typeof autoOutreach.getOptimalSendTimes).toBe('function');
  });

  test('exports createSendTimePrediction function', () => {
    expect(typeof autoOutreach.createSendTimePrediction).toBe('function');
  });

  // =====================================================
  // SEQUENCE EXPORTS
  // =====================================================

  test('exports createSequence function', () => {
    expect(typeof autoOutreach.createSequence).toBe('function');
  });

  test('exports getSequence function', () => {
    expect(typeof autoOutreach.getSequence).toBe('function');
  });

  test('exports listSequences function', () => {
    expect(typeof autoOutreach.listSequences).toBe('function');
  });

  test('exports addSequenceStep function', () => {
    expect(typeof autoOutreach.addSequenceStep).toBe('function');
  });

  test('exports enrollInSequence function', () => {
    expect(typeof autoOutreach.enrollInSequence).toBe('function');
  });

  test('exports getSequenceInstance function', () => {
    expect(typeof autoOutreach.getSequenceInstance).toBe('function');
  });

  test('exports exitSequence function', () => {
    expect(typeof autoOutreach.exitSequence).toBe('function');
  });

  test('exports getDueSequenceInstances function', () => {
    expect(typeof autoOutreach.getDueSequenceInstances).toBe('function');
  });

  test('exports advanceSequenceInstances function', () => {
    expect(typeof autoOutreach.advanceSequenceInstances).toBe('function');
  });

  test('exports getSequencePerformance function', () => {
    expect(typeof autoOutreach.getSequencePerformance).toBe('function');
  });

  // =====================================================
  // RESPONSE CLASSIFICATION EXPORTS
  // =====================================================

  test('exports getResponseCategories function', () => {
    expect(typeof autoOutreach.getResponseCategories).toBe('function');
  });

  test('exports classifyResponse function', () => {
    expect(typeof autoOutreach.classifyResponse).toBe('function');
  });

  test('exports getClassification function', () => {
    expect(typeof autoOutreach.getClassification).toBe('function');
  });

  test('exports listClassifications function', () => {
    expect(typeof autoOutreach.listClassifications).toBe('function');
  });

  test('exports reviewClassification function', () => {
    expect(typeof autoOutreach.reviewClassification).toBe('function');
  });

  test('exports getResponseSummary function', () => {
    expect(typeof autoOutreach.getResponseSummary).toBe('function');
  });

  // =====================================================
  // PERFORMANCE EXPORTS
  // =====================================================

  test('exports getOutreachPerformance function', () => {
    expect(typeof autoOutreach.getOutreachPerformance).toBe('function');
  });

  test('exports getOutreachHealth function', () => {
    expect(typeof autoOutreach.getOutreachHealth).toBe('function');
  });

  // =====================================================
  // DEFAULT EXPORT
  // =====================================================

  test('default export contains all functions', () => {
    const defaultExport = autoOutreach.default;

    // Queue
    expect(defaultExport.queueOutreach).toBeDefined();
    expect(defaultExport.getOutreachBatch).toBeDefined();
    expect(defaultExport.recordOutreachEvent).toBeDefined();
    expect(defaultExport.cancelOutreach).toBeDefined();

    // Channels
    expect(defaultExport.getChannel).toBeDefined();
    expect(defaultExport.listChannels).toBeDefined();

    // Send Time
    expect(defaultExport.calculateOptimalSendTime).toBeDefined();
    expect(defaultExport.getSendTimePatterns).toBeDefined();

    // Sequences
    expect(defaultExport.createSequence).toBeDefined();
    expect(defaultExport.enrollInSequence).toBeDefined();
    expect(defaultExport.advanceSequenceInstances).toBeDefined();

    // Classification
    expect(defaultExport.classifyResponse).toBeDefined();
    expect(defaultExport.getResponseCategories).toBeDefined();

    // Performance
    expect(defaultExport.getOutreachHealth).toBeDefined();
  });
});

describe('S68: Architecture Compliance', () => {
  test('autoOutreach.js has no tenantId in code (only in comments)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'services/autoOutreach.js'),
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

  test('routes/os/autoOutreach.js uses OS patterns', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/autoOutreach.js'),
      'utf-8'
    );

    // Should use OS response patterns
    expect(content).toMatch(/createOSResponse/);
    expect(content).toMatch(/createOSError/);

    // Should use Sentry for error handling
    expect(content).toMatch(/Sentry/);
  });
});

describe('S68: Migration Files', () => {
  test('S68 migration file exists and has correct structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'db/migrations/2025_12_01_s68_auto_outreach.sql'),
      'utf-8'
    );

    // Should have required tables
    expect(content).toMatch(/CREATE TABLE.*outreach_queue/s);
    expect(content).toMatch(/CREATE TABLE.*outreach_channels/s);
    expect(content).toMatch(/CREATE TABLE.*send_time_patterns/s);
    expect(content).toMatch(/CREATE TABLE.*send_time_predictions/s);
    expect(content).toMatch(/CREATE TABLE.*outreach_sequences/s);
    expect(content).toMatch(/CREATE TABLE.*outreach_sequence_steps/s);
    expect(content).toMatch(/CREATE TABLE.*sequence_instances/s);
    expect(content).toMatch(/CREATE TABLE.*sequence_instance_events/s);
    expect(content).toMatch(/CREATE TABLE.*response_categories/s);
    expect(content).toMatch(/CREATE TABLE.*response_classifications/s);
    expect(content).toMatch(/CREATE TABLE.*response_templates/s);

    // Should have helper views
    expect(content).toMatch(/CREATE.*VIEW.*v_outreach_queue_active/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_outreach_performance_by_channel/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_sequence_performance/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_response_summary/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_optimal_send_times/s);

    // Should have helper functions
    expect(content).toMatch(/CREATE.*FUNCTION.*get_outreach_batch/s);
    expect(content).toMatch(/CREATE.*FUNCTION.*record_outreach_event/s);
    expect(content).toMatch(/CREATE.*FUNCTION.*advance_sequence_instances/s);
    expect(content).toMatch(/CREATE.*FUNCTION.*calculate_optimal_send_time/s);
    expect(content).toMatch(/CREATE.*FUNCTION.*update_send_time_patterns/s);

    // Should have indexes
    expect(content).toMatch(/CREATE INDEX/);
  });
});

describe('S68: API Endpoint Structure', () => {
  test('OS index includes auto-outreach router', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/index.js'),
      'utf-8'
    );

    expect(content).toMatch(/import autoOutreachRouter/);
    expect(content).toMatch(/router\.use.*auto-outreach.*autoOutreachRouter/);
  });

  test('Auto-Outreach routes file has all required endpoints', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/autoOutreach.js'),
      'utf-8'
    );

    // Queue endpoints
    expect(content).toMatch(/router\.post.*\/queue/);
    expect(content).toMatch(/router\.get.*\/queue\/:id/);
    expect(content).toMatch(/router\.post.*\/queue\/batch/);
    expect(content).toMatch(/router\.post.*\/queue\/:id\/event/);
    expect(content).toMatch(/router\.get.*\/queue\/status/);

    // Channel endpoints
    expect(content).toMatch(/router\.get.*\/channels/);
    expect(content).toMatch(/router\.patch.*\/channels\/:slug/);

    // Send time endpoints
    expect(content).toMatch(/router\.post.*\/send-time\/optimal/);
    expect(content).toMatch(/router\.get.*\/send-time\/patterns/);
    expect(content).toMatch(/router\.get.*\/send-time\/best/);

    // Sequence endpoints
    expect(content).toMatch(/router\.post.*\/sequences/);
    expect(content).toMatch(/router\.get.*\/sequences/);
    expect(content).toMatch(/router\.post.*\/sequences\/:id\/steps/);
    expect(content).toMatch(/router\.post.*\/sequences\/:id\/enroll/);

    // Instance endpoints
    expect(content).toMatch(/router\.get.*\/instances\/:id/);
    expect(content).toMatch(/router\.post.*\/instances\/:id\/exit/);
    expect(content).toMatch(/router\.get.*\/instances\/due/);
    expect(content).toMatch(/router\.post.*\/instances\/advance/);

    // Response classification endpoints
    expect(content).toMatch(/router\.get.*\/responses\/categories/);
    expect(content).toMatch(/router\.post.*\/responses\/classify/);
    expect(content).toMatch(/router\.post.*\/responses\/:id\/review/);

    // Health endpoints
    expect(content).toMatch(/router\.get.*\/health/);
    expect(content).toMatch(/router\.get.*\/performance/);
  });
});
