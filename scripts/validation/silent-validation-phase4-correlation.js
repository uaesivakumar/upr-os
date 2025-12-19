/**
 * SILENT VALIDATION - PHASE 4: Compute Spearman Rank Correlation
 *
 * Computes correlation between Human CRS and SIVA CRS.
 *
 * CRITICAL (from playbook):
 * - Spearman rank correlation, NOT Pearson
 * - Requires n >= 30 scenarios for statistical significance
 * - If ρ < 0.4, SIVA calibration is insufficient
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// SPEARMAN RANK CORRELATION
// ============================================================================

function spearmanCorrelation(x, y) {
  if (x.length !== y.length) {
    throw new Error('Arrays must have equal length');
  }

  const n = x.length;
  if (n < 3) {
    return { rho: NaN, p_value: NaN, significant: false };
  }

  // Compute ranks
  const rankX = computeRanks(x);
  const rankY = computeRanks(y);

  // Spearman's rho = Pearson correlation of ranks
  const meanRankX = rankX.reduce((a, b) => a + b, 0) / n;
  const meanRankY = rankY.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = rankX[i] - meanRankX;
    const dy = rankY[i] - meanRankY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const rho = numerator / Math.sqrt(denomX * denomY);

  // Approximate p-value using t-distribution
  // t = rho * sqrt((n-2)/(1-rho^2))
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
  const df = n - 2;
  const p_value = 2 * (1 - studentT_cdf(Math.abs(t), df));

  return {
    rho: parseFloat(rho.toFixed(4)),
    t_statistic: parseFloat(t.toFixed(4)),
    df,
    p_value: parseFloat(p_value.toFixed(6)),
    significant: p_value < 0.05,
    n,
  };
}

function computeRanks(arr) {
  const indexed = arr.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => a.val - b.val);

  const ranks = new Array(arr.length);
  let i = 0;

  while (i < indexed.length) {
    let j = i;
    // Find ties
    while (j < indexed.length && indexed[j].val === indexed[i].val) {
      j++;
    }
    // Average rank for ties
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j;
  }

  return ranks;
}

// Student's t CDF approximation
function studentT_cdf(t, df) {
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
}

// Incomplete beta function approximation
function incompleteBeta(a, b, x) {
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Simple approximation using continued fraction
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaContinuedFraction(a, b, x) / a;
  } else {
    return 1 - bt * betaContinuedFraction(b, a, 1 - x) / b;
  }
}

function betaContinuedFraction(a, b, x) {
  const maxIterations = 100;
  const epsilon = 1e-10;

  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;

    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < epsilon) break;
  }

  return h;
}

function logGamma(x) {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }

  x -= 1;
  let a = c[0];
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ============================================================================
// LOAD DATA
// ============================================================================

function loadHumanScores(validationId) {
  const humanEvalDir = join(__dirname, `human_eval_${validationId}`);

  if (!existsSync(humanEvalDir)) {
    console.log(`\n⚠️  Human evaluation directory not found: ${humanEvalDir}`);
    console.log('   Run Phase 2 collection first, or use --mock for pipeline testing.\n');
    return null;
  }

  // Find all score files
  const scoreFiles = readdirSync(humanEvalDir).filter(f => f.startsWith('scores_EVAL_'));

  if (scoreFiles.length === 0) {
    console.log(`\n⚠️  No score files found in ${humanEvalDir}`);
    console.log('   Run collect-scores.js for each evaluator first.\n');
    return null;
  }

  console.log(`Found ${scoreFiles.length} evaluator score files`);

  // Load and aggregate scores
  const allScores = scoreFiles.map(f =>
    JSON.parse(readFileSync(join(humanEvalDir, f), 'utf-8'))
  );

  // Average across evaluators per scenario
  const aggregated = {};
  const weights = {
    qualification: 0.15, needs_discovery: 0.15, value_articulation: 0.15,
    objection_handling: 0.15, process_adherence: 0.10, compliance: 0.10,
    relationship_building: 0.10, next_step_secured: 0.10
  };

  for (const evalScores of allScores) {
    for (const score of evalScores.scores) {
      if (!aggregated[score.scenario_id]) {
        aggregated[score.scenario_id] = { scores: [], count: 0 };
      }

      // Compute weighted CRS for this evaluator
      let weightedCRS = 0;
      for (const [dim, weight] of Object.entries(weights)) {
        weightedCRS += (score.crs_scores[dim] || 3) * weight;
      }
      aggregated[score.scenario_id].scores.push(weightedCRS);
      aggregated[score.scenario_id].count++;
    }
  }

  // Compute mean human CRS per scenario
  const humanCRS = {};
  for (const [scenarioId, data] of Object.entries(aggregated)) {
    humanCRS[scenarioId] = data.scores.reduce((a, b) => a + b, 0) / data.count;
  }

  return humanCRS;
}

function loadSIVAScores(validationId) {
  const sivaRunDir = join(__dirname, `siva_run_${validationId}`);
  const sivaFile = join(sivaRunDir, 'siva_crs_results.json');

  if (!existsSync(sivaFile)) {
    console.log(`\n⚠️  SIVA results not found: ${sivaFile}`);
    console.log('   Run Phase 3 first.\n');
    return null;
  }

  const sivaResults = JSON.parse(readFileSync(sivaFile, 'utf-8'));

  const sivaCRS = {};
  for (const result of sivaResults.results) {
    if (result.success && result.weighted_crs !== null) {
      sivaCRS[result.scenario_id] = result.weighted_crs;
    }
  }

  return { sivaCRS, isMock: sivaResults.is_mock };
}

// ============================================================================
// MOCK DATA GENERATOR (for pipeline testing)
// ============================================================================

function generateMockHumanScores(manifest) {
  const humanCRS = {};

  for (const scenario of manifest.scenarios) {
    // Golden paths get higher human scores
    const goldenBase = 3.5 + Math.random() * 0.8;
    humanCRS[scenario.golden.scenario_id] = parseFloat(goldenBase.toFixed(2));

    // Kill paths get lower human scores
    const killBase = 2.0 + Math.random() * 1.0;
    humanCRS[scenario.kill.scenario_id] = parseFloat(killBase.toFixed(2));
  }

  return humanCRS;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     SILENT VALIDATION - PHASE 4: Spearman Rank Correlation       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Find manifest
  const manifestFiles = readdirSync(__dirname).filter(f => f.startsWith('manifest_silent_validation_'));
  if (manifestFiles.length === 0) {
    throw new Error('No manifest found. Run Phase 1 first.');
  }
  manifestFiles.sort().reverse();
  const manifestPath = join(__dirname, manifestFiles[0]);

  console.log(`Loading manifest: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const validationId = manifest.scope.validation_id;

  console.log(`Validation ID: ${validationId}`);
  console.log(`Scenarios: ${manifest.scenario_count}`);

  // Check for --mock flag
  const useMock = process.argv.includes('--mock');

  // Load SIVA scores
  const sivaData = loadSIVAScores(validationId);
  if (!sivaData) {
    console.log('\nRun Phase 3 first: node silent-validation-phase3-siva-run.js');
    process.exit(1);
  }

  console.log(`\nSIVA scores loaded: ${Object.keys(sivaData.sivaCRS).length} scenarios`);
  if (sivaData.isMock) {
    console.log('⚠️  SIVA scores are MOCK (not real SIVA output)');
  }

  // Load Human scores
  let humanCRS = loadHumanScores(validationId);
  let humanIsMock = false;

  if (!humanCRS && useMock) {
    console.log('\n⚠️  Using MOCK human scores for pipeline testing');
    humanCRS = generateMockHumanScores(manifest);
    humanIsMock = true;
  } else if (!humanCRS) {
    console.log('\nRun Phase 2 collection first, or use --mock flag for testing.');
    process.exit(1);
  }

  console.log(`Human scores loaded: ${Object.keys(humanCRS).length} scenarios`);

  // Align data - only include scenarios with both scores
  const paired = [];
  for (const scenarioId of Object.keys(sivaData.sivaCRS)) {
    if (humanCRS[scenarioId] !== undefined) {
      paired.push({
        scenario_id: scenarioId,
        human_crs: humanCRS[scenarioId],
        siva_crs: sivaData.sivaCRS[scenarioId],
      });
    }
  }

  console.log(`\nPaired scenarios: ${paired.length}`);

  if (paired.length < 30) {
    console.log('\n❌ ERROR: Insufficient data');
    console.log('   Spearman correlation requires n >= 30 for significance.');
    console.log(`   Current n = ${paired.length}`);
    console.log('\n   Collect more human evaluations before proceeding.');
    process.exit(1);
  }

  // Extract arrays
  const humanScores = paired.map(p => p.human_crs);
  const sivaScores = paired.map(p => p.siva_crs);

  // Compute Spearman correlation
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('                    SPEARMAN RANK CORRELATION');
  console.log('════════════════════════════════════════════════════════════════════\n');

  const result = spearmanCorrelation(humanScores, sivaScores);

  console.log(`  n (paired scenarios):    ${result.n}`);
  console.log(`  Spearman's ρ (rho):      ${result.rho}`);
  console.log(`  t-statistic:             ${result.t_statistic}`);
  console.log(`  Degrees of freedom:      ${result.df}`);
  console.log(`  p-value:                 ${result.p_value}`);
  console.log(`  Significant (p < 0.05):  ${result.significant ? 'YES' : 'NO'}`);

  // Interpretation
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('                        INTERPRETATION');
  console.log('════════════════════════════════════════════════════════════════════\n');

  let calibrationStatus;
  if (result.rho >= 0.7) {
    calibrationStatus = 'EXCELLENT';
    console.log('  ✅ EXCELLENT CALIBRATION (ρ >= 0.7)');
    console.log('     SIVA CRS strongly correlates with human sales judgment.');
  } else if (result.rho >= 0.5) {
    calibrationStatus = 'GOOD';
    console.log('  ✅ GOOD CALIBRATION (0.5 <= ρ < 0.7)');
    console.log('     SIVA CRS moderately correlates with human sales judgment.');
  } else if (result.rho >= 0.4) {
    calibrationStatus = 'ACCEPTABLE';
    console.log('  ⚠️  ACCEPTABLE CALIBRATION (0.4 <= ρ < 0.5)');
    console.log('     SIVA CRS weakly correlates with human judgment.');
    console.log('     Consider prompt tuning in future sprints.');
  } else {
    calibrationStatus = 'INSUFFICIENT';
    console.log('  ❌ INSUFFICIENT CALIBRATION (ρ < 0.4)');
    console.log('     SIVA CRS does NOT meaningfully correlate with human judgment.');
    console.log('     DO NOT use CRS for customer-facing features without tuning.');
  }

  if (!result.significant) {
    console.log('\n  ⚠️  WARNING: Correlation is NOT statistically significant.');
    console.log('     Results may be due to chance. Increase sample size.');
  }

  // Save results
  const outputDir = join(__dirname, `correlation_${validationId}`);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = join(outputDir, 'spearman_correlation.json');
  const output = {
    validation_id: validationId,
    computed_at: new Date().toISOString(),
    data_quality: {
      siva_is_mock: sivaData.isMock,
      human_is_mock: humanIsMock,
      paired_count: paired.length,
    },
    spearman: result,
    calibration_status: calibrationStatus,
    recommendation: calibrationStatus === 'INSUFFICIENT'
      ? 'DO NOT use CRS for customer-facing features. Requires prompt tuning.'
      : calibrationStatus === 'ACCEPTABLE'
        ? 'CRS can be used internally. Consider tuning for customer-facing use.'
        : 'CRS is validated for use.',
    paired_data: paired,
  };

  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputFile}`);

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                        NEXT STEPS                                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ 1. Run Phase 5: node silent-validation-phase5-distribution.js   ║');
  console.log('║ 2. Run Phase 6: Write silent memo                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
