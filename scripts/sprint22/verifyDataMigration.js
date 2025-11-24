#!/usr/bin/env node
/**
 * Data Migration Verification Script
 *
 * Compares Render.com database vs GCP Cloud SQL to ensure:
 * 1. All tables exist in both databases
 * 2. Row counts match
 * 3. Recent data (last 7 days) is present in GCP
 * 4. Critical schemas (agent_core) are properly migrated
 */

const { Pool } = require('pg');

// Render.com database (OLD)
const renderPool = new Pool({
  connectionString: 'postgresql://upr_postgres_user:dCO8kY3mpy7WhAnwrNCdcb69LiVf7eGi@dpg-d2venebipnbc73cjpa30-a.frankfurt-postgres.render.com:5432/upr_postgres?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

// GCP Cloud SQL (NEW)
const gcpPool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: { rejectUnauthorized: false }
});

async function getTableList(pool, schema = 'public') {
  const result = await pool.query(`
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('public', 'agent_core')
    ORDER BY schemaname, tablename
  `);
  return result.rows;
}

async function getRowCount(pool, schema, table) {
  try {
    const result = await pool.query(`SELECT COUNT(*) as count FROM "${schema}"."${table}"`);
    return parseInt(result.rows[0].count);
  } catch (error) {
    return `ERROR: ${error.message}`;
  }
}

async function getRecentData(pool, schema, table) {
  try {
    // Try common timestamp columns
    const timestampColumns = ['created_at', 'timestamp', 'updated_at', 'created', 'date'];

    for (const col of timestampColumns) {
      try {
        const result = await pool.query(`
          SELECT COUNT(*) as count
          FROM "${schema}"."${table}"
          WHERE "${col}" >= NOW() - INTERVAL '7 days'
        `);
        return {
          column: col,
          count: parseInt(result.rows[0].count)
        };
      } catch (e) {
        continue;
      }
    }
    return { column: 'N/A', count: 'No timestamp column' };
  } catch (error) {
    return { column: 'ERROR', count: error.message };
  }
}

async function checkAgentCoreSchema(pool) {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'agent_core'
      ORDER BY table_name
    `);
    return result.rows.map(r => r.table_name);
  } catch (error) {
    return [];
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('DATA MIGRATION VERIFICATION: Render → GCP Cloud SQL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Test connections
    console.log('🔌 Step 1: Testing database connections...');
    await renderPool.query('SELECT NOW()');
    console.log('✅ Render.com connection: SUCCESS');

    await gcpPool.query('SELECT NOW()');
    console.log('✅ GCP Cloud SQL connection: SUCCESS');
    console.log('');

    // Get table lists
    console.log('📋 Step 2: Comparing table structures...');
    const renderTables = await getTableList(renderPool);
    const gcpTables = await getTableList(gcpPool);

    console.log(`Render.com tables: ${renderTables.length}`);
    console.log(`GCP Cloud SQL tables: ${gcpTables.length}`);
    console.log('');

    // Check for missing tables
    const renderTableNames = renderTables.map(t => `${t.schemaname}.${t.tablename}`);
    const gcpTableNames = gcpTables.map(t => `${t.schemaname}.${t.tablename}`);

    const missingInGCP = renderTableNames.filter(t => !gcpTableNames.includes(t));
    const extraInGCP = gcpTableNames.filter(t => !renderTableNames.includes(t));

    if (missingInGCP.length > 0) {
      console.log('⚠️  MISSING TABLES IN GCP:');
      missingInGCP.forEach(t => console.log(`   - ${t}`));
      console.log('');
    }

    if (extraInGCP.length > 0) {
      console.log('ℹ️  EXTRA TABLES IN GCP (not in Render):');
      extraInGCP.forEach(t => console.log(`   - ${t}`));
      console.log('');
    }

    // Compare row counts for common tables
    console.log('🔢 Step 3: Comparing row counts...');
    console.log('');

    const commonTables = renderTables.filter(t =>
      gcpTableNames.includes(`${t.schemaname}.${t.tablename}`)
    );

    const comparison = [];
    for (const table of commonTables) {
      const renderCount = await getRowCount(renderPool, table.schemaname, table.tablename);
      const gcpCount = await getRowCount(gcpPool, table.schemaname, table.tablename);

      comparison.push({
        schema: table.schemaname,
        table: table.tablename,
        render: renderCount,
        gcp: gcpCount,
        match: renderCount === gcpCount,
        diff: typeof renderCount === 'number' && typeof gcpCount === 'number'
          ? gcpCount - renderCount
          : 'N/A'
      });
    }

    // Display results
    console.log('Table Name                          | Render  | GCP     | Status');
    console.log('----------------------------------- | ------- | ------- | --------');

    for (const row of comparison) {
      const tableName = `${row.schema}.${row.table}`.padEnd(35);
      const renderStr = String(row.render).padStart(7);
      const gcpStr = String(row.gcp).padStart(7);
      const status = row.match ? '✅ MATCH' : '❌ DIFF';
      console.log(`${tableName} | ${renderStr} | ${gcpStr} | ${status}`);
    }
    console.log('');

    // Check agent_core schema specifically
    console.log('🤖 Step 4: Verifying agent_core schema (Sprint 21/22)...');
    const renderAgentCore = await checkAgentCoreSchema(renderPool);
    const gcpAgentCore = await checkAgentCoreSchema(gcpPool);

    console.log(`Render agent_core tables: ${renderAgentCore.length}`);
    console.log(`GCP agent_core tables: ${gcpAgentCore.length}`);

    if (gcpAgentCore.length > 0) {
      console.log('✅ agent_core schema exists in GCP:');
      gcpAgentCore.forEach(t => console.log(`   - ${t}`));
    } else {
      console.log('❌ agent_core schema NOT FOUND in GCP!');
    }
    console.log('');

    // Check recent data
    console.log('📅 Step 5: Checking recent data (last 7 days)...');
    const criticalTables = comparison.filter(t =>
      t.schema === 'agent_core' ||
      ['leads', 'companies', 'contacts'].includes(t.table)
    );

    for (const table of criticalTables.slice(0, 5)) {
      const gcpRecent = await getRecentData(gcpPool, table.schema, table.table);
      console.log(`${table.schema}.${table.table}: ${gcpRecent.count} recent rows (via ${gcpRecent.column})`);
    }
    console.log('');

    // Final verdict
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('MIGRATION VERIFICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const mismatches = comparison.filter(c => !c.match).length;
    const totalTables = comparison.length;

    if (missingInGCP.length > 0) {
      console.log('❌ CRITICAL: Tables missing in GCP');
      console.log(`   ${missingInGCP.length} tables not migrated`);
      console.log('');
    }

    if (mismatches > 0) {
      console.log(`⚠️  WARNING: ${mismatches}/${totalTables} tables have different row counts`);
      console.log('');
      console.log('Possible causes:');
      console.log('  1. Migration incomplete');
      console.log('  2. Production was writing to Render while GCP was empty');
      console.log('  3. Data created after migration');
      console.log('');
    }

    if (gcpAgentCore.length === 0) {
      console.log('❌ CRITICAL: agent_core schema missing in GCP');
      console.log('   Sprint 21/22 database schemas not deployed!');
      console.log('');
    }

    if (missingInGCP.length === 0 && mismatches === 0 && gcpAgentCore.length > 0) {
      console.log('✅ MIGRATION VERIFIED');
      console.log('   All tables present with matching row counts');
      console.log('   agent_core schema properly deployed');
      console.log('');
      console.log('Safe to decommission Render.com database');
      console.log('');
    } else {
      console.log('❌ MIGRATION ISSUES DETECTED');
      console.log('   DO NOT decommission Render.com database yet');
      console.log('   Review discrepancies above before proceeding');
      console.log('');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await renderPool.end();
    await gcpPool.end();
  }
}

main();
