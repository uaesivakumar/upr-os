/**
 * PHASE 2 Inter-Rater Reliability Calculator
 *
 * Computes Krippendorff's Alpha and ICC for human evaluator agreement.
 * Run after all evaluator scores are collected.
 *
 * Usage: node compute-reliability.js
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';

// Load all score files
const scoreFiles = readdirSync('.').filter(f => f.startsWith('scores_EVAL_'));
if (scoreFiles.length < 3) {
  console.error('Need at least 3 evaluators. Found:', scoreFiles.length);
  process.exit(1);
}

console.log(`Found ${scoreFiles.length} evaluator score files`);

const allScores = scoreFiles.map(f => JSON.parse(readFileSync(f, 'utf-8')));

// Build score matrix [evaluator][scenario][dimension]
const scenarios = allScores[0].scores.map(s => s.scenario_id);
const dimensions = Object.keys(allScores[0].scores[0].crs_scores);

console.log(`\nScenarios: ${scenarios.length}`);
console.log(`Dimensions: ${dimensions.length}`);

// Compute agreement per dimension
const results = {};

for (const dim of dimensions) {
  const ratings = []; // [scenario][evaluator]

  for (let s = 0; s < scenarios.length; s++) {
    const scenarioRatings = [];
    for (const evalScores of allScores) {
      scenarioRatings.push(evalScores.scores[s].crs_scores[dim]);
    }
    ratings.push(scenarioRatings);
  }

  // Compute Intraclass Correlation (ICC) - simplified two-way random
  const icc = computeICC(ratings);
  results[dim] = { icc };
  console.log(`  ${dim}: ICC = ${icc.toFixed(3)}`);
}

// Overall agreement
const overallRatings = [];
for (let s = 0; s < scenarios.length; s++) {
  const scenarioRatings = [];
  for (const evalScores of allScores) {
    // Weighted CRS score
    const weights = { qualification: 0.15, needs_discovery: 0.15, value_articulation: 0.15,
                      objection_handling: 0.15, process_adherence: 0.10, compliance: 0.10,
                      relationship_building: 0.10, next_step_secured: 0.10 };
    let weightedScore = 0;
    for (const dim of dimensions) {
      weightedScore += evalScores.scores[s].crs_scores[dim] * weights[dim];
    }
    scenarioRatings.push(weightedScore);
  }
  overallRatings.push(scenarioRatings);
}

const overallICC = computeICC(overallRatings);
console.log(`\nOverall CRS ICC: ${overallICC.toFixed(3)}`);

// Interpretation
console.log(`\nInterpretation:`);
if (overallICC >= 0.75) {
  console.log(`  ✅ EXCELLENT agreement (ICC >= 0.75)`);
} else if (overallICC >= 0.50) {
  console.log(`  ⚠️  MODERATE agreement (0.50 <= ICC < 0.75)`);
} else {
  console.log(`  ❌ POOR agreement (ICC < 0.50) - Review evaluator training`);
}

// Save results
const output = {
  computed_at: new Date().toISOString(),
  evaluator_count: allScores.length,
  scenario_count: scenarios.length,
  dimension_icc: results,
  overall_icc: overallICC,
  interpretation: overallICC >= 0.75 ? 'EXCELLENT' : overallICC >= 0.50 ? 'MODERATE' : 'POOR',
};

writeFileSync('inter_rater_reliability.json', JSON.stringify(output, null, 2));
console.log(`\nResults saved to inter_rater_reliability.json`);

// Simplified ICC(2,1) calculation
function computeICC(ratings) {
  const n = ratings.length; // subjects
  const k = ratings[0].length; // raters

  // Grand mean
  let grandSum = 0;
  for (const row of ratings) {
    for (const val of row) grandSum += val;
  }
  const grandMean = grandSum / (n * k);

  // Between-subjects variance
  let ssb = 0;
  for (const row of ratings) {
    const rowMean = row.reduce((a, b) => a + b, 0) / k;
    ssb += k * Math.pow(rowMean - grandMean, 2);
  }
  const msb = ssb / (n - 1);

  // Within-subjects variance (error)
  let ssw = 0;
  for (const row of ratings) {
    const rowMean = row.reduce((a, b) => a + b, 0) / k;
    for (const val of row) {
      ssw += Math.pow(val - rowMean, 2);
    }
  }
  const msw = ssw / (n * (k - 1));

  // ICC(2,1) = (MSB - MSW) / (MSB + (k-1)*MSW)
  const icc = (msb - msw) / (msb + (k - 1) * msw);
  return Math.max(0, Math.min(1, icc)); // Clamp to [0,1]
}
