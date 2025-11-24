/**
 * Model Improvement Pipeline
 * Sprint 41: Feedback Loop & Learning System
 *
 * Handles training data collection, model versioning, and improvement workflows
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || '34.121.0.240',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'upr_production',
  user: process.env.DB_USER || 'upr_app',
  password: process.env.DB_PASSWORD || 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: process.env.DB_SSL === 'true'
});

class ModelImprovementPipeline {
  /**
   * Collect training data from feedback (corrections and high-quality decisions)
   */
  async collectTrainingData(options = {}) {
    const {
      modelType = null,
      minFeedbackCount = 3,
      qualityThreshold = 70,
      timeWindow = '30 days',
      includeCorrections = true,
      includeHighQuality = true
    } = options;

    try {
      const trainingSamples = [];

      // 1. Collect user corrections (explicit training data)
      if (includeCorrections) {
        const corrections = await pool.query(`
          SELECT
            f.id as feedback_id,
            f.decision_id,
            f.correction_data,
            d.tool_name as model_type,
            d.input_data,
            d.output_data as original_output,
            d.confidence_score,
            f.created_at
          FROM agent_core.feedback f
          JOIN agent_core.agent_decisions d ON f.decision_id = d.decision_id
          WHERE f.feedback_type = 'correction'
          AND f.created_at >= NOW() - INTERVAL '${timeWindow}'
          ${modelType ? `AND d.tool_name = '${modelType}'` : ''}
          AND f.correction_data IS NOT NULL
        `);

        for (const row of corrections.rows) {
          trainingSamples.push({
            source: 'user_correction',
            source_id: row.feedback_id,
            model_type: row.model_type,
            input_data: row.input_data,
            expected_output: row.correction_data,
            original_output: row.original_output,
            confidence_score: row.confidence_score,
            quality_score: 100, // User corrections are high quality
            created_at: row.created_at
          });
        }
      }

      // 2. Collect high-quality decisions (implicit training data)
      if (includeHighQuality) {
        const highQuality = await pool.query(`
          SELECT
            d.decision_id,
            d.tool_name as model_type,
            d.input_data,
            d.output_data,
            d.confidence_score,
            q.quality_score,
            q.feedback_count,
            d.decided_at as created_at
          FROM agent_core.agent_decisions d
          JOIN agent_core.decision_quality_scores q ON d.decision_id = q.decision_id
          WHERE q.quality_score >= $1
          AND q.feedback_count >= $2
          AND q.calculated_at >= NOW() - INTERVAL '${timeWindow}'
          ${modelType ? `AND d.tool_name = '${modelType}'` : ''}
        `, [qualityThreshold, minFeedbackCount]);

        for (const row of highQuality.rows) {
          trainingSamples.push({
            source: 'high_quality_decision',
            source_id: row.decision_id,
            model_type: row.model_type,
            input_data: row.input_data,
            expected_output: row.output_data,
            original_output: row.output_data,
            confidence_score: row.confidence_score,
            quality_score: parseFloat(row.quality_score),
            feedback_count: parseInt(row.feedback_count),
            created_at: row.created_at
          });
        }
      }

      return {
        total_samples: trainingSamples.length,
        corrections: trainingSamples.filter(s => s.source === 'user_correction').length,
        high_quality: trainingSamples.filter(s => s.source === 'high_quality_decision').length,
        by_model_type: this._groupByModelType(trainingSamples),
        samples: trainingSamples,
        collection_params: options
      };

    } catch (error) {
      console.error('Error collecting training data:', error);
      throw error;
    }
  }

  /**
   * Save training samples to database for future model training
   */
  async saveTrainingSamples(samples) {
    try {
      let saved = 0;
      const errors = [];

      for (const sample of samples) {
        try {
          // Check if already exists (using actual schema)
          const existing = await pool.query(`
            SELECT sample_id FROM agent_core.training_samples
            WHERE sample_type = $1 AND source_decision_id = $2
          `, [sample.source, sample.source_id]);

          if (existing.rows.length > 0) {
            continue; // Skip duplicates
          }

          // Insert new training sample (using actual schema)
          await pool.query(`
            INSERT INTO agent_core.training_samples (
              tool_name,
              sample_type,
              input_features,
              expected_output,
              actual_output,
              source_decision_id,
              quality_score,
              is_validated,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `, [
            sample.model_type,
            sample.source,
            sample.input_data,
            sample.expected_output,
            sample.original_output,
            sample.source_id,
            sample.quality_score,
            sample.source === 'user_correction' // Auto-validate user corrections
          ]);

          saved++;
        } catch (err) {
          errors.push({
            sample: sample.source_id,
            error: err.message
          });
        }
      }

      return {
        saved,
        skipped: samples.length - saved - errors.length,
        errors: errors.length,
        error_details: errors
      };

    } catch (error) {
      console.error('Error saving training samples:', error);
      throw error;
    }
  }

  /**
   * Create a new model version record
   */
  async createModelVersion(modelConfig) {
    const {
      model_name,
      version,
      model_type,
      training_data_size,
      training_config = {},
      performance_metrics = {},
      notes = ''
    } = modelConfig;

    try {
      const result = await pool.query(`
        INSERT INTO agent_core.model_versions (
          model_name,
          version,
          model_type,
          training_data_size,
          training_config,
          performance_metrics,
          status,
          is_production,
          trained_at,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, 'training', false, NOW(), $7)
        RETURNING id, model_name, version, status, trained_at
      `, [
        model_name,
        version,
        model_type,
        training_data_size,
        JSON.stringify(training_config),
        JSON.stringify(performance_metrics),
        notes
      ]);

      return result.rows[0];

    } catch (error) {
      console.error('Error creating model version:', error);
      throw error;
    }
  }

  /**
   * Update model version status and metrics
   */
  async updateModelVersion(modelId, updates) {
    const {
      status,
      performance_metrics,
      is_production = false
    } = updates;

    try {
      const result = await pool.query(`
        UPDATE agent_core.model_versions
        SET
          status = COALESCE($1, status),
          performance_metrics = COALESCE($2, performance_metrics),
          is_production = $3,
          promoted_at = CASE WHEN $3 = true THEN NOW() ELSE promoted_at END
        WHERE id = $4
        RETURNING id, model_name, version, status, is_production, promoted_at
      `, [
        status || null,
        performance_metrics ? JSON.stringify(performance_metrics) : null,
        is_production,
        modelId
      ]);

      return result.rows[0];

    } catch (error) {
      console.error('Error updating model version:', error);
      throw error;
    }
  }

  /**
   * Get current production model for a model type
   */
  async getProductionModel(modelType) {
    try {
      const result = await pool.query(`
        SELECT
          id,
          model_name,
          version,
          model_type,
          training_data_size,
          performance_metrics,
          trained_at,
          promoted_at
        FROM agent_core.model_versions
        WHERE model_type = $1
        AND is_production = true
        ORDER BY promoted_at DESC
        LIMIT 1
      `, [modelType]);

      return result.rows[0] || null;

    } catch (error) {
      console.error('Error getting production model:', error);
      throw error;
    }
  }

  /**
   * Promote a model version to production
   */
  async promoteToProduction(modelId, createdBy = 'system') {
    try {
      // Get model details
      const modelResult = await pool.query(`
        SELECT model_type, model_name, version FROM agent_core.model_versions WHERE id = $1
      `, [modelId]);

      if (modelResult.rows.length === 0) {
        throw new Error(`Model ${modelId} not found`);
      }

      const model = modelResult.rows[0];

      // Demote current production model
      await pool.query(`
        UPDATE agent_core.model_versions
        SET is_production = false
        WHERE model_type = $1
        AND is_production = true
        AND id != $2
      `, [model.model_type, modelId]);

      // Promote new model
      const result = await pool.query(`
        UPDATE agent_core.model_versions
        SET
          is_production = true,
          status = 'active',
          promoted_at = NOW(),
          created_by = $1
        WHERE id = $2
        RETURNING id, model_name, version, is_production, promoted_at
      `, [createdBy, modelId]);

      return {
        promoted: result.rows[0],
        previous_model: model,
        message: `Model ${model.model_name} v${model.version} promoted to production`
      };

    } catch (error) {
      console.error('Error promoting model:', error);
      throw error;
    }
  }

  /**
   * Generate training dataset export
   */
  async exportTrainingDataset(options = {}) {
    const {
      modelType,
      minQualityScore = 70,
      isValidated = true,
      limit = 1000
    } = options;

    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (modelType) {
        whereClause += ` AND tool_name = $${paramCount}`;
        params.push(modelType);
        paramCount++;
      }

      if (minQualityScore) {
        whereClause += ` AND quality_score >= $${paramCount}`;
        params.push(minQualityScore);
        paramCount++;
      }

      if (isValidated !== null) {
        whereClause += ` AND is_validated = $${paramCount}`;
        params.push(isValidated);
        paramCount++;
      }

      const query = `
        SELECT
          sample_id as id,
          tool_name as model_type,
          input_features as input_data,
          expected_output,
          sample_type as source,
          quality_score,
          is_validated,
          created_at
        FROM agent_core.training_samples
        ${whereClause}
        ORDER BY quality_score DESC, created_at DESC
        LIMIT $${paramCount}
      `;

      params.push(limit);

      const result = await pool.query(query, params);

      return {
        dataset_size: result.rows.length,
        model_type: modelType || 'all',
        filters_applied: options,
        samples: result.rows
      };

    } catch (error) {
      console.error('Error exporting training dataset:', error);
      throw error;
    }
  }

  /**
   * Helper: Group samples by model type
   */
  _groupByModelType(samples) {
    const grouped = {};

    for (const sample of samples) {
      if (!grouped[sample.model_type]) {
        grouped[sample.model_type] = {
          count: 0,
          corrections: 0,
          high_quality: 0,
          avg_quality_score: 0
        };
      }

      grouped[sample.model_type].count++;
      if (sample.source === 'user_correction') {
        grouped[sample.model_type].corrections++;
      }
      if (sample.source === 'high_quality_decision') {
        grouped[sample.model_type].high_quality++;
      }
    }

    // Calculate average quality scores
    for (const modelType in grouped) {
      const samplesForType = samples.filter(s => s.model_type === modelType);
      const avgQuality = samplesForType.reduce((sum, s) => sum + s.quality_score, 0) / samplesForType.length;
      grouped[modelType].avg_quality_score = parseFloat(avgQuality.toFixed(2));
    }

    return grouped;
  }

  /**
   * Close database connection
   */
  async close() {
    await pool.end();
  }
}

export default ModelImprovementPipeline;
