#!/usr/bin/env node

const { Pool } = require('pg');

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

async function checkTables() {
  const client = await pool.connect();

  try {
    // Get all tables
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n════════════════════════════════════════════════════════');
    console.log('  GCP Cloud SQL - Database Tables');
    console.log('════════════════════════════════════════════════════════\n');

    if (result.rows.length === 0) {
      console.log('❌ No tables found in database\n');
    } else {
      console.log(`Found ${result.rows.length} tables:\n`);
      result.rows.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.table_name}`);
      });
      console.log('');
    }

    // Check for Sprint 19 specific tables
    console.log('Sprint 19 Required Tables:');
    console.log('------------------------------------------------------------');
    const sprint19Tables = [
      'orchestration_runs',
      'source_health',
      'source_performance_metrics',
      'hiring_signals'
    ];

    for (const table of sprint19Tables) {
      const exists = result.rows.some(r => r.table_name === table);
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    }
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables();
