#!/usr/bin/env node

/**
 * Sprint 19 Database Seeder
 * Seeds GCP Cloud SQL with realistic test data for smoke tests
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// GCP Cloud SQL connection (external IP)
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

async function seedDatabase() {
  const client = await pool.connect();

  try {
    console.log('════════════════════════════════════════════════════════');
    console.log('  Sprint 19 Database Seeder');
    console.log('  Seeding GCP Cloud SQL with test data');
    console.log('════════════════════════════════════════════════════════\n');

    // Read the SQL file
    const sqlPath = path.join(process.cwd(), 'db/seed_sprint19_simple.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('[1/1] Running seed script...');
    await client.query(sql);
    console.log('✅ Seed script completed successfully\n');

    // Verify seeded data
    console.log('Verifying seeded data:');
    console.log('------------------------------------------------------------');

    const verifyQueries = [
      { name: 'source_performance_metrics', query: 'SELECT COUNT(*) FROM source_performance_metrics' },
      { name: 'source_health', query: 'SELECT COUNT(*) FROM source_health' },
      { name: 'hiring_signals (with quality)', query: 'SELECT COUNT(*) FROM hiring_signals WHERE quality_score IS NOT NULL' },
      { name: 'orchestration_runs', query: 'SELECT COUNT(*) FROM orchestration_runs' }
    ];

    for (const { name, query } of verifyQueries) {
      const result = await client.query(query);
      console.log(`  ${name}: ${result.rows[0].count} rows`);
    }

    console.log('\n════════════════════════════════════════════════════════');
    console.log('🟢 Database seeding completed successfully!');
    console.log('════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
