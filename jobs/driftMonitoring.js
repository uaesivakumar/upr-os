// jobs/driftMonitoring.js
// Drift Monitoring Job - Runs daily

import cron from 'node-cron';
import driftMonitor from '../ml/driftMonitor.js';

/**
 * Drift Monitoring Job - Runs daily at 4 AM
 */
class DriftMonitoringJob {

  constructor() {
    // Run every day at 4 AM
    cron.schedule('0 4 * * *', () => {
      this.runMonitoring().catch(err => {
        console.error('[DriftMonitoring] Error:', err);
      });
    });

    console.log('[DriftMonitoring] Cron job scheduled for 4 AM daily');
  }

  async runMonitoring() {
    console.log('[DriftMonitoring] Starting daily drift check...');

    try {
      // Monitor key features
      const keyFeatures = [
        'hiring_signals_90d',
        'open_rate',
        'reply_rate',
        'days_since_last_contact',
        'subject_length',
        'body_word_count',
        'personalization_level',
        'readability_score'
      ];

      for (const feature of keyFeatures) {
        try {
          await driftMonitor.monitorFeatureDrift(feature, 'company');
        } catch (error) {
          console.error(`[DriftMonitoring] Error monitoring ${feature}:`, error);
        }
      }

      // Monitor model calibration
      try {
        await driftMonitor.monitorPredictionDrift('conversion_predictor');
      } catch (error) {
        console.error('[DriftMonitoring] Error monitoring model drift:', error);
      }

      // Get summary
      const summary = await driftMonitor.getDriftSummary(7);
      console.log('[DriftMonitoring] Summary:', summary);

      console.log('[DriftMonitoring] Drift check complete');

    } catch (error) {
      console.error('[DriftMonitoring] Error:', error);
    }
  }

  /**
   * Run monitoring immediately (for testing)
   */
  async runNow() {
    await this.runMonitoring();
  }
}

const job = new DriftMonitoringJob();
export default job;
