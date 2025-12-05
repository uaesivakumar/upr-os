#!/usr/bin/env node
/**
 * Run S73 Config Migration
 * Sprint 73 - Configuration Migration
 *
 * Creates tables:
 * - llm_vertical_model_preferences
 * - scoring_config
 * - prompt_templates
 * - campaign_scoring_config
 * - lifecycle_stage_keywords
 * - company_size_bands
 * - provider_health_thresholds
 * - email_pattern_config
 * - confidence_thresholds
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🚀 Running S73 Config Migration...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, '../../db/migrations/2025_12_05_s73_config_migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Execute migration
    await pool.query(migrationSQL);

    // Verify installation - check each table
    console.log('✅ Migration complete! Verifying tables...\n');

    const tables = [
      'llm_vertical_model_preferences',
      'scoring_config',
      'prompt_templates',
      'campaign_scoring_config',
      'lifecycle_stage_keywords',
      'company_size_bands',
      'provider_health_thresholds',
      'email_pattern_config',
      'confidence_thresholds'
    ];

    for (const table of tables) {
      const result = await pool.query(`
        SELECT COUNT(*) as count FROM ${table}
      `);
      console.log(`   📊 ${table}: ${result.rows[0].count} rows`);
    }

    // Check helper functions
    console.log('\n   🔧 Checking helper functions...');
    const functions = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN ('get_vertical_model_preferences', 'get_scoring_config')
    `);
    functions.rows.forEach(row => {
      console.log(`   ✓ ${row.routine_name}()`);
    });

    console.log('\n✅ S73 Config Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
