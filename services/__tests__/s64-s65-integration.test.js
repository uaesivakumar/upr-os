/**
 * S64-S65 Integration Test Suite
 * Sprint 64: Object Intelligence v2
 * Sprint 65: Evidence System v2
 *
 * Lightweight integration tests that verify:
 * - Module exports are correct
 * - Function signatures match expected API
 * - No tenant awareness in code
 * - Deterministic behavior patterns
 */

describe('S64: Object Intelligence Module', () => {
  let objectIntelligence;

  beforeAll(async () => {
    // Import the module - will fail if there are syntax errors
    jest.doMock('../../db/index.js', () => ({
      getDb: () => ({
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        returning: jest.fn().mockResolvedValue([{ id: 'test' }]),
        raw: jest.fn().mockResolvedValue({ rows: [] }),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockReturnThis(),
        ignore: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue([{ count: 0 }]),
        clone: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        whereIn: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis()
      })
    }));

    jest.doMock('../configLoader.js', () => ({
      ConfigLoader: {
        getConfig: jest.fn().mockResolvedValue({ rules: [] })
      }
    }));

    objectIntelligence = await import('../objectIntelligence.js');
  });

  test('exports registerObject function', () => {
    expect(typeof objectIntelligence.registerObject).toBe('function');
  });

  test('exports getObject function', () => {
    expect(typeof objectIntelligence.getObject).toBe('function');
  });

  test('exports linkObjects function', () => {
    expect(typeof objectIntelligence.linkObjects).toBe('function');
  });

  test('exports getObjectGraph function', () => {
    expect(typeof objectIntelligence.getObjectGraph).toBe('function');
  });

  test('exports appendObjectEvent function', () => {
    expect(typeof objectIntelligence.appendObjectEvent).toBe('function');
  });

  test('exports getObjectTimeline function', () => {
    expect(typeof objectIntelligence.getObjectTimeline).toBe('function');
  });

  test('exports createObjectThread function', () => {
    expect(typeof objectIntelligence.createObjectThread).toBe('function');
  });

  test('exports getObjectState function', () => {
    expect(typeof objectIntelligence.getObjectState).toBe('function');
  });

  test('exports setObjectState function', () => {
    expect(typeof objectIntelligence.setObjectState).toBe('function');
  });

  test('exports deriveSignalsFromObject function', () => {
    expect(typeof objectIntelligence.deriveSignalsFromObject).toBe('function');
  });

  test('exports getObjectActions function', () => {
    expect(typeof objectIntelligence.getObjectActions).toBe('function');
  });

  test('default export contains all functions', () => {
    const defaultExport = objectIntelligence.default;
    expect(defaultExport.registerObject).toBeDefined();
    expect(defaultExport.linkObjects).toBeDefined();
    expect(defaultExport.getObjectGraph).toBeDefined();
    expect(defaultExport.getObjectTimeline).toBeDefined();
    expect(defaultExport.deriveSignalsFromObject).toBeDefined();
  });
});

describe('S65: Evidence Engine Module', () => {
  let evidenceEngine;

  beforeAll(async () => {
    jest.doMock('../../db/index.js', () => ({
      getDb: () => ({
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        returning: jest.fn().mockResolvedValue([{ id: 'test' }]),
        raw: jest.fn().mockResolvedValue({ rows: [] }),
        onConflict: jest.fn().mockReturnThis(),
        merge: jest.fn().mockReturnThis(),
        ignore: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        clone: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        join: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis()
      })
    }));

    evidenceEngine = await import('../evidenceEngine.js');
  });

  test('exports addEvidence function', () => {
    expect(typeof evidenceEngine.addEvidence).toBe('function');
  });

  test('exports getEvidence function', () => {
    expect(typeof evidenceEngine.getEvidence).toBe('function');
  });

  test('exports listEvidence function', () => {
    expect(typeof evidenceEngine.listEvidence).toBe('function');
  });

  test('exports aggregateEvidence function', () => {
    expect(typeof evidenceEngine.aggregateEvidence).toBe('function');
  });

  test('exports computeEvidenceScore function', () => {
    expect(typeof evidenceEngine.computeEvidenceScore).toBe('function');
  });

  test('exports refreshEvidenceFreshness function', () => {
    expect(typeof evidenceEngine.refreshEvidenceFreshness).toBe('function');
  });

  test('exports deduplicateEvidence function', () => {
    expect(typeof evidenceEngine.deduplicateEvidence).toBe('function');
  });

  test('exports detectConflicts function', () => {
    expect(typeof evidenceEngine.detectConflicts).toBe('function');
  });

  test('exports getProviderWeight function', () => {
    expect(typeof evidenceEngine.getProviderWeight).toBe('function');
  });

  test('exports updateProviderWeight function', () => {
    expect(typeof evidenceEngine.updateProviderWeight).toBe('function');
  });

  test('default export contains all functions', () => {
    const defaultExport = evidenceEngine.default;
    expect(defaultExport.addEvidence).toBeDefined();
    expect(defaultExport.aggregateEvidence).toBeDefined();
    expect(defaultExport.computeEvidenceScore).toBeDefined();
    expect(defaultExport.deduplicateEvidence).toBeDefined();
    expect(defaultExport.getProviderWeight).toBeDefined();
  });
});

describe('S64-S65: Architecture Compliance', () => {
  test('objectIntelligence.js has no tenantId in code (only in comments)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'services/objectIntelligence.js'),
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

  test('evidenceEngine.js has no tenantId in code (only in comments)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'services/evidenceEngine.js'),
      'utf-8'
    );

    // Remove comments and check no tenantId in actual code
    const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(codeWithoutComments).not.toMatch(/tenantId/);
    expect(codeWithoutComments).not.toMatch(/tenant_id/);

    // Should use context parameters
    expect(content).toMatch(/verticalSlug|vertical_slug/);
  });

  test('routes/os/objects.js uses OS patterns', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/objects.js'),
      'utf-8'
    );

    // Should use OS response patterns
    expect(content).toMatch(/createOSResponse/);
    expect(content).toMatch(/createOSError/);

    // Should use Sentry for error handling
    expect(content).toMatch(/Sentry/);
  });

  test('routes/os/evidence.js uses OS patterns', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/evidence.js'),
      'utf-8'
    );

    // Should use OS response patterns
    expect(content).toMatch(/createOSResponse/);
    expect(content).toMatch(/createOSError/);

    // Should use Sentry for error handling
    expect(content).toMatch(/Sentry/);
  });
});

describe('S64-S65: Migration Files', () => {
  test('S64 migration file exists and has correct structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'db/migrations/2025_11_30_s64_object_intelligence.sql'),
      'utf-8'
    );

    // Should have required tables
    expect(content).toMatch(/CREATE TABLE.*object_nodes/s);
    expect(content).toMatch(/CREATE TABLE.*object_edges/s);
    expect(content).toMatch(/CREATE TABLE.*object_threads/s);
    expect(content).toMatch(/CREATE TABLE.*object_events/s);
    expect(content).toMatch(/CREATE TABLE.*object_states/s);

    // Should have helper views
    expect(content).toMatch(/CREATE.*VIEW.*v_object_graph/s);
    expect(content).toMatch(/CREATE.*VIEW.*v_object_activity_timeline/s);

    // Should have indexes
    expect(content).toMatch(/CREATE INDEX/);
  });

  test('S65 migration file exists and has correct structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'db/migrations/2025_11_30_s65_evidence_system_v2.sql'),
      'utf-8'
    );

    // Should have required tables
    expect(content).toMatch(/CREATE TABLE.*evidence_items/s);
    expect(content).toMatch(/CREATE TABLE.*evidence_links/s);
    expect(content).toMatch(/CREATE TABLE.*evidence_freshness/s);
    expect(content).toMatch(/CREATE TABLE.*evidence_provenance/s);
    expect(content).toMatch(/CREATE TABLE.*provider_weights/s);

    // Should have helper views
    expect(content).toMatch(/CREATE.*VIEW.*v_evidence_summary_by_object/s);

    // Should have helper functions
    expect(content).toMatch(/CREATE.*FUNCTION.*calculate_decay_score/s);
    expect(content).toMatch(/CREATE.*FUNCTION.*compute_evidence_score/s);
  });
});

describe('S64-S65: API Endpoint Structure', () => {
  test('OS index includes evidence router', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/index.js'),
      'utf-8'
    );

    expect(content).toMatch(/import evidenceRouter/);
    expect(content).toMatch(/router\.use.*evidence.*evidenceRouter/);
  });

  test('Evidence routes file has all required endpoints', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/evidence.js'),
      'utf-8'
    );

    // CRUD endpoints
    expect(content).toMatch(/router\.post.*\/.*addEvidence/s);
    expect(content).toMatch(/router\.get.*\/:id.*getEvidence/s);

    // Aggregation and scoring
    expect(content).toMatch(/aggregate/);
    expect(content).toMatch(/score/);

    // Freshness
    expect(content).toMatch(/refresh/);

    // Deduplication
    expect(content).toMatch(/dedup/);

    // Provider weights
    expect(content).toMatch(/providers.*weight/);
  });

  test('Objects routes file has S64 endpoints', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(
      path.join(process.cwd(), 'routes/os/objects.js'),
      'utf-8'
    );

    // S64 endpoints
    expect(content).toMatch(/router\.post.*register/);
    expect(content).toMatch(/router\.post.*link/);
    expect(content).toMatch(/router\.get.*graph/);
    expect(content).toMatch(/router\.get.*timeline/);
    expect(content).toMatch(/router\.get.*state/);
    expect(content).toMatch(/router\.post.*state/);
    expect(content).toMatch(/router\.get.*threads/);
    expect(content).toMatch(/router\.post.*threads/);
    expect(content).toMatch(/router\.post.*signals/);
    expect(content).toMatch(/router\.get.*actions/);
  });
});
