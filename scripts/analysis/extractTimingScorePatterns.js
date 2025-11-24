#!/usr/bin/env node
/**
 * Sprint 25 - Day 1: TimingScore Pattern Extraction
 *
 * Analyzes 226+ TimingScore shadow mode decisions to extract patterns for rule engine:
 * 1. Calendar context → multiplier patterns (Ramadan, Q1, Q3 summer, Q4 freeze)
 * 2. Signal freshness → multiplier patterns (HOT, WARM, RECENT, etc.)
 * 3. Signal type → decay rate patterns (hiring, funding, expansion, award)
 * 4. Category distribution (OPTIMAL, GOOD, FAIR, POOR)
 * 5. Edge cases and boundary conditions
 *
 * Usage: node scripts/analysis/extractTimingScorePatterns.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Cloud SQL connection
const pool = new Pool({
  host: process.env.DB_HOST || '34.121.0.240',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'upr_production',
  user: process.env.DB_USER || 'upr_app',
  password: process.env.DB_PASSWORD || 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
});

const db = {
  query: (text, params) => pool.query(text, params),
  end: () => pool.end()
};

async function analyzeTimingScoreDecisions() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Sprint 25 - TimingScore Pattern Extraction');
  console.log('Analyzing shadow mode decisions for rule engine development');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Fetch all TimingScore decisions
    const { rows: decisions } = await db.query(`
      SELECT
        decision_id,
        input_data,
        output_data,
        confidence_score,
        latency_ms,
        created_at
      FROM agent_core.agent_decisions
      WHERE tool_name = 'TimingScoreTool'
      AND rule_version = 'inline_only'
      ORDER BY created_at DESC
    `);

    console.log(`📊 Total TimingScore Decisions: ${decisions.length}\n`);

    if (decisions.length === 0) {
      console.log('⚠️  No TimingScore decisions found. Run shadow mode first.');
      process.exit(1);
    }

    // Pattern Analysis
    const patterns = {
      calendarContextMap: new Map(),
      signalFreshnessMap: new Map(),
      signalTypeMap: new Map(),
      categoryDistribution: { OPTIMAL: 0, GOOD: 0, FAIR: 0, POOR: 0 },
      multiplierRanges: {
        '0.0-0.5': 0,
        '0.5-0.7': 0,
        '0.7-1.0': 0,
        '1.0-1.3': 0,
        '1.3-2.0': 0
      },
      edgeCases: [],
      calendarMultipliers: new Map(),
      signalRecencyMultipliers: new Map()
    };

    decisions.forEach(decision => {
      const input = decision.input_data;
      const output = decision.output_data.inline || decision.output_data;

      const timingMultiplier = output.timing_multiplier;
      const category = output.category;
      const calendarContext = output.metadata?.calendar_context || 'STANDARD';
      const signalFreshness = output.metadata?.signal_freshness || 'STANDARD';
      const signalType = input.signal_type || 'other';
      const signalAge = input.signal_age;

      // Calendar context patterns
      if (!patterns.calendarContextMap.has(calendarContext)) {
        patterns.calendarContextMap.set(calendarContext, {
          count: 0,
          multipliers: [],
          avgMultiplier: 0
        });
      }
      const calendarData = patterns.calendarContextMap.get(calendarContext);
      calendarData.count++;
      calendarData.multipliers.push(timingMultiplier);

      // Signal freshness patterns
      if (!patterns.signalFreshnessMap.has(signalFreshness)) {
        patterns.signalFreshnessMap.set(signalFreshness, {
          count: 0,
          multipliers: [],
          avgMultiplier: 0,
          ageRanges: []
        });
      }
      const freshnessData = patterns.signalFreshnessMap.get(signalFreshness);
      freshnessData.count++;
      freshnessData.multipliers.push(timingMultiplier);
      if (signalAge !== null) freshnessData.ageRanges.push(signalAge);

      // Signal type patterns
      if (!patterns.signalTypeMap.has(signalType)) {
        patterns.signalTypeMap.set(signalType, {
          count: 0,
          multipliers: [],
          avgMultiplier: 0
        });
      }
      const signalData = patterns.signalTypeMap.get(signalType);
      signalData.count++;
      signalData.multipliers.push(timingMultiplier);

      // Category distribution
      patterns.categoryDistribution[category]++;

      // Multiplier ranges
      if (timingMultiplier < 0.5) patterns.multiplierRanges['0.0-0.5']++;
      else if (timingMultiplier < 0.7) patterns.multiplierRanges['0.5-0.7']++;
      else if (timingMultiplier < 1.0) patterns.multiplierRanges['0.7-1.0']++;
      else if (timingMultiplier < 1.3) patterns.multiplierRanges['1.0-1.3']++;
      else patterns.multiplierRanges['1.3-2.0']++;

      // Detect edge cases
      if (category === 'POOR' && timingMultiplier >= 0.7) {
        patterns.edgeCases.push({
          type: 'CATEGORY_MISMATCH',
          expected: 'FAIR',
          actual: 'POOR',
          multiplier: timingMultiplier,
          context: { calendarContext, signalFreshness }
        });
      }

      if (category === 'OPTIMAL' && timingMultiplier < 1.3) {
        patterns.edgeCases.push({
          type: 'CATEGORY_MISMATCH',
          expected: 'GOOD',
          actual: 'OPTIMAL',
          multiplier: timingMultiplier,
          context: { calendarContext, signalFreshness }
        });
      }
    });

    // Calculate averages
    patterns.calendarContextMap.forEach((data, context) => {
      data.avgMultiplier = data.multipliers.reduce((a, b) => a + b, 0) / data.count;
      data.minMultiplier = Math.min(...data.multipliers);
      data.maxMultiplier = Math.max(...data.multipliers);
      delete data.multipliers; // Remove raw data to save space
    });

    patterns.signalFreshnessMap.forEach((data, freshness) => {
      data.avgMultiplier = data.multipliers.reduce((a, b) => a + b, 0) / data.count;
      data.minMultiplier = Math.min(...data.multipliers);
      data.maxMultiplier = Math.max(...data.multipliers);
      if (data.ageRanges.length > 0) {
        data.avgAge = data.ageRanges.reduce((a, b) => a + b, 0) / data.ageRanges.length;
        data.minAge = Math.min(...data.ageRanges);
        data.maxAge = Math.max(...data.ageRanges);
      }
      delete data.multipliers; // Remove raw data to save space
      delete data.ageRanges;
    });

    patterns.signalTypeMap.forEach((data, type) => {
      data.avgMultiplier = data.multipliers.reduce((a, b) => a + b, 0) / data.count;
      data.minMultiplier = Math.min(...data.multipliers);
      data.maxMultiplier = Math.max(...data.multipliers);
      delete data.multipliers; // Remove raw data to save space
    });

    // Print analysis
    console.log('📈 CALENDAR CONTEXT PATTERNS');
    console.log('─────────────────────────────────────────────────────────');
    patterns.calendarContextMap.forEach((data, context) => {
      console.log(`${context.padEnd(30)} | Count: ${data.count.toString().padStart(3)} | Avg: ${data.avgMultiplier.toFixed(2)} | Range: ${data.minMultiplier.toFixed(2)}-${data.maxMultiplier.toFixed(2)}`);
    });

    console.log('\n📊 SIGNAL FRESHNESS PATTERNS');
    console.log('─────────────────────────────────────────────────────────');
    patterns.signalFreshnessMap.forEach((data, freshness) => {
      const ageInfo = data.avgAge !== undefined
        ? ` | Age Range: ${data.minAge}-${data.maxAge} days (avg: ${data.avgAge.toFixed(1)})`
        : '';
      console.log(`${freshness.padEnd(20)} | Count: ${data.count.toString().padStart(3)} | Avg: ${data.avgMultiplier.toFixed(2)} | Range: ${data.minMultiplier.toFixed(2)}-${data.maxMultiplier.toFixed(2)}${ageInfo}`);
    });

    console.log('\n🏷️  SIGNAL TYPE PATTERNS');
    console.log('─────────────────────────────────────────────────────────');
    patterns.signalTypeMap.forEach((data, type) => {
      console.log(`${type.padEnd(20)} | Count: ${data.count.toString().padStart(3)} | Avg: ${data.avgMultiplier.toFixed(2)} | Range: ${data.minMultiplier.toFixed(2)}-${data.maxMultiplier.toFixed(2)}`);
    });

    console.log('\n📊 CATEGORY DISTRIBUTION');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(patterns.categoryDistribution).forEach(([category, count]) => {
      const percentage = ((count / decisions.length) * 100).toFixed(1);
      console.log(`${category.padEnd(20)} | ${count.toString().padStart(3)} (${percentage}%)`);
    });

    console.log('\n📏 MULTIPLIER RANGES');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(patterns.multiplierRanges).forEach(([range, count]) => {
      const percentage = ((count / decisions.length) * 100).toFixed(1);
      console.log(`${range.padEnd(20)} | ${count.toString().padStart(3)} (${percentage}%)`);
    });

    console.log(`\n⚠️  EDGE CASES DETECTED: ${patterns.edgeCases.length}`);
    if (patterns.edgeCases.length > 0) {
      console.log('─────────────────────────────────────────────────────────');
      patterns.edgeCases.slice(0, 10).forEach((edge, i) => {
        console.log(`${i + 1}. ${edge.type}: Expected ${edge.expected}, Got ${edge.actual} (multiplier: ${edge.multiplier})`);
        console.log(`   Context: ${edge.context.calendarContext}, ${edge.context.signalFreshness}`);
      });
      if (patterns.edgeCases.length > 10) {
        console.log(`   ... and ${patterns.edgeCases.length - 10} more edge cases`);
      }
    }

    // Convert Maps to Objects for JSON serialization
    const patternsForExport = {
      totalDecisions: decisions.length,
      calendarContextPatterns: Object.fromEntries(patterns.calendarContextMap),
      signalFreshnessPatterns: Object.fromEntries(patterns.signalFreshnessMap),
      signalTypePatterns: Object.fromEntries(patterns.signalTypeMap),
      categoryDistribution: patterns.categoryDistribution,
      multiplierRanges: patterns.multiplierRanges,
      edgeCases: patterns.edgeCases.slice(0, 20), // Keep top 20 edge cases
      extractedAt: new Date().toISOString()
    };

    // Save to file
    const outputPath = path.join(__dirname, 'timingScorePatterns.json');
    fs.writeFileSync(outputPath, JSON.stringify(patternsForExport, null, 2));
    console.log(`\n✅ Patterns saved to: ${outputPath}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Pattern extraction complete!');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('📋 Next Steps:');
    console.log('1. Review timingScorePatterns.json');
    console.log('2. Create timing_score_v1.0.json cognitive rules');
    console.log('3. Build TimingScoreRuleEngineV1.js');
    console.log('4. Test with 5 sample cases (target: 95%+ match)');
    console.log('');

    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await db.end();
    process.exit(1);
  }
}

// Run analysis
analyzeTimingScoreDecisions();
