/**
 * Outreach Quality Scoring Service
 * Sprint 45 - Enhanced quality assessment for generated outreach
 *
 * Provides comprehensive quality scoring across multiple dimensions:
 * - Personalization (0-100)
 * - Relevance (0-100)
 * - Clarity (0-100)
 * - Engagement Potential (0-100)
 * - Tone Consistency (0-100)
 */

import pg from 'pg';
const { Pool } = pg;

export class OutreachQualityService {
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
   * Score a generated outreach message
   * @param {object} params - Scoring parameters
   * @returns {object} Quality scores and tier
   */
  async scoreMessage(params) {
    const {
      message_id,
      message_text,
      subject_text = '',
      variables_used = {},
      context = {},
      template_match_score = 85
    } = params;

    // Calculate individual dimension scores
    const personalizationScore = this.calculatePersonalizationScore(
      message_text,
      subject_text,
      variables_used,
      context
    );

    const relevanceScore = this.calculateRelevanceScore(
      message_text,
      context
    );

    const clarityScore = this.calculateClarityScore(
      message_text
    );

    const engagementPotential = this.calculateEngagementPotential(
      message_text,
      subject_text,
      context
    );

    const toneConsistency = this.calculateToneConsistency(
      message_text,
      context.tone || 'professional'
    );

    // Calculate overall quality (weighted average)
    const overallQuality = Math.round(
      personalizationScore * 0.25 +
      relevanceScore * 0.25 +
      clarityScore * 0.20 +
      engagementPotential * 0.20 +
      toneConsistency * 0.10
    );

    // Generate AI suggestions
    const aiSuggestions = this.generateSuggestions({
      personalizationScore,
      relevanceScore,
      clarityScore,
      engagementPotential,
      toneConsistency,
      message_text,
      context
    });

    // Identify weak and strong points
    const scores = {
      personalization: personalizationScore,
      relevance: relevanceScore,
      clarity: clarityScore,
      engagement: engagementPotential,
      tone: toneConsistency
    };

    const weakPoints = this.identifyWeakPoints(scores);
    const strongPoints = this.identifyStrongPoints(scores);

    // Calculate additional metrics
    const variableCoverage = this.calculateVariableCoverage(variables_used, context);
    const contextRichness = this.calculateContextRichness(context);

    // Save to database
    const query = `
      INSERT INTO outreach_quality_scores (
        message_id,
        personalization_score,
        relevance_score,
        clarity_score,
        engagement_potential,
        tone_consistency,
        overall_quality,
        quality_tier,
        variable_coverage,
        context_richness,
        template_match_score,
        ai_suggestions,
        weak_points,
        strong_points
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const qualityTier = this.getQualityTier(overallQuality);

    const result = await this.pool.query(query, [
      message_id,
      personalizationScore,
      relevanceScore,
      clarityScore,
      engagementPotential,
      toneConsistency,
      overallQuality,
      qualityTier,
      variableCoverage,
      contextRichness,
      template_match_score,
      JSON.stringify(aiSuggestions),
      JSON.stringify(weakPoints),
      JSON.stringify(strongPoints)
    ]);

    return result.rows[0];
  }

  /**
   * Calculate personalization score (0-100)
   */
  calculatePersonalizationScore(messageText, subjectText, variablesUsed, context) {
    let score = 0;

    // Variable usage (0-40 points)
    const variableCount = Object.keys(variablesUsed).length;
    score += Math.min(40, variableCount * 3);

    // Personalized elements (0-30 points)
    const personalizedElements = [
      variablesUsed.first_name,
      variablesUsed.company_name,
      variablesUsed.industry,
      variablesUsed.title
    ].filter(Boolean).length;
    score += personalizedElements * 7.5;

    // Context-specific information (0-20 points)
    if (variablesUsed.pain_point) score += 10;
    if (variablesUsed.benefit) score += 10;

    // Custom insights (0-10 points)
    if (context.custom_insights || context.research_facts) score += 10;

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate relevance score (0-100)
   */
  calculateRelevanceScore(messageText, context) {
    let score = 60; // Base score

    // Industry alignment (0-15 points)
    if (context.industry && messageText.toLowerCase().includes(context.industry.toLowerCase())) {
      score += 15;
    }

    // Product-company fit (0-15 points)
    if (context.recommended_products && context.recommended_products.length > 0) {
      score += 15;
    }

    // Timing relevance (0-10 points)
    if (context.timing_score && context.timing_score >= 70) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate clarity score (0-100)
   */
  calculateClarityScore(messageText) {
    let score = 70; // Base score

    // Sentence length check (-20 if too long, +10 if good)
    const sentences = messageText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = messageText.length / sentences.length;

    if (avgSentenceLength < 100) {
      score += 10; // Good, concise sentences
    } else if (avgSentenceLength > 150) {
      score -= 20; // Too long, may be hard to read
    }

    // Paragraph structure (+10 if well structured)
    const paragraphs = messageText.split(/\n\n+/).filter(p => p.trim().length > 0);
    if (paragraphs.length >= 2 && paragraphs.length <= 5) {
      score += 10; // Good structure
    }

    // Jargon detection (-10 if excessive)
    const jargonWords = ['synergy', 'paradigm', 'leverage', 'ecosystem', 'disruptive'];
    const jargonCount = jargonWords.filter(word =>
      messageText.toLowerCase().includes(word)
    ).length;

    if (jargonCount > 2) score -= 10;

    // Call to action presence (+10)
    const ctaIndicators = ['schedule', 'call', 'meeting', 'discuss', 'connect', 'reach out'];
    const hasCTA = ctaIndicators.some(word =>
      messageText.toLowerCase().includes(word)
    );

    if (hasCTA) score += 10;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate engagement potential (0-100)
   */
  calculateEngagementPotential(messageText, subjectText, context) {
    let score = 50; // Base score

    // Subject line quality (0-20 points)
    if (subjectText) {
      const subjectLength = subjectText.length;
      if (subjectLength >= 30 && subjectLength <= 60) {
        score += 10; // Optimal length
      }

      // Personalization in subject (+10)
      if (context.company_name && subjectText.includes(context.company_name)) {
        score += 10;
      }
    }

    // Question presence (+10 points)
    if (messageText.includes('?')) {
      score += 10;
    }

    // Value proposition clarity (+15 points)
    const valueIndicators = ['save', 'increase', 'improve', 'reduce', 'grow', 'achieve'];
    const hasValue = valueIndicators.some(word =>
      messageText.toLowerCase().includes(word)
    );

    if (hasValue) score += 15;

    // Urgency or timeliness (+5 points)
    const urgencyIndicators = ['today', 'this week', 'limited', 'exclusive', 'opportunity'];
    const hasUrgency = urgencyIndicators.some(word =>
      messageText.toLowerCase().includes(word)
    );

    if (hasUrgency) score += 5;

    return Math.min(100, score);
  }

  /**
   * Calculate tone consistency (0-100)
   */
  calculateToneConsistency(messageText, expectedTone) {
    let score = 75; // Base score

    const lowerText = messageText.toLowerCase();

    if (expectedTone === 'formal') {
      // Check for contractions (should not be present)
      const contractions = ["i'm", "you're", "we're", "won't", "can't", "don't"];
      const hasContractions = contractions.some(c => lowerText.includes(c));

      if (hasContractions) score -= 20;

      // Check for formal language
      const formalIndicators = ['dear', 'sincerely', 'respectfully', 'kindly'];
      const hasFormal = formalIndicators.some(word => lowerText.includes(word));

      if (hasFormal) score += 15;
    }

    if (expectedTone === 'casual') {
      // Check for contractions (should be present)
      const contractions = ["i'm", "you're", "we're"];
      const hasContractions = contractions.some(c => lowerText.includes(c));

      if (hasContractions) score += 10;

      // Check for casual greetings
      if (lowerText.includes('hey') || lowerText.includes('hi ')) score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate variable coverage percentage
   */
  calculateVariableCoverage(variablesUsed, context) {
    const totalAvailable = Object.keys(context).length;
    if (totalAvailable === 0) return 100;

    const used = Object.keys(variablesUsed).filter(key =>
      variablesUsed[key] !== null && variablesUsed[key] !== undefined
    ).length;

    return parseFloat(((used / totalAvailable) * 100).toFixed(2));
  }

  /**
   * Calculate context richness (0-100)
   */
  calculateContextRichness(context) {
    let richness = 0;

    // Core context elements (5 points each)
    const coreElements = ['company_name', 'industry', 'first_name', 'title'];
    coreElements.forEach(elem => {
      if (context[elem]) richness += 5;
    });

    // Advanced context (10 points each)
    const advancedElements = ['pain_point', 'benefit', 'quality_score', 'recommended_products'];
    advancedElements.forEach(elem => {
      if (context[elem]) richness += 10;
    });

    // Premium context (15 points each)
    const premiumElements = ['custom_insights', 'research_facts', 'timing_score'];
    premiumElements.forEach(elem => {
      if (context[elem]) richness += 15;
    });

    return Math.min(100, richness);
  }

  /**
   * Generate improvement suggestions
   */
  generateSuggestions(params) {
    const suggestions = [];

    if (params.personalizationScore < 70) {
      suggestions.push({
        dimension: 'personalization',
        priority: 'HIGH',
        suggestion: 'Add more personalized elements like industry-specific pain points or company-specific insights',
        impact: 'Increase personalization score by 15-25 points'
      });
    }

    if (params.relevanceScore < 70) {
      suggestions.push({
        dimension: 'relevance',
        priority: 'HIGH',
        suggestion: 'Ensure message aligns with company industry and recommended products',
        impact: 'Improve relevance and response rate'
      });
    }

    if (params.clarityScore < 70) {
      suggestions.push({
        dimension: 'clarity',
        priority: 'MEDIUM',
        suggestion: 'Shorten sentences and break into smaller paragraphs for better readability',
        impact: 'Increase engagement by 10-15%'
      });
    }

    if (params.engagementPotential < 70) {
      suggestions.push({
        dimension: 'engagement',
        priority: 'HIGH',
        suggestion: 'Add a compelling question or clear value proposition in the first paragraph',
        impact: 'Boost reply rate by 20%'
      });
    }

    return suggestions;
  }

  /**
   * Identify weak points
   */
  identifyWeakPoints(scores) {
    return Object.entries(scores)
      .filter(([_, score]) => score < 70)
      .map(([dimension, score]) => ({
        dimension,
        score,
        severity: score < 50 ? 'CRITICAL' : 'MODERATE'
      }));
  }

  /**
   * Identify strong points
   */
  identifyStrongPoints(scores) {
    return Object.entries(scores)
      .filter(([_, score]) => score >= 85)
      .map(([dimension, score]) => ({ dimension, score }));
  }

  /**
   * Get quality tier
   */
  getQualityTier(score) {
    if (score >= 85) return 'EXCELLENT';
    if (score >= 70) return 'GOOD';
    if (score >= 50) return 'FAIR';
    return 'POOR';
  }

  /**
   * Get quality scores for a message
   */
  async getQualityScores(messageId) {
    const query = `
      SELECT * FROM outreach_quality_scores
      WHERE message_id = $1
      ORDER BY scored_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [messageId]);
    return result.rows[0];
  }

  /**
   * Get quality statistics
   */
  async getQualityStats(options = {}) {
    const { days = 30, tier = null } = options;

    let query = `
      SELECT
        quality_tier,
        COUNT(*) as count,
        AVG(overall_quality) as avg_quality,
        AVG(personalization_score) as avg_personalization,
        AVG(relevance_score) as avg_relevance,
        AVG(clarity_score) as avg_clarity,
        AVG(engagement_potential) as avg_engagement,
        AVG(tone_consistency) as avg_tone
      FROM outreach_quality_scores
      WHERE scored_at >= NOW() - INTERVAL '${days} days'
    `;

    const params = [];
    if (tier) {
      params.push(tier);
      query += ` AND quality_tier = $${params.length}`;
    }

    query += ` GROUP BY quality_tier ORDER BY quality_tier`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default OutreachQualityService;
