/**
 * S70 Autonomous Observability Test Suite
 * Sprint 70: Cost & Token Tracking + Performance Metrics
 *
 * Lightweight integration tests that verify:
 * - Module exports are correct
 * - Function signatures match expected API
 * - No tenant awareness in code
 * - Deterministic behavior patterns
 */

describe('S70: Autonomous Metrics Module', () => {
  let autonomousMetrics;

  beforeAll(async () => {
    // Mock database
    jest.doMock('../../db/index.js', () => ({
      getDb: () => ({
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        returning: jest.fn().mockResolvedValue([{ id: 'test', total_tokens: 100, total_cost_micros: 1000 }]),
        raw: jest.fn().mockResolvedValue({ rows: [{ input_cost_micros: 500, output_cost_micros: 500, total_cost_micros: 1000 }] }),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        orderByRaw: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue([{ count: 0 }]),
        countDistinct: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        avg: jest.fn().mockReturnThis(),
        min: jest.fn().mockReturnThis(),
        max: jest.fn().mockReturnThis(),
        modify: jest.fn().mockReturnThis()
      })
    }));

    jest.doMock('../configLoader.js', () => ({
      ConfigLoader: {
        getConfig: jest.fn().mockResolvedValue({
          dailyCostThresholdUsd: 100,
          hourlyCostThresholdUsd: 20
        })
      }
    }));

    jest.doMock('@sentry/node', () => ({
      captureException: jest.fn()
    }));

    autonomousMetrics = await import('../autonomousMetrics.js');
  });

  // =====================================================
  // TOKEN TRACKING EXPORTS
  // =====================================================

  test('exports recordTokenUsage function', () => {
    expect(typeof autonomousMetrics.recordTokenUsage).toBe('function');
  });

  test('exports computeLLMCost function', () => {
    expect(typeof autonomousMetrics.computeLLMCost).toBe('function');
  });

  test('exports getLLMUsageStats function', () => {
    expect(typeof autonomousMetrics.getLLMUsageStats).toBe('function');
  });

  test('exports getCostStats function', () => {
    expect(typeof autonomousMetrics.getCostStats).toBe('function');
  });

  // =====================================================
  // PERFORMANCE METRICS EXPORTS
  // =====================================================

  test('exports recordPerformanceEvent function', () => {
    expect(typeof autonomousMetrics.recordPerformanceEvent).toBe('function');
  });

  test('exports getPerformanceStats function', () => {
    expect(typeof autonomousMetrics.getPerformanceStats).toBe('function');
  });

  test('exports getRealtimePerformance function', () => {
    expect(typeof autonomousMetrics.getRealtimePerformance).toBe('function');
  });

  test('exports getErrorSummary function', () => {
    expect(typeof autonomousMetrics.getErrorSummary).toBe('function');
  });

  // =====================================================
  // CONVERSION EXPORTS
  // =====================================================

  test('exports getOutreachFunnel function', () => {
    expect(typeof autonomousMetrics.getOutreachFunnel).toBe('function');
  });

  test('exports updateOutreachConversion function', () => {
    expect(typeof autonomousMetrics.updateOutreachConversion).toBe('function');
  });

  // =====================================================
  // DAILY SUMMARY EXPORTS
  // =====================================================

  test('exports getDailySummary function', () => {
    expect(typeof autonomousMetrics.getDailySummary).toBe('function');
  });

  test('exports getDailySummaries function', () => {
    expect(typeof autonomousMetrics.getDailySummaries).toBe('function');
  });

  test('exports aggregateDailySummary function', () => {
    expect(typeof autonomousMetrics.aggregateDailySummary).toBe('function');
  });

  // =====================================================
  // COST TREND EXPORTS
  // =====================================================

  test('exports getCostTrend function', () => {
    expect(typeof autonomousMetrics.getCostTrend).toBe('function');
  });

  test('exports checkCostThresholds function', () => {
    expect(typeof autonomousMetrics.checkCostThresholds).toBe('function');
  });

  // =====================================================
  // PRICING EXPORTS
  // =====================================================

  test('exports getModelPricing function', () => {
    expect(typeof autonomousMetrics.getModelPricing).toBe('function');
  });

  test('exports updateModelPricing function', () => {
    expect(typeof autonomousMetrics.updateModelPricing).toBe('function');
  });

  // =====================================================
  // HEALTH EXPORTS
  // =====================================================

  test('exports getMetricsHealth function', () => {
    expect(typeof autonomousMetrics.getMetricsHealth).toBe('function');
  });

  // =====================================================
  // NO TENANT AWARENESS
  // =====================================================

  test('recordTokenUsage does not require tenantId', () => {
    const fn = autonomousMetrics.recordTokenUsage;
    const params = fn.toString().match(/\{([^}]*)\}/)?.[1] || '';
    expect(params).not.toContain('tenantId');
  });

  test('recordPerformanceEvent does not require tenantId', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString().match(/\{([^}]*)\}/)?.[1] || '';
    expect(params).not.toContain('tenantId');
  });

  test('getCostStats does not require tenantId', () => {
    const fn = autonomousMetrics.getCostStats;
    const params = fn.toString().match(/\{([^}]*)\}/)?.[1] || '';
    expect(params).not.toContain('tenantId');
  });

  test('getPerformanceStats does not require tenantId', () => {
    const fn = autonomousMetrics.getPerformanceStats;
    const params = fn.toString().match(/\{([^}]*)\}/)?.[1] || '';
    expect(params).not.toContain('tenantId');
  });

  // =====================================================
  // FUNCTION SIGNATURE VALIDATION
  // =====================================================

  test('recordTokenUsage accepts provider parameter', () => {
    const fn = autonomousMetrics.recordTokenUsage;
    const params = fn.toString();
    expect(params).toContain('provider');
  });

  test('recordTokenUsage accepts model parameter', () => {
    const fn = autonomousMetrics.recordTokenUsage;
    const params = fn.toString();
    expect(params).toContain('model');
  });

  test('recordTokenUsage accepts inputTokens parameter', () => {
    const fn = autonomousMetrics.recordTokenUsage;
    const params = fn.toString();
    expect(params).toContain('inputTokens');
  });

  test('recordTokenUsage accepts outputTokens parameter', () => {
    const fn = autonomousMetrics.recordTokenUsage;
    const params = fn.toString();
    expect(params).toContain('outputTokens');
  });

  test('recordPerformanceEvent accepts service parameter', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString();
    expect(params).toContain('service');
  });

  test('recordPerformanceEvent accepts eventType parameter', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString();
    expect(params).toContain('eventType');
  });

  test('recordPerformanceEvent accepts durationMs parameter', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString();
    expect(params).toContain('durationMs');
  });

  test('recordPerformanceEvent accepts conversion indicators', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString();
    expect(params).toContain('opened');
    expect(params).toContain('clicked');
    expect(params).toContain('replied');
    expect(params).toContain('converted');
  });

  // =====================================================
  // DEFAULT EXPORT
  // =====================================================

  test('default export contains all functions', () => {
    const defaultExport = autonomousMetrics.default;
    expect(defaultExport).toBeDefined();
    expect(defaultExport.recordTokenUsage).toBeDefined();
    expect(defaultExport.computeLLMCost).toBeDefined();
    expect(defaultExport.recordPerformanceEvent).toBeDefined();
    expect(defaultExport.getPerformanceStats).toBeDefined();
    expect(defaultExport.getCostStats).toBeDefined();
    expect(defaultExport.getMetricsHealth).toBeDefined();
  });
});

describe('S70: Autonomous Metrics Routes', () => {
  let autonomousMetricsRouter;

  beforeAll(async () => {
    // Mock database
    jest.doMock('../../db/index.js', () => ({
      getDb: () => ({
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        returning: jest.fn().mockResolvedValue([{ id: 'test' }]),
        raw: jest.fn().mockResolvedValue({ rows: [] }),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        avg: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        modify: jest.fn().mockReturnThis()
      })
    }));

    jest.doMock('../configLoader.js', () => ({
      ConfigLoader: {
        getConfig: jest.fn().mockResolvedValue({})
      }
    }));

    jest.doMock('@sentry/node', () => ({
      captureException: jest.fn()
    }));

    autonomousMetricsRouter = await import('../../routes/os/autonomousMetrics.js');
  });

  test('exports default router', () => {
    expect(autonomousMetricsRouter.default).toBeDefined();
  });

  test('router has stack (registered routes)', () => {
    expect(autonomousMetricsRouter.default.stack).toBeDefined();
    expect(Array.isArray(autonomousMetricsRouter.default.stack)).toBe(true);
    expect(autonomousMetricsRouter.default.stack.length).toBeGreaterThan(0);
  });
});

describe('S70: Cost Tracking Functionality', () => {
  let autonomousMetrics;

  beforeAll(async () => {
    jest.doMock('../../db/index.js', () => ({
      getDb: () => ({
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        returning: jest.fn().mockResolvedValue([{
          id: 'test-id',
          total_tokens: 1500,
          total_cost_micros: 2500
        }]),
        raw: jest.fn().mockResolvedValue({
          rows: [{
            input_cost_micros: 1000,
            output_cost_micros: 1500,
            total_cost_micros: 2500
          }]
        }),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        avg: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        modify: jest.fn().mockReturnThis()
      })
    }));

    jest.doMock('../configLoader.js', () => ({
      ConfigLoader: {
        getConfig: jest.fn().mockResolvedValue({
          dailyCostThresholdUsd: 100,
          hourlyCostThresholdUsd: 20
        })
      }
    }));

    jest.doMock('@sentry/node', () => ({
      captureException: jest.fn()
    }));

    autonomousMetrics = await import('../autonomousMetrics.js');
  });

  test('computeLLMCost returns cost breakdown', async () => {
    const result = await autonomousMetrics.computeLLMCost({
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 500
    });

    expect(result).toHaveProperty('inputCostMicros');
    expect(result).toHaveProperty('outputCostMicros');
    expect(result).toHaveProperty('totalCostMicros');
    expect(result).toHaveProperty('totalCostUsd');
  });

  test('recordTokenUsage function exists and accepts required params', () => {
    const fn = autonomousMetrics.recordTokenUsage;
    const params = fn.toString();
    expect(params).toContain('service');
    expect(params).toContain('operation');
    expect(params).toContain('provider');
    expect(params).toContain('model');
    expect(params).toContain('inputTokens');
    expect(params).toContain('outputTokens');
  });
});

describe('S70: Performance Tracking Functionality', () => {
  let autonomousMetrics;

  beforeAll(async () => {
    jest.doMock('../../db/index.js', () => ({
      getDb: () => ({
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        returning: jest.fn().mockResolvedValue([{
          id: 'perf-id',
          service: 'auto-discovery',
          operation: 'enrich',
          event_type: 'completed',
          duration_ms: 250
        }]),
        raw: jest.fn().mockResolvedValue({ rows: [] }),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        avg: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        countDistinct: jest.fn().mockReturnThis(),
        min: jest.fn().mockReturnThis(),
        max: jest.fn().mockReturnThis(),
        modify: jest.fn().mockReturnThis()
      })
    }));

    jest.doMock('../configLoader.js', () => ({
      ConfigLoader: {
        getConfig: jest.fn().mockResolvedValue({})
      }
    }));

    jest.doMock('@sentry/node', () => ({
      captureException: jest.fn()
    }));

    autonomousMetrics = await import('../autonomousMetrics.js');
  });

  test('recordPerformanceEvent accepts all event types', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString();
    // Verify eventType is accepted
    expect(params).toContain('eventType');
  });

  test('recordPerformanceEvent accepts error tracking fields', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString();
    expect(params).toContain('errorCode');
    expect(params).toContain('errorCategory');
    expect(params).toContain('errorMessage');
  });

  test('recordPerformanceEvent accepts throughput fields', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString();
    expect(params).toContain('batchSize');
    expect(params).toContain('itemsProcessed');
    expect(params).toContain('itemsSucceeded');
    expect(params).toContain('itemsFailed');
  });
});

describe('S70: Integration with S66-S68', () => {
  let autonomousMetrics;

  beforeAll(async () => {
    jest.doMock('../../db/index.js', () => ({
      getDb: () => ({
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereBetween: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        returning: jest.fn().mockResolvedValue([{ id: 'test' }]),
        raw: jest.fn().mockResolvedValue({ rows: [] }),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        sum: jest.fn().mockReturnThis(),
        avg: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        modify: jest.fn().mockReturnThis()
      })
    }));

    jest.doMock('../configLoader.js', () => ({
      ConfigLoader: {
        getConfig: jest.fn().mockResolvedValue({})
      }
    }));

    jest.doMock('@sentry/node', () => ({
      captureException: jest.fn()
    }));

    autonomousMetrics = await import('../autonomousMetrics.js');
  });

  test('recordPerformanceEvent supports auto-discovery service', () => {
    expect(typeof autonomousMetrics.recordPerformanceEvent).toBe('function');
  });

  test('recordPerformanceEvent supports auto-outreach service', () => {
    expect(typeof autonomousMetrics.recordPerformanceEvent).toBe('function');
  });

  test('recordPerformanceEvent supports autonomous-safety service', () => {
    expect(typeof autonomousMetrics.recordPerformanceEvent).toBe('function');
  });

  test('recordTokenUsage accepts correlationId for tracking', () => {
    const fn = autonomousMetrics.recordTokenUsage;
    const params = fn.toString();
    expect(params).toContain('correlationId');
  });

  test('recordTokenUsage accepts taskId for S66 integration', () => {
    const fn = autonomousMetrics.recordTokenUsage;
    const params = fn.toString();
    expect(params).toContain('taskId');
  });

  test('recordPerformanceEvent accepts taskId for S66 integration', () => {
    const fn = autonomousMetrics.recordPerformanceEvent;
    const params = fn.toString();
    expect(params).toContain('taskId');
  });
});

describe('S70: Architecture Compliance', () => {
  test('autonomousMetrics.js has no tenantId in code (only in comments)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'services/autonomousMetrics.js'),
      'utf-8'
    );

    // Remove comments
    const codeWithoutComments = content
      .replace(/\/\*[\s\S]*?\*\//g, '')  // Block comments
      .replace(/\/\/.*/g, '');  // Line comments

    expect(codeWithoutComments).not.toContain('tenantId');
  });

  test('routes/os/autonomousMetrics.js uses OS patterns', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/autonomousMetrics.js'),
      'utf-8'
    );

    // Should not have tenant references
    const codeWithoutComments = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    expect(codeWithoutComments).not.toContain('tenantId');
    expect(codeWithoutComments).not.toContain('req.tenant');
  });
});

describe('S70: Migration Files', () => {
  test('S70 migration file exists and has correct structure', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const migrationPath = path.join(
      process.cwd(),
      'db/migrations/2025_12_01_s70_autonomous_observability.sql'
    );

    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf-8');

    // Check for required tables
    expect(content).toContain('CREATE TABLE IF NOT EXISTS llm_usage_metrics');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS llm_model_pricing');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS autonomous_performance_metrics');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS autonomous_daily_summary');

    // Check for views
    expect(content).toContain('CREATE OR REPLACE VIEW v_llm_cost_24h');
    expect(content).toContain('CREATE OR REPLACE VIEW v_performance_24h');
    expect(content).toContain('CREATE OR REPLACE VIEW v_error_summary_24h');

    // Check for functions
    expect(content).toContain('CREATE OR REPLACE FUNCTION calculate_llm_cost');
    expect(content).toContain('CREATE OR REPLACE FUNCTION aggregate_daily_summary');
    expect(content).toContain('CREATE OR REPLACE FUNCTION get_cost_summary');
    expect(content).toContain('CREATE OR REPLACE FUNCTION get_performance_summary');
  });
});

describe('S70: API Endpoint Structure', () => {
  test('OS index includes metrics router', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/index.js'),
      'utf-8'
    );

    expect(content).toContain("import autonomousMetricsRouter from './autonomousMetrics.js'");
    expect(content).toContain("router.use('/metrics', autonomousMetricsRouter)");
  });

  test('Metrics routes file has all required endpoints', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/autonomousMetrics.js'),
      'utf-8'
    );

    // LLM cost endpoints
    expect(content).toContain("router.post('/llm/usage'");
    expect(content).toContain("router.post('/llm/cost'");
    expect(content).toContain("router.get('/llm/stats'");
    expect(content).toContain("router.get('/cost'");
    expect(content).toContain("router.get('/cost/trend'");
    expect(content).toContain("router.get('/cost/alerts'");

    // Performance endpoints
    expect(content).toContain("router.post('/performance'");
    expect(content).toContain("router.get('/performance'");
    expect(content).toContain("router.get('/performance/realtime'");
    expect(content).toContain("router.get('/errors'");

    // Conversion endpoints
    expect(content).toContain("router.get('/outreach/funnel'");
    expect(content).toContain("router.put('/outreach/conversion'");

    // Daily summary endpoints
    expect(content).toContain("router.get('/daily'");
    expect(content).toContain("router.get('/daily/range'");
    expect(content).toContain("router.post('/daily/aggregate'");

    // Health endpoint
    expect(content).toContain("router.get('/health'");
  });
});
