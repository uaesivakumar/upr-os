/**
 * Lifecycle State Persistence
 * Database layer for opportunity lifecycle state management
 *
 * Responsibilities:
 * - Save state transitions to database
 * - Query current state
 * - Retrieve lifecycle history
 * - Analytics queries
 * - State change triggers
 */

import pg from 'pg';
const { Pool } = pg;

export class LifecycleStatePersistence {
  constructor(connectionString = null) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL
    });
  }

  /**
   * Create a new state entry
   */
  async createState(stateData) {
    const {
      opportunityId,
      state,
      subState = null,
      triggerType,
      triggerReason = '',
      triggeredBy = null,
      previousState = null,
      metadata = {}
    } = stateData;

    const query = `
      INSERT INTO opportunity_lifecycle (
        opportunity_id, state, sub_state, trigger_type,
        trigger_reason, triggered_by, previous_state, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, entered_at
    `;

    const values = [
      opportunityId,
      state,
      subState,
      triggerType,
      triggerReason,
      triggeredBy,
      previousState,
      JSON.stringify(metadata)
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error creating state:', error);
      throw error;
    }
  }

  /**
   * Close a state (mark as exited)
   */
  async closeState(stateId, nextState) {
    const query = `
      UPDATE opportunity_lifecycle
      SET exited_at = NOW(), next_state = $2
      WHERE id = $1
      RETURNING id, exited_at
    `;

    try {
      const result = await this.pool.query(query, [stateId, nextState]);
      return result.rows[0];
    } catch (error) {
      console.error('Error closing state:', error);
      throw error;
    }
  }

  /**
   * Get current state for an opportunity
   */
  async getCurrentState(opportunityId) {
    const query = `
      SELECT id, state, sub_state, entered_at, trigger_type,
             trigger_reason, previous_state, metadata,
             EXTRACT(EPOCH FROM (NOW() - entered_at))::INTEGER as seconds_in_state
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1 AND exited_at IS NULL
      ORDER BY entered_at DESC
      LIMIT 1
    `;

    try {
      const result = await this.pool.query(query, [opportunityId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting current state:', error);
      throw error;
    }
  }

  /**
   * Get complete lifecycle history for an opportunity
   */
  async getLifecycleHistory(opportunityId) {
    const query = `
      SELECT state, sub_state, entered_at, exited_at, duration_seconds,
             trigger_type, trigger_reason, previous_state, next_state, metadata
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
      ORDER BY entered_at ASC
    `;

    try {
      const result = await this.pool.query(query, [opportunityId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting lifecycle history:', error);
      throw error;
    }
  }

  /**
   * Get opportunities in a specific state
   */
  async getOpportunitiesInState(state, options = {}) {
    const {
      limit = 100,
      offset = 0,
      minDuration = null,
      maxDuration = null
    } = options;

    let query = `
      SELECT opportunity_id, state, sub_state, entered_at,
             EXTRACT(EPOCH FROM (NOW() - entered_at))::INTEGER as seconds_in_state,
             trigger_type, previous_state, metadata
      FROM opportunity_lifecycle
      WHERE state = $1 AND exited_at IS NULL
    `;

    const values = [state];
    let paramIndex = 2;

    if (minDuration !== null) {
      query += ` AND EXTRACT(EPOCH FROM (NOW() - entered_at)) >= $${paramIndex}`;
      values.push(minDuration);
      paramIndex++;
    }

    if (maxDuration !== null) {
      query += ` AND EXTRACT(EPOCH FROM (NOW() - entered_at)) <= $${paramIndex}`;
      values.push(maxDuration);
      paramIndex++;
    }

    query += ` ORDER BY entered_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    try {
      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error getting opportunities in state:', error);
      throw error;
    }
  }

  /**
   * Count opportunities in each state
   */
  async getStateCounts() {
    const query = `
      SELECT state, sub_state, COUNT(*) as count
      FROM opportunity_lifecycle
      WHERE exited_at IS NULL
      GROUP BY state, sub_state
      ORDER BY state
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting state counts:', error);
      throw error;
    }
  }

  /**
   * Get state analytics
   */
  async getStateAnalytics() {
    const query = `
      SELECT
        state,
        COUNT(*) as total_entries,
        AVG(duration_seconds) as avg_duration_seconds,
        MIN(duration_seconds) as min_duration_seconds,
        MAX(duration_seconds) as max_duration_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds) as median_duration_seconds,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds) as p95_duration_seconds
      FROM opportunity_lifecycle
      WHERE exited_at IS NOT NULL
      GROUP BY state
      ORDER BY state
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting state analytics:', error);
      throw error;
    }
  }

  /**
   * Get opportunities eligible for auto-transition (time-based)
   */
  async getEligibleForAutoTransition(fromState, hoursInState) {
    const query = `
      SELECT opportunity_id, state, entered_at,
             EXTRACT(EPOCH FROM (NOW() - entered_at))::INTEGER as seconds_in_state,
             metadata
      FROM opportunity_lifecycle
      WHERE state = $1
        AND exited_at IS NULL
        AND EXTRACT(EPOCH FROM (NOW() - entered_at)) >= $2
      ORDER BY entered_at ASC
    `;

    const secondsThreshold = hoursInState * 3600;

    try {
      const result = await this.pool.query(query, [fromState, secondsThreshold]);
      return result.rows;
    } catch (error) {
      console.error('Error getting eligible transitions:', error);
      throw error;
    }
  }

  /**
   * Get opportunities eligible for dormancy check (inactivity-based)
   */
  async getEligibleForDormancy(fromState, daysInactive) {
    const query = `
      SELECT opportunity_id, state, entered_at,
             EXTRACT(EPOCH FROM (NOW() - entered_at))::INTEGER / 86400 as days_in_state,
             metadata
      FROM opportunity_lifecycle
      WHERE state = $1
        AND exited_at IS NULL
        AND EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400 >= $2
      ORDER BY entered_at ASC
    `;

    try {
      const result = await this.pool.query(query, [fromState, daysInactive]);
      return result.rows;
    } catch (error) {
      console.error('Error getting dormancy candidates:', error);
      throw error;
    }
  }

  /**
   * Get transition rules from database
   */
  async getTransitionRules(fromState = null) {
    let query = `
      SELECT rule_name, from_state, to_state, trigger_type,
             condition_type, condition_config, priority, description
      FROM lifecycle_transition_rules
      WHERE is_active = TRUE
    `;

    const values = [];

    if (fromState) {
      query += ` AND from_state = $1`;
      values.push(fromState);
    }

    query += ` ORDER BY priority DESC, rule_name ASC`;

    try {
      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error getting transition rules:', error);
      throw error;
    }
  }

  /**
   * Get common transition paths (analytics)
   */
  async getCommonPaths(limit = 10) {
    const query = `
      SELECT
        previous_state,
        state as next_state,
        COUNT(*) as transition_count,
        AVG(duration_seconds) as avg_duration_in_previous
      FROM opportunity_lifecycle
      WHERE previous_state IS NOT NULL
        AND exited_at IS NOT NULL
      GROUP BY previous_state, state
      ORDER BY transition_count DESC
      LIMIT $1
    `;

    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting common paths:', error);
      throw error;
    }
  }

  /**
   * Get average journey duration
   */
  async getAverageJourneyDuration() {
    const query = `
      WITH journey_durations AS (
        SELECT
          opportunity_id,
          MIN(entered_at) as journey_start,
          MAX(COALESCE(exited_at, NOW())) as journey_end
        FROM opportunity_lifecycle
        GROUP BY opportunity_id
      )
      SELECT
        AVG(EXTRACT(EPOCH FROM (journey_end - journey_start))) as avg_seconds,
        MIN(EXTRACT(EPOCH FROM (journey_end - journey_start))) as min_seconds,
        MAX(EXTRACT(EPOCH FROM (journey_end - journey_start))) as max_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (journey_end - journey_start))
        ) as median_seconds
      FROM journey_durations
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting journey duration:', error);
      throw error;
    }
  }

  /**
   * Search opportunities by state and filters
   */
  async searchOpportunities(filters = {}) {
    const {
      states = null,
      subStates = null,
      triggerTypes = null,
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0
    } = filters;

    let query = `
      SELECT opportunity_id, state, sub_state, entered_at, exited_at,
             duration_seconds, trigger_type, trigger_reason, previous_state, metadata
      FROM opportunity_lifecycle
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (states && states.length > 0) {
      query += ` AND state = ANY($${paramIndex})`;
      values.push(states);
      paramIndex++;
    }

    if (subStates && subStates.length > 0) {
      query += ` AND sub_state = ANY($${paramIndex})`;
      values.push(subStates);
      paramIndex++;
    }

    if (triggerTypes && triggerTypes.length > 0) {
      query += ` AND trigger_type = ANY($${paramIndex})`;
      values.push(triggerTypes);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND entered_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND entered_at <= $${paramIndex}`;
      values.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY entered_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    try {
      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error searching opportunities:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LifecycleStatePersistence;
