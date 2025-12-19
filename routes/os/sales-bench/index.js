/**
 * Sales-Bench API Router
 * S242: Scenario Management API
 * PRD v1.3 Appendix
 *
 * Mounts all Sales-Bench endpoints at /api/os/sales-bench
 *
 * Sub-routers:
 * - /scenarios  - Scenario CRUD (S242)
 * - /runs       - Run management (S242)
 * - /buyer-bots - Buyer Bot registry (S243)
 * - /crs        - CRS scoring (S245-S246)
 * - /execution  - Path execution (S247)
 * - /calibration - Human calibration (S248)
 */

import express from 'express';
import scenariosRouter from './scenarios.js';
import runsRouter from './runs.js';
import buyerBotsRouter from './buyer-bots.js';
import mandatoryRouter from './mandatory.js';
import crsRouter from './crs.js';
import executionRouter from './execution.js';
import calibrationRouter from './calibration.js';
import suitesRouter from './suites.js';
import governanceRouter from './governance.js';
import { SALES_BENCH_META, PRD_V13_COMPLIANCE } from '../../../os/sales-bench/index.js';

const router = express.Router();

/**
 * GET /api/os/sales-bench
 * Sales-Bench API root - returns module info
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Sales-Bench v1 API',
    version: SALES_BENCH_META.version,
    prdVersion: SALES_BENCH_META.prdVersion,
    prdSection: SALES_BENCH_META.prdSection,
    status: SALES_BENCH_META.status,
    authorityRule: SALES_BENCH_META.authorityRule,
    clarifications: SALES_BENCH_META.clarifications,
    compliance: PRD_V13_COMPLIANCE,
    endpoints: {
      suites: {
        path: '/api/os/sales-bench/suites',
        methods: ['GET', 'POST', 'PATCH'],
        description: 'Suite governance - registry, status, validation, audit',
        status: 'ACTIVE',
      },
      governance: {
        path: '/api/os/sales-bench/governance',
        methods: ['GET', 'POST'],
        description: 'Governance commands - Super Admin triggers, OS executes',
        status: 'ACTIVE',
        commands: ['run-system-validation', 'start-human-calibration', 'approve-for-ga', 'deprecate-suite'],
      },
      scenarios: {
        path: '/api/os/sales-bench/scenarios',
        methods: ['GET', 'POST', 'DELETE'],
        description: 'Scenario management (immutable after creation)',
      },
      runs: {
        path: '/api/os/sales-bench/runs',
        methods: ['GET', 'POST'],
        description: 'Scenario run management (append-only)',
      },
      buyerBots: {
        path: '/api/os/sales-bench/buyer-bots',
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        description: 'Buyer Bot registry with hidden states and failure triggers (S243)',
        status: 'ACTIVE',
      },
      crs: {
        path: '/api/os/sales-bench/crs',
        methods: ['GET', 'POST'],
        description: 'CRS scoring - 8 dimensions with fixed weights (S245-S246)',
        status: 'ACTIVE',
      },
      execution: {
        path: '/api/os/sales-bench/execution',
        methods: ['POST', 'GET'],
        description: 'Golden/Kill path execution with deterministic replay (S247)',
        status: 'ACTIVE',
      },
      calibration: {
        path: '/api/os/sales-bench/calibration',
        methods: ['GET', 'POST'],
        description: 'Human calibration with Spearman correlation (S248)',
        status: 'ACTIVE',
      },
    },
    documentation: 'PRD v1.3 Appendix',
  });
});

/**
 * GET /api/os/sales-bench/health
 * Sales-Bench health check
 */
router.get('/health', async (req, res) => {
  const components = {
    suites: 'healthy',     // Governance: Suite registry
    governance: 'healthy', // Governance: Commands
    scenarios: 'healthy',
    runs: 'healthy',
    buyerBots: 'healthy',  // S243
    crs: 'healthy',        // S245-S246
    execution: 'healthy',  // S247
    calibration: 'healthy', // S248
  };

  res.json({
    success: true,
    status: 'healthy',
    version: SALES_BENCH_META.version,
    components,
    timestamp: new Date().toISOString(),
  });
});

// Mount sub-routers
router.use('/suites', suitesRouter);  // Governance: Suite registry, status, validation, audit
router.use('/governance', governanceRouter);  // Governance commands: Super Admin triggers
router.use('/scenarios', scenariosRouter);
router.use('/runs', runsRouter);
router.use('/buyer-bots', buyerBotsRouter);  // S243: Buyer Bot Framework
router.use('/mandatory', mandatoryRouter);  // S244: Mandatory Adversarial Bots
router.use('/crs', crsRouter);  // S245-S246: CRS Foundation & Dimension Scoring
router.use('/execution', executionRouter);  // S247: Golden & Kill Path Execution

// S248: Human Calibration Tooling
router.use('/calibration', calibrationRouter);

export default router;
