// ml/modelRegistry.js
// Model Registry - Track, version, and deploy ML models

import { pool } from '../utils/db.js';

/**
 * Model Registry - MLflow-style model management
 *
 * Features:
 * - Model versioning
 * - Performance tracking
 * - Shadow deployment (A/B test models)
 * - Canary releases
 * - Rollback capability
 */
class ModelRegistry {

  /**
   * Register a new model version
   */
  async registerModel(modelName, modelConfig) {
    const result = await pool.query(`
      INSERT INTO ml_models (
        model_name, model_version, model_type, model_path,
        feature_columns, metrics, hyperparameters,
        training_samples, training_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      modelName,
      modelConfig.version,
      modelConfig.type,
      modelConfig.path,
      JSON.stringify(modelConfig.featureColumns),
      JSON.stringify(modelConfig.metrics),
      JSON.stringify(modelConfig.hyperparameters),
      modelConfig.trainingSamples,
      new Date(),
      'training'
    ]);

    console.log(`[ModelRegistry] Registered ${modelName} v${modelConfig.version} (ID: ${result.rows[0].id})`);

    return result.rows[0].id;
  }

  /**
   * Deploy model to production
   */
  async deployModel(modelId, deploymentType = 'full') {
    // deploymentType: 'full', 'shadow', 'canary'

    const model = await pool.query('SELECT * FROM ml_models WHERE id = $1', [modelId]);

    if (model.rows.length === 0) {
      throw new Error(`Model ${modelId} not found`);
    }

    const modelData = model.rows[0];

    if (deploymentType === 'shadow') {
      // Shadow deployment: run in parallel with production, don't serve results
      await pool.query(`
        UPDATE ml_models
        SET status = 'shadow', deployed_at = NOW()
        WHERE id = $1
      `, [modelId]);

      console.log(`[ModelRegistry] Model ${modelData.model_name} v${modelData.model_version} deployed in SHADOW mode`);

    } else if (deploymentType === 'canary') {
      // Canary deployment: serve 10% of traffic
      await pool.query(`
        UPDATE ml_models
        SET status = 'canary', deployed_at = NOW()
        WHERE id = $1
      `, [modelId]);

      // Set traffic split
      await pool.query(`
        INSERT INTO model_traffic_split (model_id, traffic_percentage)
        VALUES ($1, 0.10)
        ON CONFLICT (model_id) DO UPDATE
        SET traffic_percentage = EXCLUDED.traffic_percentage
      `, [modelId]);

      console.log(`[ModelRegistry] Model ${modelData.model_name} v${modelData.model_version} deployed as CANARY (10% traffic)`);

    } else {
      // Full deployment: archive old model, deploy new one
      await pool.query(`
        UPDATE ml_models
        SET status = 'archived'
        WHERE model_name = $1 AND status = 'deployed'
      `, [modelData.model_name]);

      await pool.query(`
        UPDATE ml_models
        SET status = 'deployed', deployed_at = NOW()
        WHERE id = $1
      `, [modelId]);

      console.log(`[ModelRegistry] Model ${modelData.model_name} v${modelData.model_version} deployed to PRODUCTION`);
    }

    return {
      model_id: modelId,
      model_name: modelData.model_name,
      version: modelData.model_version,
      deployment_type: deploymentType,
      deployed_at: new Date()
    };
  }

  /**
   * Get active model for serving
   */
  async getActiveModel(modelName) {
    const result = await pool.query(`
      SELECT * FROM ml_models
      WHERE model_name = $1 AND status IN ('deployed', 'canary')
      ORDER BY deployed_at DESC
      LIMIT 1
    `, [modelName]);

    return result.rows[0] || null;
  }

  /**
   * Shadow deployment evaluation
   */
  async evaluateShadowModel(modelId) {
    // Compare shadow model predictions vs production model
    const result = await pool.query(`
      WITH shadow_preds AS (
        SELECT
          entity_id,
          (prediction->>'probability')::numeric as shadow_prob,
          CASE
            WHEN (actual_outcome->>'converted')::boolean THEN 1
            ELSE 0
          END as actual
        FROM ml_predictions
        WHERE model_id = $1 AND actual_outcome IS NOT NULL
      ),
      prod_preds AS (
        SELECT
          entity_id,
          (prediction->>'probability')::numeric as prod_prob,
          CASE
            WHEN (actual_outcome->>'converted')::boolean THEN 1
            ELSE 0
          END as actual
        FROM ml_predictions
        WHERE
          model_id = (
            SELECT id FROM ml_models
            WHERE model_name = (SELECT model_name FROM ml_models WHERE id = $1)
            AND status = 'deployed'
          )
          AND actual_outcome IS NOT NULL
      )
      SELECT
        COUNT(*) as sample_size,
        AVG(ABS(s.shadow_prob - s.actual)) as shadow_mae,
        AVG(ABS(p.prod_prob - p.actual)) as prod_mae,
        AVG(s.shadow_prob) as shadow_avg_pred,
        AVG(p.prod_prob) as prod_avg_pred
      FROM shadow_preds s
      JOIN prod_preds p ON p.entity_id = s.entity_id
    `, [modelId]);

    if (result.rows.length === 0 || result.rows[0].sample_size === '0') {
      return {
        shadow_better: false,
        improvement: 0,
        stats: null,
        message: 'Insufficient data for comparison'
      };
    }

    const stats = result.rows[0];

    return {
      shadow_better: parseFloat(stats.shadow_mae) < parseFloat(stats.prod_mae),
      improvement: ((parseFloat(stats.prod_mae) - parseFloat(stats.shadow_mae)) / parseFloat(stats.prod_mae)) * 100,
      stats: {
        sample_size: parseInt(stats.sample_size),
        shadow_mae: parseFloat(stats.shadow_mae),
        prod_mae: parseFloat(stats.prod_mae),
        shadow_avg_pred: parseFloat(stats.shadow_avg_pred),
        prod_avg_pred: parseFloat(stats.prod_avg_pred)
      }
    };
  }

  /**
   * Promote shadow/canary to production
   */
  async promoteModel(modelId) {
    const evaluation = await this.evaluateShadowModel(modelId);

    if (!evaluation.shadow_better && evaluation.stats) {
      console.warn(`[ModelRegistry] Warning: Shadow model is NOT better than production. Promoting anyway.`);
    }

    await this.deployModel(modelId, 'full');

    return {
      promoted: true,
      evaluation
    };
  }

  /**
   * Rollback to previous model
   */
  async rollback(modelName) {
    // Get last deployed model
    const previous = await pool.query(`
      SELECT * FROM ml_models
      WHERE model_name = $1 AND status = 'archived'
      ORDER BY deployed_at DESC
      LIMIT 1
    `, [modelName]);

    if (previous.rows.length === 0) {
      throw new Error('No previous model to rollback to');
    }

    // Archive current
    await pool.query(`
      UPDATE ml_models
      SET status = 'archived'
      WHERE model_name = $1 AND status = 'deployed'
    `, [modelName]);

    // Restore previous
    await pool.query(`
      UPDATE ml_models
      SET status = 'deployed', deployed_at = NOW()
      WHERE id = $1
    `, [previous.rows[0].id]);

    console.log(`[ModelRegistry] Rolled back ${modelName} to version ${previous.rows[0].model_version}`);

    return {
      rolled_back_to: {
        model_id: previous.rows[0].id,
        version: previous.rows[0].model_version
      }
    };
  }

  /**
   * Compare model versions
   */
  async compareModels(modelId1, modelId2) {
    const models = await pool.query(`
      SELECT * FROM ml_models WHERE id IN ($1, $2)
    `, [modelId1, modelId2]);

    const m1 = models.rows.find(m => m.id === modelId1);
    const m2 = models.rows.find(m => m.id === modelId2);

    if (!m1 || !m2) {
      throw new Error('One or both models not found');
    }

    return {
      model1: {
        id: m1.id,
        version: m1.model_version,
        metrics: m1.metrics,
        status: m1.status,
        deployed_at: m1.deployed_at
      },
      model2: {
        id: m2.id,
        version: m2.model_version,
        metrics: m2.metrics,
        status: m2.status,
        deployed_at: m2.deployed_at
      },
      comparison: {
        auc_roc: {
          model1: m1.metrics.auc_roc,
          model2: m2.metrics.auc_roc,
          winner: m1.metrics.auc_roc > m2.metrics.auc_roc ? 'model1' : 'model2',
          improvement: ((m2.metrics.auc_roc - m1.metrics.auc_roc) / m1.metrics.auc_roc) * 100
        },
        accuracy: {
          model1: m1.metrics.accuracy,
          model2: m2.metrics.accuracy,
          winner: m1.metrics.accuracy > m2.metrics.accuracy ? 'model1' : 'model2',
          improvement: ((m2.metrics.accuracy - m1.metrics.accuracy) / m1.metrics.accuracy) * 100
        }
      }
    };
  }

  /**
   * List all models
   */
  async listModels(modelName = null) {
    const query = modelName
      ? 'SELECT * FROM ml_models WHERE model_name = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM ml_models ORDER BY model_name, created_at DESC';

    const params = modelName ? [modelName] : [];
    const result = await pool.query(query, params);

    return result.rows;
  }

  /**
   * Get model by ID
   */
  async getModel(modelId) {
    const result = await pool.query('SELECT * FROM ml_models WHERE id = $1', [modelId]);
    return result.rows[0] || null;
  }
}

export default new ModelRegistry();
