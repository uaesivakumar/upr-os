#!/usr/bin/env node
/**
 * Sprint 24 - Track A: ContactTier Pattern Extraction
 *
 * Analyzes 225+ ContactTier shadow mode decisions to extract patterns for rule engine:
 * 1. Title → Seniority mapping patterns
 * 2. Title → Department inference patterns
 * 3. Company size → Tier selection patterns
 * 4. Confidence score correlations
 * 5. Edge cases and exceptions
 *
 * Usage: node scripts/analysis/extractContactTierPatterns.js
 */

const { Pool } = require('pg');

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

async function analyzeContactTierDecisions() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Sprint 24 - ContactTier Pattern Extraction');
  console.log('Analyzing shadow mode decisions for rule engine development');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Fetch all ContactTier decisions
    const { rows: decisions } = await db.query(`
      SELECT
        decision_id,
        input_data,
        output_data,
        confidence_score,
        latency_ms,
        created_at
      FROM agent_core.agent_decisions
      WHERE tool_name = 'ContactTierTool'
      AND rule_version = 'inline_only'
      ORDER BY created_at DESC
    `);

    console.log(`📊 Total ContactTier Decisions: ${decisions.length}\n`);

    if (decisions.length === 0) {
      console.log('⚠️  No ContactTier decisions found. Run shadow mode first.');
      process.exit(1);
    }

    // Pattern Analysis
    const patterns = {
      titleSeniorityMap: new Map(),
      titleDepartmentMap: new Map(),
      sizeToTierMap: new Map(),
      tierDistribution: { STRATEGIC: 0, PRIMARY: 0, SECONDARY: 0, BACKUP: 0 },
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
      edgeCases: []
    };

    decisions.forEach(decision => {
      const input = decision.input_data;
      const output = decision.output_data.inline || decision.output_data;

      // Extract title patterns
      const title = input.title || 'Unknown';
      const seniority = input.seniority_level || 'Unknown';
      const department = input.department || 'Unknown';
      const tier = output.tier;
      const companySize = input.company_size || 0;
      const confidence = output.confidence || 0;

      // Title → Seniority mapping
      if (!patterns.titleSeniorityMap.has(title)) {
        patterns.titleSeniorityMap.set(title, new Map());
      }
      const seniorityMap = patterns.titleSeniorityMap.get(title);
      seniorityMap.set(seniority, (seniorityMap.get(seniority) || 0) + 1);

      // Title → Department mapping
      if (!patterns.titleDepartmentMap.has(title)) {
        patterns.titleDepartmentMap.set(title, new Map());
      }
      const deptMap = patterns.titleDepartmentMap.get(title);
      deptMap.set(department, (deptMap.get(department) || 0) + 1);

      // Size → Tier mapping
      const sizeBucket = getSizeBucket(companySize);
      if (!patterns.sizeToTierMap.has(sizeBucket)) {
        patterns.sizeToTierMap.set(sizeBucket, new Map());
      }
      const tierMap = patterns.sizeToTierMap.get(sizeBucket);
      tierMap.set(tier, (tierMap.get(tier) || 0) + 1);

      // Tier distribution
      patterns.tierDistribution[tier] = (patterns.tierDistribution[tier] || 0) + 1;

      // Confidence distribution
      if (confidence >= 0.8) patterns.confidenceDistribution.high++;
      else if (confidence >= 0.5) patterns.confidenceDistribution.medium++;
      else patterns.confidenceDistribution.low++;

      // Edge cases (unusual combinations)
      if (confidence < 0.5 || tier === 'BACKUP') {
        patterns.edgeCases.push({
          title,
          seniority,
          department,
          size: companySize,
          tier,
          confidence,
          decision_id: decision.decision_id
        });
      }
    });

    // Report findings
    console.log('📈 PATTERN ANALYSIS RESULTS\n');

    // 1. Tier Distribution
    console.log('1️⃣ Tier Distribution:');
    Object.entries(patterns.tierDistribution).forEach(([tier, count]) => {
      const pct = ((count / decisions.length) * 100).toFixed(1);
      console.log(`   ${tier.padEnd(12)}: ${count.toString().padStart(3)} decisions (${pct}%)`);
    });
    console.log('');

    // 2. Confidence Distribution
    console.log('2️⃣ Confidence Distribution:');
    console.log(`   High (≥0.8):   ${patterns.confidenceDistribution.high} decisions`);
    console.log(`   Medium (0.5-0.8): ${patterns.confidenceDistribution.medium} decisions`);
    console.log(`   Low (<0.5):    ${patterns.confidenceDistribution.low} decisions`);
    console.log('');

    // 3. Top Title → Seniority Patterns
    console.log('3️⃣ Top Title → Seniority Patterns:');
    const topTitles = Array.from(patterns.titleSeniorityMap.entries())
      .map(([title, seniorityMap]) => ({
        title,
        total: Array.from(seniorityMap.values()).reduce((a, b) => a + b, 0),
        mostCommonSeniority: Array.from(seniorityMap.entries())
          .sort((a, b) => b[1] - a[1])[0]
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    topTitles.forEach(({ title, total, mostCommonSeniority }) => {
      console.log(`   "${title}" → ${mostCommonSeniority[0]} (${total} occurrences)`);
    });
    console.log('');

    // 4. Size → Tier Patterns
    console.log('4️⃣ Company Size → Tier Patterns:');
    const sortedSizes = Array.from(patterns.sizeToTierMap.entries()).sort((a, b) => {
      const order = { 'small': 1, 'midsize': 2, 'large': 3, 'enterprise': 4 };
      return order[a[0]] - order[b[0]];
    });

    sortedSizes.forEach(([sizeBucket, tierMap]) => {
      const topTier = Array.from(tierMap.entries()).sort((a, b) => b[1] - a[1])[0];
      const total = Array.from(tierMap.values()).reduce((a, b) => a + b, 0);
      console.log(`   ${sizeBucket.padEnd(12)}: ${topTier[0]} (${topTier[1]}/${total} decisions)`);
    });
    console.log('');

    // 5. Edge Cases
    console.log('5️⃣ Edge Cases (Low Confidence / BACKUP Tier):');
    console.log(`   Total: ${patterns.edgeCases.length} edge cases\n`);

    if (patterns.edgeCases.length > 0) {
      console.log('   Top 5 Edge Cases:');
      patterns.edgeCases.slice(0, 5).forEach((edge, i) => {
        console.log(`   ${i + 1}. "${edge.title}" (${edge.seniority}) → ${edge.tier} (conf: ${edge.confidence.toFixed(2)})`);
        console.log(`      Size: ${edge.size}, Dept: ${edge.department}`);
      });
    }
    console.log('');

    // Generate rule recommendations
    console.log('═══════════════════════════════════════════════════════════');
    console.log('💡 RULE ENGINE RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('1. Seniority Inference Rules:');
    console.log('   - Extract keywords from titles (e.g., "Director" → Director level)');
    console.log('   - Use title patterns to infer seniority when not provided');
    console.log('');

    console.log('2. Department Inference Rules:');
    console.log('   - "HR" keywords → HR department');
    console.log('   - "Payroll", "Compensation" → Finance/HR');
    console.log('   - "Recruiting", "Talent" → HR');
    console.log('');

    console.log('3. Tier Selection Rules:');
    const sizeRules = sortedSizes.map(([size, tierMap]) => {
      const topTier = Array.from(tierMap.entries()).sort((a, b) => b[1] - a[1])[0];
      return `   - ${size} companies → ${topTier[0]} tier`;
    });
    sizeRules.forEach(rule => console.log(rule));
    console.log('');

    console.log('4. Confidence Adjustment:');
    console.log(`   - High confidence: ${patterns.confidenceDistribution.high} cases (${((patterns.confidenceDistribution.high / decisions.length) * 100).toFixed(1)}%)`);
    console.log(`   - Need confidence boosting for: department clarity, title standardization`);
    console.log('');

    console.log('5. Edge Case Handling:');
    console.log(`   - ${patterns.edgeCases.length} edge cases require special rules`);
    console.log('   - Focus on: unusual titles, small companies, non-standard departments');
    console.log('');

    // Export patterns for rule engine development
    const patternsExport = {
      metadata: {
        totalDecisions: decisions.length,
        analysisDate: new Date().toISOString(),
        sprint: 'Sprint 24'
      },
      tierDistribution: patterns.tierDistribution,
      confidenceDistribution: patterns.confidenceDistribution,
      topTitles: topTitles.map(t => ({
        title: t.title,
        count: t.total,
        seniority: t.mostCommonSeniority[0]
      })),
      sizeToTier: Object.fromEntries(
        sortedSizes.map(([size, tierMap]) => [
          size,
          Object.fromEntries(tierMap.entries())
        ])
      ),
      edgeCases: patterns.edgeCases.slice(0, 20) // Top 20 edge cases
    };

    // Write to file for golden dataset
    const fs = require('fs');
    const outputPath = 'scripts/analysis/contactTierPatterns.json';
    fs.writeFileSync(outputPath, JSON.stringify(patternsExport, null, 2));
    console.log(`✅ Patterns exported to: ${outputPath}\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Pattern Extraction Complete!');
    console.log('Next Steps:');
    console.log('1. Review patterns in contactTierPatterns.json');
    console.log('2. Build ContactTierRuleEngineV2.js using these patterns');
    console.log('3. Create golden dataset from high-confidence decisions');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error analyzing ContactTier decisions:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

function getSizeBucket(size) {
  if (size < 50) return 'small';
  if (size < 250) return 'midsize';
  if (size < 1000) return 'large';
  return 'enterprise';
}

// Run analysis
analyzeContactTierDecisions();
