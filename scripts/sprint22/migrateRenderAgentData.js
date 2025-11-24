#!/usr/bin/env node
/**
 * Migrate Agent Data from Render to GCP Cloud SQL
 * Handles 163 agent_decisions from Render's public.agent_decisions
 */

const { Pool } = require('pg');

// Source: Render.com
const renderPool = new Pool({
  connectionString: 'postgresql://upr_postgres_user:dCO8kY3mpy7WhAnwrNCdcb69LiVf7eGi@dpg-d2venebipnbc73cjpa30-a.frankfurt-postgres.render.com:5432/upr_postgres?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

// Target: GCP Cloud SQL
const gcpPool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: { rejectUnauthorized: false }
});

async function migrateAgentDecisions() {
  console.log('📦 Fetching agent_decisions from Render...');
  const renderData = await renderPool.query('SELECT * FROM agent_decisions ORDER BY created_at');
  console.log(`✅ Fetched ${renderData.rows.length} decisions from Render`);

  if (renderData.rows.length === 0) {
    console.log('ℹ️  No data to migrate');
    return 0;
  }

  console.log('💾 Inserting into GCP Cloud SQL...');
  let inserted = 0;
  let skipped = 0;

  for (const row of renderData.rows) {
    try {
      await gcpPool.query(`
        INSERT INTO agent_decisions (
          id, company_id, contact_id, signal_id, tool_name, tool_layer, primitive_name,
          input_params, output_result, reasoning, score, confidence, quality_tier,
          execution_time_ms, policy_version, session_id, module_caller, tenant_id,
          created_at, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        row.id, row.company_id, row.contact_id, row.signal_id, row.tool_name, row.tool_layer,
        row.primitive_name, row.input_params, row.output_result, row.reasoning, row.score,
        row.confidence, row.quality_tier, row.execution_time_ms, row.policy_version,
        row.session_id, row.module_caller, row.tenant_id, row.created_at, row.created_by
      ]);
      inserted++;
    } catch (error) {
      console.error(`❌ Error inserting row ${row.id}:`, error.message);
      skipped++;
    }
  }

  console.log(`✅ Migrated ${inserted} decisions (${skipped} skipped)`);
  return inserted;
}

async function migrateAgentOverrides() {
  console.log('📦 Fetching agent_overrides from Render...');
  const renderData = await renderPool.query('SELECT * FROM agent_overrides ORDER BY created_at');
  console.log(`✅ Fetched ${renderData.rows.length} overrides from Render`);

  if (renderData.rows.length === 0) {
    console.log('ℹ️  No overrides to migrate');
    return 0;
  }

  let inserted = 0;
  for (const row of renderData.rows) {
    try {
      await gcpPool.query(`
        INSERT INTO agent_overrides (
          id, decision_id, ai_result, human_result, ai_score, ai_confidence, ai_quality_tier,
          human_score, human_confidence, human_quality_tier, override_reason, notes,
          score_delta, agreement, created_at, user_id, user_email, tenant_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        row.id, row.decision_id, row.ai_result, row.human_result, row.ai_score, row.ai_confidence,
        row.ai_quality_tier, row.human_score, row.human_confidence, row.human_quality_tier,
        row.override_reason, row.notes, row.score_delta, row.agreement, row.created_at,
        row.user_id, row.user_email, row.tenant_id
      ]);
      inserted++;
    } catch (error) {
      console.error(`❌ Error inserting override ${row.id}:`, error.message);
    }
  }

  console.log(`✅ Migrated ${inserted} overrides`);
  return inserted;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Agent Data Migration: Render → GCP Cloud SQL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const decisionsCount = await migrateAgentDecisions();
    const overridesCount = await migrateAgentOverrides();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Migration Complete');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`✅ Migrated ${decisionsCount} agent_decisions`);
    console.log(`✅ Migrated ${overridesCount} agent_overrides`);
    console.log('');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await renderPool.end();
    await gcpPool.end();
  }
}

main();
