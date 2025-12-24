/**
 * Event Insertion Service
 *
 * S261-F5: Canonical event insertion for BTE data foundation.
 *
 * GUARDRAILS:
 * - Validates required fields
 * - Sets timestamp server-side if missing
 * - NEVER updates rows
 * - NEVER deletes rows
 * - INSERT-ONLY operations
 *
 * AUTHORITY: This service lives in OS (upr-os).
 * SaaS must call OS APIs - never write events directly.
 */

import pool from '../../server/db.js';

// ============================================================
// VALIDATION
// ============================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function isValidISO8601(value) {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

function validateBusinessEvent(input) {
  const errors = [];

  if (!input.event_type || typeof input.event_type !== 'string') {
    errors.push('event_type is required and must be a string');
  }

  if (!input.entity_type || typeof input.entity_type !== 'string') {
    errors.push('entity_type is required and must be a string');
  }

  if (!input.entity_id || !isValidUUID(input.entity_id)) {
    errors.push('entity_id is required and must be a valid UUID');
  }

  if (!input.workspace_id || !isValidUUID(input.workspace_id)) {
    errors.push('workspace_id is required and must be a valid UUID');
  }

  if (!input.sub_vertical_id || !isValidUUID(input.sub_vertical_id)) {
    errors.push('sub_vertical_id is required and must be a valid UUID');
  }

  if (!input.actor_user_id || !isValidUUID(input.actor_user_id)) {
    errors.push('actor_user_id is required and must be a valid UUID');
  }

  if (input.timestamp !== undefined && !isValidISO8601(input.timestamp)) {
    errors.push('timestamp must be a valid ISO-8601 date string');
  }

  return errors;
}

function validateUserAction(input) {
  const errors = [];

  if (!input.action_type || typeof input.action_type !== 'string') {
    errors.push('action_type is required and must be a string');
  }

  if (!input.workspace_id || !isValidUUID(input.workspace_id)) {
    errors.push('workspace_id is required and must be a valid UUID');
  }

  if (!input.actor_user_id || !isValidUUID(input.actor_user_id)) {
    errors.push('actor_user_id is required and must be a valid UUID');
  }

  if (input.timestamp !== undefined && !isValidISO8601(input.timestamp)) {
    errors.push('timestamp must be a valid ISO-8601 date string');
  }

  return errors;
}

// ============================================================
// INSERT FUNCTIONS (NO UPDATE, NO DELETE)
// ============================================================

/**
 * Insert a business event.
 *
 * This is INSERT-ONLY. The business_events table has triggers that
 * prevent UPDATE and DELETE operations.
 *
 * @param {Object} input - Event input
 * @param {string} input.event_type - Type of event
 * @param {string} input.entity_type - Type of entity involved
 * @param {string} input.entity_id - UUID of the entity
 * @param {string} input.workspace_id - UUID of the workspace
 * @param {string} input.sub_vertical_id - UUID of the sub-vertical
 * @param {string} input.actor_user_id - UUID of the user who triggered the event
 * @param {string} [input.timestamp] - ISO-8601 timestamp (defaults to server time)
 * @param {Object} [input.metadata] - Additional event data
 * @returns {Promise<Object>} The inserted event
 */
export async function insertBusinessEvent(input) {
  // Validate input
  const errors = validateBusinessEvent(input);
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  // Use server timestamp if not provided
  const hasTimestamp = input.timestamp !== undefined;

  const query = hasTimestamp
    ? `
      INSERT INTO business_events (event_type, entity_type, entity_id, workspace_id, sub_vertical_id, actor_user_id, timestamp, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `
    : `
      INSERT INTO business_events (event_type, entity_type, entity_id, workspace_id, sub_vertical_id, actor_user_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

  const params = hasTimestamp
    ? [
        input.event_type,
        input.entity_type,
        input.entity_id,
        input.workspace_id,
        input.sub_vertical_id,
        input.actor_user_id,
        input.timestamp,
        JSON.stringify(input.metadata || {}),
      ]
    : [
        input.event_type,
        input.entity_type,
        input.entity_id,
        input.workspace_id,
        input.sub_vertical_id,
        input.actor_user_id,
        JSON.stringify(input.metadata || {}),
      ];

  const result = await pool.query(query, params);
  return result.rows[0];
}

/**
 * Insert multiple business events in a single transaction.
 *
 * All events are inserted atomically - if any fails, all are rolled back.
 *
 * @param {Object[]} inputs - Array of event inputs
 * @returns {Promise<Object[]>} The inserted events
 */
export async function insertBusinessEvents(inputs) {
  // Validate all inputs first
  for (let i = 0; i < inputs.length; i++) {
    const errors = validateBusinessEvent(inputs[i]);
    if (errors.length > 0) {
      throw new Error(`Validation failed for event ${i}: ${errors.join(', ')}`);
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results = [];

    for (const input of inputs) {
      const hasTimestamp = input.timestamp !== undefined;

      const query = hasTimestamp
        ? `
          INSERT INTO business_events (event_type, entity_type, entity_id, workspace_id, sub_vertical_id, actor_user_id, timestamp, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `
        : `
          INSERT INTO business_events (event_type, entity_type, entity_id, workspace_id, sub_vertical_id, actor_user_id, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;

      const params = hasTimestamp
        ? [input.event_type, input.entity_type, input.entity_id, input.workspace_id, input.sub_vertical_id, input.actor_user_id, input.timestamp, JSON.stringify(input.metadata || {})]
        : [input.event_type, input.entity_type, input.entity_id, input.workspace_id, input.sub_vertical_id, input.actor_user_id, JSON.stringify(input.metadata || {})];

      const result = await client.query(query, params);
      results.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Insert a user action.
 *
 * INSERT-ONLY operation.
 *
 * @param {Object} input - Action input
 * @param {string} input.action_type - Type of action
 * @param {string} input.workspace_id - UUID of the workspace
 * @param {string} input.actor_user_id - UUID of the user
 * @param {string} [input.timestamp] - ISO-8601 timestamp (defaults to server time)
 * @param {Object} [input.metadata] - Additional action data
 * @returns {Promise<Object>} The inserted action
 */
export async function insertUserAction(input) {
  // Validate input
  const errors = validateUserAction(input);
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  const hasTimestamp = input.timestamp !== undefined;

  const query = hasTimestamp
    ? `
      INSERT INTO user_actions (action_type, workspace_id, actor_user_id, timestamp, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `
    : `
      INSERT INTO user_actions (action_type, workspace_id, actor_user_id, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

  const params = hasTimestamp
    ? [input.action_type, input.workspace_id, input.actor_user_id, input.timestamp, JSON.stringify(input.metadata || {})]
    : [input.action_type, input.workspace_id, input.actor_user_id, JSON.stringify(input.metadata || {})];

  const result = await pool.query(query, params);
  return result.rows[0];
}

// ============================================================
// WORKSPACE STATE (UPSERT - but history is preserved in events)
// ============================================================

/**
 * Upsert workspace state.
 *
 * NOTE: This updates workspace_state, which is mutable.
 * However, all state CHANGES should also be recorded as events
 * in business_events for full history replay.
 *
 * @param {Object} input - Workspace state input
 * @param {string} input.workspace_id - UUID of the workspace
 * @param {string} [input.current_sales_stage] - Current sales stage
 * @param {Array} [input.pending_actions] - Array of pending actions
 * @param {string} [input.last_recommendation_id] - UUID of last recommendation
 * @param {string} [input.last_action_taken_at] - ISO-8601 timestamp
 * @returns {Promise<Object>} The upserted state
 */
export async function upsertWorkspaceState(input) {
  if (!input.workspace_id || !isValidUUID(input.workspace_id)) {
    throw new Error('workspace_id is required and must be a valid UUID');
  }

  const query = `
    INSERT INTO workspace_state (workspace_id, current_sales_stage, pending_actions, last_recommendation_id, last_action_taken_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (workspace_id) DO UPDATE SET
      current_sales_stage = COALESCE(EXCLUDED.current_sales_stage, workspace_state.current_sales_stage),
      pending_actions = COALESCE(EXCLUDED.pending_actions, workspace_state.pending_actions),
      last_recommendation_id = COALESCE(EXCLUDED.last_recommendation_id, workspace_state.last_recommendation_id),
      last_action_taken_at = COALESCE(EXCLUDED.last_action_taken_at, workspace_state.last_action_taken_at)
    RETURNING *
  `;

  const params = [
    input.workspace_id,
    input.current_sales_stage || null,
    JSON.stringify(input.pending_actions || []),
    input.last_recommendation_id || null,
    input.last_action_taken_at || null,
  ];

  const result = await pool.query(query, params);
  return result.rows[0];
}

/**
 * Get workspace state by ID.
 *
 * @param {string} workspaceId - UUID of the workspace
 * @returns {Promise<Object|null>} The workspace state or null
 */
export async function getWorkspaceState(workspaceId) {
  if (!isValidUUID(workspaceId)) {
    throw new Error('workspace_id must be a valid UUID');
  }

  const result = await pool.query(
    'SELECT * FROM workspace_state WHERE workspace_id = $1',
    [workspaceId]
  );

  return result.rows[0] || null;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  insertBusinessEvent,
  insertBusinessEvents,
  insertUserAction,
  upsertWorkspaceState,
  getWorkspaceState,
};
