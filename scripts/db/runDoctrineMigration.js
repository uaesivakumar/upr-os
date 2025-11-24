#!/usr/bin/env node
/**
 * Run Doctrine Prompts Migration
 * Sprint 32 - Task 1
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
    console.log('🚀 Running doctrine prompts migration...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, '../../db/migrations/2025_01_18_doctrine_prompts.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Execute migration
    await pool.query(migrationSQL);

    // Verify installation
    const result = await pool.query(`
      SELECT name, version, active, created_at
      FROM prompt_versions
      WHERE name IN ('company_research', 'contact_qualification', 'outreach_strategy')
        AND version = 'v1.0-doctrine'
      ORDER BY name
    `);

    console.log(`✅ Migration complete! Installed ${result.rows.length} doctrine prompts:\n`);
    result.rows.forEach(row => {
      console.log(`   📝 ${row.name}`);
      console.log(`      Version: ${row.version}`);
      console.log(`      Active: ${row.active}`);
      console.log(`      Created: ${row.created_at}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
