/**
 * DiscoveryCrawlerService - S121.2
 *
 * Background crawler that runs hourly (or on-demand) to populate discovery_pool.
 * One run benefits all tenant users - cost efficient.
 *
 * ARCHITECTURE:
 * - OS-OWNED: Mechanical, expensive, async
 * - Uses existing tools: SERP, Apollo, Tool 13 (Signal Extraction), Tool 4 (EdgeCases)
 * - Logs all crawl activity for audit
 */

import { getPool } from '../../db/index.js';
import { DiscoveryPoolService } from './DiscoveryPoolService.js';
import SerpTool from '../../server/tools/serp.js';
import HiringSignalExtractionTool from '../../server/siva-tools/HiringSignalExtractionToolStandalone.js';
import EdgeCasesToolStandalone from '../../server/siva-tools/EdgeCasesToolStandalone.js';

class DiscoveryCrawlerService {
  constructor() {
    this.poolService = new DiscoveryPoolService();
    this.serpTool = new SerpTool();
    this.signalExtractionTool = new HiringSignalExtractionTool();
    this.edgeCasesTool = new EdgeCasesToolStandalone();
  }

  /**
   * Run crawler for a tenant
   * @param {string} tenantId
   * @param {Object} config - { verticalId, subVerticalId, regionCode }
   * @returns {Object} Crawl results
   */
  async runForTenant(tenantId, config) {
    const crawlId = await this.startCrawlLog(tenantId, config);
    const startTime = Date.now();

    try {
      console.log(`[DiscoveryCrawler] Starting crawl for tenant ${tenantId}...`);

      // Step 1: Load query templates
      const templates = await this.loadQueryTemplates(config);
      console.log(`[DiscoveryCrawler] Loaded ${templates.length} query templates`);

      // Step 2: Execute SERP queries
      const rawResults = await this.executeSerpQueries(templates);
      console.log(`[DiscoveryCrawler] Executed ${rawResults.length} queries`);

      // Step 3: Extract signals from results
      const signals = await this.extractSignals(rawResults);
      console.log(`[DiscoveryCrawler] Extracted ${signals.length} signals`);

      // Step 4: Pre-score with EdgeCases
      const scoredCompanies = await this.preScoreCompanies(signals, config);
      console.log(`[DiscoveryCrawler] Pre-scored ${scoredCompanies.length} companies`);

      // Step 5: Upsert to pool
      const upsertStats = await this.poolService.bulkUpsert(tenantId, scoredCompanies);
      console.log(`[DiscoveryCrawler] Upserted: ${JSON.stringify(upsertStats)}`);

      // Step 6: Complete crawl log
      const duration = Date.now() - startTime;
      await this.completeCrawlLog(crawlId, {
        queriesExecuted: rawResults.length,
        signalsExtracted: signals.length,
        companiesDiscovered: scoredCompanies.length,
        companiesNew: upsertStats.inserted,
        companiesUpdated: upsertStats.updated,
        companiesDeduplicated: upsertStats.deduplicated,
        serpCalls: rawResults.length,
        apolloCalls: 0,
        estimatedCost: rawResults.length * 0.005, // ~$0.005 per SERP call
        status: 'completed'
      });

      console.log(`[DiscoveryCrawler] Completed in ${duration}ms`);

      return {
        success: true,
        crawlId,
        duration,
        stats: {
          templates: templates.length,
          queries: rawResults.length,
          signals: signals.length,
          companies: scoredCompanies.length,
          ...upsertStats
        }
      };

    } catch (error) {
      console.error(`[DiscoveryCrawler] Error:`, error);
      await this.failCrawlLog(crawlId, error);
      throw error;
    }
  }

  /**
   * Load query templates from database
   * @param {Object} config
   * @returns {Array} Templates
   */
  async loadQueryTemplates(config) {
    const pool = getPool();
    const query = `
      SELECT * FROM discovery_query_templates
      WHERE is_active = TRUE
        AND (vertical_id IS NULL OR vertical_id = $1)
        AND (sub_vertical_id IS NULL OR sub_vertical_id = $2)
        AND (region_code IS NULL OR region_code = $3)
      ORDER BY priority DESC
      LIMIT 10
    `;

    const result = await pool.query(query, [
      config.verticalId,
      config.subVerticalId,
      config.regionCode
    ]);

    // If no templates found, use defaults
    if (result.rows.length === 0) {
      return this.getDefaultTemplates(config);
    }

    return result.rows;
  }

  /**
   * Get default query templates
   * @param {Object} config
   * @returns {Array} Default templates
   */
  getDefaultTemplates(config) {
    const region = config.regionCode || 'UAE';
    const vertical = config.verticalId || 'banking';

    return [
      {
        id: 'default-1',
        query_template: `${region} companies hiring expansion 2024 2025`,
        query_type: 'hiring',
        priority: 100
      },
      {
        id: 'default-2',
        query_template: `${region} new office opening announcement`,
        query_type: 'expansion',
        priority: 90
      },
      {
        id: 'default-3',
        query_template: `${region} startup funding round news`,
        query_type: 'funding',
        priority: 80
      },
      {
        id: 'default-4',
        query_template: `${region} ${vertical} sector growth companies`,
        query_type: 'growth',
        priority: 70
      },
      {
        id: 'default-5',
        query_template: `${region} free zone new company registration`,
        query_type: 'market_entry',
        priority: 60
      }
    ];
  }

  /**
   * Execute SERP queries
   * @param {Array} templates
   * @returns {Array} Raw SERP results
   */
  async executeSerpQueries(templates) {
    const results = [];

    for (const template of templates) {
      try {
        const serpResult = await this.serpTool.execute({
          query: template.query_template,
          num_results: 10
        });

        if (serpResult && serpResult.results) {
          results.push({
            templateId: template.id,
            queryType: template.query_type,
            query: template.query_template,
            results: serpResult.results
          });
        }
      } catch (error) {
        console.warn(`[DiscoveryCrawler] SERP query failed: ${template.query_template}`, error.message);
      }
    }

    return results;
  }

  /**
   * Extract signals from SERP results
   * @param {Array} rawResults
   * @returns {Array} Extracted signals with companies
   */
  async extractSignals(rawResults) {
    const signals = [];

    for (const result of rawResults) {
      for (const item of result.results) {
        try {
          // Use Tool 13: Hiring Signal Extraction
          const extraction = await this.signalExtractionTool.execute({
            content: `${item.title}\n${item.snippet || item.description || ''}`,
            source_url: item.link,
            context: {
              query_type: result.queryType,
              source_query: result.query
            }
          });

          if (extraction && extraction.companies) {
            for (const company of extraction.companies) {
              signals.push({
                ...company,
                signal: {
                  type: result.queryType,
                  title: item.title,
                  description: item.snippet || item.description,
                  source: 'serp',
                  sourceUrl: item.link,
                  date: new Date().toISOString(),
                  confidence: extraction.confidence || 0.5
                },
                sourceQuery: result.query,
                queryTemplateId: result.templateId
              });
            }
          }
        } catch (error) {
          console.warn(`[DiscoveryCrawler] Signal extraction failed:`, error.message);
        }
      }
    }

    // Deduplicate by company name
    const seen = new Set();
    return signals.filter(s => {
      const key = (s.name || '').toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Pre-score companies with EdgeCases tool
   * @param {Array} signals
   * @param {Object} config
   * @returns {Array} Scored companies
   */
  async preScoreCompanies(signals, config) {
    const scoredCompanies = [];

    for (const signal of signals) {
      try {
        // Build company profile for EdgeCases
        const companyProfile = {
          name: signal.name || '',
          domain: signal.domain || '',
          size: signal.headcount || 0,
          sector: 'private', // Default, EdgeCases will detect
          revenue: 0,
          linkedin_followers: 0,
          number_of_locations: 1
        };

        // Run EdgeCases detection
        let edgeCaseResult = null;
        try {
          edgeCaseResult = await this.edgeCasesTool.execute({
            company_profile: companyProfile,
            contact_profile: {},
            historical_data: {}
          });
        } catch (e) {
          // EdgeCases validation error - use defaults
          edgeCaseResult = null;
        }

        // Determine edge case type and multiplier
        let edgeCaseType = 'normal';
        let edgeCaseMultiplier = 1.0;

        if (edgeCaseResult) {
          const isEnterprise = edgeCaseResult.blockers?.some(b => b.type === 'ENTERPRISE_BRAND');
          const isGovernment = edgeCaseResult.blockers?.some(b => b.type === 'GOVERNMENT_SECTOR');
          const isSemiGov = edgeCaseResult.warnings?.some(w => w.type === 'SEMI_GOVERNMENT');

          if (isGovernment) {
            edgeCaseType = 'government';
            edgeCaseMultiplier = 0.1;
          } else if (isSemiGov) {
            edgeCaseType = 'semi_government';
            edgeCaseMultiplier = 0.4;
          } else if (isEnterprise) {
            edgeCaseType = 'enterprise';
            edgeCaseMultiplier = signal.signal?.type?.includes('expansion') ? 1.0 : 0.3;
          }
        }

        // Check for Free Zone boost
        const location = (signal.location || '').toLowerCase();
        if (location.includes('free zone') || location.includes('difc') || location.includes('jafza') || location.includes('dafza')) {
          if (edgeCaseType === 'normal') {
            edgeCaseType = 'free_zone';
            edgeCaseMultiplier = 1.3;
          }
        }

        // Check for expansion signals
        const hasExpansionSignals = ['hiring', 'expansion', 'funding', 'growth', 'market_entry'].includes(signal.signal?.type);
        const hasRecentSignals = signal.signal?.date && (Date.now() - new Date(signal.signal.date).getTime()) < 7 * 24 * 60 * 60 * 1000;

        // Calculate base score
        let baseScore = 50;
        if (hasExpansionSignals) baseScore += 10;
        if (hasRecentSignals) baseScore += 10;
        if (signal.signal?.confidence > 0.7) baseScore += 5;

        scoredCompanies.push({
          name: signal.name,
          domain: signal.domain,
          industry: signal.industry,
          sector: edgeCaseType === 'government' || edgeCaseType === 'semi_government' ? 'government' : 'private',
          estimatedSize: signal.size || 'unknown',
          headcount: signal.headcount,
          location: signal.location,
          locationCity: signal.city,
          locationCountry: signal.country || config.regionCode,
          signal: signal.signal,
          discoveredBy: 'crawler',
          sourceQuery: signal.sourceQuery,
          queryTemplateId: signal.queryTemplateId,
          edgeCaseType,
          edgeCaseMultiplier,
          baseScore,
          hasExpansionSignals,
          hasRecentSignals,
          verticalId: config.verticalId,
          subVerticalId: config.subVerticalId,
          regionCode: config.regionCode,
          rawData: signal
        });
      } catch (error) {
        console.warn(`[DiscoveryCrawler] Pre-scoring failed for ${signal.name}:`, error.message);
      }
    }

    return scoredCompanies;
  }

  /**
   * Start crawl log entry
   * @param {string} tenantId
   * @param {Object} config
   * @returns {string} Crawl ID
   */
  async startCrawlLog(tenantId, config) {
    const pool = getPool();
    const result = await pool.query(`
      INSERT INTO discovery_crawl_logs (
        tenant_id, crawl_type, vertical_id, sub_vertical_id, region_code
      ) VALUES ($1, 'scheduled', $2, $3, $4)
      RETURNING id
    `, [tenantId, config.verticalId, config.subVerticalId, config.regionCode]);

    return result.rows[0].id;
  }

  /**
   * Complete crawl log
   * @param {string} crawlId
   * @param {Object} stats
   */
  async completeCrawlLog(crawlId, stats) {
    const pool = getPool();
    await pool.query(`
      UPDATE discovery_crawl_logs SET
        completed_at = NOW(),
        queries_executed = $2,
        signals_extracted = $3,
        companies_discovered = $4,
        companies_new = $5,
        companies_updated = $6,
        companies_deduplicated = $7,
        serp_calls = $8,
        apollo_calls = $9,
        estimated_cost_usd = $10,
        status = $11
      WHERE id = $1
    `, [
      crawlId,
      stats.queriesExecuted,
      stats.signalsExtracted,
      stats.companiesDiscovered,
      stats.companiesNew,
      stats.companiesUpdated,
      stats.companiesDeduplicated,
      stats.serpCalls,
      stats.apolloCalls,
      stats.estimatedCost,
      stats.status
    ]);
  }

  /**
   * Fail crawl log
   * @param {string} crawlId
   * @param {Error} error
   */
  async failCrawlLog(crawlId, error) {
    const pool = getPool();
    await pool.query(`
      UPDATE discovery_crawl_logs SET
        completed_at = NOW(),
        status = 'failed',
        errors_count = 1,
        error_details = $2
      WHERE id = $1
    `, [crawlId, JSON.stringify({ message: error.message, stack: error.stack })]);
  }

  /**
   * Get crawl history for tenant
   * @param {string} tenantId
   * @param {number} limit
   * @returns {Array} Crawl logs
   */
  async getCrawlHistory(tenantId, limit = 10) {
    const pool = getPool();
    const result = await pool.query(`
      SELECT * FROM discovery_crawl_logs
      WHERE tenant_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `, [tenantId, limit]);

    return result.rows;
  }
}

export default DiscoveryCrawlerService;
export { DiscoveryCrawlerService };
