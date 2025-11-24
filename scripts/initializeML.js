#!/usr/bin/env node
// scripts/initializeML.js
// Initialize ML system - compute features and train initial models

import { pool } from '../utils/db.js';
import featureEngine from '../ml/featureEngine.js';
import mlService from '../ml/mlService.js';

async function main() {
  console.log('🚀 ML System Initialization\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Test database connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Step 1: Compute features for existing entities
    console.log('Step 1: Computing features for existing entities...\n');

    const companies = await pool.query('SELECT id, name FROM companies LIMIT 100');
    console.log(`Found ${companies.rows.length} companies`);

    for (let i = 0; i < Math.min(companies.rows.length, 10); i++) {
      const company = companies.rows[i];
      try {
        console.log(`  Computing features for ${company.name}...`);
        const features = await featureEngine.computeCompanyFeatures(company.id);
        await featureEngine.saveFeatures('company', company.id, features, 'v1');
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
      }
    }

    console.log('✅ Sample features computed\n');

    // Step 2: Train initial models
    console.log('Step 2: Training initial ML models...\n');

    try {
      await mlService.trainAllModels();
      console.log('✅ Models trained successfully\n');
    } catch (error) {
      console.log(`⚠️  Model training skipped (insufficient data or Python not configured): ${error.message}\n`);
    }

    // Step 3: Verify setup
    console.log('Step 3: Verifying ML infrastructure...\n');

    const featureCount = await pool.query('SELECT COUNT(*) FROM feature_store');
    console.log(`  Features stored: ${featureCount.rows[0].count}`);

    const modelCount = await pool.query('SELECT COUNT(*) FROM ml_models');
    console.log(`  Models registered: ${modelCount.rows[0].count}`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 ML System Initialization Complete!\n');

    console.log('Next steps:');
    console.log('1. Install Python dependencies: pip install -r ml/requirements.txt');
    console.log('2. Train models: python3 ml/models/conversionPredictor.py');
    console.log('3. Start using ML predictions in your emails!\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

main();
