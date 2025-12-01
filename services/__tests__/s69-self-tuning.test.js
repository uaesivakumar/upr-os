/**
 * =====================================================
 * Sprint 69: ML Self-Tuning Tests
 * =====================================================
 *
 * Tests for the config-driven self-tuning system:
 * 1) Scoring Model Auto-Tuning (Config-Level)
 * 2) Win/Loss Pattern Detection
 * 3) Journey Optimization Suggestions
 * 4) Persona Effectiveness Analytics
 *
 * Key validations:
 * - Deterministic behavior (same input → same output)
 * - Checkpoint protection for apply actions
 * - Integration with S66 (safety) and S70 (metrics)
 * - No direct model retraining
 * - OS-only (no tenant awareness)
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock db module before importing selfTuning
vi.mock('../../db/index.js', () => ({
  default: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

// Mock Sentry
vi.mock('@sentry/node', () => ({
  default: { captureException: vi.fn() },
  captureException: vi.fn(),
}));

// Mock autonomousSafety
vi.mock('../autonomousSafety.js', () => ({
  createCheckpoint: vi.fn().mockResolvedValue({ id: 'mock-checkpoint-id' }),
  recordActivity: vi.fn().mockResolvedValue({}),
}));

// Mock autonomousMetrics
vi.mock('../autonomousMetrics.js', () => ({
  recordPerformanceEvent: vi.fn().mockResolvedValue({}),
}));

// Mock configLoader
vi.mock('../configLoader.js', () => ({
  getConfig: vi.fn().mockResolvedValue({}),
}));

// Now import the service
import * as selfTuning from '../selfTuning.js';

// =====================================================
// SERVICE EXPORTS
// =====================================================

describe('S69: Self-Tuning Service Exports', () => {
  it('should export all scoring config functions', () => {
    expect(typeof selfTuning.getScoringConfig).toBe('function');
    expect(typeof selfTuning.listScoringConfigs).toBe('function');
    expect(typeof selfTuning.updateScoringConfig).toBe('function');
  });

  it('should export performance analysis functions', () => {
    expect(typeof selfTuning.analyzePerformance).toBe('function');
  });

  it('should export tuning action functions', () => {
    expect(typeof selfTuning.generateScoringTuningActions).toBe('function');
    expect(typeof selfTuning.listTuningActions).toBe('function');
    expect(typeof selfTuning.applyTuningAction).toBe('function');
    expect(typeof selfTuning.completeTuningAction).toBe('function');
    expect(typeof selfTuning.rejectTuningAction).toBe('function');
  });

  it('should export win/loss pattern functions', () => {
    expect(typeof selfTuning.generateWinLossPatterns).toBe('function');
    expect(typeof selfTuning.getWinLossPatterns).toBe('function');
  });

  it('should export journey suggestion functions', () => {
    expect(typeof selfTuning.generateJourneySuggestions).toBe('function');
    expect(typeof selfTuning.getJourneySuggestions).toBe('function');
  });

  it('should export persona stats functions', () => {
    expect(typeof selfTuning.computePersonaStats).toBe('function');
    expect(typeof selfTuning.getPersonaStats).toBe('function');
    expect(typeof selfTuning.getTopPersonas).toBe('function');
  });

  it('should export utility functions', () => {
    expect(typeof selfTuning.expireOldActions).toBe('function');
    expect(typeof selfTuning.getTuningSummary).toBe('function');
    expect(typeof selfTuning.getHealth).toBe('function');
  });

  it('should have at least 18 exported functions', () => {
    const exports = Object.keys(selfTuning).filter(k => typeof selfTuning[k] === 'function');
    expect(exports.length).toBeGreaterThanOrEqual(18);
  });
});

// =====================================================
// FUNCTION SIGNATURES
// =====================================================

describe('S69: Function Signatures', () => {
  describe('getScoringConfig', () => {
    it('should accept modelName, verticalSlug, territoryId params', () => {
      const fn = selfTuning.getScoringConfig;
      const fnStr = fn.toString();
      expect(fnStr).toContain('modelName');
      expect(fnStr).toContain('verticalSlug');
      expect(fnStr).toContain('territoryId');
    });
  });

  describe('analyzePerformance', () => {
    it('should accept verticalSlug, territoryId, timeWindowDays params', () => {
      const fn = selfTuning.analyzePerformance;
      const fnStr = fn.toString();
      expect(fnStr).toContain('verticalSlug');
      expect(fnStr).toContain('territoryId');
      expect(fnStr).toContain('timeWindowDays');
    });
  });

  describe('generateScoringTuningActions', () => {
    it('should accept verticalSlug, territoryId, modelName params', () => {
      const fn = selfTuning.generateScoringTuningActions;
      const fnStr = fn.toString();
      expect(fnStr).toContain('verticalSlug');
      expect(fnStr).toContain('territoryId');
      expect(fnStr).toContain('modelName');
    });
  });

  describe('applyTuningAction', () => {
    it('should accept actionId, approvedBy, verticalSlug, territoryId params', () => {
      const fn = selfTuning.applyTuningAction;
      const fnStr = fn.toString();
      expect(fnStr).toContain('actionId');
      expect(fnStr).toContain('approvedBy');
      expect(fnStr).toContain('verticalSlug');
    });
  });

  describe('generateWinLossPatterns', () => {
    it('should accept verticalSlug, territoryId, timeWindowDays params', () => {
      const fn = selfTuning.generateWinLossPatterns;
      const fnStr = fn.toString();
      expect(fnStr).toContain('verticalSlug');
      expect(fnStr).toContain('territoryId');
      expect(fnStr).toContain('timeWindowDays');
    });
  });

  describe('computePersonaStats', () => {
    it('should accept verticalSlug, territoryId, timeWindowDays params', () => {
      const fn = selfTuning.computePersonaStats;
      const fnStr = fn.toString();
      expect(fnStr).toContain('verticalSlug');
      expect(fnStr).toContain('territoryId');
      expect(fnStr).toContain('timeWindowDays');
    });
  });
});

// =====================================================
// ARCHITECTURE COMPLIANCE
// =====================================================

describe('S69: Architecture Compliance', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should NOT reference tenant IDs', () => {
    expect(serviceCode).not.toContain('tenantId');
    expect(serviceCode).not.toContain('tenant_id');
    expect(serviceCode).not.toContain('getTenant');
  });

  it('should NOT reference user records directly', () => {
    expect(serviceCode).not.toContain('userId');
    expect(serviceCode).not.toContain('user_id');
    expect(serviceCode).not.toContain('getUser(');
  });

  it('should NOT reference billing logic', () => {
    expect(serviceCode).not.toContain('.plan');
    expect(serviceCode).not.toContain('subscription');
    expect(serviceCode).not.toContain('billing');
  });

  it('should use verticalSlug for context', () => {
    expect(serviceCode).toContain('verticalSlug');
    expect(serviceCode).toContain('vertical_slug');
  });

  it('should use territoryId for context', () => {
    expect(serviceCode).toContain('territoryId');
    expect(serviceCode).toContain('territory_id');
  });
});

// =====================================================
// S66 INTEGRATION (CHECKPOINT PROTECTION)
// =====================================================

describe('S69: S66 Checkpoint Integration', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should import autonomousSafety for checkpoint integration', () => {
    expect(serviceCode).toContain("import * as autonomousSafety from './autonomousSafety.js'");
  });

  it('should use createCheckpoint for apply actions', () => {
    expect(serviceCode).toContain('autonomousSafety.createCheckpoint');
  });

  it('should use recordActivity for audit logging', () => {
    expect(serviceCode).toContain('autonomousSafety.recordActivity');
  });

  it('should store checkpoint_id reference in tuning actions', () => {
    expect(serviceCode).toContain('checkpoint_id');
  });
});

// =====================================================
// S70 INTEGRATION (METRICS)
// =====================================================

describe('S69: S70 Metrics Integration', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should import autonomousMetrics for performance data', () => {
    expect(serviceCode).toContain("import * as autonomousMetrics from './autonomousMetrics.js'");
  });

  it('should record performance events to S70', () => {
    expect(serviceCode).toContain('autonomousMetrics.recordPerformanceEvent');
  });

  it('should query autonomous_performance_metrics table', () => {
    expect(serviceCode).toContain('autonomous_performance_metrics');
  });
});

// =====================================================
// CONFIG-DRIVEN BEHAVIOR
// =====================================================

describe('S69: Config-Driven Behavior', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should NOT contain direct model training code', () => {
    expect(serviceCode).not.toContain('model.fit');
    expect(serviceCode).not.toContain('model.train');
    expect(serviceCode).not.toContain('tensorflow');
    expect(serviceCode).not.toContain('pytorch');
    expect(serviceCode).not.toContain('sklearn');
  });

  it('should NOT call external ML services', () => {
    expect(serviceCode).not.toContain('openai.fine_tune');
    expect(serviceCode).not.toContain('sagemaker');
    expect(serviceCode).not.toContain('mlflow');
  });

  it('should use scoring_config table for config storage', () => {
    expect(serviceCode).toContain('scoring_config');
  });

  it('should propose changes via tuning_actions table', () => {
    expect(serviceCode).toContain('scoring_tuning_actions');
  });

  it('should import configLoader for thresholds', () => {
    expect(serviceCode).toContain("import * as configLoader from './configLoader.js'");
  });
});

// =====================================================
// DETERMINISTIC BEHAVIOR
// =====================================================

describe('S69: Deterministic Behavior', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should NOT use Math.random for decision making', () => {
    // Check that random is not used for tuning decisions
    // Note: Math.random may be used for UUIDs, but not for tuning logic
    const randomUsages = serviceCode.match(/Math\.random\(\)/g) || [];
    expect(randomUsages.length).toBe(0);
  });

  it('should use confidence thresholds for proposals', () => {
    expect(serviceCode).toContain('MIN_CONFIDENCE');
    expect(serviceCode).toContain('confidence');
  });

  it('should use sample size minimums', () => {
    expect(serviceCode).toContain('MIN_SAMPLE_SIZE');
    expect(serviceCode).toContain('sample_size');
  });
});

// =====================================================
// TUNING ACTION TYPES
// =====================================================

describe('S69: Tuning Action Types', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should define TUNING_ACTION_TYPES constant', () => {
    expect(serviceCode).toContain('TUNING_ACTION_TYPES');
  });

  it('should support adjust_weight action', () => {
    expect(serviceCode).toContain('ADJUST_WEIGHT');
    expect(serviceCode).toContain('adjust_weight');
  });

  it('should support adjust_threshold action', () => {
    expect(serviceCode).toContain('ADJUST_THRESHOLD');
    expect(serviceCode).toContain('adjust_threshold');
  });

  it('should support toggle_signal action', () => {
    expect(serviceCode).toContain('TOGGLE_SIGNAL');
    expect(serviceCode).toContain('toggle_signal');
  });

  it('should define STATUS constant with all states', () => {
    expect(serviceCode).toContain('STATUS');
    expect(serviceCode).toContain('PROPOSED');
    expect(serviceCode).toContain('APPROVED');
    expect(serviceCode).toContain('APPLIED');
    expect(serviceCode).toContain('REJECTED');
    expect(serviceCode).toContain('EXPIRED');
  });
});

// =====================================================
// JOURNEY CHANGE TYPES
// =====================================================

describe('S69: Journey Change Types', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should define JOURNEY_CHANGE_TYPES constant', () => {
    expect(serviceCode).toContain('JOURNEY_CHANGE_TYPES');
  });

  it('should support channel_switch change', () => {
    expect(serviceCode).toContain('CHANNEL_SWITCH');
    expect(serviceCode).toContain('channel_switch');
  });

  it('should support delay_adjust change', () => {
    expect(serviceCode).toContain('DELAY_ADJUST');
    expect(serviceCode).toContain('delay_adjust');
  });

  it('should support followup_count change', () => {
    expect(serviceCode).toContain('FOLLOWUP_COUNT');
    expect(serviceCode).toContain('followup_count');
  });

  it('should support template_swap change', () => {
    expect(serviceCode).toContain('TEMPLATE_SWAP');
    expect(serviceCode).toContain('template_swap');
  });
});

// =====================================================
// WIN/LOSS PATTERN DETECTION
// =====================================================

describe('S69: Win/Loss Pattern Detection', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should query win_loss_patterns table', () => {
    expect(serviceCode).toContain('win_loss_patterns');
  });

  it('should calculate win_rate and loss_rate', () => {
    expect(serviceCode).toContain('win_rate');
    expect(serviceCode).toContain('loss_rate');
  });

  it('should track segment_key for pattern grouping', () => {
    expect(serviceCode).toContain('segment_key');
  });

  it('should track persona_key for pattern grouping', () => {
    expect(serviceCode).toContain('persona_key');
  });

  it('should calculate confidence based on sample size', () => {
    // Confidence calculation: min(1.0, sqrt(sample_size / 100))
    expect(serviceCode).toContain('Math.sqrt');
    expect(serviceCode).toContain('Math.min');
  });
});

// =====================================================
// PERSONA ANALYTICS
// =====================================================

describe('S69: Persona Analytics', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should query persona_performance_stats table', () => {
    expect(serviceCode).toContain('persona_performance_stats');
  });

  it('should track reply_rate metric', () => {
    expect(serviceCode).toContain('reply_rate');
  });

  it('should track open_rate metric', () => {
    expect(serviceCode).toContain('open_rate');
  });

  it('should track click_rate metric', () => {
    expect(serviceCode).toContain('click_rate');
  });

  it('should compute persona ranks', () => {
    expect(serviceCode).toContain('compute_persona_ranks');
    expect(serviceCode).toContain('rank_position');
  });
});

// =====================================================
// ERROR HANDLING
// =====================================================

describe('S69: Error Handling', () => {
  let serviceCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const servicePath = path.join(process.cwd(), 'services', 'selfTuning.js');
    serviceCode = fs.readFileSync(servicePath, 'utf-8');
  });

  it('should import Sentry for error tracking', () => {
    expect(serviceCode).toContain("import * as Sentry from '@sentry/node'");
  });

  it('should use try-catch for metrics recording', () => {
    expect(serviceCode).toContain('try {');
    expect(serviceCode).toContain('catch');
    expect(serviceCode).toContain('Sentry.captureException');
  });

  it('should throw descriptive errors for invalid operations', () => {
    expect(serviceCode).toContain('throw new Error');
  });
});

// =====================================================
// MIGRATION STRUCTURE
// =====================================================

describe('S69: Migration Structure', () => {
  let migrationCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const migrationPath = path.join(process.cwd(), 'db', 'migrations', '2025_12_01_s69_self_tuning.sql');
    migrationCode = fs.readFileSync(migrationPath, 'utf-8');
  });

  it('should create scoring_config table', () => {
    expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS scoring_config');
    expect(migrationCode).toContain('model_name');
    expect(migrationCode).toContain('signal_key');
    expect(migrationCode).toContain('weight');
  });

  it('should create scoring_tuning_actions table', () => {
    expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS scoring_tuning_actions');
    expect(migrationCode).toContain('action_type');
    expect(migrationCode).toContain('target_model');
    expect(migrationCode).toContain('confidence');
  });

  it('should create win_loss_patterns table', () => {
    expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS win_loss_patterns');
    expect(migrationCode).toContain('segment_key');
    expect(migrationCode).toContain('win_rate');
    expect(migrationCode).toContain('loss_rate');
  });

  it('should create journey_tuning_suggestions table', () => {
    expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS journey_tuning_suggestions');
    expect(migrationCode).toContain('journey_id');
    expect(migrationCode).toContain('suggested_change');
    expect(migrationCode).toContain('impact_estimate');
  });

  it('should create persona_performance_stats table', () => {
    expect(migrationCode).toContain('CREATE TABLE IF NOT EXISTS persona_performance_stats');
    expect(migrationCode).toContain('persona_key');
    expect(migrationCode).toContain('win_rate');
    expect(migrationCode).toContain('reply_rate');
  });

  it('should create views for quick access', () => {
    expect(migrationCode).toContain('CREATE OR REPLACE VIEW v_pending_tuning_actions');
    expect(migrationCode).toContain('CREATE OR REPLACE VIEW v_top_scoring_signals');
    expect(migrationCode).toContain('CREATE OR REPLACE VIEW v_underperforming_journeys');
    expect(migrationCode).toContain('CREATE OR REPLACE VIEW v_top_personas');
  });

  it('should create helper functions', () => {
    expect(migrationCode).toContain('CREATE OR REPLACE FUNCTION get_scoring_config');
    expect(migrationCode).toContain('CREATE OR REPLACE FUNCTION compute_persona_ranks');
    expect(migrationCode).toContain('CREATE OR REPLACE FUNCTION expire_old_tuning_actions');
  });

  it('should include seed data for default scoring config', () => {
    expect(migrationCode).toContain('INSERT INTO scoring_config');
    expect(migrationCode).toContain('qtle_v2');
    expect(migrationCode).toContain('lead_priority');
  });
});

// =====================================================
// ROUTES STRUCTURE
// =====================================================

describe('S69: Routes Structure', () => {
  let routesCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routesPath = path.join(process.cwd(), 'routes', 'os', 'selfTuning.js');
    routesCode = fs.readFileSync(routesPath, 'utf-8');
  });

  it('should define GET /actions endpoint', () => {
    expect(routesCode).toContain("router.get('/actions'");
  });

  it('should define POST /apply endpoint', () => {
    expect(routesCode).toContain("router.post('/apply'");
  });

  it('should define POST /complete endpoint', () => {
    expect(routesCode).toContain("router.post('/complete'");
  });

  it('should define POST /reject endpoint', () => {
    expect(routesCode).toContain("router.post('/reject'");
  });

  it('should define GET /patterns endpoint', () => {
    expect(routesCode).toContain("router.get('/patterns'");
  });

  it('should define POST /patterns/compute endpoint', () => {
    expect(routesCode).toContain("router.post('/patterns/compute'");
  });

  it('should define GET /personas endpoint', () => {
    expect(routesCode).toContain("router.get('/personas'");
  });

  it('should define POST /personas/compute endpoint', () => {
    expect(routesCode).toContain("router.post('/personas/compute'");
  });

  it('should define GET /journeys endpoint', () => {
    expect(routesCode).toContain("router.get('/journeys'");
  });

  it('should define POST /journeys/generate endpoint', () => {
    expect(routesCode).toContain("router.post('/journeys/generate'");
  });

  it('should define GET /config endpoint', () => {
    expect(routesCode).toContain("router.get('/config'");
  });

  it('should define GET /health endpoint', () => {
    expect(routesCode).toContain("router.get('/health'");
  });

  it('should validate required parameters', () => {
    expect(routesCode).toContain("verticalSlug is required");
    expect(routesCode).toContain("actionId is required");
  });
});

// =====================================================
// MAIN ROUTER INTEGRATION
// =====================================================

describe('S69: Main Router Integration', () => {
  let indexCode;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.join(process.cwd(), 'routes', 'os', 'index.js');
    indexCode = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should import selfTuningRouter', () => {
    expect(indexCode).toContain("import selfTuningRouter from './selfTuning.js'");
  });

  it('should mount router at /tuning', () => {
    expect(indexCode).toContain("router.use('/tuning', selfTuningRouter)");
  });

  it('should include tuning in health check services', () => {
    expect(indexCode).toContain("tuning: 'checking'");
  });

  it('should document tuning endpoints', () => {
    expect(indexCode).toContain("path: '/api/os/tuning'");
    expect(indexCode).toContain('ML self-tuning');
  });

  it('should reference Sprint 69 in header', () => {
    expect(indexCode).toContain('Sprint 69');
  });
});
