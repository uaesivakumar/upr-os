/**
 * NeverBounce Token Bucket & Cache
 * Week 2 Day 3-4: Production hardening
 *
 * Features:
 * - Token bucket per domain (max 5 checks/day)
 * - 24-hour result cache per exact email
 * - Jittered backoff on rate limits (429) and errors (5xx)
 *
 * Purpose: Prevent excessive NB costs from repeated validation
 */

import pool from '../../../utils/db.js';

// Token bucket configuration
const MAX_TOKENS_PER_DOMAIN = 5;    // Max 5 validations per domain per day
const TOKEN_REFILL_HOURS = 24;       // Refill every 24 hours

// Cache TTL
const CACHE_TTL_HOURS = 24;          // Cache results for 24 hours

// Retry configuration
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;        // 1 second base
const MAX_BACKOFF_MS = 10000;        // 10 seconds max

/**
 * Check if domain has available tokens
 *
 * @param {string} domain - Domain to check
 * @returns {Promise<{allowed: boolean, tokens_remaining: number}>}
 */
export async function checkTokenBucket(domain) {
  try {
    const result = await pool.query(`
      INSERT INTO nb_token_bucket (domain, tokens, last_refill)
      VALUES ($1, $2, NOW())
      ON CONFLICT (domain) DO UPDATE SET
        -- Refill tokens if 24 hours have passed
        tokens = CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - nb_token_bucket.last_refill)) / 3600 >= $3
          THEN $2  -- Full refill
          ELSE nb_token_bucket.tokens
        END,
        last_refill = CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - nb_token_bucket.last_refill)) / 3600 >= $3
          THEN NOW()
          ELSE nb_token_bucket.last_refill
        END
      RETURNING tokens, last_refill
    `, [domain, MAX_TOKENS_PER_DOMAIN, TOKEN_REFILL_HOURS]);

    const { tokens } = result.rows[0];

    return {
      allowed: tokens > 0,
      tokens_remaining: tokens
    };
  } catch (error) {
    console.error('[NB-Cache] Error checking token bucket:', error.message);
    // On error, allow (fail open)
    return { allowed: true, tokens_remaining: 1 };
  }
}

/**
 * Consume a token from domain bucket
 *
 * @param {string} domain - Domain
 * @returns {Promise<boolean>} - True if token consumed
 */
export async function consumeToken(domain) {
  try {
    const result = await pool.query(`
      UPDATE nb_token_bucket
      SET tokens = GREATEST(tokens - 1, 0)
      WHERE domain = $1 AND tokens > 0
      RETURNING tokens
    `, [domain]);

    return result.rowCount > 0;
  } catch (error) {
    console.error('[NB-Cache] Error consuming token:', error.message);
    return true; // Fail open
  }
}

/**
 * Get cached NeverBounce result
 *
 * @param {string} email - Exact email address
 * @returns {Promise<Object|null>} - Cached result or null
 */
export async function getCachedResult(email) {
  try {
    const result = await pool.query(`
      SELECT status, result, score, flags, cached_at
      FROM nb_cache
      WHERE email = $1
        AND cached_at > NOW() - INTERVAL '$2 hours'
    `, [email, CACHE_TTL_HOURS]);

    if (result.rows.length > 0) {
      const cached = result.rows[0];
      console.log(`[NB-Cache] Cache hit for ${email} (age: ${Math.floor((Date.now() - new Date(cached.cached_at).getTime()) / 1000 / 60)} min)`);

      return {
        email,
        status: cached.status,
        result: cached.result,
        score: cached.score,
        flags: cached.flags,
        cached: true,
        cached_at: cached.cached_at
      };
    }

    return null;
  } catch (error) {
    console.error('[NB-Cache] Error reading cache:', error.message);
    return null;
  }
}

/**
 * Save NeverBounce result to cache
 *
 * @param {string} email - Email address
 * @param {Object} result - NeverBounce result
 */
export async function cacheResult(email, result) {
  try {
    await pool.query(`
      INSERT INTO nb_cache (email, status, result, score, flags, cached_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (email) DO UPDATE SET
        status = EXCLUDED.status,
        result = EXCLUDED.result,
        score = EXCLUDED.score,
        flags = EXCLUDED.flags,
        cached_at = NOW()
    `, [
      email,
      result.status,
      result.result,
      result.score,
      result.flags || {}
    ]);

    console.log(`[NB-Cache] Cached result for ${email}`);
  } catch (error) {
    console.error('[NB-Cache] Error saving cache:', error.message);
    // Non-fatal, continue
  }
}

/**
 * Validate email with token bucket and cache
 *
 * Wraps verifySingle with:
 * - Token bucket check
 * - Cache lookup
 * - Result caching
 * - Backoff retry logic
 *
 * @param {string} email - Email to validate
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} - Validation result
 */
export async function validateWithCache(email, options = {}) {
  const domain = email.split('@')[1];

  // Step 1: Check cache
  const cached = await getCachedResult(email);
  if (cached) {
    return cached;
  }

  // Step 2: Check token bucket
  const { allowed, tokens_remaining } = await checkTokenBucket(domain);

  if (!allowed) {
    console.warn(`[NB-Cache] Token bucket exhausted for ${domain} (0 tokens remaining)`);

    return {
      email,
      status: 'rate_limited',
      result: 'unknown',
      score: 0.5,
      reason: `Domain ${domain} has exhausted NeverBounce quota (max ${MAX_TOKENS_PER_DOMAIN}/day). Resets in 24h.`,
      tokens_remaining: 0
    };
  }

  console.log(`[NB-Cache] Tokens remaining for ${domain}: ${tokens_remaining}`);

  // Step 3: Consume token
  const consumed = await consumeToken(domain);
  if (!consumed) {
    return {
      email,
      status: 'rate_limited',
      result: 'unknown',
      score: 0.5,
      reason: 'Token bucket race condition',
      tokens_remaining: 0
    };
  }

  // Step 4: Call NeverBounce with retry + backoff
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Import verifySingle dynamically to avoid circular dependency
      const { verifySingle } = await import('./nb.js');

      const result = await verifySingle(email, options);

      // Cache successful result
      if (result.status !== 'error') {
        await cacheResult(email, result);
      }

      return result;

    } catch (error) {
      lastError = error;

      // Check if retryable (429, 5xx)
      const isRetryable = error.statusCode === 429 ||
                         (error.statusCode >= 500 && error.statusCode < 600);

      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        // Non-retryable or final attempt
        break;
      }

      // Exponential backoff with jitter
      const backoff = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000,
        MAX_BACKOFF_MS
      );

      console.warn(`[NB-Cache] Retrying ${email} after ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  // All retries failed
  console.error(`[NB-Cache] All retries failed for ${email}:`, lastError?.message);

  return {
    email,
    status: 'error',
    result: 'unknown',
    score: 0.5,
    reason: lastError?.message || 'Validation failed after retries',
    tokens_remaining: tokens_remaining - 1
  };
}

/**
 * Clear expired cache entries (>30 days old)
 */
export async function clearExpiredCache() {
  try {
    const result = await pool.query(`
      DELETE FROM nb_cache
      WHERE cached_at < NOW() - INTERVAL '30 days'
    `);

    console.log(`[NB-Cache] Cleared ${result.rowCount} expired cache entries`);
    return result.rowCount;
  } catch (error) {
    console.error('[NB-Cache] Error clearing cache:', error.message);
    return 0;
  }
}

export default {
  checkTokenBucket,
  consumeToken,
  getCachedResult,
  cacheResult,
  validateWithCache,
  clearExpiredCache
};
