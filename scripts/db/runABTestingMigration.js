#!/usr/bin/env node
/**
 * Run A/B Testing Migration
 * Sprint 32 - Task 2
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
    console.log('🚀 Running A/B testing infrastructure migration...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, '../../db/migrations/2025_01_18_prompt_ab_testing.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration complete!\n');

    // Verify tables exist
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('prompt_executions', 'prompt_ab_tests')
      ORDER BY table_name
    `);

    console.log('📊 Created tables:');
    tables.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // Verify materialized view
    const views = await pool.query(`
      SELECT matviewname as view_name
      FROM pg_matviews
      WHERE matviewname = 'prompt_performance_metrics'
    `);

    if (views.rows.length > 0) {
      console.log('\n📊 Created materialized views:');
      views.rows.forEach(row => {
        console.log(`   ✓ ${row.view_name}`);
      });
    }

    console.log('\n✅ A/B testing infrastructure ready!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
