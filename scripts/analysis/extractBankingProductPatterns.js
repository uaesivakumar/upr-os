#!/usr/bin/env node
/**
 * Sprint 25 - Day 3: BankingProductMatch Pattern Extraction
 *
 * Analyzes 194+ BankingProductMatch shadow mode decisions to extract patterns for rule engine:
 * 1. Segment inference patterns (company_size → segment)
 * 2. Product recommendation patterns (most common products by segment/industry)
 * 3. Fit score distribution by product category
 * 4. Signal impact on recommendations
 * 5. Industry bonus effects
 * 6. Confidence level distribution
 *
 * Usage: node scripts/analysis/extractBankingProductPatterns.js
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

async function analyzeBankingProductDecisions() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Sprint 25 - BankingProductMatch Pattern Extraction');
  console.log('Analyzing shadow mode decisions for rule engine development');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Fetch all BankingProductMatch decisions
    const { rows: decisions } = await db.query(`
      SELECT
        decision_id,
        input_data,
        output_data,
        confidence_score,
        latency_ms,
        created_at
      FROM agent_core.agent_decisions
      WHERE tool_name = 'BankingProductMatchTool'
      AND rule_version = 'inline_only'
      ORDER BY created_at DESC
    `);

    console.log(`📊 Total BankingProductMatch Decisions: ${decisions.length}\n`);

    if (decisions.length === 0) {
      console.log('⚠️  No BankingProductMatch decisions found. Run shadow mode first.');
      process.exit(1);
    }

    // Pattern Analysis
    const patterns = {
      segmentDistribution: {},
      productRecommendationsBySegment: {},
      productRecommendationsByIndustry: {},
      fitScoreDistribution: {},
      signalImpact: {},
      industryDistribution: {},
      confidenceLevels: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      edgeCases: []
    };

    decisions.forEach(decision => {
      const input = decision.input_data;
      const output = decision.output_data.inline || decision.output_data;

      const segment = output.metadata?.segment_match || 'unknown';
      const industry = input.industry || 'default';
      const signals = input.signals || [];
      const products = output.recommended_products || [];
      const confidenceLevel = output.metadata?.confidenceLevel || 'MEDIUM';

      // Segment distribution
      patterns.segmentDistribution[segment] = (patterns.segmentDistribution[segment] || 0) + 1;

      // Industry distribution
      patterns.industryDistribution[industry] = (patterns.industryDistribution[industry] || 0) + 1;

      // Confidence level distribution
      patterns.confidenceLevels[confidenceLevel]++;

      // Product recommendations by segment
      if (!patterns.productRecommendationsBySegment[segment]) {
        patterns.productRecommendationsBySegment[segment] = {};
      }
      products.forEach(product => {
        const productName = product.product_name;
        if (!patterns.productRecommendationsBySegment[segment][productName]) {
          patterns.productRecommendationsBySegment[segment][productName] = {
            count: 0,
            avgFitScore: 0,
            totalFitScore: 0,
            avgPriority: 0,
            totalPriority: 0
          };
        }
        const productData = patterns.productRecommendationsBySegment[segment][productName];
        productData.count++;
        productData.totalFitScore += product.fit_score;
        productData.totalPriority += product.priority;
      });

      // Product recommendations by industry
      if (!patterns.productRecommendationsByIndustry[industry]) {
        patterns.productRecommendationsByIndustry[industry] = {};
      }
      products.forEach(product => {
        const productName = product.product_name;
        if (!patterns.productRecommendationsByIndustry[industry][productName]) {
          patterns.productRecommendationsByIndustry[industry][productName] = {
            count: 0,
            avgFitScore: 0,
            totalFitScore: 0
          };
        }
        const productData = patterns.productRecommendationsByIndustry[industry][productName];
        productData.count++;
        productData.totalFitScore += product.fit_score;
      });

      // Fit score distribution by category
      products.forEach(product => {
        const category = product.product_category;
        if (!patterns.fitScoreDistribution[category]) {
          patterns.fitScoreDistribution[category] = [];
        }
        patterns.fitScoreDistribution[category].push(product.fit_score);
      });

      // Signal impact
      signals.forEach(signal => {
        if (!patterns.signalImpact[signal]) {
          patterns.signalImpact[signal] = {
            count: 0,
            avgTopFitScore: 0,
            totalTopFitScore: 0
          };
        }
        patterns.signalImpact[signal].count++;
        if (products.length > 0) {
          patterns.signalImpact[signal].totalTopFitScore += products[0].fit_score;
        }
      });

      // Edge cases
      if (products.length === 0) {
        patterns.edgeCases.push({
          type: 'NO_PRODUCTS',
          input: { company_size: input.company_size, industry, signals, segment }
        });
      }

      if (products.length > 0 && products[0].fit_score < 50) {
        patterns.edgeCases.push({
          type: 'LOW_TOP_SCORE',
          topScore: products[0].fit_score,
          input: { company_size: input.company_size, industry, signals, segment }
        });
      }
    });

    // Calculate averages for product recommendations by segment
    Object.keys(patterns.productRecommendationsBySegment).forEach(segment => {
      Object.keys(patterns.productRecommendationsBySegment[segment]).forEach(productName => {
        const data = patterns.productRecommendationsBySegment[segment][productName];
        data.avgFitScore = (data.totalFitScore / data.count).toFixed(1);
        data.avgPriority = (data.totalPriority / data.count).toFixed(1);
        delete data.totalFitScore;
        delete data.totalPriority;
      });
    });

    // Calculate averages for product recommendations by industry
    Object.keys(patterns.productRecommendationsByIndustry).forEach(industry => {
      Object.keys(patterns.productRecommendationsByIndustry[industry]).forEach(productName => {
        const data = patterns.productRecommendationsByIndustry[industry][productName];
        data.avgFitScore = (data.totalFitScore / data.count).toFixed(1);
        delete data.totalFitScore;
      });
    });

    // Calculate signal impact averages
    Object.keys(patterns.signalImpact).forEach(signal => {
      const data = patterns.signalImpact[signal];
      data.avgTopFitScore = (data.totalTopFitScore / data.count).toFixed(1);
      delete data.totalTopFitScore;
    });

    // Calculate fit score stats
    Object.keys(patterns.fitScoreDistribution).forEach(category => {
      const scores = patterns.fitScoreDistribution[category];
      patterns.fitScoreDistribution[category] = {
        count: scores.length,
        avg: (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
        min: Math.min(...scores),
        max: Math.max(...scores)
      };
    });

    // Print analysis
    console.log('📈 SEGMENT DISTRIBUTION');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(patterns.segmentDistribution).forEach(([segment, count]) => {
      const percentage = ((count / decisions.length) * 100).toFixed(1);
      console.log(`${segment.padEnd(20)} | ${count.toString().padStart(3)} (${percentage}%)`);
    });

    console.log('\n🏭 INDUSTRY DISTRIBUTION');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(patterns.industryDistribution).forEach(([industry, count]) => {
      const percentage = ((count / decisions.length) * 100).toFixed(1);
      console.log(`${industry.padEnd(20)} | ${count.toString().padStart(3)} (${percentage}%)`);
    });

    console.log('\n📊 CONFIDENCE LEVELS');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(patterns.confidenceLevels).forEach(([level, count]) => {
      const percentage = ((count / decisions.length) * 100).toFixed(1);
      console.log(`${level.padEnd(20)} | ${count.toString().padStart(3)} (${percentage}%)`);
    });

    console.log('\n🎯 TOP PRODUCTS BY SEGMENT');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(patterns.productRecommendationsBySegment).forEach(([segment, products]) => {
      console.log(`\n${segment.toUpperCase()}:`);
      const sorted = Object.entries(products).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
      sorted.forEach(([productName, data]) => {
        console.log(`  ${productName.padEnd(50)} | Count: ${data.count.toString().padStart(3)} | Avg Fit: ${data.avgFitScore} | Avg Priority: ${data.avgPriority}`);
      });
    });

    console.log('\n📏 FIT SCORE DISTRIBUTION BY CATEGORY');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(patterns.fitScoreDistribution).forEach(([category, stats]) => {
      console.log(`${category.padEnd(30)} | Count: ${stats.count.toString().padStart(3)} | Avg: ${stats.avg} | Range: ${stats.min}-${stats.max}`);
    });

    console.log('\n📡 SIGNAL IMPACT ON TOP FIT SCORE');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(patterns.signalImpact).forEach(([signal, data]) => {
      console.log(`${signal.padEnd(20)} | Count: ${data.count.toString().padStart(3)} | Avg Top Fit: ${data.avgTopFitScore}`);
    });

    console.log(`\n⚠️  EDGE CASES DETECTED: ${patterns.edgeCases.length}`);
    if (patterns.edgeCases.length > 0) {
      console.log('─────────────────────────────────────────────────────────');
      patterns.edgeCases.slice(0, 10).forEach((edge, i) => {
        console.log(`${i + 1}. ${edge.type}`);
        if (edge.type === 'NO_PRODUCTS') {
          console.log(`   Company Size: ${edge.input.company_size}, Industry: ${edge.input.industry}, Signals: ${edge.input.signals.join(', ')}`);
        } else if (edge.type === 'LOW_TOP_SCORE') {
          console.log(`   Top Score: ${edge.topScore}, Industry: ${edge.input.industry}`);
        }
      });
      if (patterns.edgeCases.length > 10) {
        console.log(`   ... and ${patterns.edgeCases.length - 10} more edge cases`);
      }
    }

    // Save to file
    const outputPath = path.join(__dirname, 'bankingProductPatterns.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      totalDecisions: decisions.length,
      segmentDistribution: patterns.segmentDistribution,
      industryDistribution: patterns.industryDistribution,
      confidenceLevels: patterns.confidenceLevels,
      productRecommendationsBySegment: patterns.productRecommendationsBySegment,
      productRecommendationsByIndustry: patterns.productRecommendationsByIndustry,
      fitScoreDistribution: patterns.fitScoreDistribution,
      signalImpact: patterns.signalImpact,
      edgeCases: patterns.edgeCases.slice(0, 20),
      extractedAt: new Date().toISOString()
    }, null, 2));
    console.log(`\n✅ Patterns saved to: ${outputPath}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Pattern extraction complete!');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('📋 Next Steps:');
    console.log('1. Review bankingProductPatterns.json');
    console.log('2. Create banking_product_match_v1.0.json cognitive rules');
    console.log('3. Build BankingProductMatchRuleEngineV1.js');
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
analyzeBankingProductDecisions();
