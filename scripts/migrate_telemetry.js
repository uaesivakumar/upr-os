#!/usr/bin/env node
/**
 * Telemetry Table Migration Script
 *
 * This script creates the user_interactions table for telemetry tracking.
 * Can be run from Cloud Run environment where DATABASE_URL is available.
 *
 * Usage:
 *   node scripts/migrate_telemetry.js
 */

const { Pool } = require('pg');

const createTableSQL = `
-- Check and create telemetry table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'user_interactions'
    ) THEN
        -- Create table
        CREATE TABLE user_interactions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          session_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_context JSONB DEFAULT '{}',
          page_path TEXT,
          timestamp TIMESTAMP DEFAULT NOW(),

          CONSTRAINT valid_event_type CHECK (event_type IN (
            'enrichment_start',
            'enrichment_complete',
            'drawer_open',
            'drawer_close',
            'lead_save',
            'cluster_view',
            'explainability_view',
            'verify_click',
            'draft_outreach',
            'search_company',
            'refine_url',
            'filter_change'
          ))
        );

        -- Create indexes
        CREATE INDEX idx_user_interactions_user_id ON user_interactions(user_id);
        CREATE INDEX idx_user_interactions_event_type ON user_interactions(event_type);
        CREATE INDEX idx_user_interactions_timestamp ON user_interactions(timestamp DESC);
        CREATE INDEX idx_user_interactions_session ON user_interactions(session_id);
        CREATE INDEX idx_user_interactions_context ON user_interactions USING GIN (event_context);

        -- Grant permissions
        GRANT ALL ON user_interactions TO upr_app;
        GRANT USAGE, SELECT ON SEQUENCE user_interactions_id_seq TO upr_app;

        RAISE NOTICE 'Table user_interactions created successfully';
    ELSE
        RAISE NOTICE 'Table user_interactions already exists';
    END IF;
END $$;
`;

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable not set');
    process.exit(1);
  }

  console.log('🔄 Connecting to database...');

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    console.log('📊 Running telemetry table migration...');
    const result = await pool.query(createTableSQL);
    console.log('✅ Migration completed successfully');

    // Verify table exists
    console.log('🔍 Verifying table creation...');
    const verifyResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'user_interactions'
      ) AS table_exists;
    `);

    if (verifyResult.rows[0].table_exists) {
      console.log('✅ Table user_interactions exists');

      // Get table structure
      const structureResult = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'user_interactions'
        ORDER BY ordinal_position;
      `);

      console.log('\n📋 Table structure:');
      structureResult.rows.forEach(row => {
        console.log(`   ${row.column_name}: ${row.data_type}`);
      });

      console.log('\n🎉 Telemetry system ready for production use!');
    } else {
      console.error('❌ Table verification failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
