// routes/experiments.js
// A/B Testing & Experimentation API with LinUCB Support

import express from 'express';
import { pool } from '../utils/db.js';
import LinUCB from '../ml/linucb.js';
import MultiArmedBandit from '../ml/bandit.js';
import autoExperimentDesigner from '../services/autoExperimentDesigner.js';

const router = express.Router();

// Cache LinUCB instances (one per experiment)
const linucbCache = new Map();

/**
 * POST /api/experiments/select-variant
 *
 * Select best email variant using contextual bandits (LinUCB)
 *
 * Body:
 * {
 *   "experiment_name": "subject_line_test_nov_2025",
 *   "context": {
 *     "industry": "technology",
 *     "seniority": "c_level",
 *     "size": "1001-5000",
 *     "open_rate": 0.35,
 *     "reply_rate": 0.08,
 *     "lifecycle_stage": "growth"
 *   },
 *   "algorithm": "linucb" // or "thompson_sampling"
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "variant": {
 *     "variant_id": 123,
 *     "variant_name": "variant_B",
 *     "subject": "Unlock 40% faster hiring with AI",
 *     "expected_reward": 0.42,
 *     "confidence": 0.87,
 *     "algorithm": "linucb"
 *   }
 * }
 */
router.post('/select-variant', async (req, res) => {
  try {
    const { experiment_name, context, algorithm = 'linucb' } = req.body;

    if (!experiment_name) {
      return res.status(400).json({
        ok: false,
        error: 'missing_experiment_name',
        message: 'experiment_name is required'
      });
    }

    // Check if experiment exists
    const experimentResult = await pool.query(`
      SELECT id, experiment_name, status, algorithm
      FROM experiments
      WHERE experiment_name = $1
    `, [experiment_name]);

    if (experimentResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'experiment_not_found',
        message: `Experiment not found: ${experiment_name}`
      });
    }

    const experiment = experimentResult.rows[0];

    if (experiment.status !== 'active') {
      return res.status(400).json({
        ok: false,
        error: 'experiment_not_active',
        message: `Experiment is ${experiment.status}. Must be active to select variants.`
      });
    }

    let selectedVariant;

    // Use specified algorithm or experiment's default
    const useAlgorithm = algorithm || experiment.algorithm || 'linucb';

    if (useAlgorithm === 'linucb') {
      // LinUCB: Contextual bandits
      if (!context) {
        return res.status(400).json({
          ok: false,
          error: 'missing_context',
          message: 'LinUCB requires context (lead features)'
        });
      }

      // Get or create LinUCB instance
      let linucb = linucbCache.get(experiment_name);
      if (!linucb) {
        linucb = new LinUCB(experiment_name);
        await linucb.initialize();
        linucbCache.set(experiment_name, linucb);
      }

      // Select variant
      const selection = await linucb.selectVariant(context);

      // Get variant details
      const variantResult = await pool.query(`
        SELECT
          ea.id,
          ea.variant_name,
          ea.config
        FROM experiment_assignments ea
        WHERE ea.id = $1
      `, [selection.variant_id]);

      if (variantResult.rows.length === 0) {
        throw new Error('Variant not found');
      }

      const variant = variantResult.rows[0];

      selectedVariant = {
        variant_id: variant.id,
        variant_name: variant.variant_name,
        config: variant.config,
        expected_reward: selection.expected_reward,
        uncertainty: selection.uncertainty,
        ucb: selection.ucb,
        confidence: selection.confidence,
        algorithm: 'linucb'
      };

    } else if (useAlgorithm === 'thompson_sampling') {
      // Thompson Sampling: Context-free bandits
      const bandit = new MultiArmedBandit(experiment_name);
      const selection = await bandit.selectVariant();

      selectedVariant = {
        variant_id: selection.variantId,
        variant_name: selection.variantName,
        config: selection.config,
        expected_reward: selection.expectedReward,
        confidence: selection.confidence,
        algorithm: 'thompson_sampling'
      };

    } else {
      return res.status(400).json({
        ok: false,
        error: 'invalid_algorithm',
        message: 'Algorithm must be "linucb" or "thompson_sampling"'
      });
    }

    res.json({
      ok: true,
      variant: selectedVariant
    });

  } catch (error) {
    console.error('[experiments] Select variant error:', error);

    res.status(500).json({
      ok: false,
      error: 'selection_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/experiments/record-outcome
 *
 * Record outcome of an experiment (for updating bandit parameters)
 *
 * Body:
 * {
 *   "experiment_name": "subject_line_test_nov_2025",
 *   "variant_id": 123,
 *   "context": { ... },
 *   "outcome": "converted", // or "opened", "replied", "bounced", etc.
 *   "reward": 1 // 1 for success, 0 for failure, or custom reward value
 * }
 */
router.post('/record-outcome', async (req, res) => {
  try {
    const { experiment_name, variant_id, context, outcome, reward } = req.body;

    if (!experiment_name || !variant_id || reward === undefined) {
      return res.status(400).json({
        ok: false,
        error: 'missing_required_fields',
        message: 'experiment_name, variant_id, and reward are required'
      });
    }

    // Get experiment details
    const experimentResult = await pool.query(`
      SELECT id, algorithm
      FROM experiments
      WHERE experiment_name = $1
    `, [experiment_name]);

    if (experimentResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'experiment_not_found'
      });
    }

    const experiment = experimentResult.rows[0];
    const useAlgorithm = experiment.algorithm || 'linucb';

    // Update variant stats
    if (reward > 0) {
      await pool.query(`
        UPDATE experiment_assignments
        SET
          total_converted = total_converted + 1,
          updated_at = NOW()
        WHERE id = $1
      `, [variant_id]);
    }

    // Update algorithm-specific parameters
    if (useAlgorithm === 'linucb' && context) {
      let linucb = linucbCache.get(experiment_name);
      if (!linucb) {
        linucb = new LinUCB(experiment_name);
        await linucb.initialize();
        linucbCache.set(experiment_name, linucb);
      }

      await linucb.updateReward(variant_id, context, reward);
    }

    // Record outcome in database
    await pool.query(`
      INSERT INTO experiment_outcomes (
        experiment_id,
        variant_id,
        outcome,
        reward,
        context,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      experiment.id,
      variant_id,
      outcome,
      reward,
      context ? JSON.stringify(context) : null
    ]);

    res.json({
      ok: true,
      message: 'Outcome recorded successfully'
    });

  } catch (error) {
    console.error('[experiments] Record outcome error:', error);

    res.status(500).json({
      ok: false,
      error: 'recording_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/experiments/:name/performance
 *
 * Get experiment performance metrics
 */
router.get('/:name/performance', async (req, res) => {
  try {
    const { name } = req.params;

    // Get experiment
    const experimentResult = await pool.query(`
      SELECT id, experiment_name, status, algorithm, start_date, end_date
      FROM experiments
      WHERE experiment_name = $1
    `, [name]);

    if (experimentResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'experiment_not_found'
      });
    }

    const experiment = experimentResult.rows[0];

    // Get variant performance
    const variantsResult = await pool.query(`
      SELECT
        id,
        variant_name,
        total_served,
        total_converted,
        CASE
          WHEN total_served > 0 THEN (total_converted::float / total_served)
          ELSE 0
        END as conversion_rate,
        metadata
      FROM experiment_assignments
      WHERE experiment_id = $1
      ORDER BY variant_name
    `, [experiment.id]);

    const variants = variantsResult.rows.map(v => ({
      variant_id: v.id,
      variant_name: v.variant_name,
      total_served: v.total_served,
      total_converted: v.total_converted,
      conversion_rate: parseFloat(v.conversion_rate.toFixed(4)),
      confidence_interval: calculateConfidenceInterval(v.total_converted, v.total_served)
    }));

    // Find best variant
    const bestVariant = variants.reduce((best, current) =>
      current.conversion_rate > best.conversion_rate ? current : best
    , variants[0]);

    // Calculate statistical significance (if applicable)
    let statisticalSignificance = null;
    if (variants.length === 2 && variants[0].total_served > 30 && variants[1].total_served > 30) {
      statisticalSignificance = calculateZTest(
        variants[0].total_converted, variants[0].total_served,
        variants[1].total_converted, variants[1].total_served
      );
    }

    res.json({
      ok: true,
      experiment: {
        name: experiment.experiment_name,
        status: experiment.status,
        algorithm: experiment.algorithm,
        start_date: experiment.start_date,
        end_date: experiment.end_date
      },
      variants,
      summary: {
        best_variant: bestVariant.variant_name,
        best_conversion_rate: bestVariant.conversion_rate,
        statistical_significance: statisticalSignificance
      }
    });

  } catch (error) {
    console.error('[experiments] Performance error:', error);

    res.status(500).json({
      ok: false,
      error: 'performance_fetch_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/experiments/create
 *
 * Create new A/B test experiment
 */
router.post('/create', async (req, res) => {
  try {
    const { experiment_name, description, variants, algorithm = 'linucb' } = req.body;

    if (!experiment_name || !variants || variants.length < 2) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'experiment_name and at least 2 variants are required'
      });
    }

    // Create experiment
    const experimentResult = await pool.query(`
      INSERT INTO experiments (
        experiment_name,
        description,
        algorithm,
        status,
        start_date
      ) VALUES ($1, $2, $3, 'active', NOW())
      RETURNING id
    `, [experiment_name, description || null, algorithm]);

    const experimentId = experimentResult.rows[0].id;

    // Create variants
    for (const variant of variants) {
      await pool.query(`
        INSERT INTO experiment_assignments (
          experiment_id,
          variant_name,
          config
        ) VALUES ($1, $2, $3)
      `, [
        experimentId,
        variant.name,
        JSON.stringify(variant.config || {})
      ]);
    }

    res.json({
      ok: true,
      experiment_id: experimentId,
      message: 'Experiment created successfully'
    });

  } catch (error) {
    console.error('[experiments] Create error:', error);

    res.status(500).json({
      ok: false,
      error: 'creation_failed',
      message: error.message
    });
  }
});

// ===== Helper Functions =====

function calculateConfidenceInterval(conversions, trials, confidence = 0.95) {
  if (trials === 0) return { lower: 0, upper: 0 };

  const p = conversions / trials;
  const z = 1.96; // 95% confidence

  const margin = z * Math.sqrt((p * (1 - p)) / trials);

  return {
    lower: Math.max(0, p - margin),
    upper: Math.min(1, p + margin)
  };
}

function calculateZTest(conversions1, trials1, conversions2, trials2) {
  const p1 = conversions1 / trials1;
  const p2 = conversions2 / trials2;

  const pooledP = (conversions1 + conversions2) / (trials1 + trials2);
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / trials1 + 1 / trials2));

  const z = (p1 - p2) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    z_score: z,
    p_value: pValue,
    is_significant: pValue < 0.05,
    confidence_level: 1 - pValue
  };
}

function normalCDF(z) {
  // Approximation of normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

/**
 * POST /api/experiments/auto-design
 *
 * Automatically generate experiment variants using AI
 *
 * Body:
 * {
 *   "campaign_type": "digital_transformation",
 *   "objective": "maximize_conversion",
 *   "target_audience": "C-level executives in UAE banking",
 *   "num_variants": 4,
 *   "context": {
 *     "industry": "banking",
 *     "company_size": "1000+",
 *     "seniority": "c_level"
 *   },
 *   "auto_save": true // If true, saves to database immediately
 * }
 */
router.post('/auto-design', async (req, res) => {
  try {
    const {
      campaign_type,
      objective = 'maximize_conversion',
      target_audience,
      num_variants = 4,
      context = {},
      auto_save = false
    } = req.body;

    if (!campaign_type) {
      return res.status(400).json({
        ok: false,
        error: 'missing_campaign_type',
        message: 'campaign_type is required'
      });
    }

    console.log('[auto-design] Generating experiment for:', campaign_type);

    // Generate experiment design
    const experimentDesign = await autoExperimentDesigner.designExperiment({
      campaign_type,
      objective,
      target_audience,
      num_variants,
      context
    });

    // Optionally save to database
    let savedExperiment = null;
    if (auto_save) {
      savedExperiment = await autoExperimentDesigner.saveExperiment(
        experimentDesign,
        req.userId || 'system'
      );
    }

    res.json({
      ok: true,
      experiment: experimentDesign,
      saved: savedExperiment,
      message: auto_save
        ? 'Experiment generated and saved successfully'
        : 'Experiment generated (not saved - set auto_save: true to save)'
    });

  } catch (error) {
    console.error('[auto-design] Error:', error);

    res.status(500).json({
      ok: false,
      error: 'design_failed',
      message: error.message
    });
  }
});

/**
 * GET /api/experiments/list
 *
 * List all experiments
 */
router.get('/list', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.experiment_name,
        e.description,
        e.algorithm,
        e.status,
        e.start_date,
        e.end_date,
        COUNT(ea.id) as variant_count
      FROM experiments e
      LEFT JOIN experiment_assignments ea ON ea.experiment_id = e.id
      GROUP BY e.id
      ORDER BY e.start_date DESC
    `);

    res.json({
      ok: true,
      experiments: result.rows
    });

  } catch (error) {
    console.error('[experiments] List error:', error);

    res.status(500).json({
      ok: false,
      error: 'list_failed',
      message: error.message
    });
  }
});

export default router;
