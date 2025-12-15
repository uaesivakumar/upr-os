/**
 * SIVA Entity Context Service
 * Sprint 76: Intelligent UI Integration
 *
 * Provides REAL data context for SIVA tools by querying the database.
 * This is the "nervous system" connecting SIVA's brain to actual entity data.
 *
 * Key Functions:
 * - getCompanyContext(): Full company data with signals for SIVA analysis
 * - getLeadContext(): Lead/contact data with company context
 * - getSignalsForCompany(): All hiring signals for a company
 * - getProactiveInsights(): Auto-generated insights for an entity
 */

const { pool } = require('../../utils/db');

// Demo tenant for fallback
const DEMO_TENANT_ID = 'e2d48fa8-f6d1-4b70-a939-29efb47b0dc9';

/**
 * Get full company context for SIVA tools
 * Queries hiring_signals and aggregates all available data
 *
 * @param {Object} params - Query parameters
 * @param {string} params.companyId - Company UUID (from hiring_signals.id)
 * @param {string} params.companyName - Company name to search
 * @param {string} params.domain - Company domain
 * @param {string} params.tenantId - Tenant ID
 * @returns {Promise<Object>} Full company context for SIVA
 */
async function getCompanyContext({ companyId, companyName, domain, tenantId }) {
  const effectiveTenantId = tenantId || DEMO_TENANT_ID;

  let query;
  let params;

  if (companyId) {
    // Direct lookup by ID
    query = `
      SELECT * FROM hiring_signals
      WHERE id = $1 AND tenant_id = $2
    `;
    params = [companyId, effectiveTenantId];
  } else if (companyName) {
    // Search by company name (case-insensitive)
    query = `
      SELECT * FROM hiring_signals
      WHERE LOWER(company) LIKE LOWER($1)
        AND tenant_id = $2
        AND review_status = 'pending'
      ORDER BY confidence_score DESC NULLS LAST, detected_at DESC
      LIMIT 10
    `;
    params = [`%${companyName}%`, effectiveTenantId];
  } else if (domain) {
    // Search by domain
    query = `
      SELECT * FROM hiring_signals
      WHERE domain = $1 AND tenant_id = $2
      ORDER BY confidence_score DESC NULLS LAST
      LIMIT 10
    `;
    params = [domain, effectiveTenantId];
  } else {
    return null;
  }

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  // Aggregate signals for the company
  const signals = result.rows;
  const primarySignal = signals[0];

  // Build comprehensive company context
  const companyContext = {
    // Basic Info
    id: primarySignal.id,
    name: primarySignal.company,
    domain: primarySignal.domain,
    sector: primarySignal.sector,
    location: primarySignal.location,

    // Derived fields for SIVA tools
    industry: primarySignal.sector || 'Business Services',
    employee_count: estimateEmployeeCount(primarySignal),
    revenue_usd: estimateRevenue(primarySignal),
    founded_year: null, // Would need enrichment

    // Hiring Intelligence
    hiring_likelihood: primarySignal.hiring_likelihood,
    hiring_likelihood_score: primarySignal.hiring_likelihood_score,
    confidence_score: parseFloat(primarySignal.confidence_score) || 0.5,
    quality_score: parseFloat(primarySignal.quality_score) || 0.5,
    quality_tier: primarySignal.quality_tier,

    // Signals Array
    signals: signals.map(s => ({
      id: s.id,
      type: s.trigger_type,
      description: s.description,
      source_url: s.source_url,
      source_date: s.source_date,
      evidence_quote: s.evidence_quote,
      confidence: parseFloat(s.confidence_score) || 0.5,
      detected_at: s.detected_at
    })),

    // Aggregated Signal Stats
    signal_count: signals.length,
    signal_types: [...new Set(signals.map(s => s.trigger_type).filter(Boolean))],
    latest_signal_date: signals[0]?.source_date || signals[0]?.detected_at,
    avg_confidence: signals.reduce((sum, s) => sum + (parseFloat(s.confidence_score) || 0.5), 0) / signals.length,

    // Geo Intelligence
    geo_status: primarySignal.geo_status,
    geo_hints: primarySignal.geo_hints,

    // Role Intelligence
    role_cluster: primarySignal.role_cluster,

    // Quality Breakdown (if available)
    quality_breakdown: primarySignal.quality_breakdown,

    // Meta
    tenant_id: primarySignal.tenant_id,
    source: 'hiring_signals_db',
    fetched_at: new Date().toISOString()
  };

  return companyContext;
}

/**
 * Get all signals for a company
 *
 * @param {string} companyName - Company name
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of signals
 */
async function getSignalsForCompany(companyName, tenantId) {
  const effectiveTenantId = tenantId || DEMO_TENANT_ID;

  const result = await pool.query(`
    SELECT
      id, trigger_type, description, hiring_likelihood_score,
      confidence_score, source_url, source_date, evidence_quote,
      detected_at, quality_score, quality_tier
    FROM hiring_signals
    WHERE LOWER(company) = LOWER($1)
      AND tenant_id = $2
      AND review_status = 'pending'
    ORDER BY confidence_score DESC NULLS LAST, detected_at DESC
  `, [companyName, effectiveTenantId]);

  return result.rows;
}

/**
 * Get lead/contact context with company data
 *
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Lead context with company
 */
async function getLeadContext({ leadId, email, companyName, tenantId }) {
  // For now, we build lead context from company context
  // In future, this would query a contacts table
  const companyContext = await getCompanyContext({ companyName, tenantId });

  if (!companyContext) {
    return null;
  }

  // Extract potential contact info from role_cluster if available
  const roleCluster = companyContext.role_cluster || {};

  return {
    // Lead Info (derived or placeholder)
    id: leadId || `lead-${companyContext.id}`,
    name: roleCluster.contact_name || 'Decision Maker',
    title: roleCluster.target_title || inferTargetTitle(companyContext),
    email: email || null,
    seniority: inferSeniority(roleCluster.target_title),
    department: inferDepartment(roleCluster.target_title),

    // Company Context (full)
    company: companyContext,

    // Derived for SIVA tools
    company_name: companyContext.name,
    company_size: companyContext.employee_count,
    industry: companyContext.industry,
    location: companyContext.location
  };
}

/**
 * Get top companies for proactive analysis
 *
 * @param {string} tenantId - Tenant ID
 * @param {number} limit - Number of companies
 * @returns {Promise<Array>} Top companies with context
 */
async function getTopCompaniesForAnalysis(tenantId, limit = 5) {
  const effectiveTenantId = tenantId || DEMO_TENANT_ID;

  const result = await pool.query(`
    SELECT DISTINCT ON (LOWER(company))
      id, company, domain, sector, location,
      hiring_likelihood_score, confidence_score, quality_score,
      trigger_type, description, detected_at
    FROM hiring_signals
    WHERE tenant_id = $1
      AND review_status = 'pending'
      AND hiring_likelihood_score >= 3
    ORDER BY LOWER(company), hiring_likelihood_score DESC, confidence_score DESC
    LIMIT $2
  `, [effectiveTenantId, limit * 2]);

  // Get full context for each
  const companies = [];
  for (const row of result.rows.slice(0, limit)) {
    const context = await getCompanyContext({
      companyName: row.company,
      tenantId: effectiveTenantId
    });
    if (context) {
      companies.push(context);
    }
  }

  return companies;
}

/**
 * Search companies by various criteria
 *
 * @param {Object} params - Search parameters
 * @returns {Promise<Array>} Matching companies
 */
async function searchCompanies({ query, sector, location, minScore, tenantId, limit = 20 }) {
  const effectiveTenantId = tenantId || DEMO_TENANT_ID;

  let sql = `
    SELECT DISTINCT ON (LOWER(company))
      id, company, domain, sector, location,
      hiring_likelihood_score, confidence_score, quality_score,
      trigger_type, description
    FROM hiring_signals
    WHERE tenant_id = $1
      AND review_status = 'pending'
  `;
  const params = [effectiveTenantId];
  let paramIndex = 2;

  if (query) {
    sql += ` AND (LOWER(company) LIKE LOWER($${paramIndex}) OR LOWER(description) LIKE LOWER($${paramIndex}))`;
    params.push(`%${query}%`);
    paramIndex++;
  }

  if (sector) {
    sql += ` AND LOWER(sector) = LOWER($${paramIndex})`;
    params.push(sector);
    paramIndex++;
  }

  if (location) {
    sql += ` AND LOWER(location) LIKE LOWER($${paramIndex})`;
    params.push(`%${location}%`);
    paramIndex++;
  }

  if (minScore) {
    sql += ` AND hiring_likelihood_score >= $${paramIndex}`;
    params.push(minScore);
    paramIndex++;
  }

  sql += ` ORDER BY LOWER(company), hiring_likelihood_score DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await pool.query(sql, params);
  return result.rows;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Estimate employee count from signals/sector
 */
function estimateEmployeeCount(signal) {
  // Use role_cluster hints if available
  if (signal.role_cluster?.company_size) {
    return signal.role_cluster.company_size;
  }

  // Estimate based on sector
  const sectorEstimates = {
    'Banking': 500,
    'Financial Services': 300,
    'Technology': 150,
    'Healthcare': 200,
    'Manufacturing': 250,
    'Retail': 100,
    'default': 100
  };

  return sectorEstimates[signal.sector] || sectorEstimates.default;
}

/**
 * Estimate revenue from signals/sector
 */
function estimateRevenue(signal) {
  const employeeCount = estimateEmployeeCount(signal);
  // Rough estimate: $150k revenue per employee
  return employeeCount * 150000;
}

/**
 * Infer target title based on company context
 */
function inferTargetTitle(companyContext) {
  const sector = companyContext.sector?.toLowerCase() || '';

  if (sector.includes('bank') || sector.includes('financial')) {
    return 'Head of Corporate Banking';
  } else if (sector.includes('tech')) {
    return 'CTO';
  } else if (sector.includes('retail')) {
    return 'CFO';
  }

  return 'CEO';
}

/**
 * Infer seniority from title
 */
function inferSeniority(title) {
  if (!title) return 'Director';

  const t = title.toLowerCase();
  if (t.includes('ceo') || t.includes('cto') || t.includes('cfo') || t.includes('chief')) {
    return 'C-Level';
  } else if (t.includes('vp') || t.includes('vice president')) {
    return 'VP';
  } else if (t.includes('director') || t.includes('head')) {
    return 'Director';
  } else if (t.includes('manager')) {
    return 'Manager';
  }

  return 'Director';
}

/**
 * Infer department from title
 */
function inferDepartment(title) {
  if (!title) return 'Executive';

  const t = title.toLowerCase();
  if (t.includes('finance') || t.includes('cfo')) return 'Finance';
  if (t.includes('hr') || t.includes('human')) return 'HR';
  if (t.includes('tech') || t.includes('cto') || t.includes('engineering')) return 'Technology';
  if (t.includes('sales')) return 'Sales';
  if (t.includes('marketing')) return 'Marketing';
  if (t.includes('operation')) return 'Operations';

  return 'Executive';
}

module.exports = {
  getCompanyContext,
  getSignalsForCompany,
  getLeadContext,
  getTopCompaniesForAnalysis,
  searchCompanies,
  DEMO_TENANT_ID
};
