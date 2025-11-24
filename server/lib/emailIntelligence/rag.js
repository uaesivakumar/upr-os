/**
 * RAG Vector Search Module
 * Week 2 Day 1-2: Full Implementation
 *
 * Uses pgvector to find similar email patterns based on company context.
 * Embeddings generated via OpenAI text-embedding-3-small (384 dimensions).
 */

import OpenAI from 'openai';
import { getDb } from './db.js';
import embeddingMetrics from './embeddingMetrics.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 384; // Small dimension for cost/speed
const SIMILARITY_THRESHOLD = 0.75; // Minimum cosine similarity
const MAX_RESULTS = 5; // Top-K results
const IVFFLAT_PROBES = 10; // Balance between speed and recall (default is 1)

// Lazy initialization of OpenAI client
let openai = null;
function getOpenAI() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

/**
 * Generate embedding for company context
 *
 * @param {Object} context - Company context
 * @param {string} context.domain - Company domain
 * @param {string} context.company - Company name
 * @param {string} context.sector - Industry sector
 * @param {string} context.region - Geographic region
 * @returns {Promise<number[]>} - 384-dimensional embedding vector
 */
export async function generateEmbedding(context) {
  const { domain, company, sector, region } = context;

  // Create rich text representation for better semantic search
  const text = [
    company || domain,
    sector || 'unknown sector',
    region || 'unknown region',
    domain
  ].filter(Boolean).join(' ');

  const startTime = Date.now();

  try {
    const client = getOpenAI();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS
    });

    const embedding = response.data[0].embedding;
    const latency = Date.now() - startTime;

    // CRITICAL: Validate embedding dimensions match database schema
    // This prevents dimension mismatches that break vector storage
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      embeddingMetrics.recordDimensionValidationError({
        message: 'Embedding dimension mismatch',
        expected: EMBEDDING_DIMENSIONS,
        actual: embedding.length
      });

      throw new Error(
        `Embedding dimension mismatch! ` +
        `Expected ${EMBEDDING_DIMENSIONS} dimensions (${EMBEDDING_MODEL}), ` +
        `but got ${embedding.length}. ` +
        `Database schema and embedding model are out of sync. ` +
        `Check db/migrations for vector column dimensions.`
      );
    }

    // Track successful dimension validation and embedding generation
    embeddingMetrics.recordDimensionValidationSuccess();
    embeddingMetrics.recordEmbeddingGeneration(latency, text.length);

    return embedding;
  } catch (error) {
    embeddingMetrics.recordEmbeddingGenerationError(error);
    console.error('[RAG] Error generating embedding:', error.message);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Search for similar patterns via vector similarity
 *
 * @param {string} domain - Target domain
 * @param {Object} context - Company context
 * @param {Object} options - Search options
 * @param {number} options.threshold - Minimum similarity (default: 0.75)
 * @param {number} options.limit - Max results (default: 5)
 * @returns {Promise<Object|null>} - Best matching pattern or null
 */
export async function recall(domain, context = {}, options = {}) {
  const { threshold = SIMILARITY_THRESHOLD, limit = MAX_RESULTS } = options;

  console.log(`[RAG] Searching for pattern: ${domain}`);

  const db = getDb();

  try {
    // 1. Direct domain lookup (exact match)
    const directResult = await db.query(`
      SELECT
        domain,
        pattern,
        confidence,
        region,
        sector,
        last_source,
        verified_at,
        usage_count,
        EXTRACT(EPOCH FROM (NOW() - verified_at)) / 86400 as age_days
      FROM email_patterns
      WHERE domain = $1
    `, [domain]);

    if (directResult.rows.length > 0) {
      const pattern = directResult.rows[0];
      const ageDays = pattern.age_days;

      // Apply confidence decay for old patterns
      let adjustedConfidence = pattern.confidence;
      if (ageDays > 180) {
        adjustedConfidence *= 0.90; // 10% decay after 6 months
      }
      if (ageDays > 365) {
        adjustedConfidence *= 0.85; // 15% decay after 1 year
      }

      console.log(`[RAG] Direct hit: ${domain} → ${pattern.pattern} (confidence: ${adjustedConfidence.toFixed(2)}, age: ${Math.floor(ageDays)}d)`);

      // Track pattern reuse (saved LLM + NeverBounce cost)
      embeddingMetrics.recordPatternReuse(0.05);

      return {
        pattern: pattern.pattern,
        confidence: adjustedConfidence,
        source: 'rag_direct',
        domain: pattern.domain,
        region: pattern.region,
        sector: pattern.sector,
        verified_at: pattern.verified_at,
        usage_count: pattern.usage_count,
        age_days: Math.floor(ageDays),
        context: null
      };
    }

    // 2. Vector similarity search (semantic match)
    console.log(`[RAG] No direct hit, trying vector search...`);

    const embedding = await generateEmbedding({
      domain,
      company: context.company,
      sector: context.sector,
      region: context.region
    });

    // Tune ivfflat for better recall (default probes=1, we use 10)
    // This increases search accuracy at the cost of slightly higher latency
    await db.query('SET LOCAL ivfflat.probes = $1', [IVFFLAT_PROBES]);

    const vectorStartTime = Date.now();
    const vectorResult = await db.query(`
      SELECT
        domain,
        pattern,
        confidence,
        region,
        sector,
        last_source,
        verified_at,
        usage_count,
        1 - (embedding <=> $1::vector) as similarity,
        EXTRACT(EPOCH FROM (NOW() - verified_at)) / 86400 as age_days
      FROM email_patterns
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `, [JSON.stringify(embedding), limit]);
    const vectorLatency = Date.now() - vectorStartTime;

    if (vectorResult.rows.length === 0) {
      console.log('[RAG] No similar patterns found in vector search');
      embeddingMetrics.recordVectorQuery(vectorResult, vectorLatency, false);
      return null;
    }

    // Find best match above threshold
    const matches = vectorResult.rows.filter(row => row.similarity >= threshold);

    if (matches.length === 0) {
      console.log(`[RAG] No matches above threshold (${threshold})`);
      console.log(`[RAG] Best similarity: ${vectorResult.rows[0].similarity.toFixed(3)}`);
      embeddingMetrics.recordVectorQuery(vectorResult, vectorLatency, false);
      return null;
    }

    const bestMatch = matches[0];

    // Apply confidence decay for age
    let adjustedConfidence = bestMatch.confidence * bestMatch.similarity;
    const ageDays = bestMatch.age_days;
    if (ageDays > 180) {
      adjustedConfidence *= 0.90;
    }
    if (ageDays > 365) {
      adjustedConfidence *= 0.85;
    }

    console.log(`[RAG] Vector match: ${bestMatch.domain} → ${bestMatch.pattern} (similarity: ${bestMatch.similarity.toFixed(3)}, confidence: ${adjustedConfidence.toFixed(2)})`);

    // Track successful vector query hit
    embeddingMetrics.recordVectorQuery(vectorResult, vectorLatency, true);

    return {
      pattern: bestMatch.pattern,
      confidence: adjustedConfidence,
      source: 'rag_vector',
      domain: bestMatch.domain,
      region: bestMatch.region,
      sector: bestMatch.sector,
      verified_at: bestMatch.verified_at,
      similarity: bestMatch.similarity,
      usage_count: bestMatch.usage_count,
      age_days: Math.floor(ageDays),
      context: vectorResult.rows.slice(0, 3).map(r => ({
        domain: r.domain,
        pattern: r.pattern,
        similarity: r.similarity
      }))
    };

  } catch (error) {
    embeddingMetrics.recordVectorQueryError(error);
    console.error('[RAG] Error in recall:', error);
    return null;
  }
}

/**
 * Store new pattern with embedding
 *
 * @param {Object} data - Pattern data
 * @param {string} data.domain - Company domain
 * @param {string} data.pattern - Email pattern
 * @param {number} data.confidence - Confidence score (0-1)
 * @param {string} data.source - Source of pattern
 * @param {Object} data.context - Company context
 * @param {Object} data.health - Domain health
 * @param {string} data.serp_suggested_pattern - Pattern suggested by SERP (optional)
 * @param {boolean} data.serp_apollo_agreement - Whether SERP and Apollo agreed (optional)
 * @param {string} data.serp_source - SERP source (e.g., 'rocketreach') (optional)
 * @param {number} data.serp_confidence - SERP confidence score (optional)
 * @returns {Promise<void>}
 */
export async function upsertPattern(data) {
  const {
    domain,
    pattern,
    confidence,
    source,
    context = {},
    health = {},
    serp_suggested_pattern = null,
    serp_apollo_agreement = null,
    serp_source = null,
    serp_confidence = null
  } = data;

  console.log(`[RAG] Storing pattern: ${domain} → ${pattern} (confidence: ${confidence.toFixed(2)}, source: ${source})`);

  const db = getDb();

  try {
    // Generate embedding
    const embedding = await generateEmbedding({
      domain,
      company: context.company,
      sector: context.sector,
      region: context.region
    });

    // Determine validation method based on source
    let validation_method = source;
    if (source === 'serp_validated' && serp_apollo_agreement) {
      validation_method = 'serp_confirmed';
    }

    // Upsert pattern
    await db.query(`
      INSERT INTO email_patterns (
        domain,
        pattern,
        confidence,
        region,
        sector,
        company_size,
        mx_ok,
        catch_all,
        last_source,
        embedding,
        verified_at,
        created_at,
        updated_at,
        serp_suggested_pattern,
        serp_apollo_agreement,
        validation_method
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, NOW(), NOW(), NOW(), $11, $12, $13
      )
      ON CONFLICT (domain) DO UPDATE SET
        pattern = EXCLUDED.pattern,
        confidence = EXCLUDED.confidence,
        region = EXCLUDED.region,
        sector = EXCLUDED.sector,
        mx_ok = EXCLUDED.mx_ok,
        catch_all = EXCLUDED.catch_all,
        last_source = EXCLUDED.last_source,
        embedding = EXCLUDED.embedding,
        verified_at = NOW(),
        updated_at = NOW(),
        usage_count = email_patterns.usage_count + 1,
        serp_suggested_pattern = EXCLUDED.serp_suggested_pattern,
        serp_apollo_agreement = EXCLUDED.serp_apollo_agreement,
        validation_method = EXCLUDED.validation_method
    `, [
      domain,
      pattern,
      confidence,
      context.region || null,
      context.sector || null,
      context.company_size || null,
      health.mx_ok !== false,
      health.catch_all === true,
      source,
      JSON.stringify(embedding),
      serp_suggested_pattern,
      serp_apollo_agreement,
      validation_method
    ]);

    console.log(`[RAG] Pattern stored successfully: ${domain}`);

  } catch (error) {
    console.error('[RAG] Error upserting pattern:', error);
    throw error;
  }
}

/**
 * Increment usage count for pattern
 *
 * @param {string} domain - Domain to increment
 * @returns {Promise<void>}
 */
export async function incrementUsage(domain) {
  const db = getDb();

  try {
    await db.query(`SELECT increment_pattern_usage($1)`, [domain]);
    console.log(`[RAG] Incremented usage for ${domain}`);
  } catch (error) {
    console.error('[RAG] Error incrementing usage:', error);
  }
}

/**
 * Backfill embeddings for existing patterns without embeddings
 *
 * @returns {Promise<Object>} - {success: boolean, count: number, errors: Array}
 */
export async function backfillEmbeddings() {
  console.log('[RAG] Starting embedding backfill...');

  const db = getDb();
  const errors = [];
  let count = 0;

  try {
    // Get patterns without embeddings
    const result = await db.query(`
      SELECT domain, region, sector
      FROM email_patterns
      WHERE embedding IS NULL
      ORDER BY created_at DESC
    `);

    console.log(`[RAG] Found ${result.rows.length} patterns without embeddings`);

    for (const row of result.rows) {
      try {
        const embedding = await generateEmbedding({
          domain: row.domain,
          company: row.domain.split('.')[0],
          sector: row.sector,
          region: row.region
        });

        await db.query(`
          UPDATE email_patterns
          SET embedding = $1::vector, updated_at = NOW()
          WHERE domain = $2
        `, [JSON.stringify(embedding), row.domain]);

        count++;
        console.log(`[RAG] Backfilled embedding ${count}/${result.rows.length}: ${row.domain}`);

        // Rate limit to avoid API throttling (max 3000/min for tier 1)
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay = max 600/min

      } catch (error) {
        console.error(`[RAG] Error backfilling ${row.domain}:`, error.message);
        errors.push({ domain: row.domain, error: error.message });
      }
    }

    console.log(`[RAG] Backfill complete: ${count} embeddings generated, ${errors.length} errors`);

    return {
      success: errors.length === 0,
      count,
      total: result.rows.length,
      errors
    };

  } catch (error) {
    console.error('[RAG] Backfill failed:', error);
    return {
      success: false,
      count,
      errors: [{ error: error.message }]
    };
  }
}

export default {
  recall,
  upsertPattern,
  incrementUsage,
  generateEmbedding,
  backfillEmbeddings,
  metrics: embeddingMetrics
};
