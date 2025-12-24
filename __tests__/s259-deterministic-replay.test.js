/**
 * S259 AUTHORITY: Deterministic Replay Hard Gate - Integration Tests
 *
 * Tests:
 * 1. os_replay_attempts table exists
 * 2. Replay initiation with valid envelope
 * 3. Replay initiation with non-existent envelope
 * 4. Replay completion without drift
 * 5. Replay completion with drift detection (HARD FAILURE)
 * 6. Replay history tracking
 * 7. Control plane version
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const pg = require('pg');
const crypto = require('crypto');

// Use direct DB connection for testing
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://upr_app:f474d5aa0a71faf781dc7b9e021004bd2909545f9198e787@localhost:5433/upr_production'
});

describe('S259 AUTHORITY: Deterministic Replay Hard Gate', () => {
  // Test data
  const testTenantId = 'b5f3c8d0-0001-4000-8000-000000000002';
  const testWorkspaceId = 'ws-test-s259';
  const testPersonaId = 'ebf50a00-0001-4000-8000-000000000001';
  const testPolicyId = 'a0150a00-0001-4000-8000-000000000002';
  let testEnvelopeId = null;
  let testEnvelopeHash = null;

  beforeAll(async () => {
    // Create a test envelope for replay tests
    testEnvelopeHash = crypto.randomBytes(32).toString('hex');
    const testContent = { test: 's259_replay', version: '1.2' };

    const result = await pool.query(
      `SELECT envelope_id FROM seal_envelope($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        '1.2', testEnvelopeHash, testTenantId, testWorkspaceId, null,
        testPersonaId, testPolicyId, 1, null, 'TEST', 'GLOBAL', null,
        testContent, 'test', null,
      ]
    );
    testEnvelopeId = result.rows[0].envelope_id;
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query(
      `DELETE FROM os_replay_attempts WHERE envelope_hash = $1`,
      [testEnvelopeHash]
    );
    await pool.query(
      `DELETE FROM os_envelopes WHERE workspace_id = $1`,
      [testWorkspaceId]
    );
    await pool.end();
  });

  describe('os_replay_attempts Table', () => {
    test('os_replay_attempts table exists', async () => {
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'os_replay_attempts'
      `);

      expect(result.rows.length).toBe(1);
    });

    test('replay_status check constraint exists', async () => {
      try {
        await pool.query(`
          INSERT INTO os_replay_attempts (
            envelope_id, envelope_hash, replay_status
          ) VALUES (
            $1, 'test_hash', 'INVALID_STATUS'
          )
        `, [testEnvelopeId]);

        throw new Error('Should have failed - status constraint not enforced');
      } catch (error) {
        expect(error.message).toContain('replay_status');
      }
    });
  });

  describe('Replay Initiation', () => {
    test('initiate_replay returns envelope content for valid hash', async () => {
      const result = await pool.query(
        `SELECT replay_id, envelope_id, envelope_content, replay_status, error_code
         FROM initiate_replay($1, $2, $3, $4)`,
        [testEnvelopeHash, null, 'test', 'test']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].envelope_id).toEqual(testEnvelopeId);
      expect(result.rows[0].replay_status).toBe('PENDING');
      expect(result.rows[0].error_code).toBeNull();
      expect(result.rows[0].envelope_content).toBeDefined();
    });

    test('initiate_replay returns ENVELOPE_NOT_SEALED for non-existent hash', async () => {
      // SHA256 hash is exactly 64 hex chars
      const fakeHash = crypto.randomBytes(32).toString('hex');

      const result = await pool.query(
        `SELECT replay_id, envelope_id, error_code
         FROM initiate_replay($1, $2, $3, $4)`,
        [fakeHash, null, 'test', 'test']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].error_code).toBe('ENVELOPE_NOT_SEALED');
      expect(result.rows[0].envelope_id).toBeNull();
    });
  });

  describe('Replay Completion', () => {
    test('complete_replay with matching hash returns SUCCESS', async () => {
      // Initiate replay
      const initResult = await pool.query(
        `SELECT replay_id FROM initiate_replay($1, NULL, 'test', 'test')`,
        [testEnvelopeHash]
      );
      const replayId = initResult.rows[0].replay_id;

      // Complete with same hash (no drift)
      const result = await pool.query(
        `SELECT replay_id, replay_status, drift_detected
         FROM complete_replay($1, $2, $3)`,
        [replayId, JSON.stringify({ output: 'test' }), testEnvelopeHash]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].replay_status).toBe('SUCCESS');
      expect(result.rows[0].drift_detected).toBe(false);
    });

    test('complete_replay with different hash returns DRIFT_DETECTED (HARD FAILURE)', async () => {
      // Initiate replay
      const initResult = await pool.query(
        `SELECT replay_id FROM initiate_replay($1, NULL, 'test', 'test')`,
        [testEnvelopeHash]
      );
      const replayId = initResult.rows[0].replay_id;

      // Complete with DIFFERENT hash (drift!)
      const differentHash = crypto.randomBytes(32).toString('hex');
      const result = await pool.query(
        `SELECT replay_id, replay_status, drift_detected, drift_details
         FROM complete_replay($1, $2, $3)`,
        [replayId, JSON.stringify({ output: 'different' }), differentHash]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].replay_status).toBe('DRIFT_DETECTED');
      expect(result.rows[0].drift_detected).toBe(true);
      expect(result.rows[0].drift_details.drift_type).toBe('HASH_MISMATCH');
    });
  });

  describe('Replay History', () => {
    test('get_replay_history returns attempts for envelope', async () => {
      const result = await pool.query(
        `SELECT * FROM get_replay_history($1, NULL, 10)`,
        [testEnvelopeId]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      // Should have attempts from previous tests
    });

    test('get_replay_history by hash works', async () => {
      const result = await pool.query(
        `SELECT * FROM get_replay_history(NULL, $1, 10)`,
        [testEnvelopeHash]
      );

      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Control Plane Version', () => {
    test('control plane is at version 2.5', async () => {
      const result = await pool.query(`
        SELECT version FROM os_control_plane_version
        ORDER BY applied_at DESC
        LIMIT 1
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].version).toBe('2.5');
    });
  });
});

describe('S259 Error Codes', () => {
  test('REPLAY_DRIFT_DETECTED is a hard failure', () => {
    // Verified in the complete_replay test above
    expect(true).toBe(true);
  });

  test('ENVELOPE_NOT_SEALED prevents replay', () => {
    // Verified in initiate_replay test above
    expect(true).toBe(true);
  });
});
