// ml/driftMonitor.js
// Data Drift Monitor - Detect distribution changes

import { pool } from '../utils/db.js';

/**
 * Data Drift Monitor
 *
 * Detects when data distribution changes (concept drift, covariate shift)
 * Triggers model retraining when drift detected
 */
class DriftMonitor {

  /**
   * Monitor feature drift
   */
  async monitorFeatureDrift(featureName, entityType, baselineDays = 30, windowDays = 7) {
    console.log(`[DriftMonitor] Checking drift for ${featureName}...`);

    // Get baseline statistics (older period)
    const baseline = await this.getFeatureStats(
      featureName,
      entityType,
      baselineDays,
      new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    );

    // Get recent statistics (current period)
    const recent = await this.getFeatureStats(
      featureName,
      entityType,
      windowDays,
      new Date()
    );

    // Ensure we have data
    if (!baseline.values || !recent.values || baseline.values.length < 10 || recent.values.length < 10) {
      console.log(`[DriftMonitor] Insufficient data for ${featureName}`);
      return { isDrift: false, reason: 'insufficient_data' };
    }

    // Compute drift metrics
    const drift = this.computeDrift(baseline, recent);

    // Log drift
    await this.logDrift(featureName, entityType, drift);

    // Alert if significant drift
    if (drift.isDrift) {
      console.warn(`[DriftMonitor] ⚠️  DRIFT DETECTED: ${featureName} (${drift.metric}: ${drift.value.toFixed(4)})`);

      // Trigger alert
      await this.alertDrift(featureName, drift);
    } else {
      console.log(`[DriftMonitor] ✓ No drift detected for ${featureName}`);
    }

    return drift;
  }

  async getFeatureStats(featureName, entityType, days, endDate) {
    const result = await pool.query(`
      SELECT
        (features->>$1)::numeric as value
      FROM feature_store
      WHERE
        entity_type = $2
        AND features ? $1
        AND computed_at > $3 - INTERVAL '${days} days'
        AND computed_at <= $3
    `, [featureName, entityType, endDate]);

    const values = result.rows.map(r => parseFloat(r.value)).filter(v => !isNaN(v));

    if (values.length === 0) {
      return { mean: 0, stddev: 0, min: 0, max: 0, count: 0, values: [] };
    }

    return {
      mean: this.mean(values),
      stddev: this.stddev(values),
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
      values
    };
  }

  /**
   * Compute drift using multiple methods
   */
  computeDrift(baseline, recent) {
    // 1. Population Stability Index (PSI)
    const psi = this.computePSI(baseline.values, recent.values);

    // 2. Kolmogorov-Smirnov test
    const ks = this.computeKS(baseline.values, recent.values);

    // 3. Mean shift (z-score)
    const meanShift = Math.abs(recent.mean - baseline.mean) / (baseline.stddev || 1);

    // Determine if drift (PSI > 0.2 or KS p-value < 0.05 or mean shift > 2 std devs)
    const isDrift = psi > 0.2 || ks.pValue < 0.05 || meanShift > 2;

    let metric, value;
    if (psi > 0.2) {
      metric = 'PSI';
      value = psi;
    } else if (ks.pValue < 0.05) {
      metric = 'KS';
      value = ks.pValue;
    } else if (meanShift > 2) {
      metric = 'Mean Shift';
      value = meanShift;
    } else {
      metric = 'None';
      value = 0;
    }

    return {
      isDrift,
      psi,
      ks: ks.statistic,
      ks_pValue: ks.pValue,
      meanShift,
      baseline: {
        mean: baseline.mean,
        stddev: baseline.stddev,
        count: baseline.count
      },
      recent: {
        mean: recent.mean,
        stddev: recent.stddev,
        count: recent.count
      },
      metric,
      value
    };
  }

  /**
   * Population Stability Index (PSI)
   */
  computePSI(baseline, recent) {
    // Create bins
    const allValues = [...baseline, ...recent];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const binCount = 10;
    const binSize = (max - min) / binCount;

    if (binSize === 0) return 0; // No variance

    const bins = [];
    for (let i = 0; i < binCount; i++) {
      bins.push({
        min: min + i * binSize,
        max: min + (i + 1) * binSize,
        baselineCount: 0,
        recentCount: 0
      });
    }

    // Count values in each bin
    baseline.forEach(v => {
      const binIdx = Math.min(Math.floor((v - min) / binSize), binCount - 1);
      bins[binIdx].baselineCount++;
    });

    recent.forEach(v => {
      const binIdx = Math.min(Math.floor((v - min) / binSize), binCount - 1);
      bins[binIdx].recentCount++;
    });

    // Compute PSI
    let psi = 0;
    bins.forEach(bin => {
      const baselinePct = (bin.baselineCount + 0.0001) / baseline.length;
      const recentPct = (bin.recentCount + 0.0001) / recent.length;
      psi += (recentPct - baselinePct) * Math.log(recentPct / baselinePct);
    });

    return psi;
  }

  /**
   * Kolmogorov-Smirnov test
   */
  computeKS(baseline, recent) {
    // Sort both arrays
    const sortedBaseline = [...baseline].sort((a, b) => a - b);
    const sortedRecent = [...recent].sort((a, b) => a - b);

    // Compute empirical CDFs and find max difference
    let maxDiff = 0;
    let i = 0, j = 0;

    while (i < sortedBaseline.length && j < sortedRecent.length) {
      const baselineCDF = i / sortedBaseline.length;
      const recentCDF = j / sortedRecent.length;
      const diff = Math.abs(baselineCDF - recentCDF);

      if (diff > maxDiff) {
        maxDiff = diff;
      }

      if (sortedBaseline[i] < sortedRecent[j]) {
        i++;
      } else {
        j++;
      }
    }

    // Compute p-value (approximation)
    const n = baseline.length;
    const m = recent.length;
    const lambda = maxDiff * Math.sqrt((n * m) / (n + m));
    const pValue = Math.exp(-2 * lambda * lambda);

    return {
      statistic: maxDiff,
      pValue
    };
  }

  async logDrift(featureName, entityType, drift) {
    await pool.query(`
      INSERT INTO drift_logs (
        feature_name, entity_type, is_drift,
        psi, ks_statistic, ks_p_value, mean_shift,
        baseline_stats, recent_stats
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      featureName,
      entityType,
      drift.isDrift,
      drift.psi,
      drift.ks,
      drift.ks_pValue,
      drift.meanShift,
      JSON.stringify(drift.baseline),
      JSON.stringify(drift.recent)
    ]);
  }

  async alertDrift(featureName, drift) {
    // Send alert (email, Slack, etc.)
    console.log(`📧 Drift alert sent for ${featureName}`);

    // Optionally trigger model retraining
    if (drift.psi > 0.3) {
      console.log(`🔄 Significant drift detected - consider model retraining`);
      // await mlService.trainAllModels();
    }
  }

  /**
   * Monitor prediction drift (actual outcomes vs predictions)
   */
  async monitorPredictionDrift(modelName, days = 7) {
    console.log(`[DriftMonitor] Checking prediction drift for ${modelName}...`);

    const result = await pool.query(`
      SELECT
        DATE(created_at) as date,
        AVG((prediction->>'probability')::numeric) as avg_prediction,
        AVG(CASE WHEN (actual_outcome->>'converted')::boolean THEN 1 ELSE 0 END) as actual_rate
      FROM ml_predictions
      WHERE
        model_name = $1
        AND created_at > NOW() - INTERVAL '${days} days'
        AND actual_outcome IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [modelName]);

    if (result.rows.length === 0) {
      console.log(`[DriftMonitor] No data for ${modelName}`);
      return { isDrift: false, reason: 'no_data' };
    }

    const predictions = result.rows.map(r => parseFloat(r.avg_prediction));
    const actuals = result.rows.map(r => parseFloat(r.actual_rate));

    // Compute calibration error
    const calibrationError = predictions.reduce((sum, pred, i) => {
      return sum + Math.abs(pred - actuals[i]);
    }, 0) / predictions.length;

    const isDrift = calibrationError > 0.10; // 10% threshold

    if (isDrift) {
      console.warn(`[DriftMonitor] ⚠️  MODEL CALIBRATION DRIFT: ${modelName} (error: ${(calibrationError * 100).toFixed(1)}%)`);
    } else {
      console.log(`[DriftMonitor] ✓ Model ${modelName} is well calibrated`);
    }

    return {
      isDrift,
      calibrationError,
      predictions,
      actuals,
      days_analyzed: result.rows.length
    };
  }

  /**
   * Get drift summary
   */
  async getDriftSummary(days = 7) {
    const result = await pool.query(`
      SELECT
        feature_name,
        entity_type,
        COUNT(*) as total_checks,
        SUM(CASE WHEN is_drift THEN 1 ELSE 0 END) as drift_count,
        AVG(psi) as avg_psi,
        MAX(detected_at) as last_check
      FROM drift_logs
      WHERE detected_at > NOW() - INTERVAL '${days} days'
      GROUP BY feature_name, entity_type
      ORDER BY drift_count DESC
    `);

    return result.rows;
  }

  // Helper methods
  mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  stddev(values) {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }
}

export default new DriftMonitor();
