// ml/mlService.js
// ML Service - Node.js wrapper for Python ML models

import { spawn } from 'child_process';
import { pool } from '../utils/db.js';
import featureEngine from './featureEngine.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ML Service - Node.js wrapper for Python ML models
 */
class MLService {

  /**
   * Predict conversion probability
   */
  async predictConversion(companyId, personId, emailContent) {
    try {
      // 1. Get features
      const companyFeatures = await featureEngine.getFeatures('company', companyId);
      const personFeatures = await featureEngine.getFeatures('person', personId);
      const emailFeatures = await featureEngine.computeEmailFeatures(emailContent);

      const allFeatures = {
        ...companyFeatures,
        ...personFeatures,
        ...emailFeatures
      };

      // 2. Call Python model
      const prediction = await this.callPythonModel('conversionPredictor', allFeatures);

      // 3. Store prediction
      await this.storePrediction('conversion_predictor', 'email', null, prediction);

      return prediction;
    } catch (error) {
      console.error('[MLService] Conversion prediction error:', error);
      // Return default prediction on error
      return { probability: 0.3, confidence: 0.5 };
    }
  }

  /**
   * Optimize send time
   */
  async optimizeSendTime(companyId, personId) {
    try {
      const company = await pool.query('SELECT industry FROM companies WHERE id = $1', [companyId]);
      const person = await pool.query('SELECT function FROM people WHERE id = $1', [personId]);

      if (company.rows.length === 0 || person.rows.length === 0) {
        // Return default: Tuesday 10 AM
        return {
          day_of_week: 2,
          hour_of_day: 10,
          predicted_open_rate: 0.3
        };
      }

      const input = {
        industry: company.rows[0].industry || 'unknown',
        function: person.rows[0].function || 'unknown'
      };

      const result = await this.callPythonModel('sendTimeOptimizer', input);

      return result;
    } catch (error) {
      console.error('[MLService] Send time optimization error:', error);
      // Return default: Tuesday 10 AM
      return {
        day_of_week: 2,
        hour_of_day: 10,
        predicted_open_rate: 0.3
      };
    }
  }

  /**
   * Call Python model via subprocess
   */
  async callPythonModel(modelName, input) {
    return new Promise((resolve, reject) => {
      const pythonPath = 'python3';
      const scriptPath = path.join(__dirname, 'models', `${modelName}.py`);

      const python = spawn(pythonPath, [
        scriptPath,
        '--predict',
        JSON.stringify(input)
      ], {
        env: { ...process.env }
      });

      let output = '';
      let error = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        error += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error(`[MLService] Python process exited with code ${code}`);
          console.error(`[MLService] Error: ${error}`);
          reject(new Error(`Python process exited with code ${code}: ${error}`));
        } else {
          try {
            const result = JSON.parse(output.trim());
            resolve(result);
          } catch (e) {
            console.error(`[MLService] Failed to parse Python output: ${output}`);
            reject(new Error(`Failed to parse Python output: ${output}`));
          }
        }
      });

      python.on('error', (err) => {
        reject(new Error(`Failed to start Python process: ${err.message}`));
      });
    });
  }

  /**
   * Store prediction for later evaluation
   */
  async storePrediction(modelName, entityType, entityId, prediction) {
    try {
      // Get latest deployed model
      const model = await pool.query(`
        SELECT id FROM ml_models
        WHERE model_name = $1 AND status = 'deployed'
        ORDER BY deployed_at DESC
        LIMIT 1
      `, [modelName]);

      if (model.rows.length === 0) {
        console.warn(`[MLService] No deployed model found for ${modelName}`);
        return;
      }

      await pool.query(`
        INSERT INTO ml_predictions (
          model_id, model_name, entity_type, entity_id,
          prediction, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        model.rows[0].id,
        modelName,
        entityType,
        entityId,
        JSON.stringify(prediction),
        prediction.probability || prediction.score || prediction.confidence || null
      ]);
    } catch (error) {
      console.error('[MLService] Error storing prediction:', error);
    }
  }

  /**
   * Train all models (scheduled job)
   */
  async trainAllModels() {
    console.log('[MLService] Starting model training...');

    try {
      // Train conversion predictor
      await this.trainModel('conversionPredictor');

      // Train send time optimizer
      await this.trainModel('sendTimeOptimizer');

      console.log('[MLService] ✅ Model training complete');
    } catch (error) {
      console.error('[MLService] ❌ Model training failed:', error);
      throw error;
    }
  }

  async trainModel(modelName) {
    return new Promise((resolve, reject) => {
      console.log(`[MLService] Training ${modelName}...`);

      const pythonPath = 'python3';
      const scriptPath = path.join(__dirname, 'models', `${modelName}.py`);

      const python = spawn(pythonPath, [scriptPath], {
        env: { ...process.env }
      });

      python.stdout.on('data', (data) => {
        console.log(`[${modelName}] ${data.toString().trim()}`);
      });

      python.stderr.on('data', (data) => {
        console.error(`[${modelName}] ${data.toString().trim()}`);
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Training ${modelName} failed with code ${code}`));
        } else {
          console.log(`[MLService] ✅ ${modelName} training complete`);
          resolve();
        }
      });

      python.on('error', (err) => {
        reject(new Error(`Failed to start training for ${modelName}: ${err.message}`));
      });
    });
  }
}

export default new MLService();
