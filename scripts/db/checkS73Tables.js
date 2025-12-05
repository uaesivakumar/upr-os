#!/usr/bin/env node
/**
 * Check S73 Tables - Diagnostic script
 */

const { pool } = require('../../utils/db');

async function checkTables() {
  try {
    console.log('🔍 Checking S73 Tables...\n');

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
      try {
        const result = await pool.query(`
          SELECT COUNT(*) as count FROM ${table}
        `);
        console.log(`✓ ${table}: ${result.rows[0].count} rows`);
      } catch (err) {
        if (err.code === '42P01') {
          console.log(`✗ ${table}: TABLE DOES NOT EXIST`);
        } else {
          console.log(`? ${table}: ERROR - ${err.message}`);
        }
      }
    }

    // Check helper functions
    console.log('\n🔧 Checking helper functions...');
    const functions = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN ('get_vertical_model_preferences', 'get_scoring_config')
    `);

    if (functions.rows.length === 0) {
      console.log('✗ No helper functions found');
    } else {
      functions.rows.forEach(row => {
        console.log(`✓ ${row.routine_name}()`);
      });
    }

    console.log('\n✅ Diagnostic complete');

  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkTables();
