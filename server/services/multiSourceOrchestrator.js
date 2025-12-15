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
   * Searches Google News for UAE companies with hiring/expansion signals
   */
  async executeNewsSource(filters, tenantId) {
    const SERPAPI_KEY = process.env.SERPAPI_KEY;

    if (!SERPAPI_KEY) {
      console.error('[Orchestrator] SERPAPI_KEY not configured');
      return { signals: [] };
    }

    const signals = [];

    // Signal-specific search queries for UAE + Banking context
    const searchQueries = [
      { query: 'UAE company hiring expansion Dubai', signalType: 'hiring-expansion' },
      { query: 'UAE bank new branch opening', signalType: 'office-opening' },
      { query: 'company enters UAE market Dubai', signalType: 'market-entry' },
      { query: 'UAE company wins contract project award', signalType: 'project-award' },
      { query: 'UAE new subsidiary company formation Dubai', signalType: 'subsidiary-creation' },
    ];

    for (const { query, signalType } of searchQueries) {
      try {
        const url = new URL('https://serpapi.com/search.json');
        url.searchParams.set('engine', 'google_news');
        url.searchParams.set('q', query);
        url.searchParams.set('gl', 'ae'); // UAE
        url.searchParams.set('hl', 'en');
        url.searchParams.set('num', '10');
        url.searchParams.set('api_key', SERPAPI_KEY);

        console.log(`[Orchestrator:News] Searching: ${query}`);

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          console.error(`[Orchestrator:News] SerpAPI error: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const newsResults = data.news_results || [];

        console.log(`[Orchestrator:News] Found ${newsResults.length} results for: ${signalType}`);

        for (const article of newsResults) {
          const signal = this.parseNewsToSignal(article, signalType, filters);
          if (signal) {
            signals.push(signal);
          }
        }

      } catch (error) {
        console.error(`[Orchestrator:News] Error for ${signalType}:`, error.message);
        // Continue with next query
      }
    }

    console.log(`[Orchestrator:News] Total signals extracted: ${signals.length}`);
    return { signals };
  }

  /**
   * Parse news article into signal format
   * @private
   */
  parseNewsToSignal(article, signalType, filters) {
    const title = article.title || '';
    const snippet = article.snippet || article.description || '';
    const source = article.source?.name || 'News';
    const link = article.link || '';
    const date = article.date || new Date().toISOString();

    // Extract company name from title (first capitalized words before common words)
    const companyName = this.extractCompanyFromTitle(title);

    if (!companyName) {
      return null; // Skip if no company identified
    }

    // Check UAE relevance
    const fullText = `${title} ${snippet}`.toLowerCase();
    const uaeKeywords = ['uae', 'dubai', 'abu dhabi', 'sharjah', 'emirates', 'gulf'];
    const hasUaeRelevance = uaeKeywords.some(kw => fullText.includes(kw));

    if (!hasUaeRelevance) {
      return null; // Skip non-UAE news
    }

    return {
      company: companyName,
      company_name: companyName,
      domain: this.extractDomainFromText(fullText),
      sector: filters.industry || 'Banking',
      trigger_type: signalType,
      type: signalType,
      signal_type: signalType,
      description: this.truncateText(`${title}. ${snippet}`, 500),
      source_url: link,
      source_date: this.parseDate(date),
      evidence_quote: this.truncateText(snippet, 300),
      evidence_note: `${source} - ${signalType}`,
      location: this.extractLocation(fullText) || 'UAE',
      geo_status: hasUaeRelevance ? 'confirmed' : 'probable',
      geo_hints: this.extractGeoHints(fullText),
      source_type: 'NEWS',
      source: 'serpapi_news',
      source_reliability_score: 75,
      confidence: 0.7,
      raw_data: {
        title,
        snippet,
        source: source,
        link,
        originalDate: date
      }
    };
  }

  /**
   * Extract company name from news title
   * @private
   */
  extractCompanyFromTitle(title) {
    if (!title) return null;

    // Common patterns: "Company Name announces...", "Company Name to expand..."
    // Remove common prefixes and extract first proper noun phrase
    const cleanTitle = title
      .replace(/^(Breaking|Update|News|Report):\s*/i, '')
      .replace(/^(UAE|Dubai|Abu Dhabi)['']?s?\s*/i, '');

    // Match capitalized words at the start (likely company name)
    const match = cleanTitle.match(/^([A-Z][A-Za-z0-9&\-\.\s]*?)(?:\s+(?:to|will|has|is|announces|expands|opens|wins|launches|enters|plans|signs|reports|reveals|unveils|secures|acquires|partners|hires|appoints|sets|targets|eyes|mulls|considers|seeks))/i);

    if (match && match[1]) {
      const name = match[1].trim();
      // Filter out too short or generic names
      if (name.length > 2 && !['The', 'A', 'An', 'New', 'UAE', 'Dubai'].includes(name)) {
        return name;
      }
    }

    // Fallback: Take first 3-4 capitalized words
    const words = cleanTitle.split(/\s+/);
    const nameWords = [];
    for (const word of words) {
      if (/^[A-Z]/.test(word) && word.length > 1) {
        nameWords.push(word);
        if (nameWords.length >= 4) break;
      } else if (nameWords.length > 0) {
        break;
      }
    }

    if (nameWords.length > 0) {
      return nameWords.join(' ');
    }

    return null;
  }

  /**
   * Extract domain from text
   * @private
   */
  extractDomainFromText(text) {
    const domainMatch = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
    return domainMatch ? domainMatch[1] : null;
  }

  /**
   * Parse date string to ISO format
   * @private
   */
  parseDate(dateStr) {
    try {
      // Handle relative dates like "2 hours ago", "1 day ago"
      if (dateStr.includes('ago')) {
        return new Date().toISOString().split('T')[0];
      }
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch (e) {
      // Ignore
    }
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Extract location from text
   * @private
   */
  extractLocation(text) {
    const locations = {
      'dubai': 'Dubai',
      'abu dhabi': 'Abu Dhabi',
      'sharjah': 'Sharjah',
      'ajman': 'Ajman',
      'ras al khaimah': 'Ras Al Khaimah',
      'fujairah': 'Fujairah',
      'umm al quwain': 'Umm Al Quwain'
    };

    const lowerText = text.toLowerCase();
    for (const [key, value] of Object.entries(locations)) {
      if (lowerText.includes(key)) {
        return value;
      }
    }
    return 'UAE';
  }

  /**
   * Extract geo hints from text
   * @private
   */
  extractGeoHints(text) {
    const hints = [];
    const lowerText = text.toLowerCase();

    const geoTerms = ['uae', 'dubai', 'abu dhabi', 'emirates', 'gulf', 'gcc', 'mena', 'middle east'];
    for (const term of geoTerms) {
      if (lowerText.includes(term)) {
        hints.push(term);
      }
    }
    return hints;
  }

  /**
   * Truncate text to max length
   * @private
   */
  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
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
