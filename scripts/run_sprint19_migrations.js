#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL || 'postgresql://upr_postgres_user:dCO8kY3mpy7WhAnwrNCdcb69LiVf7eGi@dpg-d2venebipnbc73cjpa30-a.frankfurt-postgres.render.com:5432/upr_postgres?sslmode=require';

const pool = new Pool({
  connectionString: DB_URL
});

const migrations = [
  'db/migrations/2025_11_12_orchestration_runs.sql',
  'db/migrations/2025_11_12_deduplication_columns.sql',
  'db/migrations/2025_11_12_source_performance_tracking.sql'
];

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('Running Sprint 19 migrations...\n');

    for (const migrationFile of migrations) {
      const migrationPath = path.join(process.cwd(), migrationFile);

      if (!fs.existsSync(migrationPath)) {
        console.log(`⚠️  Skipping ${migrationFile} (file not found)`);
        continue;
      }

      console.log(`Running ${migrationFile}...`);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      await client.query(sql);
      console.log(`✅ ${migrationFile} completed\n`);
    }

    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Error running migrations:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
