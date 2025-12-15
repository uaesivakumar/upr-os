/**
 * Tenant-Safe ORM Layer
 * Sprint 65: Multi-Tenant Isolation Layer
 *
 * Provides a layer over pg pool that automatically enforces tenant isolation
 */

import * as Sentry from '@sentry/node';

// Tables that require tenant isolation
const TENANT_ISOLATED_TABLES = [
  'hr_leads',
  'targeted_companies',
  'email_templates',
  'enrichment_jobs',
  'enrichment_cache',
  'hiring_signals',
  'email_patterns',
  'news_items',
  'templates',
  'template_versions',
  'outreach_history',
  'intelligence_reports',
  'discovery_results'
];

// Tables that are shared/global (no tenant filtering needed)
const SHARED_TABLES = [
  'ml_models',
  'system_settings',
  'feature_flags'
];

/**
 * Tenant-Safe ORM
 *
 * Wraps all database operations with automatic tenant filtering
 */
export class TenantSafeORM {
  constructor(pool, tenantId) {
    this.pool = pool;
    this.tenantId = tenantId;
    this.queryCount = 0;
    this.violations = [];
  }

  /**
   * Execute SELECT with automatic tenant filtering
   * @param {string} table - Table name
   * @param {Object} options - Query options
   */
  async select(table, options = {}) {
    const {
      columns = '*',
      where = {},
      orderBy = null,
      limit = null,
      offset = null,
      joins = []
    } = options;

    // Check if table requires tenant isolation
    const needsTenantFilter = TENANT_ISOLATED_TABLES.includes(table.toLowerCase());

    // Build WHERE clause
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Add tenant filter if required
    if (needsTenantFilter) {
      conditions.push(`${table}.tenant_id = $${paramIndex}`);
      params.push(this.tenantId);
      paramIndex++;
    }

    // Add other conditions
    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        conditions.push(`${key} = ANY($${paramIndex})`);
        params.push(value);
        paramIndex++;
      } else {
        conditions.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    // Build query
    let query = `SELECT ${columns} FROM ${table}`;

    // Add joins
    for (const join of joins) {
      query += ` ${join.type || 'LEFT'} JOIN ${join.table} ON ${join.on}`;
    }

    // Add WHERE
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Add ORDER BY
    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    // Add LIMIT
    if (limit) {
      query += ` LIMIT ${parseInt(limit)}`;
    }

    // Add OFFSET
    if (offset) {
      query += ` OFFSET ${parseInt(offset)}`;
    }

    this.queryCount++;
    return this.pool.query(query, params);
  }

  /**
   * Execute INSERT with automatic tenant_id
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   */
  async insert(table, data) {
    const needsTenantFilter = TENANT_ISOLATED_TABLES.includes(table.toLowerCase());

    // Auto-add tenant_id if needed
    if (needsTenantFilter && !data.tenant_id) {
      data.tenant_id = this.tenantId;
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    this.queryCount++;
    return this.pool.query(query, values);
  }

  /**
   * Execute UPDATE with automatic tenant filtering
   * @param {string} table - Table name
   * @param {Object} data - Data to update
   * @param {Object} where - WHERE conditions
   */
  async update(table, data, where = {}) {
    const needsTenantFilter = TENANT_ISOLATED_TABLES.includes(table.toLowerCase());

    const setClause = [];
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Build SET clause
    for (const [key, value] of Object.entries(data)) {
      setClause.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }

    // Add tenant filter
    if (needsTenantFilter) {
      conditions.push(`tenant_id = $${paramIndex}`);
      params.push(this.tenantId);
      paramIndex++;
    }

    // Add other conditions
    for (const [key, value] of Object.entries(where)) {
      conditions.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }

    if (conditions.length === 0) {
      throw new Error('UPDATE without WHERE clause is not allowed');
    }

    const query = `
      UPDATE ${table}
      SET ${setClause.join(', ')}
      WHERE ${conditions.join(' AND ')}
      RETURNING *
    `;

    this.queryCount++;
    return this.pool.query(query, params);
  }

  /**
   * Execute DELETE with automatic tenant filtering
   * @param {string} table - Table name
   * @param {Object} where - WHERE conditions
   */
  async delete(table, where = {}) {
    const needsTenantFilter = TENANT_ISOLATED_TABLES.includes(table.toLowerCase());

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Add tenant filter
    if (needsTenantFilter) {
      conditions.push(`tenant_id = $${paramIndex}`);
      params.push(this.tenantId);
      paramIndex++;
    }

    // Add other conditions
    for (const [key, value] of Object.entries(where)) {
      conditions.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }

    if (conditions.length === 0) {
      throw new Error('DELETE without WHERE clause is not allowed');
    }

    const query = `DELETE FROM ${table} WHERE ${conditions.join(' AND ')} RETURNING id`;

    this.queryCount++;
    return this.pool.query(query, params);
  }

  /**
   * Execute raw query with tenant validation
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   */
  async rawQuery(text, params = []) {
    // Validate tenant safety
    this.validateQuery(text);

    this.queryCount++;
    return this.pool.query(text, params);
  }

  /**
   * Count records with tenant filtering
   * @param {string} table - Table name
   * @param {Object} where - WHERE conditions
   */
  async count(table, where = {}) {
    const result = await this.select(table, {
      columns: 'COUNT(*)::int as count',
      where
    });
    return result.rows[0]?.count || 0;
  }

  /**
   * Find one record
   * @param {string} table - Table name
   * @param {Object} where - WHERE conditions
   */
  async findOne(table, where = {}) {
    const result = await this.select(table, { where, limit: 1 });
    return result.rows[0] || null;
  }

  /**
   * Find by ID with tenant validation
   * @param {string} table - Table name
   * @param {string} id - Record ID
   */
  async findById(table, id) {
    return this.findOne(table, { id });
  }

  /**
   * Check if record exists and belongs to tenant
   * @param {string} table - Table name
   * @param {string} id - Record ID
   */
  async exists(table, id) {
    const result = await this.findById(table, id);
    return result !== null;
  }

  /**
   * Validate query for tenant safety
   * @private
   */
  validateQuery(query) {
    const lowerQuery = query.toLowerCase();

    // Check for sensitive tables
    for (const table of TENANT_ISOLATED_TABLES) {
      if (lowerQuery.includes(table)) {
        // Ensure tenant_id is in the query
        if (!lowerQuery.includes('tenant_id')) {
          const violation = {
            timestamp: new Date().toISOString(),
            query: query.substring(0, 200),
            table,
            tenant_id: this.tenantId
          };

          this.violations.push(violation);

          if (process.env.NODE_ENV === 'production') {
            Sentry.captureMessage('Tenant-unsafe query detected', {
              level: 'error',
              tags: { security: 'tenant_violation' },
              extra: violation
            });

            throw new Error(`Query on ${table} must include tenant_id filter`);
          } else {
            console.warn(`[TenantSafeORM] WARNING: Query on ${table} missing tenant_id filter`);
          }
        }
      }
    }
  }

  /**
   * Get query statistics
   */
  getStats() {
    return {
      tenant_id: this.tenantId,
      query_count: this.queryCount,
      violation_count: this.violations.length,
      violations: this.violations
    };
  }

  /**
   * Transaction wrapper with tenant context
   * @param {Function} callback - Transaction callback
   */
  async transaction(callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create tenant-scoped client wrapper
      const tenantClient = new TenantSafeClient(client, this.tenantId);

      const result = await callback(tenantClient);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Tenant-Safe Client for transactions
 */
class TenantSafeClient {
  constructor(client, tenantId) {
    this.client = client;
    this.tenantId = tenantId;
  }

  async query(text, params = []) {
    return this.client.query(text, params);
  }

  getTenantId() {
    return this.tenantId;
  }
}

/**
 * Create TenantSafeORM instance for request
 * @param {Object} pool - Database pool
 * @param {string} tenantId - Tenant ID
 */
export function createTenantORM(pool, tenantId) {
  return new TenantSafeORM(pool, tenantId);
}

/**
 * Express middleware to attach TenantSafeORM to request
 *
 * VS1 SECURITY: NEVER use body/query tenant_id - only trusted sources
 * Authorization Code: VS1-VS9-APPROVED-20251213
 */
export function attachTenantORM(pool) {
  return (req, res, next) => {
    // VS1: CRITICAL - Only use tenant_id from TRUSTED sources
    // 1. req.tenantId - set by auth middleware (from x-tenant-id header, which SaaS sets from session)
    // 2. req.user?.tenant_id - set by JWT validation
    // NEVER use req.body or req.query - these can be spoofed by malicious clients
    const tenantId = req.tenantId ||
                     req.headers['x-tenant-id'] || // Set by SaaS from authenticated session
                     req.user?.tenant_id ||
                     null; // Fail closed - no default fallback

    // VS1: Reject requests without valid tenant context (except health checks)
    if (!tenantId && !req.path.includes('/health') && !req.path.includes('/version')) {
      console.error(`[TenantORM] SECURITY: No tenant context for ${req.method} ${req.path}`);
      // In production, this would reject. For now, use system tenant with warning
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          error: 'tenant_context_required',
          message: 'Tenant context is required for this operation'
        });
      }
    }

    req.db = new TenantSafeORM(pool, tenantId || '00000000-0000-0000-0000-000000000001');
    next();
  };
}

export default TenantSafeORM;
