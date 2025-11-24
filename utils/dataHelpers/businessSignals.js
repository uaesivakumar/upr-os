import { pool } from '../db.js';

/**
 * Single source of truth for company hiring signals
 * Used by: preview badges, insight modules, urgency scoring
 *
 * @param {string} companyId - Company UUID
 * @returns {Promise<Array>} Array of signal objects
 */
export async function getCompanyBusinessSignals(companyId, companyName) {
  try {
    console.log('═══════════════════════════════════════════════════');
    console.log('[businessSignals] QUERY START');
    console.log('[businessSignals] Input companyId:', companyId);
    console.log('[businessSignals] Input companyName:', companyName);
    console.log('[businessSignals] Will query with LOWER():', companyName ? companyName.toLowerCase() : 'N/A');

    // Table uses company NAME, not ID - query by name if ID fails
    const query = companyName
      ? `SELECT
          trigger_type as signal_type,
          description as signal_text,
          source_date as signal_date,
          hiring_likelihood_score as confidence_score,
          source_url as source
         FROM hiring_signals
         WHERE LOWER(company) = LOWER($1)
         AND (source_date IS NULL OR source_date >= CURRENT_DATE - INTERVAL '90 days')
         ORDER BY source_date DESC NULLS LAST, detected_at DESC
         LIMIT 50`
      : `SELECT
          trigger_type as signal_type,
          description as signal_text,
          source_date as signal_date,
          hiring_likelihood_score as confidence_score,
          source_url as source
         FROM hiring_signals
         WHERE id = $1
         LIMIT 0`; // If no name, return empty

    const queryParam = companyName || companyId;
    console.log('[businessSignals] Query parameter value:', queryParam);

    const result = await pool.query(query, [queryParam]);

    console.log('[businessSignals] Query returned:', result.rows.length, 'signals');

    if (result.rows.length > 0) {
      console.log('[businessSignals] Sample signal:', JSON.stringify(result.rows[0], null, 2));
      console.log('[businessSignals] All signal types:', result.rows.map(r => r.signal_type).join(', '));
    } else {
      console.log('[businessSignals] ⚠️ NO SIGNALS FOUND for company:', companyName);
    }

    console.log('[businessSignals] QUERY END');
    console.log('═══════════════════════════════════════════════════');

    return result.rows;
  } catch (error) {
    console.error('═══════════════════════════════════════════════════');
    console.error('[businessSignals] ❌ QUERY ERROR');
    console.error('[businessSignals] Company:', companyName);
    console.error('[businessSignals] Error:', error.message);
    console.error('[businessSignals] Stack:', error.stack);
    console.error('═══════════════════════════════════════════════════');
    return [];
  }
}

/**
 * Check if company has recent hiring activity (last 30 days)
 */
export function hasActiveHiringSignals(signals) {
  if (!signals || signals.length === 0) return false;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentSignals = signals.filter(s =>
    new Date(s.signal_date) > thirtyDaysAgo
  );

  return recentSignals.length > 0;
}

/**
 * Summarize hiring signals for quick analysis
 */
export function getHiringSignalSummary(signals) {
  if (!signals || signals.length === 0) {
    return {
      total: 0,
      jobPostings: 0,
      expansion: 0,
      funding: 0,
      hasRecent: false,
      lastSignalDate: null
    };
  }

  const summary = {
    total: signals.length,
    jobPostings: signals.filter(s => s.signal_type?.toLowerCase() === 'job_posting').length,
    expansion: signals.filter(s =>
      s.signal_type?.toLowerCase() === 'expansion' ||
      s.signal_type?.toLowerCase() === 'expansion_news'
    ).length,
    funding: signals.filter(s => s.signal_type?.toLowerCase() === 'funding').length,
    hasRecent: hasActiveHiringSignals(signals),
    lastSignalDate: signals.length > 0 ? signals[0].signal_date : null
  };

  return summary;
}

/**
 * Get days since last signal
 */
export function daysSinceLastSignal(signals) {
  if (!signals || signals.length === 0) return null;

  const lastSignal = signals[0];
  return Math.floor(
    (Date.now() - new Date(lastSignal.signal_date)) / (1000 * 60 * 60 * 24)
  );
}
