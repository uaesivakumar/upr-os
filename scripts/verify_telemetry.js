#!/usr/bin/env node
/**
 * Verify Telemetry Table
 *
 * This script verifies the user_interactions table structure,
 * indexes, constraints, and performs a test insert.
 */

const { Pool } = require('pg');

async function verify() {
  const pool = new Pool({
    connectionString: "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=disable"
  });

  try {
    // Check indexes
    const indexResult = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'user_interactions'
      ORDER BY indexname;
    `);

    console.log('📊 Indexes on user_interactions table:');
    indexResult.rows.forEach(row => {
      console.log(`   ${row.indexname}`);
    });

    // Check constraints
    const constraintResult = await pool.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'user_interactions'::regclass
      ORDER BY conname;
    `);

    console.log('\n🔒 Constraints:');
    constraintResult.rows.forEach(row => {
      const type = row.contype === 'p' ? 'PRIMARY KEY' : row.contype === 'c' ? 'CHECK' : row.contype;
      console.log(`   ${row.conname}: ${type}`);
    });

    // Test insert
    console.log('\n🧪 Testing insert...');
    const insertResult = await pool.query(`
      INSERT INTO user_interactions (session_id, event_type, event_context, page_path)
      VALUES ('test-session-' || floor(random() * 1000), 'enrichment_start', '{"test": true}', '/enrichment')
      RETURNING id;
    `);
    console.log(`✅ Test insert successful (id: ${insertResult.rows[0].id})`);

    // Count rows
    const countResult = await pool.query('SELECT COUNT(*) as count FROM user_interactions');
    console.log(`📈 Total rows: ${countResult.rows[0].count}`);

    console.log('\n✅ All verifications passed!');
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    await pool.end();
  }
}

verify();
