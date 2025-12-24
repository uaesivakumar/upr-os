/**
 * BTE Signal Writer - Writes ONLY to bte_signals
 *
 * S262: Behavioral Telemetry Engine
 *
 * HARD RULES:
 * - Can ONLY write to bte_signals table
 * - NEVER writes to: business_events, user_actions, workspace_state
 * - These are computed outputs, not source mutations
 *
 * bte_signals is BTE's OUTPUT, not its INPUT.
 */

import pool from '../../server/db.js';

// ============================================================
// SIGNAL WRITER (bte_signals ONLY)
// ============================================================

/**
 * Write a computed signal to bte_signals.
 *
 * This is the ONLY write operation BTE performs.
 * It writes to bte_signals (BTE output), NOT to source tables.
 *
 * @param {Object} signal - Signal to write
 * @param {string} signal.entity_type - Entity type (workspace, user, enterprise)
 * @param {string} signal.entity_id - Entity UUID
 * @param {string} signal.signal_type - Signal type
 * @param {number} signal.signal_value - Computed value
 * @param {number} [signal.version] - Signal version (default 1)
 * @returns {Promise<Object>} The written signal
 */
export async function writeSignal(signal) {
  const query = `
    INSERT INTO bte_signals (entity_type, entity_id, signal_type, signal_value, version)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (entity_type, entity_id, signal_type, version)
    DO UPDATE SET signal_value = EXCLUDED.signal_value, computed_at = NOW()
    RETURNING *
  `;

  const result = await pool.query(query, [
    signal.entity_type,
    signal.entity_id,
    signal.signal_type,
    signal.signal_value,
    signal.version || 1,
  ]);

  return result.rows[0];
}

/**
 * Write multiple signals in a transaction.
 *
 * @param {Array} signals - Array of signals to write
 * @returns {Promise<Array>} Written signals
 */
export async function writeSignals(signals) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results = [];

    for (const signal of signals) {
      const query = `
        INSERT INTO bte_signals (entity_type, entity_id, signal_type, signal_value, version)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (entity_type, entity_id, signal_type, version)
        DO UPDATE SET signal_value = EXCLUDED.signal_value, computed_at = NOW()
        RETURNING *
      `;

      const result = await client.query(query, [
        signal.entity_type,
        signal.entity_id,
        signal.signal_type,
        signal.signal_value,
        signal.version || 1,
      ]);

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

// ============================================================
// EXPORTS
// ============================================================

export default {
  writeSignal,
  writeSignals,
};
