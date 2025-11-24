/**
 * Score Alert Service - Automated notifications for score changes
 */
import pg from 'pg';
const { Pool } = pg;

export class ScoreAlertService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  async checkScoreChange(opportunityId, oldScore, newScore) {
    const alerts = [];
    const change = newScore - oldScore;
    const percentChange = oldScore > 0 ? (change / oldScore) * 100 : 0;

    if (percentChange >= 20) {
      alerts.push(await this.createAlert({
        opportunityId,
        type: 'SCORE_INCREASE',
        severity: 'MEDIUM',
        message: `Score increased ${percentChange.toFixed(1)}%`
      }));
    } else if (percentChange <= -20) {
      alerts.push(await this.createAlert({
        opportunityId,
        type: 'SCORE_DECREASE',
        severity: 'HIGH',
        message: `Score dropped ${Math.abs(percentChange).toFixed(1)}%`
      }));
    }

    return alerts;
  }

  async createAlert(alert) {
    const query = `
      INSERT INTO score_alerts (opportunity_id, alert_type, severity, message)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await this.pool.query(query, [
      alert.opportunityId,
      alert.type,
      alert.severity,
      alert.message
    ]);
    return result.rows[0];
  }

  async getAlerts(options = {}) {
    const { limit = 50, severity = null, acknowledged = null } = options;

    let query = 'SELECT * FROM score_alerts WHERE 1=1';
    const params = [];

    if (severity) {
      params.push(severity);
      query += ` AND severity = $${params.length}`;
    }

    if (acknowledged !== null) {
      params.push(acknowledged);
      query += ` AND acknowledged = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async acknowledgeAlert(alertId, userId) {
    const query = `
      UPDATE score_alerts
      SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.pool.query(query, [alertId, userId]);
    return result.rows[0];
  }

  async bulkAcknowledgeAlerts(alertIds, userId) {
    const query = `
      UPDATE score_alerts
      SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
      WHERE id = ANY($1)
      RETURNING *
    `;
    const result = await this.pool.query(query, [alertIds, userId]);
    return result.rows;
  }

  async getAlertStats(options = {}) {
    const { days = 7 } = options;

    const query = `
      SELECT
        alert_type,
        severity,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE acknowledged = TRUE) as acknowledged_count,
        COUNT(*) FILTER (WHERE acknowledged = FALSE) as pending_count
      FROM score_alerts
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY alert_type, severity
      ORDER BY
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
        END,
        count DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  async getRecentAlerts(options = {}) {
    const { limit = 20, acknowledged = false } = options;

    let query = `
      SELECT
        sa.*,
        ls.lead_score,
        ls.grade,
        ls.priority_score
      FROM score_alerts sa
      LEFT JOIN lead_scores ls ON sa.opportunity_id = ls.opportunity_id
      WHERE 1=1
    `;

    const params = [];

    if (acknowledged !== null) {
      params.push(acknowledged);
      query += ` AND sa.acknowledged = $${params.length}`;
    }

    query += `
      ORDER BY
        CASE sa.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
        END,
        sa.created_at DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async close() {
    await this.pool.end();
  }
}

export default ScoreAlertService;
