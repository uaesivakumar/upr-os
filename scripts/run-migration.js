#!/usr/bin/env node
// scripts/run-migration.js
// Run database migrations from db/migrations directory

import { pool } from '../utils/db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration(migrationFile) {
  console.log(`\n📦 Running migration: ${migrationFile}\n`);

  try {
    const migrationPath = join(__dirname, '..', 'db', 'migrations', migrationFile);
    const sql = readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await pool.query(sql);

    console.log(`✅ Migration completed successfully: ${migrationFile}\n`);
  } catch (error) {
    console.error(`❌ Migration failed: ${migrationFile}`);
    console.error(error);
    throw error;
  }
}

async function main() {
  const migrationFile = process.argv[2] || '2025_10_16_campaign_system.sql';

  console.log('🚀 Campaign System Migration Runner\n');
  console.log(`Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  try {
    // Test database connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Run the migration
    await runMigration(migrationFile);

    // Verify campaign types were seeded
    const { rows } = await pool.query('SELECT category, COUNT(*) as count FROM campaign_types GROUP BY category ORDER BY category');

    console.log('📊 Campaign Types Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let total = 0;
    rows.forEach(row => {
      const displayName = row.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      console.log(`  ${displayName}: ${row.count} campaigns`);
      total += parseInt(row.count);
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Total: ${total} campaigns\n`);

    console.log('🎉 Campaign system migration completed successfully!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

main();
