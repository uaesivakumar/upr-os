/**
 * Fit Scoring Service
 * Calculates company-opportunity fit across 5 dimensions
 * Total Score: 0-100
 */

import pg from 'pg';
const { Pool } = pg;

export class FitScoringService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  /**
   * Calculate complete fit score
   */
  async calculateFitScore(opportunityId) {
    const metadata = await this.getOpportunityMetadata(opportunityId);

    const breakdown = {
      industry: this.assessIndustryFit(metadata.industry),
      size: this.assessSizeFit(metadata.size || metadata.employee_count),
      location: this.assessLocationFit(metadata.location || metadata.country),
      techStack: this.assessTechStackFit(metadata.technologies),
      budget: this.assessBudgetIndicators(metadata)
    };

    const fitScore = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

    return {
      opportunityId,
      fitScore,
      breakdown,
      calculatedAt: new Date()
    };
  }

  /**
   * Get opportunity metadata
   */
  async getOpportunityMetadata(opportunityId) {
    const query = `
      SELECT metadata
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
      ORDER BY entered_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length === 0) {
      return {};
    }

    return result.rows[0].metadata || {};
  }

  /**
   * Industry Fit (0-30 points)
   * - Perfect match: +30
   * - Adjacent industry: +20
   * - Different but relevant: +10
   * - Unrelated: 0
   */
  assessIndustryFit(industry) {
    if (!industry) return 0;

    const industryLower = industry.toLowerCase();

    // Perfect match industries
    const perfectMatch = ['technology', 'software', 'saas', 'fintech', 'ai', 'machine learning'];
    if (perfectMatch.some(ind => industryLower.includes(ind))) {
      return 30;
    }

    // Adjacent industries
    const adjacent = ['consulting', 'professional services', 'cloud', 'digital', 'analytics', 'data'];
    if (adjacent.some(ind => industryLower.includes(ind))) {
      return 20;
    }

    // Relevant industries
    const relevant = ['business services', 'enterprise', 'b2b', 'automation', 'innovation'];
    if (relevant.some(ind => industryLower.includes(ind))) {
      return 10;
    }

    return 0;
  }

  /**
   * Size Fit (0-25 points)
   * - Ideal size range (50-500): +25
   * - Good size range (10-50 or 500-1000): +15
   * - Acceptable (1-10 or 1000+): +5
   * - Too small (<1): 0
   */
  assessSizeFit(employeeCount) {
    if (!employeeCount || employeeCount < 1) return 0;

    const size = parseInt(employeeCount);

    if (size >= 50 && size <= 500) {
      return 25;
    } else if ((size >= 10 && size < 50) || (size > 500 && size <= 1000)) {
      return 15;
    } else if (size >= 1 && size < 10 || size > 1000) {
      return 5;
    }

    return 0;
  }

  /**
   * Location Fit (0-20 points)
   * - Target market (UAE, KSA): +20
   * - Secondary market (GCC): +10
   * - Other MENA: +5
   * - Outside MENA: 0
   */
  assessLocationFit(location) {
    if (!location) return 0;

    const locationLower = location.toLowerCase();

    // Target markets
    const targetMarkets = ['uae', 'dubai', 'abu dhabi', 'sharjah', 'ksa', 'saudi', 'riyadh', 'jeddah'];
    if (targetMarkets.some(loc => locationLower.includes(loc))) {
      return 20;
    }

    // Secondary markets (GCC)
    const gcc = ['kuwait', 'qatar', 'bahrain', 'oman', 'doha', 'manama'];
    if (gcc.some(loc => locationLower.includes(loc))) {
      return 10;
    }

    // Other MENA
    const mena = ['egypt', 'jordan', 'lebanon', 'morocco', 'tunisia', 'middle east', 'north africa'];
    if (mena.some(loc => locationLower.includes(loc))) {
      return 5;
    }

    return 0;
  }

  /**
   * Technology Stack Fit (0-15 points)
   * - Modern stack: +15
   * - Mixed stack: +10
   * - Legacy stack: +5
   * - Unknown: 0
   */
  assessTechStackFit(technologies) {
    if (!technologies || !Array.isArray(technologies)) return 0;

    const techLower = technologies.map(t => t.toLowerCase());

    // Modern technologies
    const modern = ['react', 'vue', 'angular', 'node.js', 'python', 'go', 'kubernetes',
                    'docker', 'aws', 'gcp', 'azure', 'microservices', 'graphql', 'rest'];
    const modernCount = modern.filter(tech => techLower.some(t => t.includes(tech))).length;

    if (modernCount >= 3) {
      return 15;
    } else if (modernCount >= 2) {
      return 10;
    } else if (modernCount >= 1) {
      return 5;
    }

    return 0;
  }

  /**
   * Budget Indicators (0-10 points)
   * - Strong indicators (funding, growth): +10
   * - Some indicators: +5
   * - No indicators: 0
   */
  assessBudgetIndicators(metadata) {
    let score = 0;

    // Funding indicators
    if (metadata.funding_raised || metadata.recent_funding) {
      score += 5;
    }

    // Growth indicators
    if (metadata.growth_rate || metadata.revenue_growth) {
      score += 3;
    }

    // Expansion indicators
    if (metadata.hiring || metadata.expanding) {
      score += 2;
    }

    return Math.min(score, 10);
  }

  /**
   * Batch calculate fit scores
   */
  async batchCalculateFitScores(opportunityIds, options = {}) {
    const { concurrency = 10 } = options;
    const results = [];

    for (let i = 0; i < opportunityIds.length; i += concurrency) {
      const batch = opportunityIds.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(id => this.calculateFitScore(id))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            opportunityId: batch[index],
            error: result.reason.message
          });
        }
      });
    }

    return results;
  }

  /**
   * Get fit score distribution
   */
  async getFitScoreDistribution() {
    // This would query from lead_scores table once fit scores are stored
    const query = `
      SELECT
        CASE
          WHEN fit_score >= 80 THEN 'Excellent'
          WHEN fit_score >= 60 THEN 'Good'
          WHEN fit_score >= 40 THEN 'Fair'
          ELSE 'Poor'
        END as fit_category,
        COUNT(*) as count,
        AVG(fit_score) as avg_score
      FROM lead_scores
      WHERE fit_score IS NOT NULL
      GROUP BY fit_category
      ORDER BY avg_score DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default FitScoringService;
