// server/lib/emailIntelligence/domainHealth.js
// Domain Health Checker (MX Records + Catch-All Detection)
// 24-hour cache to avoid repeated DNS lookups

/**
 * Domain Health Checker
 *
 * Goal: Check domain health before email generation
 * Checks:
 * 1. MX records exist (domain accepts emails)
 * 2. Catch-all detection (domain accepts all emails)
 *
 * Cache: 24 hours in domain_health table
 * Cost: FREE (DNS lookups)
 * Speed: ~200ms (cached: <10ms)
 *
 * Week 1: Basic implementation
 */

import pool from '../../../utils/db.js';
import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

/**
 * Check domain health (MX + catch-all)
 * @param {string} domain - Domain to check
 * @param {boolean} useCache - Use cached result if available (default: true)
 * @returns {Promise<Object>} {mx_ok, catch_all, mx_records, last_checked}
 */
export async function checkDomainHealth(domain, useCache = true) {
  console.log('[domain-health] Checking domain:', domain);

  // Check cache first
  if (useCache) {
    const cached = await getCachedDomainHealth(domain);
    if (cached && isCacheValid(cached.last_checked)) {
      console.log('[domain-health] Cache hit for', domain);
      return cached;
    }
  }

  // Perform fresh check
  const health = await performDomainHealthCheck(domain);

  // Save to cache
  await saveDomainHealth(domain, health);

  return health;
}

/**
 * Get cached domain health
 * @param {string} domain - Domain to lookup
 * @returns {Promise<Object|null>} Cached health or null
 */
async function getCachedDomainHealth(domain) {
  try {
    const result = await pool.query(
      `SELECT domain, mx_ok, mx_records, catch_all, last_checked, check_count
       FROM domain_health
       WHERE domain = $1`,
      [domain]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('[domain-health] Cache lookup error:', error.message);
    return null;
  }
}

/**
 * Check if cache is still valid (< 24 hours old)
 * @param {Date} lastChecked - Last check timestamp
 * @returns {boolean} True if cache is valid
 */
function isCacheValid(lastChecked) {
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const age = Date.now() - new Date(lastChecked).getTime();
  return age < CACHE_TTL;
}

/**
 * Perform actual domain health check
 * @param {string} domain - Domain to check
 * @returns {Promise<Object>} Health check results
 */
async function performDomainHealthCheck(domain) {
  const health = {
    mx_ok: false,
    mx_records: [],
    catch_all: false,
    last_error: null
  };

  // Check MX records
  try {
    const mxRecords = await resolveMx(domain);
    health.mx_ok = mxRecords && mxRecords.length > 0;
    health.mx_records = mxRecords.map(record => record.exchange);

    console.log('[domain-health] MX records for', domain, ':', health.mx_records);

    // Check catch-all (Week 2 implementation)
    // TODO: Test with random email to detect catch-all
    health.catch_all = false; // Placeholder

  } catch (error) {
    console.error('[domain-health] MX lookup failed for', domain, ':', error.message);
    health.mx_ok = false;
    health.last_error = error.message;
  }

  return health;
}

/**
 * Save domain health to cache
 * @param {string} domain - Domain
 * @param {Object} health - Health check results
 */
async function saveDomainHealth(domain, health) {
  try {
    await pool.query(
      `INSERT INTO domain_health (domain, mx_ok, mx_records, catch_all, last_checked, check_count, last_error)
       VALUES ($1, $2, $3, $4, NOW(), 1, $5)
       ON CONFLICT (domain) DO UPDATE SET
         mx_ok = EXCLUDED.mx_ok,
         mx_records = EXCLUDED.mx_records,
         catch_all = EXCLUDED.catch_all,
         last_checked = NOW(),
         check_count = domain_health.check_count + 1,
         last_error = EXCLUDED.last_error`,
      [domain, health.mx_ok, health.mx_records, health.catch_all, health.last_error]
    );

    console.log('[domain-health] Saved to cache:', domain);
  } catch (error) {
    console.error('[domain-health] Cache save error:', error.message);
  }
}

/**
 * Check multiple domains in batch
 * @param {Array<string>} domains - List of domains to check
 * @returns {Promise<Object>} Map of domain → health
 */
export async function batchCheckDomains(domains) {
  console.log('[domain-health] Batch checking', domains.length, 'domains');

  const results = {};

  for (const domain of domains) {
    results[domain] = await checkDomainHealth(domain);
  }

  return results;
}

/**
 * Clear expired cache entries (> 30 days old)
 */
export async function clearExpiredCache() {
  try {
    const result = await pool.query(
      `DELETE FROM domain_health
       WHERE last_checked < NOW() - INTERVAL '30 days'`
    );

    console.log('[domain-health] Cleared', result.rowCount, 'expired cache entries');
    return result.rowCount;
  } catch (error) {
    console.error('[domain-health] Cache cleanup error:', error.message);
    return 0;
  }
}

// Alias for shorter function name
export async function get(domain, useCache = true) {
  return checkDomainHealth(domain, useCache);
}

export default {
  checkDomainHealth,
  get,
  batchCheckDomains,
  clearExpiredCache
};
