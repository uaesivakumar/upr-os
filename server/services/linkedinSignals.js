/**
 * LinkedIn Signal Detection Service
 * Sprint 18, Task 5: LinkedIn Signal Source
 *
 * Detects hiring signals from LinkedIn company updates including:
 * - Company announcements (funding, acquisitions, expansions)
 * - Leadership changes (C-level hires)
 * - Executive hires (VP+ level)
 * - Office openings (geographical expansion)
 * - Product launches
 *
 * Supports multiple LinkedIn data sources:
 * - RapidAPI LinkedIn Scraper
 * - Manual CSV upload
 * - PhantomBuster exports
 */

import axios from 'axios';
import * as Sentry from '@sentry/node';

class LinkedInSignalService {
  /**
   * Detect hiring signals from LinkedIn company updates
   * @param {Object} options - Detection options
   * @param {string} options.companyLinkedInUrl - Company LinkedIn URL
   * @param {string} options.apiProvider - API provider ('rapidapi', 'phantombuster', 'manual')
   * @param {number} options.limit - Number of updates to fetch (default: 20)
   * @returns {Promise<Array>} Array of detected signals
   */
  static async detectSignals(options) {
    const {
      companyLinkedInUrl,
      apiProvider = 'rapidapi',
      limit = 20
    } = options;

    try {
      let updates = [];

      // Fetch updates based on provider
      if (apiProvider === 'rapidapi') {
        updates = await this.fetchFromRapidAPI(companyLinkedInUrl, limit);
      } else if (apiProvider === 'phantombuster') {
        updates = await this.fetchFromPhantomBuster(companyLinkedInUrl, limit);
      } else {
        throw new Error(`Unsupported API provider: ${apiProvider}`);
      }

      // Parse updates into signals
      const signals = updates
        .filter(update => this.isHiringRelated(update))
        .map(update => this.parseToSignal(update));

      return signals;
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'LinkedInSignalService',
          operation: 'detectSignals',
          provider: apiProvider
        },
        extra: {
          companyLinkedInUrl,
          limit
        }
      });
      throw error;
    }
  }

  /**
   * Fetch company updates from RapidAPI LinkedIn Scraper
   * @private
   */
  static async fetchFromRapidAPI(companyLinkedInUrl, limit) {
    if (!process.env.RAPIDAPI_KEY) {
      throw new Error('RAPIDAPI_KEY environment variable not set');
    }

    const response = await axios.get(
      'https://linkedin-company-api.p.rapidapi.com/get-company-updates',
      {
        params: {
          url: companyLinkedInUrl,
          limit
        },
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'linkedin-company-api.p.rapidapi.com'
        },
        timeout: 30000
      }
    );

    return response.data.updates || [];
  }

  /**
   * Fetch company updates from PhantomBuster
   * @private
   */
  static async fetchFromPhantomBuster(companyLinkedInUrl, limit) {
    if (!process.env.PHANTOMBUSTER_API_KEY) {
      throw new Error('PHANTOMBUSTER_API_KEY environment variable not set');
    }

    // PhantomBuster requires container ID
    // This is placeholder - actual implementation depends on PhantomBuster setup
    throw new Error('PhantomBuster integration not yet implemented');
  }

  /**
   * Check if update is hiring-related
   * @private
   */
  static isHiringRelated(update) {
    const text = (update.text || update.description || '').toLowerCase();

    // Hiring keywords
    const hiringKeywords = [
      // Direct hiring signals
      'hiring', 'recruiting', 'join our team', 'we\'re hiring',
      'now hiring', 'looking for', 'seeking',

      // Executive/leadership keywords
      'ceo', 'cto', 'cfo', 'coo', 'chief', 'executive',
      'president', 'vp', 'vice president', 'director',
      'head of', 'leader', 'leadership',

      // Expansion signals
      'expansion', 'expanding', 'new office', 'opening',
      'growth', 'growing', 'scale', 'scaling',

      // Funding/acquisition signals
      'funding', 'investment', 'raise', 'raised',
      'acquisition', 'acquired', 'merger', 'partnership',

      // Product/project signals
      'launch', 'launching', 'new product', 'new project',
      'initiative', 'program'
    ];

    return hiringKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Parse LinkedIn update into signal format
   * @private
   */
  static parseToSignal(update) {
    const text = update.text || update.description || '';

    // Determine trigger type based on content
    const triggerType = this.determineTriggerType(text);

    // Extract date
    const sourceDate = update.publishedAt || update.createdAt || new Date().toISOString();

    return {
      company: update.companyName || 'Unknown Company',
      domain: this.extractDomain(update.companyUrl),
      sector: update.industry || null,
      trigger_type: triggerType,
      description: this.truncate(text, 500),
      source_url: update.url || update.permalink,
      source_date: new Date(sourceDate).toISOString().split('T')[0],
      evidence_quote: this.extractRelevantQuote(text),
      evidence_note: `LinkedIn company update - ${triggerType}`,
      location: update.location || 'UAE',
      geo_status: 'probable', // LinkedIn updates are probable UAE relevance
      geo_hints: this.extractGeoHints(text),

      // SIVA metadata
      source_type: 'SOCIAL_MEDIA', // LinkedIn is social media
      source_reliability_score: 70, // LinkedIn is tier 2 source

      // Raw data for debugging
      raw_data: {
        linkedinUpdateId: update.id,
        reactions: update.reactions || 0,
        comments: update.comments || 0,
        shares: update.shares || 0
      }
    };
  }

  /**
   * Determine trigger type from text content
   * @private
   */
  static determineTriggerType(text) {
    const lower = text.toLowerCase();

    // Check for specific trigger types
    if (lower.includes('funding') || lower.includes('investment') || lower.includes('raised')) {
      return 'Investment';
    }

    if (lower.includes('acquisition') || lower.includes('acquired') || lower.includes('merger')) {
      return 'Merger';
    }

    if (lower.includes('expansion') || lower.includes('new office') || lower.includes('opening')) {
      return 'Expansion';
    }

    if (lower.includes('ceo') || lower.includes('cto') || lower.includes('cfo') ||
        lower.includes('chief') || lower.includes('president')) {
      return 'Leadership Change';
    }

    if (lower.includes('vp') || lower.includes('vice president') || lower.includes('director') ||
        lower.includes('head of')) {
      return 'Executive Hire';
    }

    if (lower.includes('launch') || lower.includes('new product') || lower.includes('introducing')) {
      return 'Product Launch';
    }

    if (lower.includes('partnership') || lower.includes('partner') || lower.includes('collaboration')) {
      return 'Partnership';
    }

    if (lower.includes('hiring') || lower.includes('recruiting') || lower.includes('join our team')) {
      return 'Hiring Drive';
    }

    // Default
    return 'Growth Signal';
  }

  /**
   * Extract domain from company URL
   * @private
   */
  static extractDomain(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract relevant quote from text (first 200 chars with hiring context)
   * @private
   */
  static extractRelevantQuote(text) {
    // Find sentence containing hiring keyword
    const sentences = text.split(/[.!?]+/);

    const hiringKeywords = ['hiring', 'join', 'recruiting', 'ceo', 'cto', 'expansion', 'funding'];

    const relevantSentence = sentences.find(sentence =>
      hiringKeywords.some(keyword => sentence.toLowerCase().includes(keyword))
    );

    if (relevantSentence) {
      return this.truncate(relevantSentence.trim(), 200);
    }

    // Fallback: first 200 chars
    return this.truncate(text, 200);
  }

  /**
   * Extract geography hints from text
   * @private
   */
  static extractGeoHints(text) {
    const lower = text.toLowerCase();
    const hints = [];

    const uaeLocations = ['dubai', 'abu dhabi', 'sharjah', 'uae', 'united arab emirates'];

    uaeLocations.forEach(location => {
      if (lower.includes(location)) {
        hints.push(location);
      }
    });

    return hints.length > 0 ? hints : ['uae'];
  }

  /**
   * Truncate text to max length
   * @private
   */
  static truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Parse CSV of LinkedIn updates (manual upload fallback)
   * @param {string} csvContent - CSV file content
   * @returns {Array} Array of signals
   */
  static parseCSV(csvContent) {
    // Simple CSV parser for LinkedIn export format
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const signals = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');

      if (values.length !== headers.length) continue;

      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index].trim();
      });

      // Parse row to signal format
      if (this.isHiringRelated({ text: row.description || row.text })) {
        signals.push(this.parseToSignal({
          companyName: row.companyName || row.company,
          text: row.description || row.text,
          url: row.url,
          publishedAt: row.date || row.publishedAt,
          industry: row.industry
        }));
      }
    }

    return signals;
  }

  /**
   * Validate LinkedIn company URL
   * @param {string} url - LinkedIn company URL
   * @returns {boolean} True if valid
   */
  static isValidLinkedInUrl(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('linkedin.com') &&
             urlObj.pathname.startsWith('/company/');
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate Q-Score for LinkedIn signal using SIVA tools
   * @param {Object} signal - Signal data
   * @returns {Promise<number>} Q-Score (0-100)
   */
  static async calculateQScore(signal) {
    // This would integrate with SIVA tools
    // For now, return estimated score based on trigger type

    const scoreMap = {
      'Investment': 90,
      'Merger': 85,
      'Expansion': 80,
      'Leadership Change': 75,
      'Executive Hire': 70,
      'Product Launch': 65,
      'Partnership': 70,
      'Hiring Drive': 85,
      'Growth Signal': 60
    };

    return scoreMap[signal.trigger_type] || 60;
  }
}

export default LinkedInSignalService;
