// server/tools/crawler.js
// Web crawler for extracting company data and UAE signals
import pool from '../db.js';
import * as cheerio from 'cheerio';

const COST_PER_CRAWL = 0.001; // Minimal cost for crawling
const TIMEOUT_MS = 10000; // 10 second timeout

class CrawlerTool {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ];
  }

  /**
   * Crawl a URL and extract content
   * @param {object} params - { url, runId, tenantId, sourceId }
   * @returns {Promise<object>} Crawled data with UAE signals
   */
  async crawl(params) {
    const { url, runId = null, tenantId = null, sourceId = null } = params;

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.getRandomUserAgent()
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const latencyMs = Date.now() - startTime;

      // Extract data
      const extracted = this.extractData(html, url);

      // Track usage
      if (tenantId && runId) {
        await this.trackUsage({
          tenantId,
          runId,
          sourceId,
          url,
          latencyMs
        });
      }

      return {
        success: true,
        url,
        ...extracted,
        metadata: {
          latencyMs,
          costUsd: COST_PER_CRAWL,
          htmlLength: html.length
        }
      };
    } catch (error) {
      console.error(`Crawler failed for ${url}:`, error);
      return {
        success: false,
        url,
        error: error.message,
        uaeSignals: {},
        metadata: {
          latencyMs: Date.now() - startTime,
          costUsd: COST_PER_CRAWL
        }
      };
    }
  }

  /**
   * Shrink article HTML to ~2000 tokens by extracting only relevant paragraphs
   * This reduces GPT-4 input costs by 50-60%
   * @param {string} html - Raw HTML content
   * @returns {string} Shrunk text content
   */
  shrinkArticle(html) {
    try {
      const $ = cheerio.load(html);

      // Remove script, style, nav, footer, ads
      $('script, style, nav, footer, aside, iframe, .ad, .advertisement').remove();

      // Extract title
      const title = $('h1').first().text() || $('title').first().text() || '';

      // Extract first paragraph (lede)
      const lede = $('article p, .article p, .content p, p').first().text() || '';

      // Find paragraphs with key hiring/business signals
      const keyParagraphs = [];
      $('p').each((i, el) => {
        const text = $(el).text();

        // Skip if too short
        if (text.length < 50) return;

        // Keep if contains key signals
        const hasSignal = (
          // Numbers (project values, hiring numbers)
          /\$?\d{1,3}(,\d{3})*(\.\d+)?(\s?(million|billion|M|B))?/i.test(text) ||

          // Dates
          /20\d{2}|Q[1-4]\s20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December/i.test(text) ||

          // Trigger words
          /(awarded|announced|launched|opened|expanded|hiring|recruiting|expansion|project|contract|investment|acquisition|partnership|tender)/i.test(text) ||

          // Locations
          /(Dubai|Abu Dhabi|UAE|Sharjah|Ras Al Khaimah|Ajman|Fujairah|Umm Al Quwain|GCC|MENA|Middle East)/i.test(text) ||

          // Company indicators
          /(Ltd|LLC|Inc|Corp|Group|Company|Technologies|Solutions|Industries)/i.test(text)
        );

        if (hasSignal) {
          // Include this paragraph + surrounding context
          const prev = $(el).prev('p').text();
          const curr = text;
          const next = $(el).next('p').text();

          keyParagraphs.push({
            prev: prev.length > 200 ? prev.substring(0, 200) + '...' : prev,
            curr,
            next: next.length > 200 ? next.substring(0, 200) + '...' : next
          });
        }
      });

      // Combine paragraphs
      const relevantText = keyParagraphs
        .slice(0, 10) // Limit to 10 paragraph clusters
        .map(p => `${p.prev}\n${p.curr}\n${p.next}`)
        .join('\n\n---\n\n');

      // Combine and limit to ~8000 characters (~2000 tokens)
      const combined = `TITLE: ${title}\n\nLEDE: ${lede}\n\n---\n\n${relevantText}`.substring(0, 8000);

      console.log('[Crawler] Article shrunk:', {
        original_length: html.length,
        shrunk_length: combined.length,
        reduction: `${Math.round((1 - combined.length / html.length) * 100)}%`,
        paragraphs_kept: keyParagraphs.length
      });

      return combined;
    } catch (err) {
      console.error('[Crawler] Shrink error:', err);
      // Fallback: return first 8000 chars of stripped HTML
      return this.stripHtml(html).substring(0, 8000);
    }
  }

  /**
   * Extract UAE signals and company data from HTML
   * @param {string} html - Raw HTML content
   * @param {string} url - Source URL
   * @returns {object} Extracted data
   */
  extractData(html, url) {
    // Use smart article shrinking instead of basic stripHtml
    const text = this.shrinkArticle(html);

    // Extract UAE signals
    const uaeSignals = {
      ae_domain: url.includes('.ae'),
      phone_971: /\+971|00971|971\s*\d/.test(text),
      free_zone: this.detectFreeZone(text),
      emirate: this.detectEmirate(text),
      aed_currency: /AED|Dhs|Dirham/i.test(text),
      po_box: /P\.?O\.?\s*Box\s*\d+/i.test(text),
      uae_mentions: (text.match(/\b(UAE|United Arab Emirates|Dubai|Abu Dhabi)\b/gi) || []).length
    };

    // Calculate UAE confidence score
    const confidence = this.calculateUAEConfidence(uaeSignals);

    // Extract company info
    const companyInfo = {
      title: this.extractTitle(html),
      description: this.extractDescription(html),
      emails: this.extractEmails(text),
      phones: this.extractPhones(text),
      addresses: this.extractAddresses(text)
    };

    return {
      uaeSignals,
      uaeConfidence: confidence,
      companyInfo,
      rawText: text // Already shrunk to ~8000 chars by shrinkArticle()
    };
  }

  /**
   * Strip HTML tags and return plain text
   * @param {string} html - HTML content
   * @returns {string} Plain text
   */
  stripHtml(html) {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract page title
   * @param {string} html - HTML content
   * @returns {string} Page title
   */
  extractTitle(html) {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract meta description
   * @param {string} html - HTML content
   * @returns {string} Meta description
   */
  extractDescription(html) {
    const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract email addresses
   * @param {string} text - Plain text content
   * @returns {Array} Email addresses
   */
  extractEmails(text) {
    const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    return [...new Set(text.match(regex) || [])];
  }

  /**
   * Extract phone numbers
   * @param {string} text - Plain text content
   * @returns {Array} Phone numbers
   */
  extractPhones(text) {
    const regex = /(\+971|00971|971)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}/g;
    return [...new Set(text.match(regex) || [])];
  }

  /**
   * Extract UAE addresses
   * @param {string} text - Plain text content
   * @returns {Array} Addresses
   */
  extractAddresses(text) {
    const regex = /(P\.?O\.?\s*Box\s*\d+[^,\n]*(?:Dubai|Abu Dhabi|Sharjah|Ajman|RAK|Fujairah|UAQ)[^,\n]*)/gi;
    return [...new Set(text.match(regex) || [])];
  }

  /**
   * Detect free zone mentions
   * @param {string} text - Plain text content
   * @returns {string|null} Free zone name if found
   */
  detectFreeZone(text) {
    const freeZones = [
      'DMCC', 'JAFZA', 'DAFZA', 'Ajman Free Zone', 'RAK Free Zone',
      'Fujairah Free Zone', 'Hamriyah Free Zone', 'SAIF Zone',
      'Dubai Internet City', 'Dubai Media City', 'Dubai Knowledge Park'
    ];

    for (const zone of freeZones) {
      if (text.includes(zone)) return zone;
    }
    return null;
  }

  /**
   * Detect emirate mentions
   * @param {string} text - Plain text content
   * @returns {string|null} Emirate name if found
   */
  detectEmirate(text) {
    const emirates = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK', 'Fujairah', 'Umm Al Quwain'];

    for (const emirate of emirates) {
      if (text.includes(emirate)) return emirate;
    }
    return null;
  }

  /**
   * Calculate UAE confidence score based on signals
   * @param {object} signals - UAE signals
   * @returns {number} Confidence score 0.00 to 1.00
   */
  calculateUAEConfidence(signals) {
    let score = 0;
    let maxScore = 0;

    // Weighted scoring
    if (signals.ae_domain) { score += 0.30; }
    maxScore += 0.30;

    if (signals.phone_971) { score += 0.20; }
    maxScore += 0.20;

    if (signals.free_zone) { score += 0.15; }
    maxScore += 0.15;

    if (signals.emirate) { score += 0.15; }
    maxScore += 0.15;

    if (signals.aed_currency) { score += 0.10; }
    maxScore += 0.10;

    if (signals.po_box) { score += 0.05; }
    maxScore += 0.05;

    if (signals.uae_mentions >= 3) { score += 0.05; }
    maxScore += 0.05;

    return Math.min(score / maxScore, 1.0);
  }

  /**
   * Get random user agent
   * @returns {string} User agent string
   */
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * Track usage in database
   * @param {object} params - Usage tracking params
   */
  async trackUsage(params) {
    const { tenantId, runId, sourceId, url, latencyMs } = params;

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
          COST_PER_CRAWL,
          1,
          JSON.stringify({
            provider: 'crawler',
            run_id: runId,
            source_id: sourceId,
            url,
            latency_ms: latencyMs
          })
        ]
      );
    } catch (error) {
      console.error('Failed to track crawler usage:', error);
    }
  }

  /**
   * Crawl multiple URLs in parallel with concurrency control
   * @param {Array} urls - Array of URLs
   * @param {object} options - Crawl options
   * @returns {Promise<Array>} Array of results
   */
  async crawlBatch(urls, options = {}) {
    const { concurrency = 3, ...otherOptions } = options;

    const results = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.crawl({ url, ...otherOptions }))
      );
      results.push(...batchResults);
    }

    return results;
  }
}

export default new CrawlerTool();
