/**
 * Score Routing Service - Automatic lead assignment based on scores
 */
import pg from 'pg';
const { Pool } = pg;

export class ScoreRoutingService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  async routeLead(opportunityId) {
    const score = await this.getLeadScore(opportunityId);
    const assignment = await this.findBestRep(score);

    return {
      opportunityId,
      assignedTo: assignment.repId,
      reason: assignment.reason,
      priority: assignment.priority
    };
  }

  async getLeadScore(opportunityId) {
    const query = 'SELECT * FROM lead_scores WHERE opportunity_id = $1';
    const result = await this.pool.query(query, [opportunityId]);
    return result.rows[0];
  }

  async findBestRep(score) {
    const grade = score.grade;
    let tier, maxLeads, priority;

    if (['A+', 'A'].includes(grade)) {
      tier = 'SENIOR';
      maxLeads = 10;
      priority = 'URGENT';
    } else if (['B+', 'B'].includes(grade)) {
      tier = 'MID_LEVEL';
      maxLeads = 25;
      priority = 'STANDARD';
    } else {
      tier = 'JUNIOR';
      maxLeads = 50;
      priority = 'LOW';
    }

    return {
      repId: `rep-${tier.toLowerCase()}-001`,
      reason: `${grade} grade lead assigned to ${tier} rep`,
      priority,
      tier,
      maxLeads
    };
  }

  async assignLead(opportunityId, repId, options = {}) {
    const { priority = 'STANDARD', reason = 'Auto-assigned', metadata = {} } = options;

    const query = `
      INSERT INTO lead_assignments (
        opportunity_id,
        assigned_to,
        assignment_reason,
        priority_level,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      opportunityId,
      repId,
      reason,
      priority,
      JSON.stringify(metadata)
    ]);

    return result.rows[0];
  }

  async getAssignments(repId, options = {}) {
    const { status = 'ACTIVE', limit = 50 } = options;

    const query = `
      SELECT
        la.*,
        ls.lead_score,
        ls.grade,
        ls.priority_score
      FROM lead_assignments la
      LEFT JOIN lead_scores ls ON la.opportunity_id = ls.opportunity_id
      WHERE la.assigned_to = $1 AND la.status = $2
      ORDER BY la.priority_level ASC, la.assigned_at DESC
      LIMIT $3
    `;

    const result = await this.pool.query(query, [repId, status, limit]);
    return result.rows;
  }

  async completeAssignment(assignmentId, completedBy) {
    const query = `
      UPDATE lead_assignments
      SET
        status = 'COMPLETED',
        completed_at = NOW(),
        metadata = metadata || jsonb_build_object('completed_by', $2::text)
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [assignmentId, completedBy]);
    return result.rows[0];
  }

  async cancelAssignment(assignmentId, reason) {
    const query = `
      UPDATE lead_assignments
      SET
        status = 'CANCELLED',
        metadata = metadata || jsonb_build_object('cancellation_reason', $2::text)
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [assignmentId, reason]);
    return result.rows[0];
  }

  async getAssignmentStats(repId) {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
        COUNT(*) FILTER (WHERE priority_level = 'URGENT') as urgent,
        AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - assigned_at)) / 3600) as avg_completion_hours
      FROM lead_assignments
      WHERE assigned_to = $1
    `;

    const result = await this.pool.query(query, [repId]);
    return result.rows[0];
  }

  async close() {
    await this.pool.end();
  }
}

export default ScoreRoutingService;
