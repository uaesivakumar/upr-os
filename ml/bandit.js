// ml/bandit.js
// Multi-Armed Bandit for Email Optimization
// Uses Thompson Sampling to dynamically allocate traffic to best-performing variants

import { pool } from '../utils/db.js';

/**
 * Multi-Armed Bandit for Email Optimization
 *
 * Uses Thompson Sampling to dynamically allocate traffic to best-performing variants
 */
class MultiArmedBandit {

  constructor(experimentId) {
    this.experimentId = experimentId;
  }

  /**
   * Select variant using Thompson Sampling
   */
  async selectVariant() {
    // Get experiment configuration
    const experiment = await pool.query(
      'SELECT variants FROM experiments WHERE id = $1',
      [this.experimentId]
    );

    if (experiment.rows.length === 0) {
      throw new Error(`Experiment ${this.experimentId} not found`);
    }

    const variants = experiment.rows[0].variants;

    // Get performance stats for each variant
    const stats = await this.getVariantStats(variants);

    // Thompson Sampling: sample from Beta distribution
    const samples = stats.map(s => {
      return {
        variantId: s.variantId,
        sample: this.betaSample(s.successes + 1, s.failures + 1) // +1 for prior
      };
    });

    // Select variant with highest sample
    const winner = samples.reduce((max, s) => s.sample > max.sample ? s : max);

    return winner.variantId;
  }

  /**
   * Get performance statistics for each variant
   */
  async getVariantStats(variants) {
    const stats = [];

    for (const variant of variants) {
      const result = await pool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN (outcome->>'converted')::boolean = true THEN 1 ELSE 0 END) as successes
        FROM experiment_assignments
        WHERE experiment_id = $1 AND variant_id = $2
      `, [this.experimentId, variant.id]);

      const row = result.rows[0];
      const total = parseInt(row.total) || 0;
      const successes = parseInt(row.successes) || 0;

      stats.push({
        variantId: variant.id,
        total,
        successes,
        failures: total - successes,
        conversionRate: total > 0 ? successes / total : 0
      });
    }

    return stats;
  }

  /**
   * Sample from Beta distribution (Thompson Sampling)
   */
  betaSample(alpha, beta) {
    // Using Gamma distribution to sample from Beta
    const gamma1 = this.gammaSample(alpha);
    const gamma2 = this.gammaSample(beta);
    return gamma1 / (gamma1 + gamma2);
  }

  /**
   * Sample from Gamma distribution
   */
  gammaSample(shape, scale = 1) {
    // Marsaglia and Tsang method
    if (shape < 1) {
      return this.gammaSample(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    let maxIterations = 1000;
    while (maxIterations-- > 0) {
      let x, v;
      do {
        x = this.normalSample();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v * scale;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }

    // Fallback after max iterations
    return d * scale;
  }

  /**
   * Sample from standard normal distribution
   */
  normalSample() {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Record outcome for a variant
   */
  async recordOutcome(entityType, entityId, variantId, outcome) {
    await pool.query(`
      UPDATE experiment_assignments
      SET outcome = $1
      WHERE
        experiment_id = $2
        AND entity_type = $3
        AND entity_id = $4
        AND variant_id = $5
    `, [
      JSON.stringify(outcome),
      this.experimentId,
      entityType,
      entityId,
      variantId
    ]);
  }

  /**
   * Assign entity to variant (create assignment record)
   */
  async assignVariant(entityType, entityId, variantId) {
    await pool.query(`
      INSERT INTO experiment_assignments (
        experiment_id, entity_type, entity_id, variant_id
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (experiment_id, entity_type, entity_id)
      DO UPDATE SET variant_id = EXCLUDED.variant_id
    `, [this.experimentId, entityType, entityId, variantId]);
  }
}

export default MultiArmedBandit;
