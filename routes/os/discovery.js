/**
 * UPR OS Discovery Endpoint
 * Sprint 64: Unified OS API Layer
 *
 * POST /api/os/discovery
 *
 * Facade over existing discovery functionality with standardized OS interface
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import multiSourceOrchestrator from '../../server/services/multiSourceOrchestrator.js';
import signalQualityScoring from '../../server/services/signalQualityScoring.js';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId,
  OS_PROFILES
} from './types.js';

const router = express.Router();

/**
 * POST /api/os/discovery
 *
 * Unified discovery endpoint for the OS layer
 *
 * Request Body:
 * {
 *   "industry": "banking",           // Target industry
 *   "filters": {
 *     "location": "UAE",
 *     "sector": "Banking",
 *     "companySize": "Enterprise",
 *     "signals": ["hiring", "expansion"]
 *   },
 *   "options": {
 *     "sources": ["news", "linkedin", "glassdoor"],
 *     "maxResults": 100,
 *     "minQuality": 0.6,
 *     "profile": "banking_employee"
 *   }
 * }
 *
 * Response: OSResponse with discovered signals
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const tenantId = getTenantId(req);
    const {
      industry = 'default',
      filters = {},
      options = {}
    } = req.body;

    const {
      sources = null,
      maxResults = 100,
      minQuality = 0,
      profile = OS_PROFILES.DEFAULT,
      useCache = true
    } = options;

    console.log(`[OS:Discovery] Request ${requestId} - Industry: ${industry}, Tenant: ${tenantId}`);

    // Execute multi-source orchestration
    const orchestrationResult = await multiSourceOrchestrator.orchestrate({
      sources,
      filters: {
        ...filters,
        industry
      },
      maxParallel: 4,
      tenantId
    });

    let signals = orchestrationResult.signals || [];

    // ========== FORENSIC LOG: After orchestrate() returns ==========
    console.log('[FORENSIC:Discovery] Raw orchestration result:', {
      requestId,
      totalRawSignals: signals.length,
      signalsBySlug: signals.reduce((acc, s) => {
        const slug = s.type || s.signal_type || s.slug || 'unknown';
        acc[slug] = (acc[slug] || 0) + 1;
        return acc;
      }, {}),
      sampleSignals: signals.slice(0, 3).map(s => ({
        slug: s.type || s.signal_type || s.slug,
        company: s.company_name || s.company || s.domain || 'N/A',
        source: s.source || 'unknown',
        created: s.created_at || s.discovered_at || 'N/A'
      })),
      sourcesRan: orchestrationResult.sources,
      sourcesSucceeded: orchestrationResult.successfulSources,
      sourcesFailed: orchestrationResult.failedSources,
      sivaStats: orchestrationResult.siva
    });

    // If zero signals, log request context
    if (signals.length === 0) {
      console.log('[FORENSIC:Discovery] ZERO SIGNALS - Request context:', {
        requestId,
        vertical: filters.vertical || filters.industry || industry,
        subVertical: filters.sub_vertical || filters.subVertical,
        region: filters.region || filters.location,
        tenantId,
        allFilters: filters,
        sourceBreakdown: orchestrationResult.sourceResults || 'N/A'
      });
    }
    // ========== END FORENSIC LOG ==========

    // Apply quality filtering
    if (minQuality > 0) {
      signals = signalQualityScoring.filterByQuality(signals, minQuality);
    }

    // Sort by quality and limit results
    signals = signals
      .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
      .slice(0, maxResults);

    // Calculate confidence based on source success rate
    const successRate = orchestrationResult.successfulSources?.length /
      (orchestrationResult.sources?.length || 1);
    const confidence = Math.round(successRate * 100);

    const executionTimeMs = Date.now() - startTime;

    // Build reason explanation
    const reason = signals.length > 0
      ? `Discovered ${signals.length} signals from ${orchestrationResult.successfulSources?.length || 0} sources`
      : 'No signals found matching criteria';

    // Extract unique companies from signals
    const companiesMap = new Map();
    for (const signal of signals) {
      const companyName = signal.company || signal.company_name;
      if (!companyName) continue;

      // Skip obviously bad company names
      if (companyName.length < 3) continue;
      if (/^(the|a|an|is|are|was|were|how|why|what|when|where|who|which|this|that|these|those|top|new|best|first|latest)$/i.test(companyName)) continue;

      if (!companiesMap.has(companyName)) {
        companiesMap.set(companyName, {
          name: companyName,
          domain: signal.domain || null,
          sector: signal.sector || null,
          location: signal.location || 'UAE',
          signals: [],
          signalCount: 0,
          latestSignalDate: null
        });
      }

      const company = companiesMap.get(companyName);
      company.signals.push({
        type: signal.trigger_type || signal.type,
        date: signal.source_date,
        source: signal.source
      });
      company.signalCount++;

      // Track latest signal date
      if (!company.latestSignalDate || signal.source_date > company.latestSignalDate) {
        company.latestSignalDate = signal.source_date;
      }
    }

    const companies = Array.from(companiesMap.values())
      .sort((a, b) => b.signalCount - a.signalCount);

    const response = createOSResponse({
      success: true,
      data: {
        signals,
        companies,
        total: signals.length,
        companyCount: companies.length,
        sources: {
          requested: orchestrationResult.sources,
          successful: orchestrationResult.successfulSources,
          failed: orchestrationResult.failedSources
        },
        statistics: {
          deduplication: orchestrationResult.deduplication,
          quality: orchestrationResult.quality
        },
        meta: {
          sourceCounts: {
            news: signals.filter(s => s.source === 'serpapi_news').length,
            linkedin: signals.filter(s => s.source === 'linkedin').length,
            other: signals.filter(s => !['serpapi_news', 'linkedin'].includes(s.source)).length
          },
          timestamps: {
            requested: new Date().toISOString(),
            completed: new Date().toISOString()
          },
          filters: {
            industry,
            location: filters.location,
            minQuality
          }
        }
      },
      reason,
      confidence,
      profile,
      endpoint: '/api/os/discovery',
      executionTimeMs,
      requestId
    });

    console.log(`[OS:Discovery] Request ${requestId} completed in ${executionTimeMs}ms - ${signals.length} signals`);

    res.json(response);

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    console.error(`[OS:Discovery] Request ${requestId} failed:`, error);

    Sentry.captureException(error, {
      tags: {
        os_endpoint: '/api/os/discovery',
        request_id: requestId
      },
      extra: req.body
    });

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_DISCOVERY_ERROR',
      endpoint: '/api/os/discovery',
      executionTimeMs,
      requestId
    }));
  }
});

/**
 * GET /api/os/discovery/health
 * Health check for discovery service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-discovery',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
