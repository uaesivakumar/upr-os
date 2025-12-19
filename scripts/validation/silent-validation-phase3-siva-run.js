/**
 * SILENT VALIDATION - PHASE 3: Run SIVA
 *
 * Executes all frozen scenarios through SIVA exactly once.
 *
 * CRITICAL RULES (from playbook):
 * - No retries (first result is final)
 * - No prompt changes
 * - No tuning
 * - Record raw CRS output
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

function findLatestManifest() {
  const files = readdirSync(__dirname).filter(f => f.startsWith('manifest_silent_validation_'));
  if (files.length === 0) {
    throw new Error('No manifest found. Run Phase 1 first.');
  }
  files.sort().reverse();
  return join(__dirname, files[0]);
}

const MANIFEST_PATH = process.argv[2] || findLatestManifest();

// SIVA endpoint (use OS service)
const SIVA_OS_URL = process.env.SIVA_OS_URL || 'http://localhost:3001';
const SIVA_CRS_ENDPOINT = `${SIVA_OS_URL}/api/os/sales-bench/crs`;

// ============================================================================
// CRS DIMENSIONS (must match Phase 2)
// ============================================================================

const CRS_DIMENSIONS = [
  { key: 'qualification', weight: 0.15 },
  { key: 'needs_discovery', weight: 0.15 },
  { key: 'value_articulation', weight: 0.15 },
  { key: 'objection_handling', weight: 0.15 },
  { key: 'process_adherence', weight: 0.10 },
  { key: 'compliance', weight: 0.10 },
  { key: 'relationship_building', weight: 0.10 },
  { key: 'next_step_secured', weight: 0.10 },
];

// ============================================================================
// SIVA CRS SCORER
// ============================================================================

async function runSIVACRS(scenario) {
  const payload = {
    scenario_id: scenario.scenario_id,
    vertical: 'banking',
    sub_vertical: 'employee_banking',
    region: 'UAE',
    entry_intent: scenario.entry_intent || 'Evaluate sales readiness',
    buyer_bot_id: scenario.buyer_bot_id,
    path_type: scenario.path_type,
    expected_outcome: scenario.expected_outcome,
  };

  try {
    const response = await fetch(SIVA_CRS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    return {
      success: true,
      scenario_id: scenario.scenario_id,
      path_type: scenario.path_type,
      crs_scores: result.crs_scores || result.scores || {},
      weighted_crs: result.weighted_crs || null,
      raw_response: result,
    };
  } catch (error) {
    // NO RETRIES - record the failure
    return {
      success: false,
      scenario_id: scenario.scenario_id,
      path_type: scenario.path_type,
      error: error.message,
      crs_scores: null,
      weighted_crs: null,
    };
  }
}

// ============================================================================
// MOCK SIVA (for when OS not available)
// ============================================================================

function mockSIVACRS(scenario) {
  // Deterministic mock based on scenario characteristics
  // This allows Phase 3 to run without live OS, for testing the pipeline
  const hash = scenario.scenario_id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const baseScore = scenario.path_type === 'GOLDEN' ? 3.5 : 2.5;

  const scores = {};
  CRS_DIMENSIONS.forEach((dim, idx) => {
    // Add some deterministic variation
    const variation = ((hash + idx) % 20 - 10) / 10; // -1 to +1
    let score = Math.round(baseScore + variation);
    score = Math.max(1, Math.min(5, score)); // Clamp 1-5
    scores[dim.key] = score;
  });

  // Weighted CRS
  let weightedCRS = 0;
  CRS_DIMENSIONS.forEach(dim => {
    weightedCRS += scores[dim.key] * dim.weight;
  });

  return {
    success: true,
    scenario_id: scenario.scenario_id,
    path_type: scenario.path_type,
    crs_scores: scores,
    weighted_crs: parseFloat(weightedCRS.toFixed(2)),
    is_mock: true,
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║         SILENT VALIDATION - PHASE 3: Run SIVA (No Tuning)        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Load manifest
  console.log(`Loading manifest from: ${MANIFEST_PATH}`);
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

  console.log(`\nScope: ${manifest.scope.vertical}/${manifest.scope.sub_vertical}/${manifest.scope.region}`);
  console.log(`Scenarios: ${manifest.scenario_count}`);
  console.log(`Frozen: ${manifest.scope.frozen ? 'YES' : 'NO'}`);

  if (!manifest.scope.frozen) {
    throw new Error('Manifest not frozen! Cannot proceed with Phase 3.');
  }

  // Check if OS is available
  let useRealSIVA = true;
  try {
    const healthCheck = await fetch(`${SIVA_OS_URL}/health`, { method: 'GET' });
    if (!healthCheck.ok) throw new Error('Health check failed');
    console.log(`\n✅ SIVA OS available at ${SIVA_OS_URL}`);
  } catch {
    console.log(`\n⚠️  SIVA OS not available at ${SIVA_OS_URL}`);
    console.log('   Using MOCK scoring (for pipeline testing only)');
    console.log('   Set SIVA_OS_URL env var for real execution\n');
    useRealSIVA = false;
  }

  // Prepare output
  const outputDir = join(__dirname, `siva_run_${manifest.scope.validation_id}`);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const results = {
    validation_id: manifest.scope.validation_id,
    run_at: new Date().toISOString(),
    siva_os_url: SIVA_OS_URL,
    is_mock: !useRealSIVA,
    scenario_count: manifest.scenario_count,
    results: [],
    summary: {
      total: 0,
      success: 0,
      failed: 0,
      golden_avg_crs: 0,
      kill_avg_crs: 0,
    },
  };

  // Run each scenario
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('                         RUNNING SCENARIOS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  let goldenCRSSum = 0, killCRSSum = 0;
  let goldenCount = 0, killCount = 0;

  for (const scenario of manifest.scenarios) {
    // Run GOLDEN path
    const goldenPayload = {
      scenario_id: scenario.golden.scenario_id,
      entry_intent: scenario.name,
      buyer_bot_id: `bot_${scenario.id.toLowerCase().replace(/-/g, '_')}`,
      path_type: 'GOLDEN',
      expected_outcome: scenario.golden.expected_outcome,
    };

    const goldenResult = useRealSIVA
      ? await runSIVACRS(goldenPayload)
      : mockSIVACRS(goldenPayload);

    results.results.push(goldenResult);
    results.summary.total++;

    if (goldenResult.success) {
      results.summary.success++;
      goldenCRSSum += goldenResult.weighted_crs || 0;
      goldenCount++;
      process.stdout.write(`  ${scenario.id} GOLDEN: CRS=${goldenResult.weighted_crs?.toFixed(2) || 'N/A'}\n`);
    } else {
      results.summary.failed++;
      process.stdout.write(`  ${scenario.id} GOLDEN: FAILED (${goldenResult.error})\n`);
    }

    // Run KILL path
    const killPayload = {
      scenario_id: scenario.kill.scenario_id,
      entry_intent: scenario.name,
      buyer_bot_id: `bot_${scenario.id.toLowerCase().replace(/-/g, '_')}_adversarial`,
      path_type: 'KILL',
      expected_outcome: scenario.kill.expected_outcome,
    };

    const killResult = useRealSIVA
      ? await runSIVACRS(killPayload)
      : mockSIVACRS(killPayload);

    results.results.push(killResult);
    results.summary.total++;

    if (killResult.success) {
      results.summary.success++;
      killCRSSum += killResult.weighted_crs || 0;
      killCount++;
      process.stdout.write(`  ${scenario.id} KILL:   CRS=${killResult.weighted_crs?.toFixed(2) || 'N/A'}\n`);
    } else {
      results.summary.failed++;
      process.stdout.write(`  ${scenario.id} KILL:   FAILED (${killResult.error})\n`);
    }
  }

  // Calculate averages
  results.summary.golden_avg_crs = goldenCount > 0 ? parseFloat((goldenCRSSum / goldenCount).toFixed(2)) : 0;
  results.summary.kill_avg_crs = killCount > 0 ? parseFloat((killCRSSum / killCount).toFixed(2)) : 0;

  // Save results
  const outputFile = join(outputDir, 'siva_crs_results.json');
  writeFileSync(outputFile, JSON.stringify(results, null, 2));

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('                      PHASE 3 COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`\nResults saved to: ${outputFile}`);
  console.log(`\nSummary:`);
  console.log(`  Total scenarios:  ${results.summary.total}`);
  console.log(`  Successful:       ${results.summary.success}`);
  console.log(`  Failed:           ${results.summary.failed}`);
  console.log(`  Golden avg CRS:   ${results.summary.golden_avg_crs}`);
  console.log(`  Kill avg CRS:     ${results.summary.kill_avg_crs}`);

  if (!useRealSIVA) {
    console.log('\n⚠️  WARNING: These are MOCK scores.');
    console.log('   Real validation requires live SIVA OS.');
    console.log('   Set SIVA_OS_URL=https://your-os-url and re-run.');
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                        NEXT STEPS                                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ 1. Ensure Phase 2 human scores are collected                     ║');
  console.log('║ 2. Run Phase 4: node silent-validation-phase4-correlation.js     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
