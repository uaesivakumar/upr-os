/**
 * Training Data Pipeline
 *
 * Extracts high-quality training examples from production decisions
 * and agent feedback for building golden datasets.
 */

const pool = require('../config/database');
const crypto = require('crypto');

class TrainingDataPipeline {
  /**
   * @param {Object} config - Pipeline configuration
   * @param {string} config.sourceType - Type of data source ('agent_decisions', 'manual_feedback', etc.)
   * @param {Object} config.filters - Filters for selecting examples
   * @param {number} config.qualityThreshold - Minimum quality score (0-100)
   * @param {string} config.exampleType - Type of example ('contact_tier', 'lead_score', etc.)
   */
  constructor(config) {
    this.config = {
      sourceType: 'agent_decisions',
      filters: {},
      qualityThreshold: 75,
      exampleType: null,
      ...config
    };
  }

  /**
   * Extract training examples from production data
   */
  async extract() {
    console.log('[TrainingDataPipeline] Starting extraction...');
    console.log(`  Source: ${this.config.sourceType}`);
    console.log(`  Type: ${this.config.exampleType || 'all'}`);
    console.log(`  Quality threshold: ${this.config.qualityThreshold}`);

    try {
      let examples = [];

      switch (this.config.sourceType) {
        case 'agent_decisions':
          examples = await this._extractFromAgentDecisions();
          break;
        case 'decision_feedback':
          examples = await this._extractFromFeedback();
          break;
        case 'contact_tiers':
          examples = await this._extractContactTierExamples();
          break;
        default:
          throw new Error(`Unknown source type: ${this.config.sourceType}`);
      }

      console.log(`[TrainingDataPipeline] Extracted ${examples.length} examples`);

      // Score quality
      const scoredExamples = await this._scoreQuality(examples);

      // Filter by quality threshold
      const filtered = scoredExamples.filter(ex => ex.quality_score >= this.config.qualityThreshold);

      console.log(`[TrainingDataPipeline] ${filtered.length} examples passed quality threshold`);

      return filtered;

    } catch (error) {
      console.error('[TrainingDataPipeline] Extraction error:', error);
      throw error;
    }
  }

  /**
   * Extract examples from agent decisions with positive outcomes
   */
  async _extractFromAgentDecisions() {
    const query = `
      SELECT
        ad.decision_id,
        ad.agent_id,
        ad.tool_name,
        ad.rule_name,
        ad.input_data,
        ad.output_data,
        ad.confidence_score,
        ad.key_factors,
        ad.decided_at,
        df.outcome_positive,
        df.outcome_type,
        df.notes as feedback_notes
      FROM agent_core.agent_decisions ad
      LEFT JOIN agent_core.decision_feedback df ON ad.decision_id = df.decision_id
      WHERE 1=1
        ${this.config.filters.outcomePositive !== undefined
          ? `AND df.outcome_positive = ${this.config.filters.outcomePositive}`
          : ''}
        ${this.config.filters.confidence
          ? `AND ad.confidence_score >= ${this.config.filters.confidence.min || 0}`
          : ''}
        ${this.config.filters.toolName
          ? `AND ad.tool_name = '${this.config.filters.toolName}'`
          : ''}
      ORDER BY ad.decided_at DESC
      ${this.config.filters.limit ? `LIMIT ${this.config.filters.limit}` : 'LIMIT 1000'}
    `;

    const result = await pool.query(query);

    return result.rows.map(row => ({
      source_decision_id: row.decision_id,
      example_type: this._mapToolNameToExampleType(row.tool_name, row.rule_name),
      input_data: row.input_data,
      expected_output: row.output_data,
      labels: {
        outcome_positive: row.outcome_positive,
        outcome_type: row.outcome_type,
        agent_id: row.agent_id,
        tool_name: row.tool_name,
        rule_name: row.rule_name,
        key_factors: row.key_factors,
        feedback_notes: row.feedback_notes,
        confidence_score: parseFloat(row.confidence_score || 0)
      },
      metadata: {
        extracted_from: 'agent_decisions',
        original_timestamp: row.decided_at
      }
    }));
  }

  /**
   * Extract examples from decision feedback (human corrections)
   */
  async _extractFromFeedback() {
    const query = `
      SELECT
        df.id as feedback_id,
        df.decision_id,
        ad.tool_name,
        ad.rule_name,
        ad.input_data,
        ad.output_data as original_output,
        df.correct_decision,
        df.outcome_positive,
        df.outcome_type,
        df.notes as feedback_notes,
        df.created_at
      FROM agent_core.decision_feedback df
      JOIN agent_core.agent_decisions ad ON df.decision_id = ad.decision_id
      WHERE df.correct_decision IS NOT NULL
        ${this.config.filters.outcomePositive !== undefined
          ? `AND df.outcome_positive = ${this.config.filters.outcomePositive}`
          : ''}
      ORDER BY df.created_at DESC
      ${this.config.filters.limit ? `LIMIT ${this.config.filters.limit}` : 'LIMIT 500'}
    `;

    const result = await pool.query(query);

    return result.rows.map(row => ({
      source_decision_id: row.decision_id,
      example_type: this._mapToolNameToExampleType(row.tool_name, row.rule_name),
      input_data: row.input_data,
      expected_output: {
        ...row.correct_decision,
        reasoning: row.feedback_notes || 'Human-corrected decision'
      },
      labels: {
        outcome_positive: row.outcome_positive,
        outcome_type: row.outcome_type,
        original_output: row.original_output,
        human_corrected: true,
        tool_name: row.tool_name,
        rule_name: row.rule_name
      },
      metadata: {
        extracted_from: 'decision_feedback',
        original_timestamp: row.created_at
      }
    }));
  }

  /**
   * Extract contact tier examples from production data
   */
  async _extractContactTierExamples() {
    // This would query actual contact data with tier assignments
    // For now, returning empty array as contacts table doesn't exist yet
    console.log('[TrainingDataPipeline] Contact tier extraction not yet implemented');
    return [];
  }

  /**
   * Map tool name and rule to example type
   */
  _mapToolNameToExampleType(toolName, ruleName) {
    // Map based on tool name
    const toolMapping = {
      'evaluate_contact_tier': 'contact_tier',
      'calculate_lead_score': 'lead_score',
      'evaluate_company_quality': 'company_quality',
      'prioritize_opportunity': 'opportunity_priority'
    };

    if (toolMapping[toolName]) {
      return toolMapping[toolName];
    }

    // Fallback to rule name
    if (ruleName) {
      if (ruleName.includes('tier')) return 'contact_tier';
      if (ruleName.includes('score')) return 'lead_score';
      if (ruleName.includes('quality')) return 'company_quality';
    }

    // Default to tool name
    return toolName || 'unknown';
  }

  /**
   * Score quality of extracted examples
   */
  async _scoreQuality(examples) {
    console.log('[TrainingDataPipeline] Scoring example quality...');

    return examples.map(example => {
      let score = 0;
      const metrics = {};

      // Completeness (30 points)
      const completenessScore = this._scoreCompleteness(example);
      score += completenessScore;
      metrics.completeness = completenessScore;

      // Correctness (40 points) - based on feedback
      const correctnessScore = this._scoreCorrectness(example);
      score += correctnessScore;
      metrics.correctness = correctnessScore;

      // Clarity (15 points)
      const clarityScore = this._scoreClarity(example);
      score += clarityScore;
      metrics.clarity = clarityScore;

      // Representativeness (15 points)
      const representativenessScore = 15; // Default for now
      score += representativenessScore;
      metrics.representativeness = representativenessScore;

      return {
        ...example,
        quality_score: Math.min(100, Math.max(0, score)),
        quality_metrics: metrics
      };
    });
  }

  /**
   * Score completeness (30 points max)
   */
  _scoreCompleteness(example) {
    let score = 0;

    // Check required fields
    if (example.input_data && Object.keys(example.input_data).length > 0) score += 10;
    if (example.expected_output && Object.keys(example.expected_output).length > 0) score += 10;

    // Check for reasoning/explanation
    if (example.expected_output?.reasoning) score += 5;

    // Check for confidence
    if (example.expected_output?.confidence !== undefined) score += 5;

    return score;
  }

  /**
   * Score correctness (40 points max)
   */
  _scoreCorrectness(example) {
    let score = 20; // Base score

    // Positive outcomes get higher scores
    if (example.labels?.outcome_positive === true) score += 15;
    else if (example.labels?.outcome_positive === false) score -= 10;

    // Human corrections are high quality
    if (example.labels?.human_corrected) score += 5;

    return Math.min(40, Math.max(0, score));
  }

  /**
   * Score clarity (15 points max)
   */
  _scoreClarity(example) {
    let score = 10; // Base score

    // Check reasoning quality
    const reasoning = example.expected_output?.reasoning || '';
    if (reasoning.length > 50) score += 3; // Detailed reasoning
    if (reasoning.includes('because') || reasoning.includes('since')) score += 2; // Causal reasoning

    return Math.min(15, score);
  }

  /**
   * Save examples to dataset
   * @param {string} datasetId - Target dataset ID
   * @param {Array} examples - Examples to save
   */
  async saveToDataset(datasetId, examples) {
    console.log(`[TrainingDataPipeline] Saving ${examples.length} examples to dataset ${datasetId}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let savedCount = 0;
      for (const example of examples) {
        await client.query(
          `INSERT INTO training.examples (
            dataset_id, example_type, input_data, expected_output,
            source_decision_id, quality_score, labels, validation_status, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            datasetId,
            example.example_type,
            JSON.stringify(example.input_data),
            JSON.stringify(example.expected_output),
            example.source_decision_id || null,
            example.quality_score || null,
            JSON.stringify(example.labels || {}),
            'pending',
            JSON.stringify(example.metadata || {})
          ]
        );
        savedCount++;
      }

      await client.query('COMMIT');
      console.log(`[TrainingDataPipeline] Saved ${savedCount} examples successfully`);

      return { savedCount };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[TrainingDataPipeline] Save error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = TrainingDataPipeline;
