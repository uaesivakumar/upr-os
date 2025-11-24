// jobs/mlPipeline.js
// ML Pipeline - Automated model retraining and continuous learning

import cron from 'node-cron';
import mlService from '../ml/mlService.js';
import featureEngine from '../ml/featureEngine.js';
import { pool } from '../utils/db.js';

/**
 * ML Pipeline - Automated model retraining
 */
class MLPipeline {

  constructor() {
    // Retrain models weekly on Sundays at 3 AM
    cron.schedule('0 3 * * 0', () => {
      this.runPipeline();
    });

    console.log('[MLPipeline] Scheduled weekly retraining (Sundays 3 AM)');
  }

  async runPipeline() {
    console.log('[MLPipeline] 🚀 Starting weekly retraining pipeline...');

    try {
      const startTime = Date.now();

      // 1. Compute features for all new entities
      await this.computeFeatures();

      // 2. Retrain models
      await mlService.trainAllModels();

      // 3. Evaluate model performance
      await this.evaluateModels();

      // 4. Deploy if performance improved
      await this.deployBestModels();

      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
      console.log(`[MLPipeline] ✅ Pipeline complete in ${duration} minutes`);

    } catch (error) {
      console.error('[MLPipeline] ❌ Pipeline error:', error);
    }
  }

  async computeFeatures() {
    console.log('[MLPipeline] Computing features for new entities...');

    try {
      // Compute features for companies without features
      const companies = await pool.query(`
        SELECT id FROM companies
        WHERE id NOT IN (
          SELECT entity_id FROM feature_store
          WHERE entity_type = 'company' AND feature_version = 'v1'
        )
        LIMIT 1000
      `);

      console.log(`[MLPipeline] Computing features for ${companies.rows.length} companies`);

      for (const c of companies.rows) {
        try {
          const features = await featureEngine.computeCompanyFeatures(c.id);
          await featureEngine.saveFeatures('company', c.id, features, 'v1');
        } catch (error) {
          console.error(`[MLPipeline] Error computing features for company ${c.id}:`, error.message);
        }
      }

      // Compute features for people without features
      const people = await pool.query(`
        SELECT id FROM people
        WHERE id NOT IN (
          SELECT entity_id FROM feature_store
          WHERE entity_type = 'person' AND feature_version = 'v1'
        )
        LIMIT 1000
      `);

      console.log(`[MLPipeline] Computing features for ${people.rows.length} people`);

      for (const p of people.rows) {
        try {
          const features = await featureEngine.computePersonFeatures(p.id);
          await featureEngine.saveFeatures('person', p.id, features, 'v1');
        } catch (error) {
          console.error(`[MLPipeline] Error computing features for person ${p.id}:`, error.message);
        }
      }

      console.log('[MLPipeline] ✅ Feature computation complete');

    } catch (error) {
      console.error('[MLPipeline] Feature computation error:', error);
    }
  }

  async evaluateModels() {
    console.log('[MLPipeline] Evaluating model performance...');

    try {
      // Compare predictions vs actual outcomes
      const result = await pool.query(`
        SELECT
          mp.model_name,
          AVG(ABS((mp.prediction->>'probability')::numeric -
                  CASE WHEN eo.converted THEN 1 ELSE 0 END)) as mae,
          COUNT(*) as sample_size
        FROM ml_predictions mp
        JOIN email_outcomes eo ON eo.id = mp.entity_id::uuid
        WHERE
          mp.entity_type = 'email'
          AND eo.sent_at > NOW() - INTERVAL '7 days'
        GROUP BY mp.model_name
      `);

      console.log('[MLPipeline] 📊 Model Performance:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      result.rows.forEach(r => {
        console.log(`  ${r.model_name}:`);
        console.log(`    MAE: ${parseFloat(r.mae).toFixed(4)}`);
        console.log(`    Samples: ${r.sample_size}`);
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
      console.error('[MLPipeline] Evaluation error:', error);
    }
  }

  async deployBestModels() {
    console.log('[MLPipeline] Deploying best-performing models...');

    try {
      // For now, latest models are auto-deployed during training
      // In production, you'd compare performance and only deploy if improved

      const deployedModels = await pool.query(`
        SELECT model_name, model_version, deployed_at, metrics
        FROM ml_models
        WHERE status = 'deployed'
        ORDER BY deployed_at DESC
      `);

      console.log('[MLPipeline] 📦 Currently Deployed Models:');
      deployedModels.rows.forEach(m => {
        console.log(`  ${m.model_name} v${m.model_version} (deployed ${new Date(m.deployed_at).toLocaleDateString()})`);
      });

    } catch (error) {
      console.error('[MLPipeline] Deployment error:', error);
    }
  }

  /**
   * Run pipeline immediately (for manual trigger)
   */
  async runNow() {
    return this.runPipeline();
  }
}

const pipeline = new MLPipeline();
export default pipeline;
