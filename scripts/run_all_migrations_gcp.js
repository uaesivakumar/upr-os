#!/usr/bin/env node

/**
 * Run ALL database migrations on GCP Cloud SQL
 * This initializes the entire database schema from scratch
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// GCP Cloud SQL connection
const pool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'UprApp2025!Pass31cd5b023e349c88',
  ssl: {
    rejectUnauthorized: false
  }
});

// All migrations in chronological order
const migrations = [
  '2025_10_16_campaign_system.sql',
  '2025_10_17_ml_infrastructure.sql',
  '2025_10_17_api_keys.sql',
  '2025_10_17_feature_store_enhancements.sql',
  '2025_10_17_drift_monitoring.sql',
  '2025_10_17_contextual_bandits.sql',
  '2025_10_17_model_registry_enhancements.sql',
  '2025_10_17_intelligence_reports.sql',
  '2025_10_19_phase0_multitenancy.sql',
  '2025_10_19_entity_resolution.sql',
  '2025_10_19_usage_tracking.sql',
  '2025_10_19_kb_chunks_rag_enhancements.sql',
  '2025_10_19_radar_module.sql',
  '2025_10_19_hiring_signals_recall_mode.sql',
  '2025_10_20_enrichment_jobs.sql',
  '2025_10_20_hiring_signals_grouped_views.sql',
  '2025_10_20_fix_entities_person_schema.sql',
  '2025_10_20_email_pattern_intelligence.sql',
  '2025_10_20_email_pattern_intelligence_v2.sql',
  '2025_10_20_email_pattern_intelligence_v3.sql',
  '2025_10_21_evidence_query_indexes.sql',
  '2025_10_21_nb_cache_and_token_bucket.sql',
  '2025_10_21_pattern_failure_learning.sql',
  '2025_10_22_domain_pattern_discovery.sql',
  '2025_10_22_fix_embedding_dimensions.sql',
  '2025_10_23_fix_signal_duplication.sql',
  '2025_10_25_outreach_telemetry.sql',
  '2025_10_25_hr_leads_favorite_irrelevant.sql',
  '2025_10_25_fix_company_uniqueness.sql',
  '2025_10_26_company_cache.sql',
  '2025_10_30_user_interactions_telemetry.sql',
  '2025_11_09_add_performance_indexes.sql',
  '2025_11_10_add_signal_confidence.sql',
  '2025_11_12_orchestration_runs.sql',
  '2025_11_12_deduplication_columns.sql',
  '2025_11_12_source_performance_tracking.sql'
];

async function runAllMigrations() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  GCP Cloud SQL - Complete Database Migration');
  console.log('  Running ALL migrations from scratch');
  console.log('════════════════════════════════════════════════════════\n');

  // Test connection
  const testClient = await pool.connect();
  try {
    await testClient.query('SELECT 1');
    console.log('✅ Database connection successful\n');
  } finally {
    testClient.release();
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (let i = 0; i < migrations.length; i++) {
    const migrationFile = migrations[i];
    const migrationPath = path.join(process.cwd(), 'db/migrations', migrationFile);

    console.log(`[${i + 1}/${migrations.length}] Running ${migrationFile}...`);

    if (!fs.existsSync(migrationPath)) {
      console.log(`⚠️  SKIP - File not found\n`);
      skipCount++;
      continue;
    }

    // Use a fresh connection for each migration to avoid transaction issues
    const client = await pool.connect();
    try {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await client.query(sql);
      console.log(`✅ SUCCESS\n`);
      successCount++;
    } catch (error) {
      console.log(`❌ FAIL - ${error.message}\n`);
      failCount++;

      // Don't stop on errors - some migrations may depend on data that doesn't exist yet
      // We'll continue and report issues at the end
    } finally {
      client.release();
    }
  }

  try {

    console.log('════════════════════════════════════════════════════════');
    console.log('  Migration Summary');
    console.log('════════════════════════════════════════════════════════');
    console.log(`Total migrations: ${migrations.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⚠️  Skipped: ${skipCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('════════════════════════════════════════════════════════\n');

    if (failCount > 0) {
      console.log('⚠️  Some migrations failed - database may be partially initialized');
      console.log('   This is expected for a fresh database with no seed data');
    } else {
      console.log('🟢 All migrations completed successfully!');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runAllMigrations().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
