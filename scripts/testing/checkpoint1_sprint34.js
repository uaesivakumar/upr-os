#!/usr/bin/env node
/**
 * Sprint 34 Checkpoint 1: Reports, Dashboard & Scoring
 * Tests database schema, report generation, dashboard, and scoring functionality
 */

// Set DATABASE_URL to Cloud SQL (production)
process.env.DATABASE_URL = "postgresql://upr_app:SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=@34.121.0.240:5432/upr_production?sslmode=disable";

import pg from 'pg';
const { Pool } = pg;
import { LifecycleReportGenerator } from '../../server/services/lifecycleReportGenerator.js';
import { LifecycleDashboard } from '../../server/services/lifecycleDashboard.js';
import { LifecycleScoring } from '../../server/services/lifecycleScoring.js';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
    console.log(`✅ ${message}`);
  } else {
    testsFailed++;
    console.error(`❌ ${message}`);
  }
}

async function checkpoint1() {
  console.log('\n' + '='.repeat(70));
  console.log('SPRINT 34 CHECKPOINT 1: REPORTS, DASHBOARD & SCORING');
  console.log('='.repeat(70));
  console.log('');

  const dbConfig = {
    host: '34.121.0.240',
    port: 5432,
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    database: 'upr_production',
    ssl: false
  };
  const dbUrl = dbConfig; // For services that expect a connection string, we'll handle differently
  const pool = new Pool(dbConfig);
  console.log('Pool created successfully');
  const reportGenerator = new LifecycleReportGenerator(dbUrl);
  console.log('ReportGenerator created');
  const dashboard = new LifecycleDashboard(dbUrl);
  console.log('Dashboard created');
  const scoring = new LifecycleScoring(dbUrl);
  console.log('Scoring created');

  try {
    // =======================================================================
    // Section 1: Database Schema
    // =======================================================================
    console.log('📋 Section 1: Database Schema\n');

    // Test new tables exist
    const tablesQuery = `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'lifecycle_scores',
          're_engagement_attempts',
          'lifecycle_action_templates',
          'opportunity_touchpoints'
        )
      ORDER BY table_name
    `;
    const tables = await pool.query(tablesQuery);
    assert(tables.rows.length === 4, `All 4 new tables exist (found ${tables.rows.length})`);

    // Test lifecycle_scores table structure
    const scoresColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lifecycle_scores'
    `);
    assert(scoresColumns.rows.length >= 10, `lifecycle_scores has correct columns (${scoresColumns.rows.length})`);

    // Test views exist (regular view)
    const viewsQuery = `
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = 'opportunity_journey_summary'
    `;
    const views = await pool.query(viewsQuery);
    assert(views.rows.length === 1, `Regular view exists (found ${views.rows.length})`);

    // Test materialized view exists
    const matViewQuery = `
      SELECT matviewname FROM pg_matviews
      WHERE schemaname = 'public'
        AND matviewname = 'lifecycle_analytics_cache'
    `;
    const matViews = await pool.query(matViewQuery);
    assert(matViews.rows.length === 1, `Materialized view exists (found ${matViews.rows.length})`);

    // Test functions exist
    const functionsQuery = `
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN (
          'calculate_engagement_score',
          'get_attribution_weights',
          'update_lifecycle_scores_updated_at'
        )
    `;
    const functions = await pool.query(functionsQuery);
    assert(functions.rows.length === 3, `All 3 functions exist (found ${functions.rows.length})`);

    // Test seed data (action templates)
    const templatesQuery = `SELECT COUNT(*) as count FROM lifecycle_action_templates`;
    const templates = await pool.query(templatesQuery);
    const templateCount = parseInt(templates.rows[0].count);
    assert(templateCount >= 6, `Action templates seeded (${templateCount} templates)`);

    // Test indexes exist
    const indexesQuery = `
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'lifecycle_scores'
        AND indexname LIKE 'idx_%'
    `;
    const indexes = await pool.query(indexesQuery);
    assert(indexes.rows.length >= 4, `lifecycle_scores indexes created (${indexes.rows.length})`);

    // =======================================================================
    // Section 2: Report Generator
    // =======================================================================
    console.log('\n📋 Section 2: Lifecycle Report Generator\n');

    // Test state distribution report
    const stateDistReport = await reportGenerator.generateStateDistributionReport();
    assert(stateDistReport.reportType === 'state_distribution', 'State distribution report type correct');
    assert(Array.isArray(stateDistReport.data), 'State distribution report has data array');
    assert(stateDistReport.summary !== undefined, 'State distribution report has summary');
    console.log(`   Found ${stateDistReport.data.length} states in distribution`);

    // Test conversion funnel report
    const funnelReport = await reportGenerator.generateConversionFunnelReport();
    assert(funnelReport.reportType === 'conversion_funnel', 'Conversion funnel report type correct');
    assert(Array.isArray(funnelReport.data), 'Funnel report has data array');
    assert(funnelReport.summary.overallConversionRate !== undefined, 'Funnel report has conversion rate');
    console.log(`   Funnel has ${funnelReport.data.length} stages`);

    // Test time-in-state report
    const timeReport = await reportGenerator.generateTimeInStateReport();
    assert(timeReport.reportType === 'time_in_state', 'Time-in-state report type correct');
    assert(Array.isArray(timeReport.data), 'Time report has data array');
    if (timeReport.data.length > 0) {
      assert(timeReport.data[0].avgDays !== undefined, 'Time report has avgDays metric');
      assert(timeReport.data[0].medianDays !== undefined, 'Time report has medianDays metric');
    }
    console.log(`   Analyzed ${timeReport.data.length} states for time metrics`);

    // Test velocity report
    const velocityReport = await reportGenerator.generateVelocityReport();
    assert(velocityReport.reportType === 'velocity', 'Velocity report type correct');
    assert(Array.isArray(velocityReport.data), 'Velocity report has data array');
    console.log(`   Found ${velocityReport.data.length} transition paths`);

    // Test outcome report
    const outcomeReport = await reportGenerator.generateOutcomeReport();
    assert(outcomeReport.reportType === 'outcome_analysis', 'Outcome report type correct');
    assert(Array.isArray(outcomeReport.data), 'Outcome report has data array');
    assert(outcomeReport.summary.totalClosed !== undefined, 'Outcome report has total closed');
    assert(outcomeReport.summary.winRate !== undefined, 'Outcome report has win rate');
    console.log(`   Total closed: ${outcomeReport.summary.totalClosed}, Win rate: ${outcomeReport.summary.winRate}%`);

    // Test all reports generation
    const allReports = await reportGenerator.generateAllReports();
    assert(allReports.reportType === 'all_reports', 'All reports type correct');
    assert(allReports.reports.stateDistribution !== undefined, 'All reports includes state distribution');
    assert(allReports.reports.conversionFunnel !== undefined, 'All reports includes funnel');
    assert(allReports.reports.timeInState !== undefined, 'All reports includes time-in-state');
    assert(allReports.reports.velocity !== undefined, 'All reports includes velocity');
    assert(allReports.reports.outcome !== undefined, 'All reports includes outcome');

    // Test CSV export
    const csvExport = reportGenerator.exportReportToCSV(stateDistReport);
    assert(typeof csvExport === 'string', 'CSV export returns string');
    assert(csvExport.includes(','), 'CSV export contains commas');

    // Test JSON export
    const jsonExport = reportGenerator.exportReportToJSON(stateDistReport);
    assert(typeof jsonExport === 'string', 'JSON export returns string');
    const parsed = JSON.parse(jsonExport);
    assert(parsed.reportType === 'state_distribution', 'JSON export parses correctly');

    // =======================================================================
    // Section 3: Dashboard
    // =======================================================================
    console.log('\n📋 Section 3: Lifecycle Dashboard\n');

    // Test overview metrics
    const overview = await dashboard.getOverviewMetrics();
    assert(overview.totalActiveOpportunities !== undefined, 'Overview has total active opps');
    assert(overview.currentConversionRate !== undefined, 'Overview has conversion rate');
    assert(overview.avgTimeToClose !== undefined, 'Overview has avg time to close');
    assert(overview.winRateLast30Days !== undefined, 'Overview has win rate');
    console.log(`   Active opps: ${overview.totalActiveOpportunities}, Win rate: ${overview.winRateLast30Days}%`);

    // Test state distribution
    const stateDistribution = await dashboard.getStateDistribution();
    assert(Array.isArray(stateDistribution), 'State distribution is array');
    if (stateDistribution.length > 0) {
      assert(stateDistribution[0].state !== undefined, 'State distribution has state');
      assert(stateDistribution[0].count !== undefined, 'State distribution has count');
      assert(stateDistribution[0].percentage !== undefined, 'State distribution has percentage');
    }
    console.log(`   ${stateDistribution.length} states in distribution`);

    // Test conversion funnel
    const funnel = await dashboard.getConversionFunnel();
    assert(Array.isArray(funnel), 'Funnel is array');
    if (funnel.length > 0) {
      assert(funnel[0].state !== undefined, 'Funnel has state');
      assert(funnel[0].count !== undefined, 'Funnel has count');
      assert(funnel[0].conversionRate !== undefined, 'Funnel has conversion rate');
    }
    console.log(`   ${funnel.length} stages in funnel`);

    // Test recent transitions
    const recentTransitions = await dashboard.getRecentTransitions(10);
    assert(Array.isArray(recentTransitions), 'Recent transitions is array');
    assert(recentTransitions.length <= 10, 'Recent transitions respects limit');
    if (recentTransitions.length > 0) {
      assert(recentTransitions[0].opportunityId !== undefined, 'Transition has opportunity ID');
      assert(recentTransitions[0].state !== undefined, 'Transition has state');
    }
    console.log(`   ${recentTransitions.length} recent transitions`);

    // Test trending metrics
    const trending = await dashboard.getTrendingMetrics(7);
    assert(Array.isArray(trending), 'Trending metrics is array');
    if (trending.length > 0) {
      assert(trending[0].date !== undefined, 'Trending has date');
      assert(trending[0].discovered !== undefined, 'Trending has discovered count');
    }
    console.log(`   ${trending.length} days of trending data`);

    // Test alerts
    const alerts = await dashboard.getAlerts();
    assert(Array.isArray(alerts), 'Alerts is array');
    console.log(`   ${alerts.length} active alerts`);

    // Test complete dashboard data
    const dashboardData = await dashboard.getDashboardData();
    assert(dashboardData.overview !== undefined, 'Dashboard has overview');
    assert(dashboardData.stateDistribution !== undefined, 'Dashboard has state distribution');
    assert(dashboardData.conversionFunnel !== undefined, 'Dashboard has funnel');
    assert(dashboardData.recentTransitions !== undefined, 'Dashboard has recent transitions');
    assert(dashboardData.trending !== undefined, 'Dashboard has trending');
    assert(dashboardData.alerts !== undefined, 'Dashboard has alerts');
    assert(dashboardData.generatedAt !== undefined, 'Dashboard has timestamp');

    // =======================================================================
    // Section 4: Scoring System
    // =======================================================================
    console.log('\n📋 Section 4: Lifecycle Scoring\n');

    // Create test opportunity with touchpoints
    const testOppId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a40';

    // Clean up any existing data
    await pool.query('DELETE FROM opportunity_touchpoints WHERE opportunity_id = $1', [testOppId]);
    await pool.query('DELETE FROM lifecycle_scores WHERE opportunity_id = $1', [testOppId]);
    await pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

    // Create lifecycle history for test opportunity
    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, entered_at, exited_at, trigger_type, trigger_reason)
      VALUES
        ($1, 'DISCOVERED', NOW() - INTERVAL '30 days', NOW() - INTERVAL '28 days', 'manual', 'Test'),
        ($1, 'QUALIFIED', NOW() - INTERVAL '28 days', NOW() - INTERVAL '20 days', 'auto', 'High quality'),
        ($1, 'OUTREACH', NOW() - INTERVAL '20 days', NOW() - INTERVAL '15 days', 'manual', 'Started outreach'),
        ($1, 'ENGAGED', NOW() - INTERVAL '15 days', NULL, 'manual', 'Had meeting')
    `, [testOppId]);

    // Create touchpoints
    await pool.query(`
      INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, channel, occurred_at, outcome)
      VALUES
        ($1, 'email', 'email', NOW() - INTERVAL '20 days', 'response'),
        ($1, 'meeting', 'zoom', NOW() - INTERVAL '15 days', 'positive'),
        ($1, 'email', 'email', NOW() - INTERVAL '10 days', 'response'),
        ($1, 'call', 'phone', NOW() - INTERVAL '5 days', 'positive')
    `, [testOppId]);

    // Test engagement score calculation
    const engagementScore = await scoring.calculateEngagementScore(testOppId);
    assert(typeof engagementScore === 'number', 'Engagement score is number');
    assert(engagementScore >= 0 && engagementScore <= 100, `Engagement score in range (${engagementScore})`);
    console.log(`   Engagement score: ${engagementScore}/100`);

    // Test velocity score calculation
    const velocityScore = await scoring.calculateVelocityScore(testOppId);
    assert(typeof velocityScore === 'number', 'Velocity score is number');
    assert(velocityScore >= 0 && velocityScore <= 100, `Velocity score in range (${velocityScore})`);
    console.log(`   Velocity score: ${velocityScore}/100`);

    // Test quality score retrieval
    const qualityScore = await scoring.getQualityScore(testOppId);
    assert(typeof qualityScore === 'number', 'Quality score is number');
    assert(qualityScore >= 0 && qualityScore <= 100, `Quality score in range (${qualityScore})`);
    console.log(`   Quality score: ${qualityScore}/100`);

    // Test composite score calculation
    const compositeScores = await scoring.calculateCompositeScore(testOppId);
    assert(compositeScores.engagementScore !== undefined, 'Composite has engagement');
    assert(compositeScores.velocityScore !== undefined, 'Composite has velocity');
    assert(compositeScores.qualityScore !== undefined, 'Composite has quality');
    assert(compositeScores.compositeScore !== undefined, 'Composite has composite score');
    assert(compositeScores.compositeScore >= 0 && compositeScores.compositeScore <= 100,
      `Composite score in range (${compositeScores.compositeScore})`);
    console.log(`   Composite score: ${compositeScores.compositeScore}/100`);

    // Test time to close prediction
    const timeToClose = await scoring.predictTimeToClose(testOppId);
    assert(timeToClose !== null, 'Time to close prediction returned');
    assert(timeToClose.estimatedDays !== undefined, 'Prediction has estimated days');
    assert(timeToClose.estimatedDate !== undefined, 'Prediction has estimated date');
    console.log(`   Estimated time to close: ${timeToClose.estimatedDays} days`);

    // Test win probability prediction
    const winProb = await scoring.predictWinProbability(testOppId);
    assert(typeof winProb === 'number', 'Win probability is number');
    assert(winProb >= 0 && winProb <= 100, `Win probability in range (${winProb}%)`);
    console.log(`   Win probability: ${winProb}%`);

    // Test churn risk identification
    const churnRisk = await scoring.identifyChurnRisk(testOppId);
    assert(['low', 'medium', 'high'].includes(churnRisk), `Churn risk is valid (${churnRisk})`);
    console.log(`   Churn risk: ${churnRisk}`);

    // Test score opportunity (full scoring with save)
    const fullScore = await scoring.scoreOpportunity(testOppId);
    assert(fullScore.opportunityId === testOppId, 'Score opportunity returns correct ID');
    assert(fullScore.compositeScore !== undefined, 'Full score has composite');
    assert(fullScore.winProbability !== undefined, 'Full score has win probability');
    assert(fullScore.churnRisk !== undefined, 'Full score has churn risk');

    // Verify saved to database
    const savedScore = await pool.query(
      'SELECT * FROM lifecycle_scores WHERE opportunity_id = $1',
      [testOppId]
    );
    assert(savedScore.rows.length === 1, 'Score saved to database');
    assert(parseInt(savedScore.rows[0].composite_score) === fullScore.compositeScore,
      'Saved composite score matches');

    // Test score all opportunities (limit 5 for speed)
    const batchResult = await scoring.scoreAllOpportunities({ limit: 5 });
    assert(batchResult.totalProcessed !== undefined, 'Batch scoring has total processed');
    assert(batchResult.successCount !== undefined, 'Batch scoring has success count');
    assert(batchResult.failureCount !== undefined, 'Batch scoring has failure count');
    assert(Array.isArray(batchResult.results), 'Batch scoring has results array');
    console.log(`   Batch scored ${batchResult.totalProcessed} opportunities (${batchResult.successCount} success)`);

    // Test get high-risk opportunities
    const highRisk = await scoring.getHighRiskOpportunities();
    assert(Array.isArray(highRisk), 'High-risk opportunities is array');
    console.log(`   ${highRisk.length} high-risk opportunities found`);

    // Test get top opportunities
    const topOpps = await scoring.getTopOpportunities(5);
    assert(Array.isArray(topOpps), 'Top opportunities is array');
    assert(topOpps.length <= 5, 'Top opportunities respects limit');
    console.log(`   ${topOpps.length} top opportunities found`);

    // Test database function: calculate_engagement_score
    const dbEngagementScore = await pool.query(
      'SELECT calculate_engagement_score($1) as score',
      [testOppId]
    );
    assert(dbEngagementScore.rows[0].score !== null, 'DB engagement score function works');
    console.log(`   DB engagement score function: ${dbEngagementScore.rows[0].score}/100`);

    // Test database function: get_attribution_weights (linear model)
    const linearWeights = await pool.query(
      'SELECT * FROM get_attribution_weights($1, $2)',
      [testOppId, 'linear']
    );
    assert(linearWeights.rows.length > 0, 'Linear attribution weights calculated');
    const linearSum = linearWeights.rows.reduce((sum, row) => sum + parseFloat(row.weight), 0);
    assert(Math.abs(linearSum - 1.0) < 0.01, `Linear weights sum to 1.0 (${linearSum.toFixed(4)})`);

    // Test database function: get_attribution_weights (time_decay model)
    const timeDecayWeights = await pool.query(
      'SELECT * FROM get_attribution_weights($1, $2)',
      [testOppId, 'time_decay']
    );
    assert(timeDecayWeights.rows.length > 0, 'Time decay attribution weights calculated');

    // Test database function: get_attribution_weights (position_based model)
    const positionWeights = await pool.query(
      'SELECT * FROM get_attribution_weights($1, $2)',
      [testOppId, 'position_based']
    );
    assert(positionWeights.rows.length > 0, 'Position-based attribution weights calculated');

    // =======================================================================
    // Cleanup
    // =======================================================================
    console.log('\n🧹 Cleaning up test data...\n');
    await pool.query('DELETE FROM opportunity_touchpoints WHERE opportunity_id = $1', [testOppId]);
    await pool.query('DELETE FROM lifecycle_scores WHERE opportunity_id = $1', [testOppId]);
    await pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

    // =======================================================================
    // Summary
    // =======================================================================
    console.log('='.repeat(70));
    console.log('CHECKPOINT 1 SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✅`);
    console.log(`Failed: ${testsFailed} ❌`);
    console.log(`Pass Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
    console.log('='.repeat(70));

    if (testsFailed === 0) {
      console.log('\n✅ CHECKPOINT 1: PASSED');
      console.log('📊 Reports, Dashboard, and Scoring systems are ready!');
      process.exit(0);
    } else {
      console.log('\n❌ CHECKPOINT 1: FAILED');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 1 ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    await reportGenerator.close();
    await dashboard.close();
    await scoring.close();
  }
}

checkpoint1();
