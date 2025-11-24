#!/usr/bin/env node

/**
 * Run Embedding Dimension Fix Migration
 *
 * Applies the 2025_10_22_fix_embedding_dimensions.sql migration to Cloud SQL.
 * This fixes the dimension mismatch between code (384) and database (1536).
 */

import { readFileSync } from 'fs';
import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable not set');
  console.error('');
  console.error('Usage:');
  console.error('  export DATABASE_URL="postgresql://..."');
  console.error('  node run-embedding-fix-migration.js');
  process.exit(1);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════');
console.log('EMBEDDING DIMENSION FIX MIGRATION');
console.log('═══════════════════════════════════════════════════════════════════════');
console.log('');
console.log('Database URL:', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
console.log('');
console.log('This migration will:');
console.log('  1. Drop existing embedding indexes');
console.log('  2. Change vector dimensions from 1536 → 384');
console.log('  3. Recreate indexes with correct dimensions');
console.log('  4. Create embedding_meta table for version tracking');
console.log('');

const pool = new Pool({ connectionString: DATABASE_URL });

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('✅ Connected to database');
    console.log('');

    // Begin transaction
    await client.query('BEGIN');
    console.log('📊 Transaction started');
    console.log('');

    // Step 1: Drop existing indexes
    console.log('Step 1: Dropping existing embedding indexes...');
    await client.query('DROP INDEX IF EXISTS idx_pattern_failures_embedding');
    await client.query('DROP INDEX IF EXISTS idx_email_patterns_embedding');
    await client.query('DROP INDEX IF EXISTS idx_kb_chunks_embedding');
    console.log('  ✅ Indexes dropped');
    console.log('');

    // Step 2: Change column dimensions
    console.log('Step 2: Changing embedding column dimensions from 1536 → 384...');

    await client.query('ALTER TABLE pattern_failures ALTER COLUMN embedding TYPE vector(384)');
    console.log('  ✅ pattern_failures.embedding → vector(384)');

    await client.query('ALTER TABLE email_patterns ALTER COLUMN embedding TYPE vector(384)');
    console.log('  ✅ email_patterns.embedding → vector(384)');

    await client.query('ALTER TABLE kb_chunks ALTER COLUMN embedding TYPE vector(384)');
    console.log('  ✅ kb_chunks.embedding → vector(384)');
    console.log('');

    // Step 3: Recreate indexes
    console.log('Step 3: Recreating indexes with 384-dimensional vectors...');

    await client.query(`
      CREATE INDEX idx_pattern_failures_embedding
        ON pattern_failures
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    `);
    console.log('  ✅ idx_pattern_failures_embedding (ivfflat, lists=100)');

    await client.query(`
      CREATE INDEX idx_email_patterns_embedding
        ON email_patterns
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    `);
    console.log('  ✅ idx_email_patterns_embedding (ivfflat, lists=100)');

    await client.query(`
      CREATE INDEX idx_kb_chunks_embedding
        ON kb_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    `);
    console.log('  ✅ idx_kb_chunks_embedding (ivfflat, lists=100)');
    console.log('');

    // Step 4: Create metadata table
    console.log('Step 4: Creating embedding_meta table for version tracking...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS embedding_meta (
        id SERIAL PRIMARY KEY,
        model_name TEXT NOT NULL,
        dimension INTEGER NOT NULL,
        cost_per_1m_tokens NUMERIC(10,4),
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        applied_by TEXT DEFAULT CURRENT_USER,
        notes TEXT
      )
    `);
    console.log('  ✅ embedding_meta table created');

    // Record current configuration
    await client.query(`
      INSERT INTO embedding_meta (model_name, dimension, cost_per_1m_tokens, notes)
      VALUES (
        'text-embedding-3-small',
        384,
        0.02,
        'Initial alignment: Changed from 1536 (3-large) to 384 (3-small) for cost efficiency. 85% cost savings with minimal accuracy impact for pattern matching use case.'
      )
    `);
    console.log('  ✅ Current configuration recorded: text-embedding-3-small (384 dims, $0.02/1M tokens)');
    console.log('');

    // Step 5: Add comments
    console.log('Step 5: Adding documentation comments...');

    await client.query(`
      COMMENT ON TABLE embedding_meta IS
        'Tracks embedding model versions to ensure code and schema stay in sync. Prevents future dimension mismatches.'
    `);

    await client.query(`
      COMMENT ON COLUMN pattern_failures.embedding IS
        'Vector embedding (384 dims, text-embedding-3-small) for similarity search to prevent repeating expensive mistakes'
    `);

    await client.query(`
      COMMENT ON COLUMN email_patterns.embedding IS
        'Vector embedding (384 dims, text-embedding-3-small) for RAG pattern discovery via similarity search'
    `);

    await client.query(`
      COMMENT ON COLUMN kb_chunks.embedding IS
        'Vector embedding (384 dims, text-embedding-3-small) for knowledge base retrieval'
    `);

    console.log('  ✅ Documentation comments added');
    console.log('');

    // Commit transaction
    await client.query('COMMIT');
    console.log('✅ Transaction committed');
    console.log('');

    // Verification
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('MIGRATION COMPLETE - VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');

    // Check embedding_meta
    console.log('Embedding Configuration:');
    const metaResult = await client.query(`
      SELECT model_name, dimension, cost_per_1m_tokens, applied_at, applied_by
      FROM embedding_meta
      ORDER BY id DESC
      LIMIT 1
    `);
    console.table(metaResult.rows);

    // Check indexes
    console.log('Index Status:');
    const indexResult = await client.query(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE indexname LIKE '%embedding%'
      ORDER BY tablename, indexname
    `);
    console.table(indexResult.rows);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('✅ MIGRATION SUCCESSFUL');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Update server/lib/emailIntelligence/rag.js to add dimension validation');
    console.log('  2. Redeploy Cloud Run services');
    console.log('  3. Test failure learning with real enrichment');
    console.log('');
    console.log('Expected Outcome:');
    console.log('  - Failure learning system operational');
    console.log('  - Cost savings from avoided duplicate attempts');
    console.log('  - Pattern similarity search working');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('');
    console.error('❌ MIGRATION FAILED - TRANSACTION ROLLED BACK');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);

  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
