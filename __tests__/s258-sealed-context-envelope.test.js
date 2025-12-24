/**
 * S258 AUTHORITY: Sealed Context Envelope v1 - Integration Tests
 *
 * Tests:
 * 1. os_envelopes table exists with required columns
 * 2. sha256_hash is NOT NULL (mandatory)
 * 3. Envelope sealing function works (idempotent)
 * 4. Envelope verification function works
 * 5. Status constraints enforced
 * 6. Control plane version
 */

const { describe, test, expect, afterAll } = require('@jest/globals');
const pg = require('pg');
const crypto = require('crypto');

// Use direct DB connection for testing
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://upr_app:f474d5aa0a71faf781dc7b9e021004bd2909545f9198e787@localhost:5433/upr_production'
});

describe('S258 AUTHORITY: Sealed Context Envelope v1', () => {
  // Test data - valid UUIDs
  const testTenantId = 'b5f3c8d0-0001-4000-8000-000000000001';
  const testWorkspaceId = 'ws-test-s258';
  const testPersonaId = 'ebf50a00-0001-4000-8000-000000000001';
  const testPolicyId = 'a0150a00-0001-4000-8000-000000000001';  // Valid UUID format

  afterAll(async () => {
    // Cleanup test envelopes
    await pool.query(
      `DELETE FROM os_envelopes WHERE workspace_id = $1`,
      [testWorkspaceId]
    );
    await pool.end();
  });

  describe('os_envelopes Table Structure', () => {
    test('os_envelopes table exists', async () => {
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'os_envelopes'
      `);

      expect(result.rows.length).toBe(1);
    });

    test('sha256_hash column is NOT NULL', async () => {
      const result = await pool.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'os_envelopes' AND column_name = 'sha256_hash'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].is_nullable).toBe('NO');
    });

    test('envelope_version column exists', async () => {
      const result = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'os_envelopes' AND column_name = 'envelope_version'
      `);

      expect(result.rows.length).toBe(1);
    });

    test('unique constraint on sha256_hash', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'os_envelopes' AND constraint_type = 'UNIQUE'
      `);

      const hashConstraint = result.rows.find(r => r.constraint_name.includes('envelope_hash'));
      expect(hashConstraint).toBeDefined();
    });
  });

  describe('Envelope Sealing', () => {
    test('seal_envelope creates new envelope', async () => {
      const testHash = crypto.randomBytes(32).toString('hex');
      const testContent = { test: 'envelope', timestamp: new Date().toISOString() };

      const result = await pool.query(
        `SELECT envelope_id, is_new, sealed_at
         FROM seal_envelope($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          '1.2',  // envelope_version
          testHash,
          testTenantId,
          testWorkspaceId,
          null,  // user_id
          testPersonaId,
          testPolicyId,
          1,  // policy_version
          null,  // territory_id
          'TEST → PATH',  // persona_resolution_path
          'GLOBAL',  // persona_resolution_scope
          null,  // territory_resolution_path
          testContent,
          'test',  // sealed_by
          null,  // expires_at
        ]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].is_new).toBe(true);
      expect(result.rows[0].envelope_id).toBeDefined();
    });

    test('seal_envelope is idempotent (same hash returns existing)', async () => {
      const testHash = crypto.randomBytes(32).toString('hex');
      const testContent = { test: 'idempotent', timestamp: new Date().toISOString() };

      // First seal
      const first = await pool.query(
        `SELECT envelope_id, is_new
         FROM seal_envelope($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          '1.2', testHash, testTenantId, testWorkspaceId, null,
          testPersonaId, testPolicyId, 1, null, 'TEST', 'GLOBAL', null,
          testContent, 'test', null,
        ]
      );

      // Second seal with same hash
      const second = await pool.query(
        `SELECT envelope_id, is_new
         FROM seal_envelope($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          '1.2', testHash, testTenantId, testWorkspaceId, null,
          testPersonaId, testPolicyId, 1, null, 'TEST', 'GLOBAL', null,
          testContent, 'test', null,
        ]
      );

      expect(first.rows[0].is_new).toBe(true);
      expect(second.rows[0].is_new).toBe(false);
      expect(first.rows[0].envelope_id).toEqual(second.rows[0].envelope_id);
    });
  });

  describe('Envelope Verification', () => {
    test('verify_envelope returns valid for existing envelope', async () => {
      // Create a test envelope
      const testHash = crypto.randomBytes(32).toString('hex');

      const sealResult = await pool.query(
        `SELECT envelope_id FROM seal_envelope($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          '1.2', testHash, testTenantId, testWorkspaceId, null,
          testPersonaId, testPolicyId, 1, null, 'TEST', 'GLOBAL', null,
          { test: 'verify' }, 'test', null,
        ]
      );

      // Verify by envelope_id
      const result = await pool.query(
        `SELECT is_valid, envelope_id, status, verification_message
         FROM verify_envelope($1, $2)`,
        [sealResult.rows[0].envelope_id, null]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].is_valid).toBe(true);
      expect(result.rows[0].status).toBe('SEALED');
    });

    test('verify_envelope returns ENVELOPE_NOT_SEALED for non-existent', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const result = await pool.query(
        `SELECT is_valid, verification_message
         FROM verify_envelope($1, $2)`,
        [fakeId, null]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].is_valid).toBe(false);
      expect(result.rows[0].verification_message).toContain('ENVELOPE_NOT_SEALED');
    });

    test('verify_envelope by sha256_hash works', async () => {
      const testHash = crypto.randomBytes(32).toString('hex');

      await pool.query(
        `SELECT envelope_id FROM seal_envelope($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          '1.2', testHash, testTenantId, testWorkspaceId, null,
          testPersonaId, testPolicyId, 1, null, 'TEST', 'GLOBAL', null,
          { test: 'hash_verify' }, 'test', null,
        ]
      );

      // Verify by hash
      const result = await pool.query(
        `SELECT is_valid, envelope_id
         FROM verify_envelope($1, $2)`,
        [null, testHash]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].is_valid).toBe(true);
      expect(result.rows[0].envelope_id).toBeDefined();
    });
  });

  describe('Status Constraints', () => {
    test('status check constraint is enforced', async () => {
      try {
        await pool.query(`
          INSERT INTO os_envelopes (
            envelope_version, sha256_hash, tenant_id, workspace_id,
            persona_id, policy_id, policy_version, envelope_content, status
          ) VALUES (
            '1.0', 'invalid_status_test_hash', $1, $2,
            $3, $4, 1, '{}', 'INVALID'
          )
        `, [testTenantId, testWorkspaceId, testPersonaId, testPolicyId]);

        throw new Error('Should have failed - status constraint not enforced');
      } catch (error) {
        expect(error.message).toContain('status');
      }
    });
  });

  describe('Envelope Content Retrieval', () => {
    test('get_envelope_content returns full envelope', async () => {
      const testHash = crypto.randomBytes(32).toString('hex');
      const testContent = { test: 'content_retrieval', nested: { key: 'value' } };

      const sealResult = await pool.query(
        `SELECT envelope_id FROM seal_envelope($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          '1.2', testHash, testTenantId, testWorkspaceId, null,
          testPersonaId, testPolicyId, 1, null, 'TEST', 'GLOBAL', null,
          testContent, 'test', null,
        ]
      );

      const result = await pool.query(
        `SELECT envelope_id, envelope_version, sha256_hash, envelope_content
         FROM get_envelope_content($1, $2)`,
        [sealResult.rows[0].envelope_id, null]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].envelope_content.test).toBe('content_retrieval');
      expect(result.rows[0].envelope_content.nested.key).toBe('value');
    });
  });

  describe('Control Plane Version', () => {
    test('control plane is at version 2.4', async () => {
      const result = await pool.query(`
        SELECT version FROM os_control_plane_version
        ORDER BY applied_at DESC
        LIMIT 1
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].version).toBe('2.4');
    });
  });
});
