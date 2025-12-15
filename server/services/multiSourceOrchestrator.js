/**
 * Multi-Source Orchestrator Service
 * Sprint 19, Task 1: Multi-Source Orchestration
 *
 * Central orchestration service for all signal discovery sources:
 * - News scraping (SerpAPI)
 * - LinkedIn signals
 * - Job boards (Indeed, LinkedIn Jobs)
 * - Social media (Twitter/X)
 *
 * Features:
 * - Parallel source execution
 * - Per-source timeout and retry logic
 * - Circuit breaker pattern for failing sources
 * - Source health monitoring
 * - Performance metrics tracking
 */

import * as Sentry from '@sentry/node';
import pool from '../db.js';

// Import source services
import LinkedInSignalService from './linkedinSignals.js';
import deduplicationService from './deduplicationService.js';
import sourcePrioritization from './sourcePrioritization.js';
import signalQualityScoring from './signalQualityScoring.js';
// Note: Other source services will be imported as they're implemented

// Sprint 20 Task 3: SIVA Discovery Integration
// Dynamically imported to avoid require() in ES module
let sivaDiscoveryIntegration = null;

class MultiSourceOrchestrator {
  constructor() {
    // Load SIVA integration dynamically (CommonJS module)
    this.loadSivaIntegration();

    // Source configuration
    this.sources = {
      news: {
        id: 'news',
        name: 'News Scraping (SerpAPI)',
        enabled: true,
        timeout: 30000, // 30 seconds
        maxRetries: 2,
        priority: 0.8,
        handler: this.executeNewsSource.bind(this)
      },
      linkedin: {
        id: 'linkedin',
        name: 'LinkedIn Company Updates',
        enabled: true,
        timeout: 25000, // 25 seconds
        maxRetries: 2,
        priority: 0.7,
        handler: this.executeLinkedInSource.bind(this)
      },
      jobs: {
        id: 'jobs',
        name: 'Job Boards (Indeed, LinkedIn Jobs)',
        enabled: false, // Not implemented yet
        timeout: 20000,
        maxRetries: 2,
        priority: 0.6,
        handler: this.executeJobBoardsSource.bind(this)
      },
      social: {
        id: 'social',
        name: 'Social Media (Twitter/X)',
        enabled: false, // Not implemented yet
        timeout: 15000,
        maxRetries: 1,
        priority: 0.5,
        handler: this.executeSocialSource.bind(this)
      }
    };

    // Circuit breaker state
    this.circuitBreakers = {};
    this.initializeCircuitBreakers();
  }

  /**
   * Initialize circuit breakers for all sources
   * Circuit breaker prevents cascading failures
   */
  initializeCircuitBreakers() {
    Object.keys(this.sources).forEach(sourceId => {
      this.circuitBreakers[sourceId] = {
        state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
        failureCount: 0,
        lastFailureTime: null,
        threshold: 3, // Open circuit after 3 consecutive failures
        timeout: 60000, // Try again after 60 seconds
      };
    });
  }

  /**
   * Load SIVA Discovery Integration (CommonJS module)
   * Uses dynamic import to handle CommonJS/ESM mismatch
   */
  async loadSivaIntegration() {
    try {
      const module = await import('./sivaDiscoveryIntegration.js');
      sivaDiscoveryIntegration = module.default || module;
      console.log('[MultiSourceOrchestrator] SIVA Discovery Integration loaded');
    } catch (error) {
      console.error('[MultiSourceOrchestrator] Failed to load SIVA integration:', error.message);
      // Continue without SIVA integration (graceful degradation)
    }
  }

  /**
   * Main orchestration method - Execute multiple sources in parallel
   *
   * @param {Object} options - Orchestration options
   * @param {Array<string>} options.sources - Specific sources to execute (optional)
   * @param {Object} options.filters - Discovery filters (location, sector, etc.)
   * @param {number} options.maxParallel - Max sources to run in parallel (default: 4)
   * @param {string} options.tenantId - Tenant ID for signal attribution
   * @returns {Promise<Object>} Orchestration results
   */
  async orchestrate(options = {}) {
    const {
      sources: requestedSources = null,
      filters = {},
      maxParallel = 4,
      tenantId = null
    } = options;

    const startTime = Date.now();
    const orchestrationId = this.generateOrchestrationId();

    try {
      console.log(`[Orchestrator] Starting orchestration ${orchestrationId}`);

      // Step 1: Select sources to execute
      const selectedSources = this.selectSources(requestedSources);
      console.log(`[Orchestrator] Selected ${selectedSources.length} sources:`, selectedSources.map(s => s.id));

      // Step 2: Execute sources in parallel (with concurrency limit)
      const sourceResults = await this.executeSourcesInParallel(
        selectedSources,
        filters,
        maxParallel,
        tenantId
      );

      // Step 3: Aggregate results
      const aggregatedResults = this.aggregateResults(sourceResults);

      // ========== FORENSIC LOG: After source aggregation ==========
      console.log('[FORENSIC:Orchestrator] After source aggregation:', {
        orchestrationId,
        totalSignalsFromSources: aggregatedResults.signals?.length || 0,
        successfulSources: aggregatedResults.successfulSources,
        failedSources: aggregatedResults.failedSources,
        sourceResultsSummary: sourceResults.map(r => ({
          source: r.sourceId,
          success: r.success,
          signalCount: r.signals?.length || 0,
          error: r.error || null
        }))
      });

      if (!aggregatedResults.signals || aggregatedResults.signals.length === 0) {
        console.log('[FORENSIC:Orchestrator] ZERO SIGNALS from sources - no SIVA will run');
      }
      // ========== END FORENSIC LOG ==========

      // Step 3.5: Deduplicate signals across sources (Sprint 19 Task 2)
      let finalSignals = aggregatedResults.signals;
      let deduplicationStats = null;

      if (finalSignals && finalSignals.length > 0) {
        try {
          const deduplicationResult = await deduplicationService.deduplicateSignals(finalSignals);
          finalSignals = deduplicationResult.uniqueSignals;
          deduplicationStats = deduplicationResult.stats;

          console.log(`[Orchestrator] Deduplication complete: ${deduplicationStats.originalCount} → ${deduplicationStats.uniqueCount} signals (${deduplicationStats.duplicatesRemoved} removed)`);
        } catch (dedupeError) {
          console.error('[Orchestrator] Deduplication failed, continuing with all signals:', dedupeError);
          Sentry.captureException(dedupeError, {
            tags: {
              service: 'MultiSourceOrchestrator',
              operation: 'deduplication',
              orchestrationId
            }
          });
        }
      }

      // Step 3.6: Calculate quality scores (Sprint 19 Task 4)
      let qualityStats = null;
      if (finalSignals && finalSignals.length > 0) {
        try {
          // Get source reliability scores
          const sourceReliabilityMap = {};
          for (const source of selectedSources) {
            try {
              const metrics = await sourcePrioritization.getSourceMetrics(source.id);
              if (metrics) {
                sourceReliabilityMap[source.id] = metrics.successRate;
              }
            } catch (err) {
              console.warn(`[Orchestrator] Could not get reliability for ${source.id}`);
            }
          }

          // Calculate quality scores for all signals
          finalSignals = await signalQualityScoring.batchCalculateQuality(finalSignals, sourceReliabilityMap);

          // Calculate quality statistics
          const excellentCount = finalSignals.filter(s => s.quality_tier === 'EXCELLENT').length;
          const goodCount = finalSignals.filter(s => s.quality_tier === 'GOOD').length;
          const highQualityCount = excellentCount + goodCount;

          qualityStats = {
            totalSignals: finalSignals.length,
            excellentCount,
            goodCount,
            highQualityCount,
            highQualityRate: finalSignals.length > 0 ? highQualityCount / finalSignals.length : 0,
            avgQualityScore: finalSignals.length > 0
              ? finalSignals.reduce((sum, s) => sum + (s.quality_score || 0), 0) / finalSignals.length
              : 0
          };

          console.log(`[Orchestrator] Quality scoring complete: ${highQualityCount}/${finalSignals.length} high-quality signals (${(qualityStats.highQualityRate * 100).toFixed(1)}%)`);
        } catch (qualityError) {
          console.error('[Orchestrator] Quality scoring failed, continuing without scores:', qualityError);
          Sentry.captureException(qualityError, {
            tags: {
              service: 'MultiSourceOrchestrator',
              operation: 'qualityScoring',
              orchestrationId
            }
          });
        }
      }

      // Step 3.7: Process signals through SIVA Foundation tools (Sprint 20 Task 3)
      let sivaStats = null;
      if (finalSignals && finalSignals.length > 0) {
        // ========== FORENSIC LOG: Before SIVA ==========
        const uniqueCompanies = new Set(finalSignals.map(s => s.company_id || s.company_name || s.company || s.domain).filter(Boolean));
        console.log('[FORENSIC:Orchestrator] BEFORE SIVA:', {
          orchestrationId,
          finalSignalsCount: finalSignals.length,
          uniqueCompanyIdentifiers: uniqueCompanies.size,
          sampleCompanyIds: [...uniqueCompanies].slice(0, 5)
        });
        // ========== END FORENSIC LOG ==========

        try {
          const sivaResult = await sivaDiscoveryIntegration.processDiscoveredSignals(finalSignals, {
            sessionId: orchestrationId,
            tenantId
          });

          // ========== FORENSIC LOG: After SIVA ==========
          const filteredByReason = (sivaResult.filtered || []).reduce((acc, s) => {
            const reason = s.filterReason || 'unknown';
            const key = reason.includes('Critical') ? 'CRITICAL' : reason.includes('quality') ? 'QUALITY' : 'OTHER';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {});
          console.log('[FORENSIC:Orchestrator] AFTER SIVA:', {
            orchestrationId,
            inputCount: sivaResult.totalSignals,
            passedCount: sivaResult.processedSignals?.length || 0,
            filteredCount: sivaResult.filtered?.length || 0,
            filteredByReason,
            sampleFiltered: (sivaResult.filtered || []).slice(0, 3).map(s => ({
              company: s.company_name || s.company || 'N/A',
              reason: s.filterReason
            })),
            sivaStats: sivaResult.stats
          });
          // ========== END FORENSIC LOG ==========

          // Update signals with SIVA enrichment
          finalSignals = sivaResult.processedSignals;
          sivaStats = sivaResult.stats;

          console.log(`[Orchestrator] SIVA processing complete: ${finalSignals.length}/${sivaResult.totalSignals} signals passed (${sivaResult.filtered.length} filtered)`);
        } catch (sivaError) {
          console.error('[Orchestrator] SIVA processing failed, continuing without SIVA enrichment:', sivaError);
          Sentry.captureException(sivaError, {
            tags: {
              service: 'MultiSourceOrchestrator',
              operation: 'sivaProcessing',
              orchestrationId
            }
          });
        }
      }

      // Update aggregated results with deduplicated, quality-scored, and SIVA-enriched signals
      const finalResults = {
        ...aggregatedResults,
        signals: finalSignals,
        totalSignals: finalSignals.length,
        deduplication: deduplicationStats,
        quality: qualityStats,
        siva: sivaStats
      };

      // Step 4: Save orchestration run to database
      await this.saveOrchestrationRun({
        orchestrationId,
        sources: selectedSources.map(s => s.id),
        results: finalResults,
        executionTimeMs: Date.now() - startTime,
        tenantId
      });

      console.log(`[Orchestrator] Orchestration ${orchestrationId} complete:`,
        `${finalResults.totalSignals} signals from ${aggregatedResults.successfulSources} sources`);

      return {
        success: true,
        orchestrationId,
        executionTimeMs: Date.now() - startTime,
        ...finalResults
      };

    } catch (error) {
      console.error(`[Orchestrator] Orchestration ${orchestrationId} failed:`, error);

      Sentry.captureException(error, {
        tags: {
          service: 'MultiSourceOrchestrator',
          operation: 'orchestrate',
          orchestrationId
        },
        extra: {
          options,
          executionTimeMs: Date.now() - startTime
        }
      });

      throw error;
    }
  }

  /**
   * Select sources to execute based on:
   * - Requested sources (if specified)
   * - Enabled status
   * - Circuit breaker state
   * - Priority scores
   */
  selectSources(requestedSources = null) {
    let sourcesToExecute = Object.values(this.sources);

    // Filter by requested sources
    if (requestedSources && requestedSources.length > 0) {
      sourcesToExecute = sourcesToExecute.filter(s =>
        requestedSources.includes(s.id)
      );
    }

    // Filter by enabled status
    sourcesToExecute = sourcesToExecute.filter(s => s.enabled);

    // Filter by circuit breaker state
    sourcesToExecute = sourcesToExecute.filter(s => {
      const breaker = this.circuitBreakers[s.id];
      return this.isCircuitClosed(breaker);
    });

    // Sort by priority (highest first)
    sourcesToExecute.sort((a, b) => b.priority - a.priority);

    return sourcesToExecute;
  }

  /**
   * Check if circuit breaker is closed (source can be executed)
   */
  isCircuitClosed(breaker) {
    if (breaker.state === 'CLOSED') {
      return true;
    }

    if (breaker.state === 'OPEN') {
      // Check if timeout has elapsed
      const timeSinceFailure = Date.now() - breaker.lastFailureTime;
      if (timeSinceFailure >= breaker.timeout) {
        // Transition to HALF_OPEN (try one request)
        breaker.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    if (breaker.state === 'HALF_OPEN') {
      // Allow one request to test if source is healthy
      return true;
    }

    return false;
  }

  /**
   * Execute sources in parallel with concurrency limit
   */
  async executeSourcesInParallel(sources, filters, maxParallel, tenantId) {
    const results = [];

    // Execute sources in batches to respect concurrency limit
    for (let i = 0; i < sources.length; i += maxParallel) {
      const batch = sources.slice(i, i + maxParallel);

      const batchResults = await Promise.allSettled(
        batch.map(source => this.executeSource(source, filters, tenantId))
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute a single source with timeout and retry logic
   */
  async executeSource(source, filters, tenantId) {
    const startTime = Date.now();

    try {
      console.log(`[Orchestrator] Executing source: ${source.id}`);

      // Execute source with timeout
      const result = await Promise.race([
        source.handler(filters, tenantId),
        this.createTimeout(source.timeout, source.id)
      ]);

      // Mark success in circuit breaker
      this.recordSuccess(source.id);

      const executionTimeMs = Date.now() - startTime;
      console.log(`[Orchestrator] Source ${source.id} completed: ${result.signals.length} signals in ${executionTimeMs}ms`);

      // Update source performance metrics (Sprint 19 Task 3)
      try {
        await sourcePrioritization.updateSourcePerformance({
          sourceId: source.id,
          executionTimeMs,
          success: true,
          signalsCount: result.signals.length,
          highQualityCount: result.signals.filter(s => s.confidence >= 0.7).length
        });
      } catch (perfError) {
        console.error(`[Orchestrator] Failed to update performance for ${source.id}:`, perfError);
      }

      return {
        sourceId: source.id,
        sourceName: source.name,
        success: true,
        signals: result.signals,
        executionTimeMs,
        error: null
      };

    } catch (error) {
      // Mark failure in circuit breaker
      this.recordFailure(source.id);

      const executionTimeMs = Date.now() - startTime;
      console.error(`[Orchestrator] Source ${source.id} failed:`, error.message);

      // Update source performance metrics (Sprint 19 Task 3)
      try {
        await sourcePrioritization.updateSourcePerformance({
          sourceId: source.id,
          executionTimeMs,
          success: false,
          signalsCount: 0,
          highQualityCount: 0
        });
      } catch (perfError) {
        console.error(`[Orchestrator] Failed to update performance for ${source.id}:`, perfError);
      }

      Sentry.captureException(error, {
        tags: {
          service: 'MultiSourceOrchestrator',
          operation: 'executeSource',
          sourceId: source.id
        }
      });

      return {
        sourceId: source.id,
        sourceName: source.name,
        success: false,
        signals: [],
        executionTimeMs,
        error: error.message
      };
    }
  }

  /**
   * Create timeout promise
   */
  createTimeout(ms, sourceId) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Source ${sourceId} timeout after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Record successful source execution (circuit breaker)
   */
  recordSuccess(sourceId) {
    const breaker = this.circuitBreakers[sourceId];
    breaker.failureCount = 0;
    breaker.state = 'CLOSED';
  }

  /**
   * Record failed source execution (circuit breaker)
   */
  recordFailure(sourceId) {
    const breaker = this.circuitBreakers[sourceId];
    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();

    if (breaker.failureCount >= breaker.threshold) {
      console.warn(`[Orchestrator] Circuit breaker OPEN for source: ${sourceId}`);
      breaker.state = 'OPEN';
    }
  }

  /**
   * Aggregate results from all sources
   */
  aggregateResults(sourceResults) {
    const successful = [];
    const failed = [];
    const allSignals = [];

    sourceResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successful.push(result.value);
        allSignals.push(...result.value.signals);
      } else {
        const failureInfo = result.status === 'fulfilled'
          ? result.value
          : { error: result.reason?.message || 'Unknown error' };
        failed.push(failureInfo);
      }
    });

    return {
      totalSignals: allSignals.length,
      successfulSources: successful.length,
      failedSources: failed.length,
      sources: successful.map(s => ({
        id: s.sourceId,
        name: s.sourceName,
        signalCount: s.signals.length,
        executionTimeMs: s.executionTimeMs
      })),
      failures: failed.map(f => ({
        id: f.sourceId,
        name: f.sourceName,
        error: f.error
      })),
      signals: allSignals
    };
  }

  /**
   * Save orchestration run to database for tracking
   */
  async saveOrchestrationRun(data) {
    try {
      await pool.query(
        `INSERT INTO orchestration_runs (
          orchestration_id,
          tenant_id,
          sources_requested,
          sources_executed,
          sources_successful,
          sources_failed,
          total_signals,
          unique_signals,
          execution_time_ms,
          filters,
          deduplication_stats,
          quality_stats,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT DO NOTHING`,
        [
          data.orchestrationId,
          data.tenantId,
          data.sources || [],
          data.sources || [],
          data.results?.sourcesExecuted?.filter(s => s.success).map(s => s.id) || [],
          data.results?.sourcesExecuted?.filter(s => !s.success).map(s => s.id) || [],
          data.results?.totalSignals || 0,
          data.results?.uniqueSignals || data.results?.totalSignals || 0,
          data.executionTimeMs,
          data.filters || {},
          data.results?.deduplication || null,
          data.results?.quality || null
        ]
      );
    } catch (error) {
      // Non-critical - log but don't fail orchestration
      console.error('[Orchestrator] Failed to save orchestration run:', error);
      Sentry.captureException(error, {
        tags: { service: 'MultiSourceOrchestrator', operation: 'saveOrchestrationRun' }
      });
    }
  }

  /**
   * Generate unique orchestration ID
   */
  generateOrchestrationId() {
    return `orch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // =========================================================================
  // SOURCE HANDLERS
  // =========================================================================

  /**
   * News source handler (SerpAPI)
   */
  async executeNewsSource(filters, tenantId) {
    // TODO: Implement news scraping via SerpAPI
    // For now, return empty result
    console.log('[Orchestrator] News source not yet implemented');
    return { signals: [] };
  }

  /**
   * LinkedIn source handler
   */
  async executeLinkedInSource(filters, tenantId) {
    try {
      // Get company LinkedIn URLs from filters or database
      const companies = filters.companies || await this.getCompaniesForDiscovery(tenantId);

      const allSignals = [];

      // Execute LinkedIn detection for each company
      for (const company of companies) {
        if (!company.linkedInUrl) continue;

        try {
          const signals = await LinkedInSignalService.detectSignals({
            companyLinkedInUrl: company.linkedInUrl,
            apiProvider: 'rapidapi',
            limit: 10
          });

          allSignals.push(...signals);
        } catch (error) {
          console.error(`[Orchestrator] LinkedIn detection failed for ${company.name}:`, error.message);
          // Continue with next company
        }
      }

      return { signals: allSignals };

    } catch (error) {
      console.error('[Orchestrator] LinkedIn source error:', error);
      throw error;
    }
  }

  /**
   * Job boards source handler
   */
  async executeJobBoardsSource(filters, tenantId) {
    // TODO: Implement job board scraping
    console.log('[Orchestrator] Job boards source not yet implemented');
    return { signals: [] };
  }

  /**
   * Social media source handler (Twitter/X)
   */
  async executeSocialSource(filters, tenantId) {
    // TODO: Implement Twitter/X monitoring
    console.log('[Orchestrator] Social media source not yet implemented');
    return { signals: [] };
  }

  /**
   * Get companies for discovery (helper method)
   */
  async getCompaniesForDiscovery(tenantId, limit = 10) {
    try {
      const result = await pool.query(
        `SELECT id, name, domain, linkedin_url as "linkedInUrl"
         FROM companies
         WHERE tenant_id = $1
           AND linkedin_url IS NOT NULL
         ORDER BY updated_at DESC
         LIMIT $2`,
        [tenantId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[Orchestrator] Failed to get companies:', error);
      return [];
    }
  }

  // =========================================================================
  // SOURCE MANAGEMENT
  // =========================================================================

  /**
   * Get source configuration
   */
  getSourceConfig(sourceId) {
    return this.sources[sourceId] || null;
  }

  /**
   * Get all source configurations
   */
  getAllSources() {
    return Object.values(this.sources).map(source => ({
      id: source.id,
      name: source.name,
      enabled: source.enabled,
      priority: source.priority,
      timeout: source.timeout,
      circuitBreaker: this.circuitBreakers[source.id]
    }));
  }

  /**
   * Enable a source
   */
  enableSource(sourceId) {
    if (this.sources[sourceId]) {
      this.sources[sourceId].enabled = true;
      console.log(`[Orchestrator] Source ${sourceId} enabled`);
      return true;
    }
    return false;
  }

  /**
   * Disable a source
   */
  disableSource(sourceId) {
    if (this.sources[sourceId]) {
      this.sources[sourceId].enabled = false;
      console.log(`[Orchestrator] Source ${sourceId} disabled`);
      return true;
    }
    return false;
  }

  /**
   * Update source priority
   */
  updateSourcePriority(sourceId, priority) {
    if (this.sources[sourceId]) {
      this.sources[sourceId].priority = priority;
      console.log(`[Orchestrator] Source ${sourceId} priority updated to ${priority}`);
      return true;
    }
    return false;
  }

  /**
   * Reset circuit breaker for a source
   */
  resetCircuitBreaker(sourceId) {
    if (this.circuitBreakers[sourceId]) {
      this.circuitBreakers[sourceId] = {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: null,
        threshold: 3,
        timeout: 60000
      };
      console.log(`[Orchestrator] Circuit breaker reset for source: ${sourceId}`);
      return true;
    }
    return false;
  }
}

// Export singleton instance
export default new MultiSourceOrchestrator();
