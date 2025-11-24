/**
 * Run Agent Core Persistence Migration
 * Sprint 20 Task 2
 */

const fs = require('fs');
const path = require('path');
const db = require('../utils/db');

async function runMigration() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗄️  Running Agent Core Persistence Migration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../db/migrations/2025_11_14_agent_core_persistence.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📂 Migration file loaded:', migrationPath);
    console.log('📏 Size:', migrationSQL.length, 'bytes\n');

    // Execute migration
    console.log('⚙️  Executing migration...\n');
    await db.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables created
    console.log('🔍 Verifying tables...\n');

    const tablesQuery = `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename LIKE 'agent_%' OR tablename LIKE 'persona_%')
      ORDER BY tablename
    `;

    const tables = await db.query(tablesQuery);
    console.log('   Tables created:');
    tables.rows.forEach(row => {
      console.log('   ✓', row.tablename);
    });

    // Verify views created
    const viewsQuery = `
      SELECT viewname
      FROM pg_views
      WHERE schemaname = 'public'
        AND viewname LIKE 'agent_%'
      ORDER BY viewname
    `;

    const views = await db.query(viewsQuery);
    console.log('\n   Views created:');
    views.rows.forEach(row => {
      console.log('   ✓', row.viewname);
    });

    // Check persona_versions seed data
    const personaQuery = 'SELECT version, is_active, is_production FROM persona_versions';
    const personas = await db.query(personaQuery);
    console.log('\n   Persona versions:');
    personas.rows.forEach(row => {
      console.log(`   ✓ ${row.version} (active: ${row.is_active}, production: ${row.is_production})`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Agent Core Persistence Layer Ready!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  }
}

runMigration();
