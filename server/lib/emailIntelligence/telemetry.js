// server/lib/emailIntelligence/telemetry.js
// Enrichment Telemetry and Observability
// Tracks cost, latency, and layer performance for analytics

/**
 * Enrichment Telemetry (Observability Layer)
 *
 * Goal: Track enrichment performance and costs
 * Metrics:
 * - Which layer found the pattern (RAG/Rules/LLM/Fallback)
 * - Cost breakdown (LLM + NeverBounce)
 * - Latency per enrichment
 * - Confidence scores
 * - Success rate
 *
 * Week 1: Basic telemetry implementation
 */

import pool from '../../../utils/db.js';

/**
 * Record enrichment telemetry
 * @param {Object} telemetry - Telemetry data
 */
export async function recordEnrichmentTelemetry(telemetry) {
  const {
    company_name,
    domain,
    layer_used,
    rag_hit = false,
    rag_confidence = null,
    rules_confidence = null,
    llm_called = false,
    llm_confidence = null,
    llm_cost_cents = 0,
    nb_calls = 0,
    nb_cost_cents = 0,
    total_cost_cents = 0,
    latency_ms,
    pattern_found,
    final_confidence,
    emails_generated = 0,
    emails_validated = 0
  } = telemetry;

  try {
    await pool.query(
      `INSERT INTO enrichment_telemetry (
        company_name, domain, layer_used,
        rag_hit, rag_confidence, rules_confidence,
        llm_called, llm_confidence,
        llm_cost_cents, nb_calls, nb_cost_cents, total_cost_cents,
        latency_ms, pattern_found, final_confidence,
        emails_generated, emails_validated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        company_name, domain, layer_used,
        rag_hit, rag_confidence, rules_confidence,
        llm_called, llm_confidence,
        llm_cost_cents, nb_calls, nb_cost_cents, total_cost_cents,
        latency_ms, pattern_found, final_confidence,
        emails_generated, emails_validated
      ]
    );

    console.log('[telemetry] Recorded:', { company_name, domain, layer_used, total_cost_cents });
  } catch (error) {
    console.error('[telemetry] Failed to record:', error.message);
  }
}

/**
 * Get enrichment statistics
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Aggregated stats
 */
export async function getEnrichmentStats(filters = {}) {
  const { startDate, endDate, layer } = filters;

  let query = `
    SELECT
      COUNT(*) as total_enrichments,
      SUM(CASE WHEN rag_hit THEN 1 ELSE 0 END) as rag_hits,
      SUM(CASE WHEN llm_called THEN 1 ELSE 0 END) as llm_calls,
      ROUND(AVG(llm_cost_cents), 4) as avg_llm_cost,
      ROUND(AVG(nb_cost_cents), 4) as avg_nb_cost,
      ROUND(AVG(total_cost_cents), 4) as avg_total_cost,
      ROUND(AVG(latency_ms), 0) as avg_latency_ms,
      ROUND(AVG(final_confidence), 3) as avg_confidence,
      SUM(emails_generated) as total_emails_generated,
      SUM(emails_validated) as total_emails_validated
    FROM enrichment_telemetry
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (startDate) {
    query += ` AND created_at >= $${paramIndex++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND created_at <= $${paramIndex++}`;
    params.push(endDate);
  }

  if (layer) {
    query += ` AND layer_used = $${paramIndex++}`;
    params.push(layer);
  }

  try {
    const result = await pool.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error('[telemetry] Failed to get stats:', error.message);
    return null;
  }
}

/**
 * Get cost breakdown by layer
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Cost breakdown
 */
export async function getCostBreakdown(startDate, endDate) {
  try {
    const result = await pool.query(
      `SELECT
        layer_used,
        COUNT(*) as count,
        ROUND(AVG(total_cost_cents), 4) as avg_cost,
        ROUND(SUM(total_cost_cents), 2) as total_cost,
        ROUND(AVG(latency_ms), 0) as avg_latency
      FROM enrichment_telemetry
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY layer_used
      ORDER BY total_cost DESC`,
      [startDate, endDate]
    );

    return result.rows;
  } catch (error) {
    console.error('[telemetry] Failed to get cost breakdown:', error.message);
    return [];
  }
}

/**
 * Get daily enrichment metrics
 * @param {number} days - Number of days to retrieve (default: 7)
 * @returns {Promise<Array>} Daily metrics
 */
export async function getDailyMetrics(days = 7) {
  try {
    const result = await pool.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as enrichments,
        SUM(CASE WHEN rag_hit THEN 1 ELSE 0 END) as rag_hits,
        SUM(CASE WHEN llm_called THEN 1 ELSE 0 END) as llm_calls,
        ROUND(AVG(total_cost_cents), 4) as avg_cost,
        ROUND(SUM(total_cost_cents), 2) as total_cost,
        ROUND(AVG(latency_ms), 0) as avg_latency
      FROM enrichment_telemetry
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC`
    );

    return result.rows;
  } catch (error) {
    console.error('[telemetry] Failed to get daily metrics:', error.message);
    return [];
  }
}

/**
 * Calculate ROI (cost savings)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} ROI metrics
 */
export async function calculateROI(startDate, endDate) {
  const BASELINE_COST = 0.30; // $0.30 per company (old system)

  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_enrichments,
        ROUND(SUM(total_cost_cents) / 100, 2) as actual_cost_usd,
        ROUND(AVG(total_cost_cents), 4) as avg_cost_cents
      FROM enrichment_telemetry
      WHERE created_at >= $1 AND created_at <= $2`,
      [startDate, endDate]
    );

    const stats = result.rows[0];
    const baselineCost = stats.total_enrichments * BASELINE_COST;
    const savings = baselineCost - stats.actual_cost_usd;
    const savingsPercent = (savings / baselineCost) * 100;

    return {
      total_enrichments: parseInt(stats.total_enrichments),
      actual_cost_usd: parseFloat(stats.actual_cost_usd),
      baseline_cost_usd: parseFloat(baselineCost.toFixed(2)),
      savings_usd: parseFloat(savings.toFixed(2)),
      savings_percent: parseFloat(savingsPercent.toFixed(1)),
      avg_cost_cents: parseFloat(stats.avg_cost_cents)
    };
  } catch (error) {
    console.error('[telemetry] Failed to calculate ROI:', error.message);
    return null;
  }
}

/**
 * Get layer performance comparison
 * @returns {Promise<Array>} Layer comparison
 */
export async function getLayerPerformance() {
  try {
    const result = await pool.query(
      `SELECT
        layer_used,
        COUNT(*) as usage_count,
        ROUND(AVG(final_confidence), 3) as avg_confidence,
        ROUND(AVG(total_cost_cents), 4) as avg_cost_cents,
        ROUND(AVG(latency_ms), 0) as avg_latency_ms,
        ROUND((COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM enrichment_telemetry) * 100), 1) as usage_percent
      FROM enrichment_telemetry
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY layer_used
      ORDER BY usage_count DESC`
    );

    return result.rows;
  } catch (error) {
    console.error('[telemetry] Failed to get layer performance:', error.message);
    return [];
  }
}

// Alias for shorter function name
export async function recordTelemetry(telemetry) {
  return recordEnrichmentTelemetry(telemetry);
}

export default {
  recordEnrichmentTelemetry,
  recordTelemetry,
  getEnrichmentStats,
  getCostBreakdown,
  getDailyMetrics,
  calculateROI,
  getLayerPerformance
};
