#!/usr/bin/env node
/**
 * Apply OS Control Plane Migration
 *
 * This script applies the control plane schema and verifies all tables exist.
 * Run with: node scripts/apply-control-plane-migration.js
 */

import { pool } from '../utils/db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('\n🚀 OS Control Plane Migration\n');
  console.log('━'.repeat(60));

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Read and apply migration
    const migrationPath = join(__dirname, '..', 'server', 'migrations', '008_os_control_plane.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('📦 Applying migration: 008_os_control_plane.sql\n');
    await pool.query(sql);
    console.log('✅ Migration applied successfully\n');

    // Verify tables exist (hard checks from contract)
    console.log('🔍 Verifying tables exist...\n');

    const verificationQueries = [
      { name: 'os_verticals', query: "SELECT to_regclass('public.os_verticals') IS NOT NULL AS ok" },
      { name: 'os_sub_verticals', query: "SELECT to_regclass('public.os_sub_verticals') IS NOT NULL AS ok" },
      { name: 'os_personas', query: "SELECT to_regclass('public.os_personas') IS NOT NULL AS ok" },
      { name: 'os_persona_policies', query: "SELECT to_regclass('public.os_persona_policies') IS NOT NULL AS ok" },
      { name: 'os_workspace_bindings', query: "SELECT to_regclass('public.os_workspace_bindings') IS NOT NULL AS ok" },
      { name: 'os_controlplane_audit', query: "SELECT to_regclass('public.os_controlplane_audit') IS NOT NULL AS ok" },
    ];

    let allOk = true;
    for (const { name, query } of verificationQueries) {
      const result = await pool.query(query);
      const ok = result.rows[0]?.ok === true;
      console.log(`  ${ok ? '✅' : '❌'} ${name}: ${ok ? 'EXISTS' : 'MISSING'}`);
      if (!ok) allOk = false;
    }

    console.log('\n' + '━'.repeat(60));

    if (!allOk) {
      console.error('\n❌ Some tables are missing! Migration may have failed.');
      process.exit(1);
    }

    // Verify seed data
    console.log('\n📊 Verifying seed data...\n');

    const { rows: verticals } = await pool.query('SELECT key, name, entity_type FROM os_verticals');
    console.log('  Verticals:', verticals.length);
    verticals.forEach(v => console.log(`    - ${v.key}: ${v.name} (${v.entity_type})`));

    const { rows: subVerticals } = await pool.query(`
      SELECT sv.key, sv.name, v.key as vertical_key
      FROM os_sub_verticals sv
      JOIN os_verticals v ON sv.vertical_id = v.id
    `);
    console.log('\n  Sub-Verticals:', subVerticals.length);
    subVerticals.forEach(sv => console.log(`    - ${sv.key}: ${sv.name} (vertical: ${sv.vertical_key})`));

    const { rows: personas } = await pool.query(`
      SELECT p.key, p.name, sv.key as sub_vertical_key
      FROM os_personas p
      JOIN os_sub_verticals sv ON p.sub_vertical_id = sv.id
    `);
    console.log('\n  Personas:', personas.length);
    personas.forEach(p => console.log(`    - ${p.key}: ${p.name} (sub-vertical: ${p.sub_vertical_key})`));

    const { rows: policies } = await pool.query(`
      SELECT pp.policy_version, p.key as persona_key
      FROM os_persona_policies pp
      JOIN os_personas p ON pp.persona_id = p.id
    `);
    console.log('\n  Persona Policies:', policies.length);
    policies.forEach(pp => console.log(`    - ${pp.persona_key}: version ${pp.policy_version}`));

    console.log('\n' + '━'.repeat(60));
    console.log('\n🎉 OS Control Plane schema ready!\n');
    console.log('Next steps:');
    console.log('  1. Create Super Admin CRUD routes');
    console.log('  2. Create OS resolve-config endpoint');
    console.log('  3. Wire UI to new APIs\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

applyMigration();
