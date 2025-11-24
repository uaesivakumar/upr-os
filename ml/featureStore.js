// ml/featureStore.js
// Feature Store - Centralized feature management with versioning

import { pool } from '../utils/db.js';
import crypto from 'crypto';

/**
 * Feature Store - Feast-style with versioning
 *
 * Features:
 * - Feature versioning (v1, v2, etc.)
 * - Point-in-time correctness
 * - Feature lineage tracking
 * - Batch and online serving
 */
class FeatureStore {

  /**
   * Register feature definition
   */
  async registerFeature(featureName, config) {
    await pool.query(`
      INSERT INTO feature_definitions (
        name, description, entity_type, value_type,
        computation_logic, version, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (name, version) DO UPDATE
      SET
        description = EXCLUDED.description,
        computation_logic = EXCLUDED.computation_logic,
        updated_at = NOW()
    `, [
      featureName,
      config.description,
      config.entityType,
      config.valueType,
      JSON.stringify(config.computationLogic),
      config.version || 'v1',
      config.createdBy || 'system'
    ]);

    console.log(`[FeatureStore] Registered feature: ${featureName} (${config.version || 'v1'})`);
  }

  /**
   * Get features for online serving (low latency)
   */
  async getOnlineFeatures(entityType, entityId, featureNames = null, version = 'v1') {
    const result = await pool.query(`
      SELECT features, computed_at
      FROM feature_store
      WHERE
        entity_type = $1
        AND entity_id = $2
        AND feature_version = $3
      ORDER BY computed_at DESC
      LIMIT 1
    `, [entityType, entityId, version]);

    if (result.rows.length === 0) {
      return null;
    }

    const allFeatures = result.rows[0].features;

    // Filter to requested features
    if (featureNames && Array.isArray(featureNames)) {
      const filtered = {};
      featureNames.forEach(name => {
        if (allFeatures[name] !== undefined) {
          filtered[name] = allFeatures[name];
        }
      });
      return filtered;
    }

    return allFeatures;
  }

  /**
   * Get historical features (point-in-time correctness)
   */
  async getHistoricalFeatures(entityType, entityId, asOfTime, version = 'v1') {
    const result = await pool.query(`
      SELECT features, computed_at
      FROM feature_store
      WHERE
        entity_type = $1
        AND entity_id = $2
        AND feature_version = $3
        AND computed_at <= $4
      ORDER BY computed_at DESC
      LIMIT 1
    `, [entityType, entityId, version, asOfTime]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].features;
  }

  /**
   * Batch feature retrieval (for training)
   */
  async getBatchFeatures(requests, version = 'v1') {
    // requests = [{entityType, entityId, asOfTime?}, ...]

    const results = [];

    for (const req of requests) {
      let features;

      if (req.asOfTime) {
        features = await this.getHistoricalFeatures(
          req.entityType,
          req.entityId,
          req.asOfTime,
          version
        );
      } else {
        features = await this.getOnlineFeatures(
          req.entityType,
          req.entityId,
          null,
          version
        );
      }

      results.push({
        entityType: req.entityType,
        entityId: req.entityId,
        features,
        retrievedAt: new Date()
      });
    }

    return results;
  }

  /**
   * Materialize features (compute and store)
   */
  async materializeFeatures(entityType, entityId, features, version = 'v1') {
    const featureHash = crypto.createHash('md5')
      .update(JSON.stringify(features))
      .digest('hex');

    try {
      await pool.query(`
        INSERT INTO feature_store (
          entity_type, entity_id, features, feature_version, feature_hash, computed_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (entity_type, entity_id, feature_version, feature_hash) DO NOTHING
      `, [entityType, entityId, JSON.stringify(features), version, featureHash]);

      console.log(`[FeatureStore] Materialized features for ${entityType}:${entityId} (${version})`);
    } catch (error) {
      console.error('[FeatureStore] Materialization error:', error);
      throw error;
    }
  }

  /**
   * Feature lineage tracking
   */
  async trackFeatureLineage(featureName, dependencies) {
    await pool.query(`
      INSERT INTO feature_lineage (feature_name, dependencies)
      VALUES ($1, $2)
      ON CONFLICT (feature_name) DO UPDATE
      SET dependencies = EXCLUDED.dependencies, updated_at = NOW()
    `, [featureName, JSON.stringify(dependencies)]);
  }

  /**
   * Get feature statistics (for monitoring)
   */
  async getFeatureStats(featureName, entityType, days = 7) {
    const result = await pool.query(`
      SELECT
        COUNT(*) as count,
        AVG((features->>$1)::numeric) as mean,
        STDDEV((features->>$1)::numeric) as stddev,
        MIN((features->>$1)::numeric) as min,
        MAX((features->>$1)::numeric) as max,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (features->>$1)::numeric) as median
      FROM feature_store
      WHERE
        entity_type = $2
        AND features ? $1
        AND computed_at > NOW() - INTERVAL '${days} days'
    `, [featureName, entityType]);

    return {
      feature_name: featureName,
      ...result.rows[0],
      count: parseInt(result.rows[0].count || 0),
      mean: parseFloat(result.rows[0].mean || 0),
      stddev: parseFloat(result.rows[0].stddev || 0),
      min: parseFloat(result.rows[0].min || 0),
      max: parseFloat(result.rows[0].max || 0),
      median: parseFloat(result.rows[0].median || 0)
    };
  }

  /**
   * Compare feature versions
   */
  async compareVersions(entityType, entityId, version1, version2) {
    const features1 = await this.getOnlineFeatures(entityType, entityId, null, version1);
    const features2 = await this.getOnlineFeatures(entityType, entityId, null, version2);

    if (!features1 || !features2) {
      return { error: 'One or both versions not found' };
    }

    const diff = {};

    // Features only in v1
    for (const key in features1) {
      if (!(key in features2)) {
        diff[key] = { v1: features1[key], v2: null, status: 'removed' };
      }
    }

    // Features only in v2
    for (const key in features2) {
      if (!(key in features1)) {
        diff[key] = { v1: null, v2: features2[key], status: 'added' };
      }
    }

    // Features in both (check if changed)
    for (const key in features1) {
      if (key in features2 && features1[key] !== features2[key]) {
        diff[key] = { v1: features1[key], v2: features2[key], status: 'changed' };
      }
    }

    return diff;
  }

  /**
   * Get all feature definitions
   */
  async listFeatureDefinitions(version = null) {
    const query = version
      ? 'SELECT * FROM feature_definitions WHERE version = $1 ORDER BY name'
      : 'SELECT * FROM feature_definitions ORDER BY name, version';

    const params = version ? [version] : [];
    const result = await pool.query(query, params);

    return result.rows;
  }

  /**
   * Get feature lineage
   */
  async getFeatureLineage(featureName) {
    const result = await pool.query(
      'SELECT * FROM feature_lineage WHERE feature_name = $1',
      [featureName]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }
}

export default new FeatureStore();
