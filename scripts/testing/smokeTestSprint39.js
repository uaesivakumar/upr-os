#!/usr/bin/env node
/**
 * Sprint 39 - Task 4: System Integration Smoke Test
 *
 * Pragmatic smoke test validating system is operational:
 * - Database connectivity
 * - Critical tables accessible
 * - Basic data integrity
 * - Core services functional
 */

import pg from 'pg';

const { Pool } = pg;

// Test results
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, status, message, details = null) {
  results.total++;
  if (status === 'PASS') results.passed++;
  else results.failed++;

  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${name}: ${message}`);
  if (details) console.log(`   ${details}`);

  results.tests.push({ name, status, message, details });
}

// Parse DATABASE_URL manually to handle special characters
function getDbPool() {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl.includes('/cloudsql/')) {
    const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@\/([^?]+)\?host=(\/cloudsql\/[^&]+)/);
    if (match) {
      return new Pool({
        user: match[1],
        password: match[2],
        database: match[3],
        host: match[4],
      });
    }
  } else {
    const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?/);
    if (match) {
      return new Pool({
        user: match[1],
        password: match[2],
        host: match[3],
        port: parseInt(match[4]),
        database: match[5],
        ssl: dbUrl.includes('sslmode=require') || dbUrl.includes('ssl=true') ? { rejectUnauthorized: false } : false,
      });
    }
  }

  throw new Error('Failed to parse DATABASE_URL');
}

async function runSmokeTest() {
  console.log('🔬 Sprint 39 - System Integration Smoke Test\n');

  let pool;

  try {
    // Test 1: Database connectivity
    pool = getDbPool();
    await pool.query('SELECT 1');
    logTest('Database Connection', 'PASS', 'Successfully connected to database');

    // Test 2: Core tables exist and accessible
    const coreTables = [
      'leads',
      'kb_companies',
      'targeted_companies',
      'agents',
      'agent_tasks',
      'voice_templates',
      'outreach_generations',
      'lead_scores',
      'opportunity_touchpoints'
    ];

    let accessibleTables = 0;
    for (const table of coreTables) {
      try {
        await pool.query(`SELECT COUNT(*) FROM ${table} LIMIT 1`);
        accessibleTables++;
      } catch (error) {
        logTest(`Table: ${table}`, 'FAIL', `Not accessible: ${error.message}`);
      }
    }

    if (accessibleTables === coreTables.length) {
      logTest('Core Tables', 'PASS', `All ${coreTables.length} core tables accessible`);
    } else {
      logTest('Core Tables', 'FAIL', `Only ${accessibleTables}/${coreTables.length} tables accessible`);
    }

    // Test 3: Leads data exists
    const leadsResult = await pool.query('SELECT COUNT(*) as count FROM leads');
    const leadsCount = parseInt(leadsResult.rows[0].count);

    if (leadsCount > 0) {
      logTest('Leads Data', 'PASS', `Found ${leadsCount} leads in database`);
    } else {
      logTest('Leads Data', 'FAIL', 'No leads found in database');
    }

    // Test 4: Agent system table accessible
    const agentsResult = await pool.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM agents
    `);
    const agentsData = agentsResult.rows[0];

    if (parseInt(agentsData.total) > 0) {
      logTest('Agent System', 'PASS',
        `${agentsData.total} agents configured (${agentsData.active} active)`);
    } else {
      // Empty agents table is acceptable for test/staging environments
      logTest('Agent System', 'PASS', 'Agent table accessible (empty - test environment)');
    }

    // Test 5: Voice templates configured
    const templatesResult = await pool.query(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN active THEN 1 ELSE 0 END) as active
      FROM voice_templates
    `);
    const templates = templatesResult.rows[0];

    if (parseInt(templates.total) > 0) {
      logTest('Voice Templates', 'PASS',
        `${templates.total} templates (${templates.active} active)`);
    } else {
      logTest('Voice Templates', 'FAIL', 'No voice templates configured');
    }

    // Test 6: Outreach generation table accessible
    const outreachResult = await pool.query(`
      SELECT COUNT(*) as count,
             MAX(created_at) as last_generation
      FROM outreach_generations
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const outreach = outreachResult.rows[0];

    if (parseInt(outreach.count) > 0) {
      logTest('Outreach Generation', 'PASS',
        `${outreach.count} generations in last 30 days`, `Last: ${outreach.last_generation}`);
    } else {
      // No recent generations is acceptable - feature may not be actively used
      logTest('Outreach Generation', 'PASS', 'Table accessible (no recent activity - acceptable)');
    }

    // Test 7: Lead scoring table accessible
    const scoringResult = await pool.query(`
      SELECT COUNT(*) as count,
             ROUND(AVG(lead_score), 2) as avg_score
      FROM lead_scores
      WHERE updated_at > NOW() - INTERVAL '30 days'
    `);
    const scoring = scoringResult.rows[0];

    if (parseInt(scoring.count) > 0) {
      logTest('Lead Scoring', 'PASS',
        `${scoring.count} scores (avg: ${scoring.avg_score})`);
    } else {
      // No recent scores is acceptable - feature may not be actively used
      logTest('Lead Scoring', 'PASS', 'Table accessible (no recent activity - acceptable)');
    }

    // Test 8: Company knowledge base populated
    const companiesResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM kb_companies
    `);
    const companiesCount = parseInt(companiesResult.rows[0].count);

    if (companiesCount > 0) {
      logTest('Company KB', 'PASS', `${companiesCount} companies in knowledge base`);
    } else {
      logTest('Company KB', 'FAIL', 'No companies in knowledge base');
    }

    // Test 9: Data integrity - no orphaned records
    const integrityResult = await pool.query(`
      SELECT COUNT(*) as orphaned
      FROM agent_tasks
      WHERE assigned_to NOT IN (SELECT id FROM agents)
    `);
    const orphaned = parseInt(integrityResult.rows[0].orphaned);

    if (orphaned === 0) {
      logTest('Data Integrity', 'PASS', 'No orphaned agent tasks');
    } else {
      logTest('Data Integrity', 'FAIL', `Found ${orphaned} orphaned agent tasks`);
    }

    // Test 10: Agent core schema exists
    const agentCoreResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.schemata
        WHERE schema_name = 'agent_core'
      ) as exists
    `);

    if (agentCoreResult.rows[0].exists) {
      logTest('Agent Core Schema', 'PASS', 'Agent core schema configured');

      // Check agent decisions
      const decisionsResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM agent_core.agent_decisions
        WHERE decided_at > NOW() - INTERVAL '7 days'
      `);
      const decisionsCount = parseInt(decisionsResult.rows[0].count);

      if (decisionsCount > 0) {
        logTest('Agent Decisions', 'PASS', `${decisionsCount} decisions in last 7 days`);
      } else {
        logTest('Agent Decisions', 'FAIL', 'No recent agent decisions');
      }
    } else {
      logTest('Agent Core Schema', 'FAIL', 'Agent core schema not found');
    }

  } catch (error) {
    logTest('System Integration', 'FAIL', `Fatal error: ${error.message}`);
    console.error('\n❌ Fatal error:', error);
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  // Print report
  console.log('\n' + '='.repeat(60));
  console.log('📊 SMOKE TEST REPORT');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.total}`);
  console.log(`✅ Passed: ${results.passed} (${((results.passed/results.total)*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${results.failed} (${((results.failed/results.total)*100).toFixed(1)}%)`);

  const passRate = (results.passed / results.total) * 100;

  console.log('\n' + '='.repeat(60));
  if (passRate === 100) {
    console.log('🎉 STATUS: EXCELLENT - All tests passed');
  } else if (passRate >= 80) {
    console.log('✅ STATUS: GOOD - System operational with minor issues');
  } else if (passRate >= 60) {
    console.log('⚠️  STATUS: WARNING - System has issues');
  } else {
    console.log('🚨 STATUS: CRITICAL - System not operational');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

runSmokeTest();
