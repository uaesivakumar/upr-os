// utils/patternCache.js
import { pool } from "./db.js";

/**
 * [MODIFIED] Fetches a domain's full intelligence record from the database, including the new status.
 * @param {string} domain The domain name.
 * @returns {Promise<object|null>} The pattern record or null.
 */
export async function getDomainPattern(domain) {
  const d = (domain || "").toLowerCase();
  if (!d) return null;
  try {
    const { rows } = await pool.query(
      `SELECT domain, pattern, source, confidence, example_email, status FROM email_patterns WHERE domain = $1`,
      [d]
    );
    return rows[0] || null;
  } catch (e) {
    console.error(`[patternCache] Error getting pattern for ${domain}:`, e.message);
    return null;
  }
}

/**
 * [MODIFIED] Saves or updates a domain's full intelligence record, including the new status.
 * @param {object} options - { domain, pattern, source, example, confidence, status }
 */
export async function setDomainPattern({ domain, pattern, source = 'inferred', example = null, confidence = 0.8, status = 'valid' }) {
  const d = (domain || "").toLowerCase();
  if (!d || !pattern) return;
  
  const query = `
    INSERT INTO email_patterns (domain, pattern, source, example_email, confidence, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (domain) DO UPDATE SET
      pattern = EXCLUDED.pattern,
      source = EXCLUDED.source,
      example_email = COALESCE(EXCLUDED.example_email, email_patterns.example_email),
      confidence = EXCLUDED.confidence,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING *;
  `;
  try {
    const { rows } = await pool.query(query, [d, pattern, source, example, confidence, status]);
    console.log(`[patternCache] Saved intelligence for ${d}: pattern=${pattern}, status=${status}`);
    return rows[0];
  } catch (e) {
    console.error(`[patternCache] Error setting pattern for ${d}:`, e.message);
  }
} 