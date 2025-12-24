/**
 * BTE Reader - READ-ONLY Database Access
 *
 * S262: Behavioral Telemetry Engine
 *
 * HARD RULES (ENFORCED):
 * - READ-ONLY: No INSERT, UPDATE, DELETE operations
 * - No writes to: business_events, user_actions, workspace_state
 * - No SIVA runtime imports
 * - No envelopes
 * - Deterministic queries only
 *
 * This module provides the ONLY database access for BTE.
 * All BTE components must use this reader.
 */

import pool from '../../server/db.js';

// ============================================================
// READ-ONLY ENFORCEMENT
// ============================================================

/**
 * List of allowed tables for BTE read access.
 * BTE can READ from these tables only.
 */
const ALLOWED_READ_TABLES = [
  'business_events',
  'user_actions',
  'workspace_state',
  'bte_signals',
  'bte_thresholds',
];

/**
 * Validate that a query is read-only.
 * Throws if query attempts to modify data.
 *
 * @param {string} sql - SQL query to validate
 * @throws {Error} if query is not read-only
 */
function validateReadOnly(sql) {
  const normalized = sql.trim().toUpperCase();

  // Block all write operations
  const writePatterns = [
    /^\s*INSERT\s+/i,
    /^\s*UPDATE\s+/i,
    /^\s*DELETE\s+/i,
    /^\s*DROP\s+/i,
    /^\s*CREATE\s+/i,
    /^\s*ALTER\s+/i,
    /^\s*TRUNCATE\s+/i,
    /^\s*GRANT\s+/i,
    /^\s*REVOKE\s+/i,
  ];

  for (const pattern of writePatterns) {
    if (pattern.test(normalized)) {
      throw new Error(
        `[BTE VIOLATION] Write operation attempted. BTE is READ-ONLY.\n` +
        `Query: ${sql.substring(0, 100)}...`
      );
    }
  }

  // Ensure it's a SELECT or WITH (CTE)
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
    throw new Error(
      `[BTE VIOLATION] Only SELECT queries allowed. BTE is READ-ONLY.\n` +
      `Query: ${sql.substring(0, 100)}...`
    );
  }
}

// ============================================================
// READ-ONLY QUERY FUNCTION
// ============================================================

/**
 * Execute a read-only query.
 * This is the ONLY way BTE should access the database.
 *
 * @param {string} sql - SQL SELECT query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 * @throws {Error} if query is not read-only
 */
export async function readQuery(sql, params = []) {
  // Enforce read-only
  validateReadOnly(sql);

  // Execute query
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Execute a read-only query returning a single row.
 *
 * @param {string} sql - SQL SELECT query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} Single row or null
 */
export async function readOne(sql, params = []) {
  const rows = await readQuery(sql, params);
  return rows[0] || null;
}

// ============================================================
// EVENT READERS (business_events - READ ONLY)
// ============================================================

/**
 * Read business events for a workspace within a time range.
 * Used for computing temporal signals.
 *
 * @param {string} workspaceId - UUID of the workspace
 * @param {Date} startTime - Start of time range
 * @param {Date} endTime - End of time range
 * @returns {Promise<Array>} Events in time range
 */
export async function readBusinessEvents(workspaceId, startTime, endTime) {
  return readQuery(
    `SELECT event_id, event_type, entity_type, entity_id, actor_user_id, timestamp, metadata
     FROM business_events
     WHERE workspace_id = $1 AND timestamp >= $2 AND timestamp <= $3
     ORDER BY timestamp ASC`,
    [workspaceId, startTime, endTime]
  );
}

/**
 * Read business events by actor (user).
 *
 * @param {string} actorUserId - UUID of the user
 * @param {Date} startTime - Start of time range
 * @param {Date} endTime - End of time range
 * @returns {Promise<Array>} Events by user
 */
export async function readEventsByActor(actorUserId, startTime, endTime) {
  return readQuery(
    `SELECT event_id, event_type, entity_type, entity_id, workspace_id, timestamp, metadata
     FROM business_events
     WHERE actor_user_id = $1 AND timestamp >= $2 AND timestamp <= $3
     ORDER BY timestamp ASC`,
    [actorUserId, startTime, endTime]
  );
}

/**
 * Read event counts by type for a workspace.
 *
 * @param {string} workspaceId - UUID of the workspace
 * @param {Date} startTime - Start of time range
 * @param {Date} endTime - End of time range
 * @returns {Promise<Array>} Event type counts
 */
export async function readEventCounts(workspaceId, startTime, endTime) {
  return readQuery(
    `SELECT event_type, COUNT(*) as count
     FROM business_events
     WHERE workspace_id = $1 AND timestamp >= $2 AND timestamp <= $3
     GROUP BY event_type
     ORDER BY count DESC`,
    [workspaceId, startTime, endTime]
  );
}

// ============================================================
// USER ACTION READERS (user_actions - READ ONLY)
// ============================================================

/**
 * Read user actions for a workspace.
 *
 * @param {string} workspaceId - UUID of the workspace
 * @param {Date} startTime - Start of time range
 * @param {Date} endTime - End of time range
 * @returns {Promise<Array>} User actions
 */
export async function readUserActions(workspaceId, startTime, endTime) {
  return readQuery(
    `SELECT action_id, action_type, actor_user_id, timestamp, metadata
     FROM user_actions
     WHERE workspace_id = $1 AND timestamp >= $2 AND timestamp <= $3
     ORDER BY timestamp ASC`,
    [workspaceId, startTime, endTime]
  );
}

/**
 * Read action counts by type.
 *
 * @param {string} workspaceId - UUID of the workspace
 * @param {Date} startTime - Start of time range
 * @param {Date} endTime - End of time range
 * @returns {Promise<Array>} Action type counts
 */
export async function readActionCounts(workspaceId, startTime, endTime) {
  return readQuery(
    `SELECT action_type, COUNT(*) as count
     FROM user_actions
     WHERE workspace_id = $1 AND timestamp >= $2 AND timestamp <= $3
     GROUP BY action_type
     ORDER BY count DESC`,
    [workspaceId, startTime, endTime]
  );
}

// ============================================================
// WORKSPACE STATE READER (workspace_state - READ ONLY)
// ============================================================

/**
 * Read current workspace state.
 *
 * @param {string} workspaceId - UUID of the workspace
 * @returns {Promise<Object|null>} Workspace state or null
 */
export async function readWorkspaceState(workspaceId) {
  return readOne(
    `SELECT workspace_id, current_sales_stage, pending_actions,
            last_recommendation_id, last_action_taken_at, updated_at
     FROM workspace_state
     WHERE workspace_id = $1`,
    [workspaceId]
  );
}

// ============================================================
// THRESHOLD READER (bte_thresholds - READ ONLY)
// ============================================================

/**
 * Read all thresholds.
 *
 * @returns {Promise<Array>} All thresholds
 */
export async function readAllThresholds() {
  return readQuery(
    `SELECT threshold_key, value, version, description
     FROM bte_thresholds
     ORDER BY threshold_key`
  );
}

/**
 * Read a single threshold by key.
 *
 * @param {string} key - Threshold key
 * @returns {Promise<Object|null>} Threshold or null
 */
export async function readThreshold(key) {
  return readOne(
    `SELECT threshold_key, value, version, description
     FROM bte_thresholds
     WHERE threshold_key = $1`,
    [key]
  );
}

/**
 * Read thresholds as a map for efficient lookup.
 *
 * @returns {Promise<Object>} Map of threshold_key -> value
 */
export async function readThresholdsMap() {
  const thresholds = await readAllThresholds();
  const map = {};
  for (const t of thresholds) {
    map[t.threshold_key] = t.value;
  }
  return map;
}

// ============================================================
// SIGNAL READER (bte_signals - READ ONLY)
// ============================================================

/**
 * Read signals for an entity.
 *
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity UUID
 * @returns {Promise<Array>} Signals for entity
 */
export async function readSignals(entityType, entityId) {
  return readQuery(
    `SELECT signal_type, signal_value, computed_at, version
     FROM bte_signals
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY signal_type, computed_at DESC`,
    [entityType, entityId]
  );
}

/**
 * Read latest signal value for an entity.
 *
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity UUID
 * @param {string} signalType - Signal type
 * @returns {Promise<Object|null>} Latest signal or null
 */
export async function readLatestSignal(entityType, entityId, signalType) {
  return readOne(
    `SELECT signal_type, signal_value, computed_at, version
     FROM bte_signals
     WHERE entity_type = $1 AND entity_id = $2 AND signal_type = $3
     ORDER BY computed_at DESC
     LIMIT 1`,
    [entityType, entityId, signalType]
  );
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  // Core read functions
  readQuery,
  readOne,

  // Event readers
  readBusinessEvents,
  readEventsByActor,
  readEventCounts,

  // Action readers
  readUserActions,
  readActionCounts,

  // State reader
  readWorkspaceState,

  // Threshold readers
  readAllThresholds,
  readThreshold,
  readThresholdsMap,

  // Signal readers
  readSignals,
  readLatestSignal,
};
