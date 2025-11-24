#!/usr/bin/env node
/**
 * Sprint 39 - Task 4: End-to-End System Integration Test
 *
 * Validates that all system components work together:
 * - Authentication flow
 * - Lead enrichment pipeline
 * - Agent decision making
 * - Outreach generation
 * - Dashboard data flow
 * - Database persistence
 */

import pg from 'pg';
import { readFileSync } from 'fs';

const { Pool } = pg;

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  critical: 0,
  tests: []
};

function logTest(component, test, severity, status, message, details = null) {
  results.total++;
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') {
    results.failed++;
    if (severity === 'CRITICAL') results.critical++;
  }
  else if (status === 'WARN') results.warnings++;

  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? (severity === 'CRITICAL' ? '🚨' : '❌') : '⚠️';
  console.log(`${emoji} [${component}] ${test}: ${message}`);
  if (details) console.log(`   ${details}`);

  results.tests.push({ component, test, severity, status, message, details });
}

// Database connection
let pool;
function getDbPool() {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;

    // Parse DATABASE_URL manually to handle special characters
    if (dbUrl.includes('/cloudsql/')) {
      const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@\/([^?]+)\?host=(\/cloudsql\/[^&]+)/);
      if (match) {
        pool = new Pool({
          user: match[1],
          password: match[2],
          database: match[3],
          host: match[4],
        });
      } else {
        throw new Error('Failed to parse Cloud SQL Unix socket connection string');
      }
    } else {
      // Parse standard PostgreSQL URL manually to handle passwords with special chars
      const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?/);
      if (match) {
        pool = new Pool({
          user: match[1],
          password: match[2],
          host: match[3],
          port: parseInt(match[4]),
          database: match[5],
          ssl: dbUrl.includes('sslmode=require') || dbUrl.includes('ssl=true') ? { rejectUnauthorized: false } : false,
        });
      } else {
        // Fallback to connection string parsing
        pool = new Pool({
          connectionString: dbUrl,
        });
      }
    }
  }
  return pool;
}

// ================================================================
// AUTHENTICATION FLOW TEST
// ================================================================

async function testAuthenticationFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('🔐 AUTHENTICATION FLOW');
  console.log('='.repeat(60) + '\n');

  try {
    // Test 1: Check admin user exists in database
    const db = getDbPool();
    const result = await db.query(`
      SELECT username, role, is_active
      FROM users
      WHERE role = 'admin'
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      logTest('Auth', 'Admin user exists', 'CRITICAL', 'PASS',
        `Found admin user: ${admin.username}, Active: ${admin.is_active}`);
    } else {
      logTest('Auth', 'Admin user exists', 'CRITICAL', 'FAIL',
        'No admin user found in database');
    }

    // Test 2: Check session table exists
    const sessionCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sessions'
      ) as table_exists
    `);

    if (sessionCheck.rows[0].table_exists) {
      logTest('Auth', 'Session table exists', 'HIGH', 'PASS',
        'Sessions table configured for auth state');
    } else {
      logTest('Auth', 'Session table exists', 'MEDIUM', 'WARN',
        'No sessions table (may use JWT-only auth)');
    }

  } catch (error) {
    logTest('Auth', 'Authentication flow', 'CRITICAL', 'FAIL',
      `Error testing auth: ${error.message}`);
  }
}

// ================================================================
// LEAD ENRICHMENT PIPELINE TEST
// ================================================================

async function testLeadEnrichmentPipeline() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 LEAD ENRICHMENT PIPELINE');
  console.log('='.repeat(60) + '\n');

  try {
    const db = getDbPool();

    // Test 1: Check enrichment data completeness
    const enrichmentCheck = await db.query(`
      SELECT
        COUNT(*) as total_leads,
        COUNT(company) as has_company,
        COUNT(title) as has_title,
        COUNT(industry) as has_industry,
        ROUND(AVG(CASE WHEN company IS NOT NULL THEN 1 ELSE 0 END) * 100, 1) as company_pct
      FROM leads
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    const stats = enrichmentCheck.rows[0];
    const completeness = parseFloat(stats.company_pct);

    if (completeness >= 80) {
      logTest('Enrichment', 'Data completeness', 'HIGH', 'PASS',
        `${completeness}% of leads have company data`,
        `Total leads: ${stats.total_leads}, Company: ${stats.has_company}`);
    } else if (completeness >= 50) {
      logTest('Enrichment', 'Data completeness', 'MEDIUM', 'WARN',
        `${completeness}% completeness (target: 80%)`);
    } else {
      logTest('Enrichment', 'Data completeness', 'HIGH', 'FAIL',
        `Only ${completeness}% completeness`);
    }

    // Test 2: Check enrichment sources integration
    const sourcesCheck = await db.query(`
      SELECT DISTINCT data_source
      FROM leads
      WHERE data_source IS NOT NULL
      LIMIT 10
    `);

    if (sourcesCheck.rows.length > 0) {
      const sources = sourcesCheck.rows.map(r => r.data_source).join(', ');
      logTest('Enrichment', 'Data sources integrated', 'HIGH', 'PASS',
        `Found ${sourcesCheck.rows.length} data sources`, sources);
    } else {
      logTest('Enrichment', 'Data sources integrated', 'MEDIUM', 'WARN',
        'No data sources tracked (enrichment may not be active)');
    }

  } catch (error) {
    logTest('Enrichment', 'Lead enrichment pipeline', 'HIGH', 'FAIL',
      `Error testing enrichment: ${error.message}`);
  }
}

// ================================================================
// AGENT DECISION MAKING TEST
// ================================================================

async function testAgentDecisionMaking() {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 AGENT DECISION MAKING');
  console.log('='.repeat(60) + '\n');

  try {
    const db = getDbPool();

    // Test 1: Check agents are active
    const agentsCheck = await db.query(`
      SELECT
        COUNT(*) as total_agents,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_agents,
        SUM(CASE WHEN status = 'learning' THEN 1 ELSE 0 END) as learning_agents
      FROM agents
    `);

    const agents = agentsCheck.rows[0];
    const totalAgents = parseInt(agents.total_agents);

    if (totalAgents > 0) {
      logTest('Agents', 'Agents configured', 'HIGH', 'PASS',
        `${totalAgents} agents (Active: ${agents.active_agents}, Learning: ${agents.learning_agents})`);
    } else {
      logTest('Agents', 'Agents configured', 'MEDIUM', 'WARN',
        'No agents in database (system not yet initialized)');
    }

    // Test 2: Check agent decisions are being made
    const decisionsCheck = await db.query(`
      SELECT
        COUNT(*) as total_decisions,
        COUNT(DISTINCT agent_id) as agents_deciding,
        MAX(decided_at) as last_decision
      FROM agent_core.agent_decisions
      WHERE decided_at > NOW() - INTERVAL '7 days'
    `);

    const decisions = decisionsCheck.rows[0];
    const totalDecisions = parseInt(decisions.total_decisions);

    if (totalDecisions > 0) {
      logTest('Agents', 'Agent decisions active', 'HIGH', 'PASS',
        `${totalDecisions} decisions in last 7 days by ${decisions.agents_deciding} agents`,
        `Last decision: ${decisions.last_decision}`);
    } else {
      logTest('Agents', 'Agent decisions active', 'MEDIUM', 'WARN',
        'No recent agent decisions (agents may not be running)');
    }

    // Test 3: Check agent performance tracking
    const performanceCheck = await db.query(`
      SELECT COUNT(*) as metrics_count
      FROM agent_performance_metrics
      WHERE recorded_at > NOW() - INTERVAL '7 days'
    `);

    const metricsCount = parseInt(performanceCheck.rows[0].metrics_count);

    if (metricsCount > 0) {
      logTest('Agents', 'Performance tracking', 'MEDIUM', 'PASS',
        `${metricsCount} performance metrics recorded`);
    } else {
      logTest('Agents', 'Performance tracking', 'LOW', 'WARN',
        'No recent performance metrics');
    }

  } catch (error) {
    logTest('Agents', 'Agent decision making', 'HIGH', 'FAIL',
      `Error testing agents: ${error.message}`);
  }
}

// ================================================================
// OUTREACH GENERATION TEST
// ================================================================

async function testOutreachGeneration() {
  console.log('\n' + '='.repeat(60));
  console.log('📧 OUTREACH GENERATION');
  console.log('='.repeat(60) + '\n');

  try {
    const db = getDbPool();

    // Test 1: Check voice templates configured
    const templatesCheck = await db.query(`
      SELECT
        COUNT(*) as total_templates,
        COUNT(DISTINCT voice_type) as voice_types,
        SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_templates
      FROM voice_templates
    `);

    const templates = templatesCheck.rows[0];
    const totalTemplates = parseInt(templates.total_templates);

    if (totalTemplates > 0) {
      logTest('Outreach', 'Voice templates configured', 'HIGH', 'PASS',
        `${totalTemplates} templates (${templates.voice_types} voice types, ${templates.active_templates} active)`);
    } else {
      logTest('Outreach', 'Voice templates configured', 'HIGH', 'FAIL',
        'No voice templates configured');
    }

    // Test 2: Check outreach generations
    const generationsCheck = await db.query(`
      SELECT
        COUNT(*) as total_generations,
        COUNT(DISTINCT lead_id) as leads_contacted,
        MAX(created_at) as last_generation
      FROM outreach_generations
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    const generations = generationsCheck.rows[0];
    const totalGenerations = parseInt(generations.total_generations);

    if (totalGenerations > 0) {
      logTest('Outreach', 'Outreach generation active', 'HIGH', 'PASS',
        `${totalGenerations} generations for ${generations.leads_contacted} leads`,
        `Last: ${generations.last_generation}`);
    } else {
      logTest('Outreach', 'Outreach generation active', 'MEDIUM', 'WARN',
        'No recent outreach generations');
    }

    // Test 3: Check quality scores
    const qualityCheck = await db.query(`
      SELECT
        COUNT(*) as scored_generations,
        ROUND(AVG(quality_score), 2) as avg_quality,
        MIN(quality_score) as min_quality,
        MAX(quality_score) as max_quality
      FROM outreach_generations
      WHERE quality_score IS NOT NULL
      AND created_at > NOW() - INTERVAL '30 days'
    `);

    const quality = qualityCheck.rows[0];
    const scoredCount = parseInt(quality.scored_generations);

    if (scoredCount > 0) {
      const avgQuality = parseFloat(quality.avg_quality);
      if (avgQuality >= 0.7) {
        logTest('Outreach', 'Outreach quality', 'MEDIUM', 'PASS',
          `Avg quality: ${avgQuality} (Range: ${quality.min_quality}-${quality.max_quality})`);
      } else {
        logTest('Outreach', 'Outreach quality', 'MEDIUM', 'WARN',
          `Low avg quality: ${avgQuality} (target: 0.7+)`);
      }
    } else {
      logTest('Outreach', 'Outreach quality', 'LOW', 'WARN',
        'No quality scores available');
    }

  } catch (error) {
    logTest('Outreach', 'Outreach generation', 'HIGH', 'FAIL',
      `Error testing outreach: ${error.message}`);
  }
}

// ================================================================
// DASHBOARD DATA FLOW TEST
// ================================================================

async function testDashboardDataFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 DASHBOARD DATA FLOW');
  console.log('='.repeat(60) + '\n');

  try {
    const db = getDbPool();

    // Test 1: Check lead scoring data
    const scoringCheck = await db.query(`
      SELECT
        COUNT(*) as scored_leads,
        ROUND(AVG(lead_score), 2) as avg_score,
        ROUND(AVG(fit_score), 2) as avg_fit,
        ROUND(AVG(engagement_score), 2) as avg_engagement
      FROM lead_scores
      WHERE updated_at > NOW() - INTERVAL '30 days'
    `);

    const scoring = scoringCheck.rows[0];
    const scoredLeads = parseInt(scoring.scored_leads);

    if (scoredLeads > 0) {
      logTest('Dashboard', 'Lead scoring data', 'HIGH', 'PASS',
        `${scoredLeads} leads scored`,
        `Avg - Total: ${scoring.avg_score}, Fit: ${scoring.avg_fit}, Engagement: ${scoring.avg_engagement}`);
    } else {
      logTest('Dashboard', 'Lead scoring data', 'MEDIUM', 'WARN',
        'No recent lead scores (scoring engine may not be active)');
    }

    // Test 2: Check opportunity tracking
    const opportunitiesCheck = await db.query(`
      SELECT
        COUNT(*) as total_opportunities,
        COUNT(DISTINCT lead_id) as unique_leads,
        MAX(created_at) as last_touchpoint
      FROM opportunity_touchpoints
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    const opps = opportunitiesCheck.rows[0];
    const totalOpps = parseInt(opps.total_opportunities);

    if (totalOpps > 0) {
      logTest('Dashboard', 'Opportunity tracking', 'HIGH', 'PASS',
        `${totalOpps} touchpoints for ${opps.unique_leads} leads`,
        `Last: ${opps.last_touchpoint}`);
    } else {
      logTest('Dashboard', 'Opportunity tracking', 'MEDIUM', 'WARN',
        'No recent opportunity touchpoints');
    }

    // Test 3: Check company knowledge base
    const companiesCheck = await db.query(`
      SELECT
        COUNT(*) as total_companies,
        COUNT(DISTINCT industry) as industries,
        COUNT(DISTINCT country) as countries
      FROM kb_companies
    `);

    const companies = companiesCheck.rows[0];
    const totalCompanies = parseInt(companies.total_companies);

    if (totalCompanies > 0) {
      logTest('Dashboard', 'Company knowledge base', 'HIGH', 'PASS',
        `${totalCompanies} companies across ${companies.industries} industries, ${companies.countries} countries`);
    } else {
      logTest('Dashboard', 'Company knowledge base', 'HIGH', 'FAIL',
        'No companies in knowledge base');
    }

  } catch (error) {
    logTest('Dashboard', 'Dashboard data flow', 'HIGH', 'FAIL',
      `Error testing dashboard: ${error.message}`);
  }
}

// ================================================================
// DATABASE PERSISTENCE TEST
// ================================================================

async function testDatabasePersistence() {
  console.log('\n' + '='.repeat(60));
  console.log('💾 DATABASE PERSISTENCE');
  console.log('='.repeat(60) + '\n');

  try {
    const db = getDbPool();

    // Test 1: Check critical tables are accessible
    const criticalTables = [
      'users', 'leads', 'kb_companies', 'agents',
      'voice_templates', 'outreach_generations',
      'lead_scores', 'opportunity_touchpoints'
    ];

    let tablesAccessible = 0;
    for (const table of criticalTables) {
      try {
        await db.query(`SELECT COUNT(*) FROM ${table} LIMIT 1`);
        tablesAccessible++;
      } catch (error) {
        logTest('Database', `Table: ${table}`, 'MEDIUM', 'WARN',
          `Table not accessible: ${error.message}`);
      }
    }

    if (tablesAccessible === criticalTables.length) {
      logTest('Database', 'Critical tables accessible', 'CRITICAL', 'PASS',
        `All ${criticalTables.length} critical tables accessible`);
    } else {
      logTest('Database', 'Critical tables accessible', 'CRITICAL', 'FAIL',
        `Only ${tablesAccessible}/${criticalTables.length} tables accessible`);
    }

    // Test 2: Check referential integrity
    const integrityCheck = await db.query(`
      SELECT
        COUNT(*) as orphaned_records
      FROM agent_tasks
      WHERE assigned_to NOT IN (SELECT id FROM agents)
    `);

    const orphaned = parseInt(integrityCheck.rows[0].orphaned_records);

    if (orphaned === 0) {
      logTest('Database', 'Referential integrity', 'HIGH', 'PASS',
        'No orphaned records found');
    } else {
      logTest('Database', 'Referential integrity', 'HIGH', 'FAIL',
        `Found ${orphaned} orphaned records`);
    }

    // Test 3: Check data freshness
    const freshnessCheck = await db.query(`
      SELECT
        'leads' as table_name,
        MAX(created_at) as latest_record
      FROM leads
      UNION ALL
      SELECT
        'outreach_generations',
        MAX(created_at)
      FROM outreach_generations
      UNION ALL
      SELECT
        'lead_scores',
        MAX(updated_at)
      FROM lead_scores
    `);

    let freshDataCount = 0;
    freshnessCheck.rows.forEach(row => {
      if (row.latest_record) {
        const daysSinceUpdate = Math.floor((Date.now() - new Date(row.latest_record)) / (1000 * 60 * 60 * 24));
        if (daysSinceUpdate <= 7) {
          freshDataCount++;
        }
      }
    });

    if (freshDataCount >= 2) {
      logTest('Database', 'Data freshness', 'MEDIUM', 'PASS',
        `${freshDataCount}/3 tables have data from last 7 days`);
    } else {
      logTest('Database', 'Data freshness', 'MEDIUM', 'WARN',
        `Only ${freshDataCount}/3 tables have fresh data (may be test environment)`);
    }

  } catch (error) {
    logTest('Database', 'Database persistence', 'CRITICAL', 'FAIL',
      `Error testing database: ${error.message}`);
  }
}

// ================================================================
// MAIN TEST RUNNER
// ================================================================

async function runE2EIntegrationTests() {
  console.log('🔄 Starting End-to-End System Integration Test...\n');

  try {
    await testAuthenticationFlow();
    await testLeadEnrichmentPipeline();
    await testAgentDecisionMaking();
    await testOutreachGeneration();
    await testDashboardDataFlow();
    await testDatabasePersistence();

    // Print final report
    console.log('\n' + '='.repeat(60));
    console.log('📊 E2E INTEGRATION TEST REPORT');
    console.log('='.repeat(60) + '\n');

    console.log(`Total Tests Run: ${results.total}`);
    console.log(`✅ Passed: ${results.passed} (${((results.passed/results.total)*100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${results.failed} (${((results.failed/results.total)*100).toFixed(1)}%)`);
    console.log(`🚨 Critical Failures: ${results.critical}`);
    console.log(`⚠️  Warnings: ${results.warnings} (${((results.warnings/results.total)*100).toFixed(1)}%)`);

    console.log('\n' + '='.repeat(60));

    // Determine overall status
    let status;
    let statusEmoji;
    if (results.critical > 0) {
      status = 'CRITICAL (Production Blocker)';
      statusEmoji = '🚨';
    } else if (results.failed > 0) {
      status = 'FAILED (Issues Found)';
      statusEmoji = '❌';
    } else if (results.warnings > results.total * 0.3) {
      status = 'WARNING (Many Issues)';
      statusEmoji = '⚠️';
    } else if (results.warnings > 0) {
      status = 'GOOD (Minor Issues)';
      statusEmoji = '✅';
    } else {
      status = 'EXCELLENT (All Tests Passed)';
      statusEmoji = '🎉';
    }

    console.log(`${statusEmoji} SYSTEM STATUS: ${status}`);
    console.log('='.repeat(60) + '\n');

    // Summary by component
    const componentSummary = {};
    results.tests.forEach(test => {
      if (!componentSummary[test.component]) {
        componentSummary[test.component] = { passed: 0, failed: 0, warnings: 0 };
      }
      if (test.status === 'PASS') componentSummary[test.component].passed++;
      else if (test.status === 'FAIL') componentSummary[test.component].failed++;
      else if (test.status === 'WARN') componentSummary[test.component].warnings++;
    });

    console.log('📊 Summary by Component:\n');
    Object.entries(componentSummary).forEach(([component, stats]) => {
      console.log(`${component}:`);
      console.log(`  ✅ Passed: ${stats.passed}`);
      console.log(`  ❌ Failed: ${stats.failed}`);
      console.log(`  ⚠️  Warnings: ${stats.warnings}`);
    });

    console.log('');

  } catch (error) {
    console.error('❌ Fatal error during E2E testing:', error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  // Exit with appropriate code
  process.exit(results.critical > 0 ? 2 : results.failed > 0 ? 1 : 0);
}

// Check database connection
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

runE2EIntegrationTests();
