#!/usr/bin/env node

/**
 * Apply Sprint 19 migrations to GCP Cloud SQL
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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

async function applyMigrations() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  Sprint 19 Database Migrations');
  console.log('  Applying to GCP Cloud SQL');
  console.log('════════════════════════════════════════════════════════\n');

  const migrations = [
    '2025_11_12_orchestration_runs_fixed.sql',
    '2025_11_12_sprint19_columns.sql',
    '2025_11_12_deduplication_columns.sql',
    '2025_11_12_source_performance_tracking.sql'
  ];

  let successCount = 0;

  for (let i = 0; i < migrations.length; i++) {
    const migrationFile = migrations[i];
    const migrationPath = path.join(process.cwd(), 'db/migrations', migrationFile);

    console.log(`[${i + 1}/${migrations.length}] Running ${migrationFile}...`);

    if (!fs.existsSync(migrationPath)) {
      console.log(`⚠️  SKIP - File not found\n`);
      continue;
    }

    const client = await pool.connect();
    try {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await client.query(sql);
      console.log(`✅ SUCCESS\n`);
      successCount++;
    } catch (error) {
      console.log(`❌ FAIL - ${error.message}\n`);
    } finally {
      client.release();
    }
  }

  await pool.end();

  console.log('════════════════════════════════════════════════════════');
  console.log(`✅ Applied ${successCount}/${migrations.length} migrations successfully`);
  console.log('════════════════════════════════════════════════════════\n');
}

applyMigrations().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
