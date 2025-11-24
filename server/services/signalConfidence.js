/**
 * Signal Confidence Service
 * Sprint 18, Task 7: Signal Confidence Scoring
 *
 * Calculates confidence scores for hiring signals based on:
 * - 40% Source Credibility (from SIVA Tool 14 reliability score)
 * - 30% Freshness (days since source_date)
 * - 30% Completeness (% of key fields populated)
 *
 * Output: confidence_score (0.00 to 1.00)
 */

import pool from '../db.js';

class SignalConfidenceService {
  /**
   * Calculate confidence score for a signal
   * @param {Object} signal - Signal data
   * @param {number} signal.sourceReliabilityScore - SIVA Tool 14 score (0-100)
   * @param {Date|string} signal.sourceDate - Signal date
   * @param {string} signal.description - Signal description
   * @param {string} signal.evidenceQuote - Evidence quote
   * @param {string} signal.company - Company name
   * @param {string} signal.domain - Company domain
   * @param {string} signal.triggerType - Trigger type
   * @returns {number} Confidence score (0.00 to 1.00)
   */
  static calculateConfidence(signal) {
    const {
      sourceReliabilityScore,
      sourceDate,
      description,
      evidenceQuote,
      company,
      domain,
      triggerType
    } = signal;

    // 1. SOURCE CREDIBILITY (40% weight)
    let sourceScore = 0.5; // Default
    if (sourceReliabilityScore !== null && sourceReliabilityScore !== undefined) {
      sourceScore = Math.min(sourceReliabilityScore / 100.0, 1.0);
    }

    // 2. FRESHNESS (30% weight)
    let freshnessScore = 0.5; // Default
    if (sourceDate) {
      const date = new Date(sourceDate);
      const now = new Date();
      const daysOld = Math.floor((now - date) / (1000 * 60 * 60 * 24));

      if (daysOld < 0) {
        // Future dates (edge case)
        freshnessScore = 1.0;
      } else if (daysOld <= 7) {
        // Very fresh (0-7 days)
        freshnessScore = 1.0;
      } else if (daysOld <= 30) {
        // Recent (8-30 days)
        freshnessScore = 0.8;
      } else if (daysOld <= 90) {
        // Moderately fresh (31-90 days)
        freshnessScore = 0.6;
      } else if (daysOld <= 180) {
        // Older (91-180 days)
        freshnessScore = 0.4;
      } else {
        // Very old (180+ days)
        freshnessScore = 0.2;
      }
    }

    // 3. COMPLETENESS (30% weight)
    // Check 7 key fields
    let completenessScore = 0.0;
    const fieldWeight = 1.0 / 7.0;

    // Company (mandatory, always counted)
    if (company && company.trim().length > 0) {
      completenessScore += fieldWeight;
    }

    // Domain
    if (domain && domain.trim().length > 0) {
      completenessScore += fieldWeight;
    }

    // Trigger type
    if (triggerType && triggerType.trim().length > 0) {
      completenessScore += fieldWeight;
    }

    // Description (must be meaningful, >20 chars)
    if (description && description.trim().length > 20) {
      completenessScore += fieldWeight;
    }

    // Evidence quote (must be meaningful, >30 chars)
    if (evidenceQuote && evidenceQuote.trim().length > 30) {
      completenessScore += fieldWeight;
    }

    // Source date
    if (sourceDate) {
      completenessScore += fieldWeight;
    }

    // Domain-company match (bonus check)
    if (domain && company) {
      const companyFirst = company.split(' ')[0].toLowerCase();
      const domainFirst = domain.split('.')[0].toLowerCase();

      if (domain.toLowerCase().includes(companyFirst) ||
          company.toLowerCase().includes(domainFirst)) {
        completenessScore += fieldWeight;
      }
    }

    // 4. CALCULATE WEIGHTED CONFIDENCE
    const confidence =
      (sourceScore * 0.4) +
      (freshnessScore * 0.3) +
      (completenessScore * 0.3);

    // Ensure bounds
    const boundedConfidence = Math.max(0, Math.min(1, confidence));

    // Round to 2 decimal places
    return Math.round(boundedConfidence * 100) / 100;
  }

  /**
   * Extract source type from URL
   * @param {string} sourceUrl - Source URL
   * @returns {string} Source type
   */
  static extractSourceType(sourceUrl) {
    if (!sourceUrl) return 'UNKNOWN';

    const url = sourceUrl.toLowerCase();

    // Job boards
    if (url.includes('linkedin.com/jobs') ||
        url.includes('bayt.com') ||
        url.includes('naukrigulf.com') ||
        url.includes('indeed.ae') ||
        url.includes('glassdoor.com')) {
      return 'JOB_BOARD';
    }

    // News sites
    if (url.includes('gulfnews.com') ||
        url.includes('khaleejtimes.com') ||
        url.includes('thenationalnews.com') ||
        url.includes('arabianbusiness.com') ||
        url.includes('reuters.com') ||
        url.includes('bloomberg.com') ||
        url.includes('zawya.com') ||
        url.includes('tradearabia.com') ||
        url.includes('menafn.com')) {
      return 'NEWS';
    }

    // Social media
    if (url.includes('linkedin.com/posts') ||
        url.includes('linkedin.com/feed') ||
        url.includes('twitter.com') ||
        url.includes('facebook.com')) {
      return 'SOCIAL_MEDIA';
    }

    // Blogs
    if (url.includes('medium.com') ||
        url.includes('wordpress.com') ||
        url.includes('blog')) {
      return 'BLOG';
    }

    // Corporate websites
    if (url.includes('.com') ||
        url.includes('.ae') ||
        url.includes('.org') ||
        url.includes('.net')) {
      return 'CORPORATE_WEBSITE';
    }

    return 'UNKNOWN';
  }

  /**
   * Get confidence level label for UI display
   * @param {number} confidenceScore - Confidence score (0-1)
   * @returns {string} 'HIGH', 'MEDIUM', or 'LOW'
   */
  static getConfidenceLevel(confidenceScore) {
    if (confidenceScore >= 0.75) return 'HIGH';
    if (confidenceScore >= 0.50) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Extract source reliability score from SIVA metadata in notes field
   * @param {string} notes - Signal notes containing SIVA metadata JSON
   * @returns {number|null} Source reliability score or null
   */
  static extractSourceReliability(notes) {
    if (!notes) return null;

    try {
      // Extract SIVA metadata from notes
      const metadataMatch = notes.match(/\[SIVA_PHASE2_METADATA\]\s*({[\s\S]*?})\s*$/);
      if (!metadataMatch) return null;

      const metadata = JSON.parse(metadataMatch[1]);

      // Get source reliability score from Tool 14
      if (metadata.source && metadata.source.reliability_score !== undefined) {
        return metadata.source.reliability_score;
      }

      return null;
    } catch (error) {
      console.error('Error extracting source reliability from notes:', error);
      return null;
    }
  }

  /**
   * Backfill confidence scores for existing signals
   * @param {Object} options - Options
   * @param {string} options.tenantId - Optional tenant ID filter
   * @param {number} options.batchSize - Batch size (default: 100)
   * @param {boolean} options.dryRun - Dry run mode (default: false)
   * @returns {Promise<Object>} Backfill results
   */
  static async backfillConfidenceScores(options = {}) {
    const {
      tenantId = null,
      batchSize = 100,
      dryRun = false
    } = options;

    const startTime = Date.now();
    let totalProcessed = 0;
    let totalUpdated = 0;
    let errors = [];

    try {
      // Build query
      let query = `
        SELECT
          id,
          company,
          domain,
          trigger_type,
          description,
          evidence_quote,
          source_url,
          source_date,
          notes
        FROM hiring_signals
        WHERE confidence_score IS NULL
      `;

      const params = [];
      if (tenantId) {
        query += ` AND tenant_id = $1`;
        params.push(tenantId);
      }

      query += ` ORDER BY detected_at DESC`;

      // Fetch signals
      const result = await pool.query(query, params);
      const signals = result.rows;

      console.log(`Found ${signals.length} signals to backfill`);

      // Process in batches
      for (let i = 0; i < signals.length; i += batchSize) {
        const batch = signals.slice(i, i + batchSize);

        for (const signal of batch) {
          try {
            // Extract source reliability from SIVA metadata
            const sourceReliabilityScore = this.extractSourceReliability(signal.notes);

            // Calculate confidence
            const confidenceScore = this.calculateConfidence({
              sourceReliabilityScore,
              sourceDate: signal.source_date,
              description: signal.description,
              evidenceQuote: signal.evidence_quote,
              company: signal.company,
              domain: signal.domain,
              triggerType: signal.trigger_type
            });

            // Extract source type
            const sourceType = this.extractSourceType(signal.source_url);

            if (!dryRun) {
              // Update signal
              await pool.query(
                `UPDATE hiring_signals
                 SET confidence_score = $1,
                     source_type = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [confidenceScore, sourceType, signal.id]
              );
              totalUpdated++;
            }

            totalProcessed++;

            // Log progress
            if (totalProcessed % 50 === 0) {
              console.log(`Processed ${totalProcessed}/${signals.length} signals...`);
            }
          } catch (error) {
            errors.push({
              signalId: signal.id,
              error: error.message
            });
          }
        }
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        totalProcessed,
        totalUpdated,
        errors: errors.length,
        errorDetails: errors.slice(0, 10), // First 10 errors
        durationMs: duration,
        dryRun
      };
    } catch (error) {
      console.error('Backfill error:', error);
      throw error;
    }
  }
}

export default SignalConfidenceService;
