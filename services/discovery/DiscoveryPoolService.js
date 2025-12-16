/**
 * DiscoveryPoolService - S121.1
 *
 * OS-OWNED service for managing the discovery pool.
 * Mechanical, tenant-level storage for discovered opportunities.
 *
 * ARCHITECTURE:
 * - OS owns persistence and deduplication
 * - SIVA reads from pool, never writes directly
 * - One crawl benefits all tenant users
 */

import crypto from 'crypto';
import { getPool } from '../../db/index.js';

class DiscoveryPoolService {
  constructor() {
    this.tableName = 'discovery_pool';
  }

  /**
   * Generate company hash for deduplication
   * @param {string} companyName
   * @param {string} domain
   * @returns {string} SHA256 hash
   */
  generateCompanyHash(companyName, domain) {
    const normalized = `${(companyName || '').toLowerCase().trim()}:${(domain || '').toLowerCase().trim()}`;
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Upsert discovered company to pool
   * @param {string} tenantId
   * @param {Object} company
   * @returns {Object} Upserted record
   */
  async upsertCompany(tenantId, company) {
    const pool = getPool();
    const companyHash = this.generateCompanyHash(company.name, company.domain);

    const query = `
      INSERT INTO discovery_pool (
        tenant_id, company_name, company_domain, company_hash,
        industry, sector, estimated_size, estimated_headcount,
        location, location_city, location_country,
        signal_type, signal_title, signal_description, signal_source, signal_source_url, signal_date, signal_confidence,
        discovered_by, source_query, query_template_id,
        edge_case_type, edge_case_multiplier, base_score, has_expansion_signals, has_recent_signals,
        vertical_id, sub_vertical_id, region_code,
        raw_data, expires_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21,
        $22, $23, $24, $25, $26,
        $27, $28, $29,
        $30, NOW() + INTERVAL '30 days'
      )
      ON CONFLICT (tenant_id, company_hash)
      DO UPDATE SET
        signal_type = EXCLUDED.signal_type,
        signal_title = EXCLUDED.signal_title,
        signal_description = EXCLUDED.signal_description,
        signal_source = EXCLUDED.signal_source,
        signal_source_url = EXCLUDED.signal_source_url,
        signal_date = EXCLUDED.signal_date,
        signal_confidence = EXCLUDED.signal_confidence,
        edge_case_type = EXCLUDED.edge_case_type,
        edge_case_multiplier = EXCLUDED.edge_case_multiplier,
        base_score = EXCLUDED.base_score,
        has_expansion_signals = EXCLUDED.has_expansion_signals,
        has_recent_signals = EXCLUDED.has_recent_signals,
        last_refreshed_at = NOW(),
        refresh_count = discovery_pool.refresh_count + 1,
        is_stale = FALSE,
        expires_at = NOW() + INTERVAL '30 days',
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      tenantId,
      company.name,
      company.domain,
      companyHash,
      company.industry,
      company.sector || 'private',
      company.estimatedSize,
      company.headcount,
      company.location,
      company.locationCity,
      company.locationCountry,
      company.signal?.type,
      company.signal?.title,
      company.signal?.description,
      company.signal?.source,
      company.signal?.sourceUrl,
      company.signal?.date,
      company.signal?.confidence || 0.5,
      company.discoveredBy || 'crawler',
      company.sourceQuery,
      company.queryTemplateId,
      company.edgeCaseType || 'normal',
      company.edgeCaseMultiplier || 1.0,
      company.baseScore || 50,
      company.hasExpansionSignals || false,
      company.hasRecentSignals || false,
      company.verticalId,
      company.subVerticalId,
      company.regionCode,
      JSON.stringify(company.rawData || {})
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Bulk upsert companies to pool
   * @param {string} tenantId
   * @param {Array} companies
   * @returns {Object} Stats { inserted, updated, deduplicated }
   */
  async bulkUpsert(tenantId, companies) {
    const stats = { inserted: 0, updated: 0, deduplicated: 0, errors: 0 };

    for (const company of companies) {
      try {
        const result = await this.upsertCompany(tenantId, company);
        if (result.refresh_count === 0) {
          stats.inserted++;
        } else {
          stats.updated++;
        }
      } catch (error) {
        if (error.code === '23505') { // Unique violation
          stats.deduplicated++;
        } else {
          stats.errors++;
          console.error(`[DiscoveryPool] Error upserting ${company.name}:`, error.message);
        }
      }
    }

    return stats;
  }

  /**
   * Query pool with filters (for SIVA to consume)
   * @param {Object} filters
   * @returns {Array} Companies from pool
   */
  async queryPool(filters) {
    const pool = getPool();
    const conditions = ['tenant_id = $1', 'is_stale = FALSE'];
    const values = [filters.tenantId];
    let paramIndex = 2;

    // Territory filter
    if (filters.territories && filters.territories.length > 0) {
      conditions.push(`(location_city = ANY($${paramIndex}) OR location_country = ANY($${paramIndex}))`);
      values.push(filters.territories);
      paramIndex++;
    }

    // Vertical filter
    if (filters.verticalId) {
      conditions.push(`vertical_id = $${paramIndex}`);
      values.push(filters.verticalId);
      paramIndex++;
    }

    // Sub-vertical filter
    if (filters.subVerticalId) {
      conditions.push(`sub_vertical_id = $${paramIndex}`);
      values.push(filters.subVerticalId);
      paramIndex++;
    }

    // Freshness filter (days)
    if (filters.freshnessDays) {
      conditions.push(`discovered_at > NOW() - INTERVAL '${parseInt(filters.freshnessDays)} days'`);
    }

    // Minimum score filter
    if (filters.minScore) {
      conditions.push(`base_score >= $${paramIndex}`);
      values.push(filters.minScore);
      paramIndex++;
    }

    // Edge case type filter
    if (filters.edgeCaseType) {
      conditions.push(`edge_case_type = $${paramIndex}`);
      values.push(filters.edgeCaseType);
      paramIndex++;
    }

    // Exclude already assigned to user
    if (filters.excludeAssignedToUser) {
      conditions.push(`
        id NOT IN (
          SELECT pool_id FROM lead_assignments
          WHERE tenant_id = $1 AND user_id = $${paramIndex}
          AND status IN ('assigned', 'viewed', 'contacted')
        )
      `);
      values.push(filters.excludeAssignedToUser);
      paramIndex++;
    }

    const query = `
      SELECT
        id, company_name, company_domain, industry, sector,
        estimated_size, estimated_headcount, location, location_city, location_country,
        signal_type, signal_title, signal_description, signal_source, signal_source_url, signal_date, signal_confidence,
        edge_case_type, edge_case_multiplier, base_score, has_expansion_signals, has_recent_signals,
        vertical_id, sub_vertical_id, region_code,
        discovered_at, last_refreshed_at, refresh_count
      FROM discovery_pool
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        base_score DESC,
        has_recent_signals DESC,
        discovered_at DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    values.push(filters.limit || 50);
    values.push(filters.offset || 0);

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get pool statistics for tenant
   * @param {string} tenantId
   * @returns {Object} Stats
   */
  async getPoolStats(tenantId) {
    const pool = getPool();

    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_stale = FALSE) as active,
        COUNT(*) FILTER (WHERE is_stale = TRUE) as stale,
        COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '7 days') as fresh_7d,
        COUNT(*) FILTER (WHERE edge_case_type = 'enterprise') as enterprise,
        COUNT(*) FILTER (WHERE edge_case_type = 'government') as government,
        COUNT(*) FILTER (WHERE has_expansion_signals = TRUE) as with_signals,
        AVG(base_score)::INTEGER as avg_score,
        MAX(discovered_at) as last_discovery
      FROM discovery_pool
      WHERE tenant_id = $1
    `;

    const result = await pool.query(query, [tenantId]);
    return result.rows[0];
  }

  /**
   * Mark companies as stale
   * @returns {number} Count of affected rows
   */
  async markStaleCompanies() {
    const pool = getPool();
    const result = await pool.query('SELECT mark_stale_discovery_pool()');
    return result.rows[0].mark_stale_discovery_pool;
  }

  /**
   * Get company by ID
   * @param {string} id
   * @returns {Object} Company
   */
  async getById(id) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM discovery_pool WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  /**
   * Delete expired companies (cleanup job)
   * @param {number} daysOld - Delete companies older than this many days past expiry
   * @returns {number} Count of deleted rows
   */
  async deleteExpired(daysOld = 30) {
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM discovery_pool
       WHERE expires_at < NOW() - INTERVAL '${parseInt(daysOld)} days'
       RETURNING id`
    );
    return result.rowCount;
  }
}

export default DiscoveryPoolService;
export { DiscoveryPoolService };
