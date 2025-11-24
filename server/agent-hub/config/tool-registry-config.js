/**
 * Tool Registry Configuration
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Define metadata and configuration for all SIVA tools
 * Tools: CompanyQuality, ContactTier, TimingScore, BankingProductMatch
 *
 * Reference: Agent Hub Architecture §4 - Tool Registry
 */

const path = require('path');
const { companyQualityInputSchema, companyQualityOutputSchema } = require('../../siva-tools/schemas/companyQualitySchemas');
const { contactTierInputSchema, contactTierOutputSchema } = require('../../siva-tools/schemas/contactTierSchemas');
const { timingScoreInputSchema, timingScoreOutputSchema } = require('../../siva-tools/schemas/timingScoreSchemas');
const { bankingProductMatchInputSchema, bankingProductMatchOutputSchema } = require('../../siva-tools/schemas/bankingProductMatchSchemas');

/**
 * Tool configurations for all SIVA decision primitives
 */
const TOOL_CONFIGS = [
  // ═══════════════════════════════════════════════════════════
  // TOOL 1: CompanyQualityTool
  // ═══════════════════════════════════════════════════════════
  {
    name: 'CompanyQualityTool',
    displayName: 'Company Quality Evaluator',
    version: 'v2.0',
    primitive: 'EVALUATE_COMPANY_QUALITY',
    phase: 1,
    type: 'STRICT',
    path: path.join(__dirname, '../../siva-tools/CompanyQualityToolStandalone.js'),
    inputSchema: companyQualityInputSchema,
    outputSchema: companyQualityOutputSchema,
    sla: {
      p50LatencyMs: 300,
      p95LatencyMs: 900,
      errorRateThreshold: 0.001 // 0.1%
    },
    capabilities: {
      abTesting: true,
      shadowMode: true,
      scoringAdjustments: true,
      batchExecution: false
    },
    dependencies: [],
    healthCheckInput: {
      company_name: 'Health Check Corp',
      domain: 'healthcheck.ae',
      industry: 'Technology',
      uae_signals: {
        has_ae_domain: true,
        has_uae_address: true
      },
      size_bucket: 'startup',
      size: 50
    }
  },

  // ═══════════════════════════════════════════════════════════
  // TOOL 2: ContactTierTool
  // ═══════════════════════════════════════════════════════════
  {
    name: 'ContactTierTool',
    displayName: 'Contact Tier Selector',
    version: 'v2.0',
    primitive: 'SELECT_CONTACT_TIER',
    phase: 1,
    type: 'STRICT',
    path: path.join(__dirname, '../../siva-tools/ContactTierToolStandalone.js'),
    inputSchema: contactTierInputSchema,
    outputSchema: contactTierOutputSchema,
    sla: {
      p50LatencyMs: 200,
      p95LatencyMs: 600,
      errorRateThreshold: 0.001 // 0.1%
    },
    capabilities: {
      abTesting: true,
      shadowMode: true,
      scoringAdjustments: true,
      batchExecution: false
    },
    dependencies: [],
    healthCheckInput: {
      title: 'Chief Financial Officer',
      company_size: 100
    }
  },

  // ═══════════════════════════════════════════════════════════
  // TOOL 3: TimingScoreTool
  // ═══════════════════════════════════════════════════════════
  {
    name: 'TimingScoreTool',
    displayName: 'Timing Score Calculator',
    version: 'v1.0',
    primitive: 'CALCULATE_TIMING_SCORE',
    phase: 1,
    type: 'STRICT',
    path: path.join(__dirname, '../../siva-tools/TimingScoreToolStandalone.js'),
    inputSchema: timingScoreInputSchema,
    outputSchema: timingScoreOutputSchema,
    sla: {
      p50LatencyMs: 250,
      p95LatencyMs: 750,
      errorRateThreshold: 0.001 // 0.1%
    },
    capabilities: {
      abTesting: true,
      shadowMode: true,
      scoringAdjustments: true,
      batchExecution: false
    },
    dependencies: [],
    healthCheckInput: {
      current_date: new Date().toISOString().split('T')[0],
      signal_type: 'hiring',
      signal_age: 7
    }
  },

  // ═══════════════════════════════════════════════════════════
  // TOOL 4: BankingProductMatchTool
  // ═══════════════════════════════════════════════════════════
  {
    name: 'BankingProductMatchTool',
    displayName: 'Banking Product Matcher',
    version: 'v1.0',
    primitive: 'MATCH_BANKING_PRODUCTS',
    phase: 1,
    type: 'STRICT',
    path: path.join(__dirname, '../../siva-tools/BankingProductMatchToolStandalone.js'),
    inputSchema: bankingProductMatchInputSchema,
    outputSchema: bankingProductMatchOutputSchema,
    sla: {
      p50LatencyMs: 400,
      p95LatencyMs: 1200,
      errorRateThreshold: 0.001 // 0.1%
    },
    capabilities: {
      abTesting: true,
      shadowMode: true,
      scoringAdjustments: true,
      batchExecution: false
    },
    dependencies: [],
    healthCheckInput: {
      company_size: 150,
      industry: 'technology',
      average_salary_aed: 15000
    }
  }
];

module.exports = { TOOL_CONFIGS };
