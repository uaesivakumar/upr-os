/**
 * LeadAssignmentService - S121.3
 *
 * Prevent 25 salespeople from chasing same 6 leads.
 * OS manages lead assignment, collision prevention, and fair distribution.
 *
 * ARCHITECTURE:
 * - OS-OWNED: State management, collision prevention
 * - Soft assignment (auto-assign on view)
 * - Hard assignment (user claims lead)
 * - Auto-release after 7 days no action
 */

import { getPool } from '../../database/pool.js';

class LeadAssignmentService {
  constructor() {
    this.tableName = 'lead_assignments';
  }

  /**
   * Soft assign lead to user (auto-assign on view)
   * @param {string} poolId
   * @param {string} tenantId
   * @param {string} userId
   * @returns {Object} Assignment record
   */
  async softAssign(poolId, tenantId, userId) {
    const pool = getPool();

    // Check if already assigned to this user
    const existing = await this.getAssignment(poolId, tenantId, userId);
    if (existing) {
      // Update viewed_at if first view
      if (!existing.viewed_at) {
        await pool.query(`
          UPDATE lead_assignments
          SET viewed_at = NOW(), status = 'viewed'
          WHERE id = $1
        `, [existing.id]);
      }
      return existing;
    }

    // Check if assigned to another user (collision prevention)
    const otherAssignment = await this.getActiveAssignment(poolId, tenantId);
    if (otherAssignment && otherAssignment.user_id !== userId) {
      // Already assigned to someone else
      return {
        assigned: false,
        reason: 'already_assigned',
        assignedTo: otherAssignment.user_id,
        assignedAt: otherAssignment.assigned_at
      };
    }

    // Create soft assignment
    const result = await pool.query(`
      INSERT INTO lead_assignments (
        pool_id, tenant_id, user_id, assignment_type, status
      ) VALUES ($1, $2, $3, 'auto', 'assigned')
      ON CONFLICT (pool_id, tenant_id, user_id)
      DO UPDATE SET
        viewed_at = NOW(),
        status = 'viewed',
        updated_at = NOW()
      RETURNING *
    `, [poolId, tenantId, userId]);

    return result.rows[0];
  }

  /**
   * Hard assign (claim) lead to user
   * @param {string} poolId
   * @param {string} tenantId
   * @param {string} userId
   * @returns {Object} Assignment record
   */
  async claimLead(poolId, tenantId, userId) {
    const pool = getPool();

    // Check if already claimed by another user
    const otherAssignment = await this.getActiveAssignment(poolId, tenantId);
    if (otherAssignment && otherAssignment.user_id !== userId && otherAssignment.assignment_type === 'claimed') {
      return {
        claimed: false,
        reason: 'already_claimed',
        claimedBy: otherAssignment.user_id,
        claimedAt: otherAssignment.assigned_at
      };
    }

    // Create or update to claimed assignment
    const result = await pool.query(`
      INSERT INTO lead_assignments (
        pool_id, tenant_id, user_id, assignment_type, status
      ) VALUES ($1, $2, $3, 'claimed', 'assigned')
      ON CONFLICT (pool_id, tenant_id, user_id)
      DO UPDATE SET
        assignment_type = 'claimed',
        status = 'assigned',
        updated_at = NOW()
      RETURNING *
    `, [poolId, tenantId, userId]);

    return { claimed: true, ...result.rows[0] };
  }

  /**
   * Mark lead as contacted
   * @param {string} poolId
   * @param {string} tenantId
   * @param {string} userId
   * @param {string} channel - 'email', 'linkedin', 'phone', 'sms'
   * @returns {Object} Updated assignment
   */
  async markContacted(poolId, tenantId, userId, channel) {
    const pool = getPool();

    const result = await pool.query(`
      UPDATE lead_assignments
      SET
        status = 'contacted',
        contacted_at = NOW(),
        contact_attempts = contact_attempts + 1,
        last_contact_at = NOW(),
        contact_channel = $4,
        updated_at = NOW()
      WHERE pool_id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING *
    `, [poolId, tenantId, userId, channel]);

    return result.rows[0];
  }

  /**
   * Mark lead as converted
   * @param {string} poolId
   * @param {string} tenantId
   * @param {string} userId
   * @returns {Object} Updated assignment
   */
  async markConverted(poolId, tenantId, userId) {
    const pool = getPool();

    const result = await pool.query(`
      UPDATE lead_assignments
      SET
        status = 'converted',
        converted_at = NOW(),
        updated_at = NOW()
      WHERE pool_id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING *
    `, [poolId, tenantId, userId]);

    return result.rows[0];
  }

  /**
   * Release lead (manual or auto)
   * @param {string} poolId
   * @param {string} tenantId
   * @param {string} userId
   * @param {string} reason - 'no_action', 'manual', 'territory_change', 'expired'
   * @returns {Object} Updated assignment
   */
  async releaseLead(poolId, tenantId, userId, reason = 'manual') {
    const pool = getPool();

    const result = await pool.query(`
      UPDATE lead_assignments
      SET
        status = 'released',
        released_at = NOW(),
        release_reason = $4,
        updated_at = NOW()
      WHERE pool_id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING *
    `, [poolId, tenantId, userId, reason]);

    return result.rows[0];
  }

  /**
   * Auto-release abandoned assignments (7 days no action)
   * @returns {number} Count of released assignments
   */
  async releaseAbandonedAssignments() {
    const pool = getPool();
    const result = await pool.query('SELECT release_abandoned_assignments()');
    return result.rows[0].release_abandoned_assignments;
  }

  /**
   * Get assignment for user
   * @param {string} poolId
   * @param {string} tenantId
   * @param {string} userId
   * @returns {Object} Assignment
   */
  async getAssignment(poolId, tenantId, userId) {
    const pool = getPool();
    const result = await pool.query(`
      SELECT * FROM lead_assignments
      WHERE pool_id = $1 AND tenant_id = $2 AND user_id = $3
    `, [poolId, tenantId, userId]);

    return result.rows[0];
  }

  /**
   * Get active assignment for a lead (any user)
   * @param {string} poolId
   * @param {string} tenantId
   * @returns {Object} Active assignment if exists
   */
  async getActiveAssignment(poolId, tenantId) {
    const pool = getPool();
    const result = await pool.query(`
      SELECT * FROM lead_assignments
      WHERE pool_id = $1 AND tenant_id = $2
        AND status IN ('assigned', 'viewed', 'contacted')
      ORDER BY assigned_at ASC
      LIMIT 1
    `, [poolId, tenantId]);

    return result.rows[0];
  }

  /**
   * Get user's assigned leads
   * @param {string} tenantId
   * @param {string} userId
   * @param {Object} filters - { status, limit, offset }
   * @returns {Array} User's assignments with lead details
   */
  async getUserAssignments(tenantId, userId, filters = {}) {
    const pool = getPool();
    const conditions = ['la.tenant_id = $1', 'la.user_id = $2'];
    const values = [tenantId, userId];
    let paramIndex = 3;

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`la.status = ANY($${paramIndex})`);
        values.push(filters.status);
      } else {
        conditions.push(`la.status = $${paramIndex}`);
        values.push(filters.status);
      }
      paramIndex++;
    }

    const query = `
      SELECT
        la.*,
        dp.company_name,
        dp.company_domain,
        dp.industry,
        dp.location,
        dp.signal_type,
        dp.signal_title,
        dp.base_score,
        dp.edge_case_type
      FROM lead_assignments la
      JOIN discovery_pool dp ON la.pool_id = dp.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY la.assigned_at DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    values.push(filters.limit || 50);
    values.push(filters.offset || 0);

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get assignment statistics for tenant
   * @param {string} tenantId
   * @returns {Object} Stats
   */
  async getTenantStats(tenantId) {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
        COUNT(*) FILTER (WHERE status = 'viewed') as viewed,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COUNT(*) FILTER (WHERE status = 'released') as released,
        COUNT(DISTINCT user_id) as active_users,
        AVG(EXTRACT(EPOCH FROM (COALESCE(contacted_at, NOW()) - assigned_at)) / 3600)::INTEGER as avg_hours_to_contact
      FROM lead_assignments
      WHERE tenant_id = $1
    `, [tenantId]);

    return result.rows[0];
  }

  /**
   * Get user's statistics
   * @param {string} tenantId
   * @param {string} userId
   * @returns {Object} User stats
   */
  async getUserStats(tenantId, userId) {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
        COUNT(*) FILTER (WHERE status = 'viewed') as viewed,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COUNT(*) FILTER (WHERE status = 'released') as released,
        SUM(contact_attempts) as total_contacts,
        COUNT(*) FILTER (WHERE converted_at IS NOT NULL)::FLOAT /
          NULLIF(COUNT(*) FILTER (WHERE contacted_at IS NOT NULL), 0) as conversion_rate
      FROM lead_assignments
      WHERE tenant_id = $1 AND user_id = $2
    `, [tenantId, userId]);

    return result.rows[0];
  }

  /**
   * Add user note to assignment
   * @param {string} poolId
   * @param {string} tenantId
   * @param {string} userId
   * @param {string} note
   * @returns {Object} Updated assignment
   */
  async addNote(poolId, tenantId, userId, note) {
    const pool = getPool();

    const result = await pool.query(`
      UPDATE lead_assignments
      SET
        user_notes = COALESCE(user_notes, '') || E'\n' || $4,
        updated_at = NOW()
      WHERE pool_id = $1 AND tenant_id = $2 AND user_id = $3
      RETURNING *
    `, [poolId, tenantId, userId, `[${new Date().toISOString()}] ${note}`]);

    return result.rows[0];
  }
}

export default LeadAssignmentService;
export { LeadAssignmentService };
