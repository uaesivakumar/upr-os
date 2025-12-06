#!/usr/bin/env node
/**
 * Run S50-S55 OS Migrations
 * Sprint 50: API Provider Registry
 * Sprint 51: LLM Router
 * Sprint 52: Vertical Pack System
 * Sprint 53: Territory Management
 * Sprint 55: OS Kernel Config
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../../utils/db');

const MIGRATIONS = [
  '2025_11_29_s50_api_provider_registry.sql',
  '2025_11_29_s51_llm_router.sql',
  '2025_11_30_s52_vertical_pack_system.sql',
  '2025_11_30_s53_territory_management.sql',
  '2025_11_30_s55_os_kernel_config.sql',
  '2025_12_06_fix_s55_fk_constraint.sql',  // Must run before cleanup
  '2025_12_06_cleanup_seed_data.sql',
];

async function runMigrations() {
  console.log('🚀 Running S50-S55 OS Migrations...\n');

  for (const migration of MIGRATIONS) {
    const migrationPath = path.join(__dirname, '../../db/migrations', migration);

    if (!fs.existsSync(migrationPath)) {
      console.log(`⚠️  Skipping ${migration} - file not found`);
      continue;
    }

    console.log(`📦 Running: ${migration}`);

    try {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await pool.query(sql);
      console.log(`   ✅ ${migration} - Success`);
    } catch (error) {
      // Check if it's a "already exists" error - that's OK
      if (error.code === '42P07' || error.message.includes('already exists')) {
        console.log(`   ℹ️  ${migration} - Already applied (table exists)`);
      } else if (error.code === '42710' || error.message.includes('already exists')) {
        console.log(`   ℹ️  ${migration} - Already applied (object exists)`);
      } else {
        console.error(`   ❌ ${migration} - Failed:`, error.message);
      }
    }
  }

  // Verify key tables
  console.log('\n🔍 Verifying tables...');
  const tables = [
    'api_providers',
    'llm_providers',
    'llm_models',
    'vertical_packs',
    'vertical_model_preferences',
    'territories',
    'os_config_namespaces',
    'os_kernel_config',
    'os_kernel_config_versions'
  ];

  for (const table of tables) {
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count FROM ${table}
      `);
      console.log(`   ✓ ${table}: ${result.rows[0].count} rows`);
    } catch (err) {
      if (err.code === '42P01') {
        console.log(`   ✗ ${table}: TABLE DOES NOT EXIST`);
      } else {
        console.log(`   ? ${table}: ERROR - ${err.message}`);
      }
    }
  }

  console.log('\n✅ Migration complete!');
  await pool.end();
}

runMigrations().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
