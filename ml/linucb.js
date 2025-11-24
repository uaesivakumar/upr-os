// ml/linucb.js
// LinUCB (Linear Upper Confidence Bound) - Contextual Bandits
//
// Contextual bandits that select email variants based on lead features
// More sophisticated than Thompson Sampling - considers WHO is receiving the email

import { pool } from '../utils/db.js';

/**
 * LinUCB: Contextual Multi-Armed Bandit
 *
 * Unlike Thompson Sampling (context-free), LinUCB uses lead features to personalize variant selection.
 *
 * How it works:
 * 1. Each variant learns a linear model: reward = w^T * context
 * 2. For a new lead, compute expected reward + uncertainty (UCB)
 * 3. Select variant with highest UCB (exploitation + exploration)
 *
 * Context features:
 * - Industry (technology, finance, healthcare, etc.)
 * - Seniority level (c_level, vp, director, manager, individual)
 * - Company size (1-10, 11-50, 51-200, 201-1000, 1001+)
 * - Engagement history (open_rate, reply_rate)
 * - Lifecycle stage (onboarding, growth, scaling, mature)
 */
export default class LinUCB {

  constructor(experimentName, alpha = 1.5) {
    this.experimentName = experimentName;
    this.alpha = alpha; // Exploration parameter (higher = more exploration)
    this.d = null; // Feature dimension (set when features are provided)
    this.variants = {}; // { variantId: { A, b, theta } }
  }

  /**
   * Initialize LinUCB for all variants in an experiment
   */
  async initialize() {
    console.log(`[LinUCB] Initializing for experiment: ${this.experimentName}`);

    // Get all variants
    const result = await pool.query(`
      SELECT
        ea.id as variant_id,
        ea.variant_name,
        ea.total_served,
        ea.total_converted,
        ea.metadata
      FROM experiment_assignments ea
      JOIN experiments e ON e.id = ea.experiment_id
      WHERE e.experiment_name = $1
    `, [this.experimentName]);

    if (result.rows.length === 0) {
      throw new Error(`Experiment not found: ${this.experimentName}`);
    }

    // Get feature dimension from first context (if available)
    const firstContext = await this._getRecentContext();
    if (firstContext) {
      this.d = firstContext.length;
    } else {
      // Default feature dimension if no context available yet
      this.d = 10; // Adjust based on your feature set
    }

    console.log(`[LinUCB] Feature dimension: ${this.d}`);

    // Initialize each variant's parameters
    for (const variant of result.rows) {
      const variantId = variant.variant_id;

      // Load existing parameters from metadata (if available)
      let A, b;

      if (variant.metadata?.linucb_A && variant.metadata?.linucb_b) {
        // Restore from database
        A = this._deserializeMatrix(variant.metadata.linucb_A);
        b = this._deserializeVector(variant.metadata.linucb_b);
      } else {
        // Initialize fresh
        A = this._identityMatrix(this.d); // A = I_d (d × d identity matrix)
        b = this._zeroVector(this.d); // b = 0 (d-dimensional zero vector)
      }

      const theta = this._computeTheta(A, b);

      this.variants[variantId] = {
        variant_id: variantId,
        variant_name: variant.variant_name,
        A, // Design matrix: A = D_a^T * D_a + I_d
        b, // Response vector: b = D_a^T * c_a
        theta // Parameter estimate: θ = A^(-1) * b
      };

      console.log(`[LinUCB] Initialized variant: ${variant.variant_name}`);
    }
  }

  /**
   * Select best variant for a given lead context
   *
   * @param context - Lead features (e.g., { industry: 'technology', seniority: 'c_level', size: '1001-5000', ... })
   * @returns { variantId, variantName, expectedReward, ucb, confidence }
   */
  async selectVariant(context) {
    if (Object.keys(this.variants).length === 0) {
      await this.initialize();
    }

    // Convert context to feature vector
    const x = this._contextToFeatures(context);

    let bestVariant = null;
    let bestUCB = -Infinity;

    const scores = [];

    for (const [variantId, variant] of Object.entries(this.variants)) {
      // Compute expected reward: θ^T * x
      const expectedReward = this._dotProduct(variant.theta, x);

      // Compute uncertainty: α * sqrt(x^T * A^(-1) * x)
      const A_inv = this._invertMatrix(variant.A);
      const uncertainty = this.alpha * Math.sqrt(
        this._quadraticForm(x, A_inv)
      );

      // UCB = expected reward + uncertainty
      const ucb = expectedReward + uncertainty;

      scores.push({
        variant_id: variantId,
        variant_name: variant.variant_name,
        expected_reward: expectedReward,
        uncertainty,
        ucb
      });

      if (ucb > bestUCB) {
        bestUCB = ucb;
        bestVariant = {
          variant_id: variantId,
          variant_name: variant.variant_name,
          expected_reward: expectedReward,
          uncertainty,
          ucb,
          confidence: this._computeConfidence(expectedReward, uncertainty)
        };
      }
    }

    console.log(`[LinUCB] Variant scores:`, scores);
    console.log(`[LinUCB] Selected: ${bestVariant.variant_name} (UCB: ${bestUCB.toFixed(4)})`);

    return bestVariant;
  }

  /**
   * Update LinUCB parameters after observing a reward
   *
   * @param variantId - Which variant was shown
   * @param context - Lead features
   * @param reward - Observed reward (1 = converted, 0 = not converted)
   */
  async updateReward(variantId, context, reward) {
    if (!this.variants[variantId]) {
      throw new Error(`Variant not found: ${variantId}`);
    }

    const x = this._contextToFeatures(context);
    const variant = this.variants[variantId];

    // Update A: A = A + x * x^T
    variant.A = this._addMatrices(
      variant.A,
      this._outerProduct(x, x)
    );

    // Update b: b = b + reward * x
    variant.b = this._addVectors(
      variant.b,
      this._scaleVector(x, reward)
    );

    // Recompute θ: θ = A^(-1) * b
    variant.theta = this._computeTheta(variant.A, variant.b);

    // Persist to database (non-blocking)
    this._persistParameters(variantId, variant.A, variant.b).catch(err => {
      console.error('[LinUCB] Failed to persist parameters:', err);
    });

    console.log(`[LinUCB] Updated variant ${variantId} with reward ${reward}`);
  }

  /**
   * Convert lead context to feature vector
   *
   * Features (one-hot encoded):
   * - Industry (5 features)
   * - Seniority (5 features)
   * - Company size (5 features)
   * - Engagement (2 features: open_rate, reply_rate)
   * - Lifecycle stage (5 features)
   *
   * Total: ~22 features (can be adjusted)
   */
  _contextToFeatures(context) {
    const features = [];

    // Industry (one-hot)
    const industries = ['technology', 'finance', 'healthcare', 'manufacturing', 'other'];
    for (const ind of industries) {
      features.push(context.industry === ind ? 1 : 0);
    }

    // Seniority (one-hot)
    const seniorities = ['c_level', 'vp', 'director', 'manager', 'individual'];
    for (const sen of seniorities) {
      features.push(context.seniority === sen ? 1 : 0);
    }

    // Company size (one-hot)
    const sizes = ['1-50', '51-200', '201-1000', '1001-5000', '5000+'];
    const sizeMap = {
      '1-10': '1-50',
      '11-50': '1-50',
      '51-200': '51-200',
      '201-1000': '201-1000',
      '1001-5000': '1001-5000',
      '5001-10000': '5000+',
      '10000+': '5000+'
    };
    const normalizedSize = sizeMap[context.size] || 'other';
    for (const sz of sizes) {
      features.push(normalizedSize === sz ? 1 : 0);
    }

    // Engagement (continuous)
    features.push(context.open_rate || 0);
    features.push(context.reply_rate || 0);

    // Lifecycle stage (one-hot)
    const stages = ['onboarding', 'growth', 'scaling', 'mature', 'other'];
    for (const stage of stages) {
      features.push(context.lifecycle_stage === stage ? 1 : 0);
    }

    // Bias term
    features.push(1);

    // Update dimension if needed
    if (this.d === null) {
      this.d = features.length;
    }

    // Pad or truncate to match dimension
    while (features.length < this.d) {
      features.push(0);
    }

    return features.slice(0, this.d);
  }

  // ===== Matrix/Vector Operations =====

  _identityMatrix(d) {
    const I = [];
    for (let i = 0; i < d; i++) {
      I[i] = [];
      for (let j = 0; j < d; j++) {
        I[i][j] = (i === j) ? 1 : 0;
      }
    }
    return I;
  }

  _zeroVector(d) {
    return new Array(d).fill(0);
  }

  _dotProduct(a, b) {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  _scaleVector(v, scalar) {
    return v.map(x => x * scalar);
  }

  _addVectors(a, b) {
    return a.map((val, i) => val + b[i]);
  }

  _outerProduct(a, b) {
    // Returns a * b^T (d × d matrix)
    const result = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b.length; j++) {
        result[i][j] = a[i] * b[j];
      }
    }
    return result;
  }

  _addMatrices(A, B) {
    return A.map((row, i) => row.map((val, j) => val + B[i][j]));
  }

  _invertMatrix(A) {
    // Simple matrix inversion (for small matrices)
    // In production, use a proper linear algebra library (e.g., math.js)
    const d = A.length;

    // Create augmented matrix [A | I]
    const augmented = A.map((row, i) =>
      [...row, ...this._identityMatrix(d)[i]]
    );

    // Gaussian elimination
    for (let i = 0; i < d; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < d; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }

      // Swap rows
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      // Make diagonal 1
      const pivot = augmented[i][i];
      if (Math.abs(pivot) < 1e-10) {
        // Singular matrix - return identity (fallback)
        return this._identityMatrix(d);
      }

      for (let j = 0; j < 2 * d; j++) {
        augmented[i][j] /= pivot;
      }

      // Eliminate column
      for (let k = 0; k < d; k++) {
        if (k !== i) {
          const factor = augmented[k][i];
          for (let j = 0; j < 2 * d; j++) {
            augmented[k][j] -= factor * augmented[i][j];
          }
        }
      }
    }

    // Extract inverse (right half of augmented matrix)
    return augmented.map(row => row.slice(d));
  }

  _quadraticForm(x, A) {
    // Compute x^T * A * x
    const Ax = A.map(row => this._dotProduct(row, x));
    return this._dotProduct(x, Ax);
  }

  _computeTheta(A, b) {
    const A_inv = this._invertMatrix(A);
    return A_inv.map(row => this._dotProduct(row, b));
  }

  _computeConfidence(expectedReward, uncertainty) {
    // Confidence: how certain are we about this estimate?
    // Higher expected reward + lower uncertainty = higher confidence
    if (uncertainty === 0) return 1.0;
    return Math.min(1.0, Math.max(0.0, expectedReward / (expectedReward + uncertainty)));
  }

  // ===== Persistence =====

  async _persistParameters(variantId, A, b) {
    await pool.query(`
      UPDATE experiment_assignments
      SET metadata = jsonb_set(
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{linucb_A}', $1::jsonb
        ),
        '{linucb_b}', $2::jsonb
      )
      WHERE id = $3
    `, [
      JSON.stringify(this._serializeMatrix(A)),
      JSON.stringify(this._serializeVector(b)),
      variantId
    ]);
  }

  _serializeMatrix(A) {
    return A.map(row => row.join(',')).join(';');
  }

  _serializeVector(v) {
    return v.join(',');
  }

  _deserializeMatrix(str) {
    return str.split(';').map(row => row.split(',').map(Number));
  }

  _deserializeVector(str) {
    return str.split(',').map(Number);
  }

  async _getRecentContext() {
    // Get a recent context to infer feature dimension
    const result = await pool.query(`
      SELECT metadata->'context' as context
      FROM experiment_assignments
      WHERE metadata->'context' IS NOT NULL
      LIMIT 1
    `);

    if (result.rows.length === 0) return null;

    const context = result.rows[0].context;
    return this._contextToFeatures(context);
  }
}
