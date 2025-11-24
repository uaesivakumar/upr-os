// server/lib/emailIntelligence/nb.js
// NeverBounce Parallel Verification Module
// Production-grade email verification with parallel processing, early stop, and timeout protection

/**
 * NeverBounce Parallel Verification Module
 *
 * Features:
 * - Parallel verification (3 emails at once)
 * - Early stop (stop at 2 valid)
 * - Timeout protection (7 seconds max per email)
 * - Cost tracking ($0.008 per verification)
 * - Retry logic (1 retry on network error)
 * - Error handling with Promise.allSettled
 *
 * Week 1 Day 3-4: Full Implementation
 */

import fetch from 'node-fetch';

const NEVERBOUNCE_API_KEY = process.env.NEVERBOUNCE_API_KEY;
const NEVERBOUNCE_API_URL = 'https://api.neverbounce.com/v4/single/check';
const COST_PER_VERIFICATION = 0.008; // $0.008 per verification
const TIMEOUT_MS = 7000; // 7 seconds max per verification
const MAX_RETRIES = 1; // Retry once on network error
const MAX_PARALLEL = 3; // Max concurrent verifications

/**
 * Map NeverBounce result codes to internal statuses
 * @param {string} code - NeverBounce result code
 * @returns {Object} {status, score, reason}
 */
function mapNeverBounceResult(code) {
  const codeStr = String(code).toLowerCase();

  const statusMap = {
    'valid': { status: 'valid', score: 1.0 },
    'invalid': { status: 'invalid', score: 0.0 },
    'disposable': { status: 'invalid', score: 0.0, reason: 'disposable' },
    'do_not_mail': { status: 'invalid', score: 0.0, reason: 'do_not_mail' },
    'catchall': { status: 'accept_all', score: 0.6 },
    'accept_all': { status: 'accept_all', score: 0.6 },
    'unknown': { status: 'unknown', score: 0.5 }
  };

  return statusMap[codeStr] || { status: 'unknown', score: 0.5 };
}

/**
 * Verify a single email via NeverBounce API
 *
 * @param {string} email - Email to verify
 * @param {Object} options - Verification options
 * @param {number} options.timeoutMs - Timeout in milliseconds
 * @param {number} options.retryCount - Current retry count
 * @returns {Promise<Object>} Verification result
 */
async function verifyOne(email, options = {}) {
  const { timeoutMs = TIMEOUT_MS, retryCount = 0 } = options;

  if (!NEVERBOUNCE_API_KEY) {
    console.warn('[NeverBounce] API key not configured, skipping verification');
    return {
      email,
      status: 'skipped',
      result: 'unknown',
      score: 0.5,
      reason: 'API key not configured'
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startTime = Date.now();

    const response = await fetch(NEVERBOUNCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'UPR-EmailIntelligence/1.0'
      },
      body: JSON.stringify({
        key: NEVERBOUNCE_API_KEY,
        email: email,
        address_info: 0,
        credits_info: 0,
        timeout: 5 // NeverBounce server-side timeout (5s)
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`NeverBounce API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const executionTime = Date.now() - startTime;

    // Extract result code
    const resultCode = data?.result || data?.verification?.result || 'unknown';
    const mapped = mapNeverBounceResult(resultCode);

    console.log(`[NeverBounce] ✅ ${email} → ${mapped.status} (${executionTime}ms)`);

    return {
      email,
      status: mapped.status,
      result: resultCode,
      score: mapped.score,
      reason: mapped.reason,
      flags: data.flags || {},
      execution_time: executionTime,
      credits_used: 1
    };

  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout
    if (error.name === 'AbortError') {
      console.error(`[NeverBounce] ⏱️  Timeout verifying ${email} (>${timeoutMs}ms)`);
      return {
        email,
        status: 'timeout',
        result: 'unknown',
        score: 0.5,
        reason: `Timeout after ${timeoutMs}ms`
      };
    }

    // Handle network errors with retry
    if (retryCount < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      console.warn(`[NeverBounce] 🔄 Retrying ${email} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
      return verifyOne(email, { timeoutMs, retryCount: retryCount + 1 });
    }

    // Handle other errors
    console.error(`[NeverBounce] ❌ Error verifying ${email}:`, error.message);
    return {
      email,
      status: 'error',
      result: 'unknown',
      score: 0.5,
      reason: error.message
    };
  }
}

/**
 * Verify multiple emails in parallel with early stop
 *
 * @param {string[]} emails - Array of emails to verify
 * @param {Object} options - Configuration options
 * @param {number} options.maxParallel - Max parallel verifications (default: 3)
 * @param {number} options.timeoutMs - Timeout per verification (default: 7000)
 * @param {number} options.earlyStopAt - Stop after N valid emails (default: 2, 0 = no early stop)
 * @returns {Promise<Object>} {results, summary, cost, duration, early_stopped}
 */
export async function verifyBatch(emails, options = {}) {
  const {
    maxParallel = MAX_PARALLEL,
    timeoutMs = TIMEOUT_MS,
    earlyStopAt = 2
  } = options;

  const startTime = Date.now();
  const results = [];
  let validCount = 0;
  let totalCost = 0;
  let creditsUsed = 0;

  console.log(`[NeverBounce] 🚀 Batch verification: ${emails.length} emails (parallel: ${maxParallel}, early stop: ${earlyStopAt || 'disabled'})`);

  // Verify in batches with parallelism
  for (let i = 0; i < emails.length; i += maxParallel) {
    // Early stop check
    if (earlyStopAt > 0 && validCount >= earlyStopAt) {
      console.log(`[NeverBounce] ⚡ Early stop: ${validCount} valid emails found (target: ${earlyStopAt})`);
      break;
    }

    const batch = emails.slice(i, i + maxParallel);
    const promises = batch.map(email => verifyOne(email, { timeoutMs }));

    // Use Promise.allSettled to prevent cascading failures
    const batchResults = await Promise.allSettled(promises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const verificationResult = result.value;
        results.push(verificationResult);

        // Count valid emails for early stop
        if (verificationResult.status === 'valid') {
          validCount++;
        }

        // Track cost (skip if verification was skipped or errored)
        if (verificationResult.status !== 'skipped' && verificationResult.status !== 'error') {
          totalCost += COST_PER_VERIFICATION;
          creditsUsed += verificationResult.credits_used || 1;
        }
      } else {
        // Promise rejected (should rarely happen with our error handling)
        console.error('[NeverBounce] ❌ Promise rejected:', result.reason);
        const emailIndex = results.length;
        results.push({
          email: batch[emailIndex % batch.length],
          status: 'error',
          result: 'unknown',
          score: 0.5,
          reason: result.reason?.message || 'Promise rejected'
        });
      }
    }

    // Early stop check after each batch
    if (earlyStopAt > 0 && validCount >= earlyStopAt) {
      break;
    }
  }

  const duration = Date.now() - startTime;
  const earlyStoppedAt = results.length < emails.length ? results.length : null;

  // Calculate summary statistics
  const summary = {
    total: emails.length,
    verified: results.length,
    valid: results.filter(r => r.status === 'valid').length,
    invalid: results.filter(r => r.status === 'invalid').length,
    accept_all: results.filter(r => r.status === 'accept_all').length,
    unknown: results.filter(r => r.status === 'unknown').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    timeout: results.filter(r => r.status === 'timeout').length,
    error: results.filter(r => r.status === 'error').length
  };

  console.log(`[NeverBounce] ✅ Batch complete: ${duration}ms, ${summary.valid} valid, ${summary.verified}/${summary.total} verified, cost: $${totalCost.toFixed(4)}`);

  return {
    results,
    summary,
    cost: totalCost,
    cost_cents: totalCost * 100,
    credits_used: creditsUsed,
    duration,
    early_stopped: earlyStoppedAt !== null,
    early_stopped_at: earlyStoppedAt
  };
}

/**
 * Verify single email (convenience wrapper)
 *
 * @param {string} email - Email to verify
 * @param {Object} options - Verification options
 * @returns {Promise<Object>} Verification result
 */
export async function verifySingle(email, options = {}) {
  const result = await verifyBatch([email], {
    maxParallel: 1,
    earlyStopAt: 0, // No early stop for single verification
    ...options
  });
  return result.results[0];
}

/**
 * Check if NeverBounce is configured
 *
 * @returns {boolean}
 */
export function isConfigured() {
  return !!NEVERBOUNCE_API_KEY;
}

/**
 * Get cost per verification
 *
 * @returns {number} Cost in USD
 */
export function getCostPerVerification() {
  return COST_PER_VERIFICATION;
}

/**
 * Calculate cost for N verifications
 *
 * @param {number} count - Number of verifications
 * @returns {number} Total cost in USD
 */
export function calculateCost(count) {
  return count * COST_PER_VERIFICATION;
}

/**
 * Calculate cost in cents (for telemetry)
 *
 * @param {number} count - Number of verifications
 * @returns {number} Total cost in cents
 */
export function calculateCostCents(count) {
  return count * COST_PER_VERIFICATION * 100;
}

/**
 * Check if domain is catch-all
 * Tests random email address to detect catch-all domains
 *
 * @param {string} domain - Domain to check
 * @returns {Promise<boolean>} True if catch-all
 */
export async function isCatchAllDomain(domain) {
  const randomEmail = `test${Date.now()}${Math.random().toString(36).slice(2)}@${domain}`;

  const result = await verifySingle(randomEmail, { timeoutMs: 5000 });

  // If random email is valid or accept_all, domain is catch-all
  return result.status === 'valid' || result.status === 'accept_all';
}

// Export all functions
export default {
  verifyBatch,
  verifySingle,
  isConfigured,
  getCostPerVerification,
  calculateCost,
  calculateCostCents,
  isCatchAllDomain
};
