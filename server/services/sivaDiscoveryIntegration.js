/**
 * SIVA Discovery Integration Service
 * Sprint 20 Task 3: Wire SIVA tools into Discovery Engine
 *
 * Integrates SIVA Foundation Tools (1, 3, 4) into the discovery/RADAR pipeline:
 * - Tool 1 (CompanyQuality): Filter companies after signal discovery
 * - Tool 3 (TimingScore): Calculate optimal timing for each signal
 * - Tool 4 (EdgeCases): Detect blockers before enrichment
 *
 * Integration points:
 * 1. After multiSourceOrchestrator returns signals
 * 2. Before signals are saved to hiring_signals table
 * 3. Before signals are sent to enrichment pipeline
 */

const CompanyQualityTool = require('../siva-tools/CompanyQualityToolStandalone');
const TimingScoreTool = require('../siva-tools/TimingScoreToolStandalone');
const EdgeCasesTool = require('../siva-tools/EdgeCasesToolStandalone');
const agentPersistence = require('./agentPersistence');
const Sentry = require('@sentry/node');

class SivaDiscoveryIntegration {
  constructor() {
    // Initialize SIVA Foundation tools
    this.companyQualityTool = new CompanyQualityTool();
    this.timingScoreTool = new TimingScoreTool();
    this.edgeCasesTool = new EdgeCasesTool();
  }

  /**
   * Process discovered signals through SIVA Foundation tools
   *
   * @param {Array} signals - Raw signals from multi-source orchestrator
   * @param {Object} options - Processing options
   * @param {string} options.sessionId - Session ID for grouping decisions
   * @param {string} options.tenantId - Tenant ID
   * @returns {Promise<Object>} Processed signals with SIVA enrichment
   */
  async processDiscoveredSignals(signals, options = {}) {
    const { sessionId = null, tenantId = null } = options;
    const startTime = Date.now();

    console.log(`[SIVA Discovery] Processing ${signals.length} signals through Foundation tools...`);

    try {
      const results = {
        totalSignals: signals.length,
        processedSignals: [],
        filtered: [],
        stats: {
          companyQuality: { processed: 0, passed: 0, failed: 0 },
          timingScore: { processed: 0, optimal: 0, good: 0, fair: 0, poor: 0 },
          edgeCases: { processed: 0, clean: 0, blockers: 0, warnings: 0 },
          executionTimeMs: 0
        }
      };

      // Process each signal through SIVA tools
      for (const signal of signals) {
        try {
          const processedSignal = await this.processSignal(signal, { sessionId, tenantId });

          if (processedSignal.passed) {
            results.processedSignals.push(processedSignal.signal);
          } else {
            results.filtered.push({
              ...processedSignal.signal,
              filterReason: processedSignal.filterReason
            });
          }

          // Update stats
          this.updateStats(results.stats, processedSignal);

        } catch (error) {
          console.error(`[SIVA Discovery] Error processing signal ${signal.id}:`, error.message);
          Sentry.captureException(error, {
            tags: { service: 'SivaDiscoveryIntegration', signalId: signal.id }
          });

          // Keep signal even if SIVA processing fails
          results.processedSignals.push(signal);
        }
      }

      results.stats.executionTimeMs = Date.now() - startTime;

      console.log(`[SIVA Discovery] Processed ${signals.length} signals:`,
        `${results.processedSignals.length} passed,`,
        `${results.filtered.length} filtered`,
        `(${results.stats.executionTimeMs}ms)`);

      return results;

    } catch (error) {
      console.error('[SIVA Discovery] Processing failed:', error);
      Sentry.captureException(error, {
        tags: { service: 'SivaDiscoveryIntegration', operation: 'processDiscoveredSignals' }
      });

      // Fail gracefully - return original signals
      return {
        totalSignals: signals.length,
        processedSignals: signals,
        filtered: [],
        stats: {
          executionTimeMs: Date.now() - startTime,
          error: error.message
        }
      };
    }
  }

  /**
   * Process a single signal through SIVA Foundation tools
   *
   * @param {Object} signal - Signal object from discovery
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processSignal(signal, options = {}) {
    const { sessionId, tenantId } = options;
    const sivaMetadata = {
      tools: {},
      passed: true,
      filterReason: null
    };

    // Step 1: Company Quality Check (Tool 1)
    const companyQualityResult = await this.checkCompanyQuality(signal, { sessionId, tenantId });
    sivaMetadata.tools.companyQuality = companyQualityResult;

    // If company quality check fails, filter signal
    if (companyQualityResult.outcome === 'FAIL') {
      sivaMetadata.passed = false;
      sivaMetadata.filterReason = `Company quality check failed: ${companyQualityResult.reasoning}`;
      return {
        signal: { ...signal, sivaMetadata },
        passed: false,
        filterReason: sivaMetadata.filterReason
      };
    }

    // Step 2: Edge Cases Check (Tool 4) - Check for blockers
    const edgeCasesResult = await this.checkEdgeCases(signal, { sessionId, tenantId });
    sivaMetadata.tools.edgeCases = edgeCasesResult;

    // If blockers detected, filter signal
    if (edgeCasesResult.has_blockers) {
      sivaMetadata.passed = false;
      sivaMetadata.filterReason = `Blockers detected: ${edgeCasesResult.blockers.map(b => b.category).join(', ')}`;
      return {
        signal: { ...signal, sivaMetadata },
        passed: false,
        filterReason: sivaMetadata.filterReason
      };
    }

    // Step 3: Timing Score (Tool 3) - Calculate optimal timing
    const timingScoreResult = await this.calculateTimingScore(signal, { sessionId, tenantId });
    sivaMetadata.tools.timingScore = timingScoreResult;

    // Attach SIVA metadata to signal
    return {
      signal: {
        ...signal,
        sivaMetadata,
        // Also attach key fields at top level for easy querying
        siva_company_quality_tier: companyQualityResult.tier,
        siva_company_quality_score: companyQualityResult.score,
        siva_timing_score: timingScoreResult.timing_score,
        siva_timing_category: timingScoreResult.category,
        siva_has_blockers: edgeCasesResult.has_blockers,
        siva_has_warnings: edgeCasesResult.has_warnings
      },
      passed: true,
      filterReason: null
    };
  }

  /**
   * Check company quality using Tool 1
   */
  async checkCompanyQuality(signal, options = {}) {
    const { sessionId, tenantId } = options;
    const startTime = Date.now();

    try {
      // Extract company data from signal
      const input = {
        companyId: signal.company_id || null,
        companyName: signal.company_name || signal.company || null,
        industry: signal.industry || signal.sector || null,
        employee_count: signal.employee_count || signal.company_size || null,
        location: signal.location || signal.company_location || null,
        revenue: signal.revenue || null,
        founded: signal.founded_year || null
      };

      const result = await this.companyQualityTool.execute(input);
      const executionTimeMs = Date.now() - startTime;

      // Log decision to database (async)
      agentPersistence.logDecision({
        toolName: 'CompanyQualityTool',
        toolLayer: 'foundation',
        primitiveName: 'EVALUATE_COMPANY_QUALITY',
        input,
        output: result,
        executionTimeMs,
        companyId: signal.company_id || null,
        signalId: signal.id || null,
        sessionId,
        moduleCaller: 'discovery',
        tenantId
      }).catch(err => console.error('Failed to persist CompanyQuality decision:', err.message));

      return result;

    } catch (error) {
      console.error('[SIVA Discovery] CompanyQualityTool error:', error);
      Sentry.captureException(error, {
        tags: {
          tool: 'CompanyQualityTool',
          module: 'discovery',
          signalId: signal.id
        }
      });

      // Return default PASS on error (don't filter signal)
      return {
        outcome: 'PASS',
        tier: 'UNKNOWN',
        score: 50,
        reasoning: `Error evaluating company quality: ${error.message}`
      };
    }
  }

  /**
   * Calculate timing score using Tool 3
   */
  async calculateTimingScore(signal, options = {}) {
    const { sessionId, tenantId } = options;
    const startTime = Date.now();

    try {
      // Extract timing data from signal
      const input = {
        signalId: signal.id || null,
        signal_type: signal.type || signal.signal_type || 'hiring',
        signal_date: signal.discovered_at || signal.created_at || new Date().toISOString(),
        industry: signal.industry || signal.sector || null,
        location: signal.location || signal.company_location || null,
        decision_velocity: signal.decision_velocity || 'STANDARD'
      };

      const result = await this.timingScoreTool.execute(input);
      const executionTimeMs = Date.now() - startTime;

      // Log decision to database (async)
      agentPersistence.logDecision({
        toolName: 'TimingScoreTool',
        toolLayer: 'foundation',
        primitiveName: 'CALCULATE_TIMING_SCORE',
        input,
        output: result,
        executionTimeMs,
        companyId: signal.company_id || null,
        signalId: signal.id || null,
        sessionId,
        moduleCaller: 'discovery',
        tenantId
      }).catch(err => console.error('Failed to persist TimingScore decision:', err.message));

      return result;

    } catch (error) {
      console.error('[SIVA Discovery] TimingScoreTool error:', error);
      Sentry.captureException(error, {
        tags: {
          tool: 'TimingScoreTool',
          module: 'discovery',
          signalId: signal.id
        }
      });

      // Return default GOOD timing on error
      return {
        timing_score: 75,
        category: 'GOOD',
        reasoning: `Error calculating timing: ${error.message}`
      };
    }
  }

  /**
   * Check edge cases using Tool 4
   */
  async checkEdgeCases(signal, options = {}) {
    const { sessionId, tenantId } = options;
    const startTime = Date.now();

    try {
      // Extract edge case data from signal
      const input = {
        companyId: signal.company_id || null,
        companyName: signal.company_name || signal.company || null,
        domain: signal.domain || signal.company_domain || null,
        industry: signal.industry || signal.sector || null,
        employee_count: signal.employee_count || signal.company_size || null,
        location: signal.location || signal.company_location || null
      };

      const result = await this.edgeCasesTool.execute(input);
      const executionTimeMs = Date.now() - startTime;

      // Log decision to database (async)
      agentPersistence.logDecision({
        toolName: 'EdgeCasesTool',
        toolLayer: 'foundation',
        primitiveName: 'CHECK_EDGE_CASES',
        input,
        output: result,
        executionTimeMs,
        companyId: signal.company_id || null,
        signalId: signal.id || null,
        sessionId,
        moduleCaller: 'discovery',
        tenantId
      }).catch(err => console.error('Failed to persist EdgeCases decision:', err.message));

      return result;

    } catch (error) {
      console.error('[SIVA Discovery] EdgeCasesTool error:', error);
      Sentry.captureException(error, {
        tags: {
          tool: 'EdgeCasesTool',
          module: 'discovery',
          signalId: signal.id
        }
      });

      // Return default CLEAN on error (don't filter signal)
      return {
        has_blockers: false,
        has_warnings: false,
        blockers: [],
        warnings: [],
        reasoning: `Error checking edge cases: ${error.message}`
      };
    }
  }

  /**
   * Update processing statistics
   */
  updateStats(stats, processedSignal) {
    const { tools, passed } = processedSignal.signal.sivaMetadata || {};

    // Company quality stats
    if (tools?.companyQuality) {
      stats.companyQuality.processed++;
      if (tools.companyQuality.outcome === 'PASS') {
        stats.companyQuality.passed++;
      } else {
        stats.companyQuality.failed++;
      }
    }

    // Timing score stats
    if (tools?.timingScore) {
      stats.timingScore.processed++;
      const category = tools.timingScore.category;
      if (category === 'OPTIMAL') stats.timingScore.optimal++;
      else if (category === 'GOOD') stats.timingScore.good++;
      else if (category === 'FAIR') stats.timingScore.fair++;
      else if (category === 'POOR') stats.timingScore.poor++;
    }

    // Edge cases stats
    if (tools?.edgeCases) {
      stats.edgeCases.processed++;
      if (tools.edgeCases.has_blockers) {
        stats.edgeCases.blockers++;
      } else if (tools.edgeCases.has_warnings) {
        stats.edgeCases.warnings++;
      } else {
        stats.edgeCases.clean++;
      }
    }
  }
}

module.exports = new SivaDiscoveryIntegration();
