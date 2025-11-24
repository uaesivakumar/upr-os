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

async function checkSchema() {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'hiring_signals'
      ORDER BY ordinal_position
    `);

    console.log('\n════════════════════════════════════════════════════════');
    console.log('  hiring_signals Table Schema');
    console.log('════════════════════════════════════════════════════════\n');

    result.rows.forEach(row => {
      console.log(`  ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log('');

    // Check for Sprint 19 required columns
    console.log('Sprint 19 Required Columns:');
    console.log('------------------------------------------------------------');
    const requiredColumns = [
      'confidence_score',
      'quality_score',
      'quality_tier',
      'quality_breakdown',
      'dedupe_hash'
    ];

    for (const col of requiredColumns) {
      const exists = result.rows.some(r => r.column_name === col);
      console.log(`  ${exists ? '✅' : '❌'} ${col}`);
    }
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkSchema();
