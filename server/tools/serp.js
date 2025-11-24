// server/tools/serp.js
// SerpAPI search tool for discovering UAE companies
import pool from '../db.js';

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const COST_PER_SEARCH = 0.005; // $0.005 per search

class SerpTool {
  constructor() {
    this.baseURL = 'https://serpapi.com/search';
  }

  /**
   * Perform a Google search via SerpAPI
   * @param {object} params - { query, location, engine, num, runId, tenantId }
   * @returns {Promise<object>} Search results
   */
  async search(params) {
    const {
      query,
      location = 'United Arab Emirates',
      engine = 'google',
      num = 10,
      runId = null,
      tenantId = null,
      sourceId = null
    } = params;

    if (!SERPAPI_KEY) {
      throw new Error('SERPAPI_KEY environment variable not set');
    }

    const url = new URL(this.baseURL);
    url.searchParams.append('q', query);
    url.searchParams.append('location', location);
    url.searchParams.append('engine', engine);
    url.searchParams.append('num', num);
    url.searchParams.append('api_key', SERPAPI_KEY);

    const startTime = Date.now();

    try {
      console.log('[SERP Debug] Request URL:', url.toString());
      const response = await fetch(url.toString());
      console.log('[SERP Debug] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[SERP Debug] Error response body:', errorBody);
        throw new Error(`SerpAPI error: ${response.status} ${response.statusText} - ${errorBody.substring(0, 200)}`);
      }

      const data = await response.json();
      console.log('[SERP Debug] Results count:', data.organic_results?.length || 0);
      const latencyMs = Date.now() - startTime;

      // Track usage
      if (tenantId && runId) {
        await this.trackUsage({
          tenantId,
          runId,
          sourceId,
          query,
          resultCount: data.organic_results?.length || 0,
          latencyMs
        });
      }

      return {
        success: true,
        results: this.parseResults(data, engine),
        metadata: {
          query,
          location,
          engine,
          resultCount: data.organic_results?.length || 0,
          latencyMs,
          costUsd: COST_PER_SEARCH
        }
      };
    } catch (error) {
      console.error('SerpAPI search failed:', error);
      return {
        success: false,
        error: error.message,
        results: [],
        metadata: {
          query,
          location,
          engine,
          latencyMs: Date.now() - startTime,
          costUsd: COST_PER_SEARCH // Still charged even on failure
        }
      };
    }
  }

  /**
   * Parse SerpAPI results based on engine type
   * @param {object} data - Raw SerpAPI response
   * @param {string} engine - Search engine type
   * @returns {Array} Parsed results
   */
  parseResults(data, engine) {
    if (engine === 'google_news') {
      return (data.news_results || []).map(result => ({
        title: result.title,
        link: result.link,
        snippet: result.snippet,
        source: result.source,
        date: result.date,
        thumbnail: result.thumbnail
      }));
    }

    if (engine === 'google_local') {
      return (data.local_results || []).map(result => ({
        title: result.title,
        address: result.address,
        phone: result.phone,
        website: result.website,
        rating: result.rating,
        reviews: result.reviews,
        type: result.type
      }));
    }

    // Default: google organic results
    return (data.organic_results || []).map(result => ({
      title: result.title,
      link: result.link,
      snippet: result.snippet,
      displayedLink: result.displayed_link,
      position: result.position
    }));
  }

  /**
   * Track usage in database
   * @param {object} params - Usage tracking params
   */
  async trackUsage(params) {
    const { tenantId, runId, sourceId, query, resultCount, latencyMs } = params;

    try {
      await pool.query(
        `INSERT INTO usage_events (
          tenant_id,
          event_type,
          cost_usd,
          credits_consumed,
          metadata
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          tenantId,
          'discovery',
          COST_PER_SEARCH,
          1,
          JSON.stringify({
            provider: 'serpapi',
            run_id: runId,
            source_id: sourceId,
            query,
            result_count: resultCount,
            latency_ms: latencyMs
          })
        ]
      );
    } catch (error) {
      console.error('Failed to track SerpAPI usage:', error);
    }
  }

  /**
   * Search UAE companies by industry
   * @param {string} industry - Industry keyword
   * @param {object} options - Additional options
   * @returns {Promise<object>} Search results
   */
  async searchUAECompanies(industry, options = {}) {
    const query = `${industry} companies in UAE`;
    return this.search({
      query,
      location: 'United Arab Emirates',
      engine: 'google',
      num: options.num || 20,
      ...options
    });
  }

  /**
   * Search UAE business news
   * @param {string} keyword - News keyword
   * @param {object} options - Additional options
   * @returns {Promise<object>} News results
   */
  async searchUAENews(keyword, options = {}) {
    const query = `${keyword} UAE business`;
    return this.search({
      query,
      location: 'United Arab Emirates',
      engine: 'google_news',
      num: options.num || 10,
      ...options
    });
  }

  /**
   * Multi-source search for comprehensive company discovery
   * @param {string} keyword - Search keyword
   * @param {object} options - Additional options
   * @returns {Promise<object>} Combined results from multiple engines
   */
  async multiSourceSearch(keyword, options = {}) {
    const { runId, tenantId, sourceId } = options;

    const [webResults, newsResults] = await Promise.all([
      this.searchUAECompanies(keyword, { runId, tenantId, sourceId, num: 20 }),
      this.searchUAENews(keyword, { runId, tenantId, sourceId, num: 10 })
    ]);

    return {
      web: webResults,
      news: newsResults,
      totalCost: (webResults.metadata?.costUsd || 0) + (newsResults.metadata?.costUsd || 0)
    };
  }
}

export default new SerpTool();
