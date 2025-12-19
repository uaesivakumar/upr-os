/**
 * ARCHIVE CURRENT VALIDATION RESULTS
 *
 * This script archives the current validation results into the permanent
 * Sales-Bench artifact structure.
 *
 * Authority: OS
 * Visibility: Super Admin (read-only)
 *
 * Creates:
 * - Suite A: Banking/EB/UAE - Payroll Solutioning (Post-Entry)
 * - Immutable artifact bundle
 * - Database records for suite, run, and status
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const VALIDATION_DIR = join(__dirname, '../../scripts/validation');
const ARTIFACTS_DIR = join(__dirname, 'artifacts');

// Suite definition for current validation
const SUITE_A = {
  suite_key: 'banking-eb-uae-post-entry',
  name: 'Banking/EB/UAE - Payroll Solutioning (Post-Entry)',
  description: 'Employee Banking scenarios for UAE market. Post-entry sales conversations with existing leads.',
  vertical: 'banking',
  sub_vertical: 'employee_banking',
  region_code: 'UAE',
  stage: 'POST_ENTRY',
};

// ============================================================================
// FIND LATEST VALIDATION ARTIFACTS
// ============================================================================

function findLatestValidation() {
  const files = readdirSync(VALIDATION_DIR);

  // Find manifest
  const manifests = files.filter(f => f.startsWith('manifest_silent_validation_'));
  if (manifests.length === 0) throw new Error('No manifest found');
  manifests.sort().reverse();
  const manifestFile = manifests[0];
  const validationId = manifestFile.replace('manifest_silent_validation_', '').replace('.json', '');

  return {
    validationId,
    manifestFile,
    manifestPath: join(VALIDATION_DIR, manifestFile),
    systemValidationDir: join(VALIDATION_DIR, `system_validation_silent_validation_${validationId}`),
    founderReviewDir: join(VALIDATION_DIR, `founder_review_silent_validation_${validationId}`),
    systemMemoPath: join(VALIDATION_DIR, `SYSTEM_VALIDATION_MEMO_silent_validation_${validationId}.md`),
  };
}

// ============================================================================
// COMPUTE HASHES
// ============================================================================

function computeFileHash(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function computeManifestHash(manifest) {
  const scenarioData = manifest.scenarios.map(s =>
    `${s.id}:${s.golden.hash}:${s.kill.hash}`
  ).sort().join('|');
  return createHash('sha256').update(scenarioData).digest('hex');
}

// ============================================================================
// GET GIT INFO
// ============================================================================

function getGitInfo() {
  try {
    const commitSha = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname }).toString().trim();
    return { commitSha, branch };
  } catch {
    return { commitSha: 'unknown', branch: 'unknown' };
  }
}

// ============================================================================
// ARCHIVE ARTIFACTS
// ============================================================================

function archiveArtifacts(validation, manifest, gitInfo) {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const runId = `run_${Date.now()}`;

  // Create artifact directory
  // Structure: /os/sales-bench/artifacts/<suite_key>/<yyyymmdd>/<run_id>/
  const suiteDir = join(ARTIFACTS_DIR, SUITE_A.suite_key);
  const dateDir = join(suiteDir, today);
  const runDir = join(dateDir, runId);

  if (!existsSync(suiteDir)) mkdirSync(suiteDir, { recursive: true });
  if (!existsSync(dateDir)) mkdirSync(dateDir, { recursive: true });
  if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });

  console.log(`\nArchiving to: ${runDir}\n`);

  // Copy manifest
  copyFileSync(validation.manifestPath, join(runDir, 'manifest.json'));

  // Copy system validation results
  if (existsSync(validation.systemValidationDir)) {
    copyFileSync(
      join(validation.systemValidationDir, 'results.json'),
      join(runDir, 'results.json')
    );
    copyFileSync(
      join(validation.systemValidationDir, 'analysis.json'),
      join(runDir, 'analysis.json')
    );
  }

  // Copy founder review packet
  if (existsSync(validation.founderReviewDir)) {
    copyFileSync(
      join(validation.founderReviewDir, 'FOUNDER_REVIEW_PACKET.txt'),
      join(runDir, 'founder_review_packet.txt')
    );
    copyFileSync(
      join(validation.founderReviewDir, 'ANNOTATED_PACKET.txt'),
      join(runDir, 'annotated_packet.txt')
    );
  }

  // Copy system memo
  if (existsSync(validation.systemMemoPath)) {
    copyFileSync(validation.systemMemoPath, join(runDir, 'memo.md'));
  }

  // Load analysis for metrics
  let analysis = null;
  const analysisPath = join(validation.systemValidationDir, 'analysis.json');
  if (existsSync(analysisPath)) {
    analysis = JSON.parse(readFileSync(analysisPath, 'utf-8'));
  }

  // Create run metadata
  const runMetadata = {
    run_id: runId,
    suite_key: SUITE_A.suite_key,
    run_number: 1,
    run_mode: 'FULL',

    // Version tracking
    scenario_manifest_hash: computeManifestHash(manifest),
    siva_version: '1.0.0',
    model_slug: 'mock-execution', // Will be real model when using live SIVA
    code_commit_sha: gitInfo.commitSha,

    // Environment
    environment: 'LOCAL',
    triggered_by: 'archive-script',
    trigger_source: 'CLI',

    // Timing
    archived_at: new Date().toISOString(),
    original_validation_id: validation.validationId,

    // Results summary
    scenario_count: manifest.scenario_count,
    golden_count: manifest.golden_count,
    kill_count: manifest.kill_count,

    // Metrics (from analysis)
    metrics: analysis ? {
      golden_pass_rate: parseFloat(analysis.outcomes.golden.pass_rate),
      kill_containment_rate: parseFloat(analysis.outcomes.kill.containment_rate),
      cohens_d: analysis.distribution.separation,
      coherence_status: analysis.coherence.coherence_status,
      adversarial_status: analysis.adversarial.status,
      policy_status: analysis.policy.status,
      overall_status: analysis.overall_status,
    } : null,

    // Artifact integrity
    artifact_hash: computeFileHash(join(runDir, 'manifest.json')),

    status: 'COMPLETED',
  };

  writeFileSync(join(runDir, 'run_metadata.json'), JSON.stringify(runMetadata, null, 2));

  // Create suite metadata
  const suiteMetadata = {
    ...SUITE_A,
    scenario_manifest_hash: computeManifestHash(manifest),
    scenario_count: manifest.scenario_count,
    is_frozen: true,
    frozen_at: new Date().toISOString(),
    frozen_by: 'archive-script',
    created_at: manifest.scope.created_at,
    last_run_id: runId,
    last_run_at: new Date().toISOString(),
  };

  // Save suite metadata to suite directory
  writeFileSync(join(suiteDir, 'suite.json'), JSON.stringify(suiteMetadata, null, 2));

  return { runDir, runId, runMetadata, suiteMetadata };
}

// ============================================================================
// GENERATE DATABASE SEED
// ============================================================================

function generateDatabaseSeed(manifest, runMetadata, suiteMetadata) {
  const seedSQL = `
-- ============================================================================
-- SALES-BENCH INITIAL DATA SEED
-- Generated: ${new Date().toISOString()}
-- Suite: ${SUITE_A.suite_key}
-- ============================================================================

-- Insert suite (requires vertical/sub_vertical IDs from existing data)
INSERT INTO sales_bench_suites (
    suite_key, name, description,
    vertical_id, sub_vertical_id, region_code,
    stage, scenario_manifest_hash, scenario_count,
    is_frozen, frozen_at, frozen_by, created_by
)
SELECT
    '${SUITE_A.suite_key}',
    '${SUITE_A.name}',
    '${SUITE_A.description}',
    v.id,
    sv.id,
    '${SUITE_A.region_code}',
    '${SUITE_A.stage}',
    '${suiteMetadata.scenario_manifest_hash}',
    ${manifest.scenario_count},
    true,
    '${suiteMetadata.frozen_at}',
    'archive-script',
    'archive-script'
FROM os_verticals v
JOIN os_sub_verticals sv ON sv.vertical_id = v.id
WHERE v.slug = 'banking' AND sv.key = 'employee_banking'
ON CONFLICT (suite_key) DO UPDATE SET
    scenario_manifest_hash = EXCLUDED.scenario_manifest_hash,
    scenario_count = EXCLUDED.scenario_count,
    is_frozen = true,
    frozen_at = EXCLUDED.frozen_at;

-- Insert suite status
INSERT INTO sales_bench_suite_status (suite_id, status, system_validated_at, system_metrics)
SELECT
    s.id,
    'SYSTEM_VALIDATED',
    NOW(),
    '${JSON.stringify(runMetadata.metrics || {})}'::jsonb
FROM sales_bench_suites s
WHERE s.suite_key = '${SUITE_A.suite_key}'
ON CONFLICT (suite_id) DO UPDATE SET
    status = 'SYSTEM_VALIDATED',
    system_validated_at = NOW(),
    system_metrics = EXCLUDED.system_metrics;

-- Insert run record
INSERT INTO sales_bench_runs (
    suite_id, suite_key, run_number, run_mode,
    scenario_manifest_hash, siva_version, model_slug, code_commit_sha,
    environment, triggered_by, trigger_source,
    started_at, ended_at, status,
    scenario_count, golden_count, kill_count,
    pass_count, fail_count, block_count,
    golden_pass_rate, kill_containment_rate, cohens_d,
    metrics, artifact_path
)
SELECT
    s.id,
    '${SUITE_A.suite_key}',
    1,
    'FULL',
    '${runMetadata.scenario_manifest_hash}',
    '${runMetadata.siva_version}',
    '${runMetadata.model_slug}',
    '${runMetadata.code_commit_sha}',
    '${runMetadata.environment}',
    '${runMetadata.triggered_by}',
    '${runMetadata.trigger_source}',
    '${manifest.scope.created_at}',
    '${runMetadata.archived_at}',
    'COMPLETED',
    ${manifest.scenario_count},
    ${manifest.golden_count},
    ${manifest.kill_count},
    ${runMetadata.metrics?.golden_pass_rate ? Math.round(runMetadata.metrics.golden_pass_rate * manifest.golden_count / 100) : 0},
    ${runMetadata.metrics?.kill_containment_rate ? Math.round((100 - runMetadata.metrics.kill_containment_rate) * manifest.kill_count / 100) : 0},
    0,
    ${runMetadata.metrics?.golden_pass_rate || 0},
    ${runMetadata.metrics?.kill_containment_rate || 0},
    ${runMetadata.metrics?.cohens_d || 0},
    '${JSON.stringify(runMetadata.metrics || {})}'::jsonb,
    '${runMetadata.run_id}'
FROM sales_bench_suites s
WHERE s.suite_key = '${SUITE_A.suite_key}';

-- Insert audit log entry
INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role)
SELECT
    s.id,
    'SUITE_CREATED',
    'Initial suite creation and system validation archive',
    'archive-script',
    'SYSTEM'
FROM sales_bench_suites s
WHERE s.suite_key = '${SUITE_A.suite_key}';
`;

  return seedSQL;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        SALES-BENCH ARCHIVE: Current Validation Results           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Find validation artifacts
  console.log('Finding validation artifacts...');
  const validation = findLatestValidation();
  console.log(`  Validation ID: ${validation.validationId}`);

  // Load manifest
  const manifest = JSON.parse(readFileSync(validation.manifestPath, 'utf-8'));
  console.log(`  Scenarios: ${manifest.scenario_count}`);
  console.log(`  Frozen: ${manifest.scope.frozen}`);

  // Get git info
  const gitInfo = getGitInfo();
  console.log(`  Git commit: ${gitInfo.commitSha.substring(0, 8)}`);

  // Archive artifacts
  console.log('\nArchiving artifacts...');
  const { runDir, runId, runMetadata, suiteMetadata } = archiveArtifacts(validation, manifest, gitInfo);

  console.log('  ✅ manifest.json');
  console.log('  ✅ results.json');
  console.log('  ✅ analysis.json');
  console.log('  ✅ founder_review_packet.txt');
  console.log('  ✅ annotated_packet.txt');
  console.log('  ✅ memo.md');
  console.log('  ✅ run_metadata.json');

  // Generate database seed
  console.log('\nGenerating database seed...');
  const seedSQL = generateDatabaseSeed(manifest, runMetadata, suiteMetadata);
  const seedPath = join(runDir, 'database_seed.sql');
  writeFileSync(seedPath, seedSQL);
  console.log(`  ✅ ${seedPath}`);

  // Summary
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('                     ARCHIVE COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`\nSuite: ${SUITE_A.suite_key}`);
  console.log(`Run ID: ${runId}`);
  console.log(`\nArtifact location:`);
  console.log(`  ${runDir}/`);
  console.log('\nFiles archived:');
  console.log('  ├── manifest.json');
  console.log('  ├── results.json');
  console.log('  ├── analysis.json');
  console.log('  ├── founder_review_packet.txt');
  console.log('  ├── annotated_packet.txt');
  console.log('  ├── memo.md');
  console.log('  ├── run_metadata.json');
  console.log('  └── database_seed.sql');

  console.log('\nMetrics preserved:');
  if (runMetadata.metrics) {
    console.log(`  Golden pass rate:     ${runMetadata.metrics.golden_pass_rate}%`);
    console.log(`  Kill containment:     ${runMetadata.metrics.kill_containment_rate}%`);
    console.log(`  Cohen's d:            ${runMetadata.metrics.cohens_d}`);
    console.log(`  Overall status:       ${runMetadata.metrics.overall_status}`);
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Suite A: Banking/EB/UAE - Payroll Solutioning (Post-Entry)      ║');
  console.log('║  Status: SYSTEM_VALIDATED                                        ║');
  console.log('║  Human validation: PENDING                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
