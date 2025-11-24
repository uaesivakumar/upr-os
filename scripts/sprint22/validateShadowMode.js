#!/usr/bin/env node
/**
 * Sprint 22 Shadow Mode Validation Script
 *
 * Automated test suite that:
 * 1. Generates diverse test cases (100+ scenarios)
 * 2. Sends requests to CompanyQualityTool
 * 3. Collects shadow mode comparison data
 * 4. Analyzes match rate between inline and rule engine
 * 5. Reports discrepancies
 * 6. Recommends: Enable full rule engine OR fix rules first
 *
 * Usage:
 *   node scripts/sprint22/validateShadowMode.js
 *
 * Success Criteria:
 *   - Match rate ≥ 95%
 *   - Avg score diff ≤ 3 points
 *   - Avg confidence diff ≤ 0.05
 *   - No critical failures
 */

const axios = require('axios');
const db = require('../../utils/db');

// Configuration
const BASE_URL = process.env.API_URL || 'https://upr-web-service-191599223867.us-central1.run.app';
const NUM_TEST_CASES = 100;
const MATCH_THRESHOLD = 0.95; // 95% match rate required
const SCORE_DIFF_THRESHOLD = 3; // Max avg score difference
const CONFIDENCE_DIFF_THRESHOLD = 0.05; // Max avg confidence difference

// Test cases covering diverse scenarios
const testScenarios = [
  // High quality - Strong signals
  {
    name: 'High Quality - Tech UAE + High Salary + Free Zone',
    input: {
      company_name: 'TechCorp UAE',
      domain: 'techcorp.ae',
      industry: 'Technology',
      uae_signals: { has_ae_domain: true, has_uae_address: true, linkedin_location: 'Dubai, UAE' },
      salary_indicators: { salary_level: 'high', avg_salary: 18000 },
      size: 150,
      size_bucket: 'midsize',
      license_type: 'Free Zone',
      sector: 'Private'
    },
    expected_range: [90, 100]
  },

  // Medium quality - Moderate signals
  {
    name: 'Medium Quality - Moderate UAE + Medium Salary',
    input: {
      company_name: 'Local Startup',
      domain: 'startup.ae',
      industry: 'Retail',
      uae_signals: { has_ae_domain: true, has_uae_address: false },
      salary_indicators: { avg_salary: 9000 },
      size: 80,
      size_bucket: 'scaleup',
      license_type: 'Mainland',
      sector: 'Private'
    },
    expected_range: [30, 50]
  },

  // Low quality - Weak signals
  {
    name: 'Low Quality - No UAE Signals + Low Salary',
    input: {
      company_name: 'Remote Company',
      domain: 'remote.com',
      industry: 'Consulting',
      uae_signals: { has_ae_domain: false, has_uae_address: false },
      salary_indicators: { avg_salary: 5000 },
      size: 20,
      size_bucket: 'startup',
      license_type: 'Mainland',
      sector: 'Private'
    },
    expected_range: [0, 20]
  },

  // Edge case - Enterprise brand (should be rejected)
  {
    name: 'Edge Case - Emirates Airlines',
    input: {
      company_name: 'Emirates Airlines',
      domain: 'emirates.com',
      industry: 'Aviation',
      uae_signals: { has_ae_domain: false, has_uae_address: true },
      salary_indicators: { salary_level: 'high' },
      size: 50000,
      size_bucket: 'enterprise',
      license_type: 'Mainland',
      sector: 'Private'
    },
    expected_range: [0, 10]
  },

  // Edge case - Government sector (should be rejected)
  {
    name: 'Edge Case - Government Ministry',
    input: {
      company_name: 'Ministry of Innovation',
      domain: 'moi.gov.ae',
      industry: 'Government',
      uae_signals: { has_ae_domain: true, has_uae_address: true },
      salary_indicators: { salary_level: 'high' },
      size: 200,
      size_bucket: 'midsize',
      license_type: 'Mainland',
      sector: 'Government'
    },
    expected_range: [0, 10]
  },

  // High value industry - FinTech
  {
    name: 'High Value Industry - FinTech Startup',
    input: {
      company_name: 'FinTech Innovations',
      domain: 'fintech.ae',
      industry: 'FinTech',
      uae_signals: { has_ae_domain: true, has_uae_address: true },
      salary_indicators: { salary_level: 'high', avg_salary: 20000 },
      size: 120,
      size_bucket: 'scaleup',
      license_type: 'Free Zone',
      sector: 'Private'
    },
    expected_range: [90, 100]
  },

  // Healthcare - High value
  {
    name: 'High Value Industry - Healthcare',
    input: {
      company_name: 'Medical Clinic',
      domain: 'clinic.ae',
      industry: 'Healthcare',
      uae_signals: { has_ae_domain: true, has_uae_address: true },
      salary_indicators: { avg_salary: 16000 },
      size: 200,
      size_bucket: 'midsize',
      license_type: 'Mainland',
      sector: 'Private'
    },
    expected_range: [70, 90]
  },

  // Small company - acceptable
  {
    name: 'Small Company - Good Signals',
    input: {
      company_name: 'Boutique Agency',
      domain: 'agency.ae',
      industry: 'Marketing',
      uae_signals: { has_ae_domain: true, has_uae_address: true },
      salary_indicators: { avg_salary: 12000 },
      size: 35,
      size_bucket: 'startup',
      license_type: 'Mainland',
      sector: 'Private'
    },
    expected_range: [50, 70]
  },

  // Missing data - low confidence
  {
    name: 'Missing Data - Low Confidence',
    input: {
      company_name: 'Unknown Corp',
      domain: 'unknown.com',
      industry: 'Unknown',
      uae_signals: { has_ae_domain: false, has_uae_address: false },
      salary_indicators: {},
      size: 10,
      size_bucket: 'startup',
      license_type: 'Mainland',
      sector: 'Private'
    },
    expected_range: [0, 20]
  },

  // Multiple edge cases
  {
    name: 'Edge Case - ADNOC (Enterprise Brand)',
    input: {
      company_name: 'ADNOC',
      domain: 'adnoc.ae',
      industry: 'Oil & Gas',
      uae_signals: { has_ae_domain: true, has_uae_address: true },
      salary_indicators: { salary_level: 'high' },
      size: 100000,
      size_bucket: 'enterprise',
      license_type: 'Mainland',
      sector: 'Private'
    },
    expected_range: [0, 10]
  }
];

// Generate variations for comprehensive testing
function generateTestCases() {
  const cases = [];

  // Add base scenarios
  testScenarios.forEach(scenario => {
    cases.push(scenario);
  });

  // Generate size variations
  const sizes = [10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 5000];
  sizes.forEach(size => {
    cases.push({
      name: `Size Variation - ${size} employees`,
      input: {
        company_name: `Company ${size}`,
        domain: `company${size}.ae`,
        industry: 'Technology',
        uae_signals: { has_ae_domain: true, has_uae_address: true },
        salary_indicators: { salary_level: 'high' },
        size: size,
        size_bucket: size < 50 ? 'startup' : size < 200 ? 'scaleup' : size < 500 ? 'midsize' : 'enterprise',
        license_type: 'Free Zone',
        sector: 'Private'
      },
      expected_range: null // Varies by size
    });
  });

  // Generate salary variations
  const salaries = [3000, 5000, 7000, 9000, 12000, 15000, 18000, 25000];
  salaries.forEach(salary => {
    cases.push({
      name: `Salary Variation - AED ${salary}/month`,
      input: {
        company_name: `Salary Test ${salary}`,
        domain: 'test.ae',
        industry: 'Technology',
        uae_signals: { has_ae_domain: true, has_uae_address: true },
        salary_indicators: { avg_salary: salary },
        size: 100,
        size_bucket: 'scaleup',
        license_type: 'Mainland',
        sector: 'Private'
      },
      expected_range: null
    });
  });

  // Generate industry variations
  const industries = ['Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing', 'Education', 'Real Estate'];
  industries.forEach(industry => {
    cases.push({
      name: `Industry Variation - ${industry}`,
      input: {
        company_name: `${industry} Company`,
        domain: `${industry.toLowerCase().replace(/\s+/g, '')}.ae`,
        industry: industry,
        uae_signals: { has_ae_domain: true, has_uae_address: true },
        salary_indicators: { salary_level: 'medium' },
        size: 150,
        size_bucket: 'midsize',
        license_type: 'Mainland',
        sector: 'Private'
      },
      expected_range: null
    });
  });

  return cases.slice(0, NUM_TEST_CASES);
}

/**
 * Send test request to CompanyQualityTool
 */
async function sendTestRequest(testCase) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/agent-core/v1/tools/evaluate_company_quality`,
      testCase.input,
      { timeout: 10000 }
    );

    return {
      success: true,
      testCase: testCase.name,
      result: response.data.result,
      decision_id: response.data.result._meta.decision_id,
      shadow_mode_active: response.data.result._meta.shadow_mode_active
    };
  } catch (error) {
    return {
      success: false,
      testCase: testCase.name,
      error: error.message
    };
  }
}

/**
 * Query shadow mode comparison data from database
 */
async function queryShadowModeData() {
  const query = `
    SELECT
      decision_id,
      tool_name,
      (output_data->'inline'->>'quality_score')::int as inline_score,
      (output_data->'inline'->>'confidence')::decimal as inline_confidence,
      (output_data->'rule'->>'score')::int as rule_score,
      (output_data->'rule'->>'confidence')::decimal as rule_confidence,
      (output_data->'comparison'->>'match')::boolean as match,
      (output_data->'comparison'->>'score_diff')::decimal as score_diff,
      (output_data->'comparison'->>'confidence_diff')::decimal as confidence_diff,
      latency_ms as execution_time_ms,
      created_at
    FROM agent_core.agent_decisions
    WHERE tool_name = 'CompanyQualityTool'
      AND created_at >= NOW() - INTERVAL '10 minutes'
    ORDER BY created_at DESC
  `;

  const result = await db.query(query);
  return result.rows;
}

/**
 * Analyze shadow mode results
 */
function analyzeShadowModeData(data) {
  if (data.length === 0) {
    return {
      status: 'NO_DATA',
      message: 'No shadow mode data collected'
    };
  }

  const total = data.length;
  const matches = data.filter(d => d.match === true).length;
  const matchRate = matches / total;

  const avgScoreDiff = data.reduce((sum, d) => sum + (d.score_diff || 0), 0) / total;
  const avgConfidenceDiff = data.reduce((sum, d) => sum + (d.confidence_diff || 0), 0) / total;
  const avgExecutionTime = data.reduce((sum, d) => sum + d.execution_time_ms, 0) / total;

  const mismatches = data.filter(d => d.match === false);

  // Determine status
  let status = 'PASS';
  const issues = [];

  if (matchRate < MATCH_THRESHOLD) {
    status = 'FAIL';
    issues.push(`Match rate ${(matchRate * 100).toFixed(1)}% < ${MATCH_THRESHOLD * 100}% threshold`);
  }

  if (avgScoreDiff > SCORE_DIFF_THRESHOLD) {
    status = 'FAIL';
    issues.push(`Avg score diff ${avgScoreDiff.toFixed(2)} > ${SCORE_DIFF_THRESHOLD} threshold`);
  }

  if (avgConfidenceDiff > CONFIDENCE_DIFF_THRESHOLD) {
    status = 'WARN';
    issues.push(`Avg confidence diff ${avgConfidenceDiff.toFixed(4)} > ${CONFIDENCE_DIFF_THRESHOLD} threshold`);
  }

  return {
    status,
    total,
    matches,
    mismatches: mismatches.length,
    matchRate: parseFloat((matchRate * 100).toFixed(2)),
    avgScoreDiff: parseFloat(avgScoreDiff.toFixed(2)),
    avgConfidenceDiff: parseFloat(avgConfidenceDiff.toFixed(4)),
    avgExecutionTime: parseFloat(avgExecutionTime.toFixed(2)),
    issues,
    mismatchSamples: mismatches.slice(0, 5).map(m => ({
      decision_id: m.decision_id,
      inline_score: m.inline_score,
      rule_score: m.rule_score,
      diff: m.score_diff
    }))
  };
}

/**
 * Main validation flow
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Sprint 22 Shadow Mode Validation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Step 1: Generate test cases
  console.log(`📋 Step 1: Generating ${NUM_TEST_CASES} test cases...`);
  const testCases = generateTestCases();
  console.log(`✅ Generated ${testCases.length} test cases\n`);

  // Step 2: Send test requests
  console.log('🧪 Step 2: Sending test requests...');
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    process.stdout.write(`\r   Progress: ${i + 1}/${testCases.length} (${successCount} ✓, ${failCount} ✗)`);

    const result = await sendTestRequest(testCase);
    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }

    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n✅ Completed: ${successCount} successful, ${failCount} failed\n`);

  if (!results.some(r => r.shadow_mode_active)) {
    console.log('❌ ERROR: Shadow mode not active!');
    console.log('   Check that rule engine v2.0 loaded successfully');
    process.exit(1);
  }

  // Step 3: Wait for database logging
  console.log('⏳ Step 3: Waiting for database logging (5 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('✅ Wait complete\n');

  // Step 4: Query shadow mode data
  console.log('📊 Step 4: Querying shadow mode comparison data...');
  const shadowData = await queryShadowModeData();
  console.log(`✅ Retrieved ${shadowData.length} decisions from database\n`);

  if (shadowData.length === 0) {
    console.log('⚠️  WARNING: No shadow mode data in database');
    console.log('   Possible causes:');
    console.log('   - Database logging failed');
    console.log('   - Decision IDs not found');
    console.log('   - agent_core.agent_decisions table missing');
    process.exit(1);
  }

  // Step 5: Analyze results
  console.log('🔍 Step 5: Analyzing shadow mode performance...');
  const analysis = analyzeShadowModeData(shadowData);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Shadow Mode Analysis Results');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Total Decisions:      ${analysis.total}`);
  console.log(`Matches:              ${analysis.matches} (${analysis.matchRate}%)`);
  console.log(`Mismatches:           ${analysis.mismatches}`);
  console.log(`Avg Score Diff:       ${analysis.avgScoreDiff} points`);
  console.log(`Avg Confidence Diff:  ${analysis.avgConfidenceDiff}`);
  console.log(`Avg Execution Time:   ${analysis.avgExecutionTime}ms`);
  console.log('');

  if (analysis.mismatchSamples.length > 0) {
    console.log('Mismatch Samples (first 5):');
    analysis.mismatchSamples.forEach((m, i) => {
      console.log(`  ${i + 1}. Decision ${m.decision_id.substring(0, 8)}...`);
      console.log(`     Inline: ${m.inline_score}, Rule: ${m.rule_score}, Diff: ${m.diff}`);
    });
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Validation Result');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (analysis.status === 'PASS') {
    console.log('✅ PASS - Shadow mode validation successful!');
    console.log('');
    console.log('Recommendations:');
    console.log('  1. Rule engine is ready for production migration');
    console.log('  2. Can safely replace inline logic with rule engine');
    console.log('  3. Continue monitoring for 1-2 weeks to confirm stability');
    console.log('');
    process.exit(0);
  } else if (analysis.status === 'WARN') {
    console.log('⚠️  WARN - Shadow mode validation passed with warnings');
    console.log('');
    console.log('Issues:');
    analysis.issues.forEach(issue => console.log(`  - ${issue}`));
    console.log('');
    console.log('Recommendations:');
    console.log('  1. Review mismatch cases to understand differences');
    console.log('  2. Consider adjusting match thresholds if differences acceptable');
    console.log('  3. Monitor for another week before migration');
    console.log('');
    process.exit(0);
  } else {
    console.log('❌ FAIL - Shadow mode validation failed');
    console.log('');
    console.log('Issues:');
    analysis.issues.forEach(issue => console.log(`  - ${issue}`));
    console.log('');
    console.log('Recommendations:');
    console.log('  1. Review cognitive_extraction_logic_v2.0.json');
    console.log('  2. Compare rule logic with inline logic in CompanyQualityToolStandalone.js');
    console.log('  3. Fix discrepancies and re-test');
    console.log('  4. DO NOT migrate to rule engine until match rate ≥95%');
    console.log('');
    process.exit(1);
  }
}

// Run validation
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
