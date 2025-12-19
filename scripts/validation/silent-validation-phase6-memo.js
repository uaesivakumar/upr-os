/**
 * SILENT VALIDATION - PHASE 6: Write Silent Memo
 *
 * Generates the internal 1-2 page validation memo.
 * This is a SILENT memo - not for external sharing.
 *
 * From playbook:
 * - Internal document only
 * - Not for marketing
 * - Honest assessment of CRS calibration
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║         SILENT VALIDATION - PHASE 6: Write Silent Memo           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Find all validation artifacts
  const manifestFiles = readdirSync(__dirname).filter(f => f.startsWith('manifest_silent_validation_'));
  if (manifestFiles.length === 0) {
    console.log('No manifest found. Run Phase 1 first.');
    process.exit(1);
  }
  manifestFiles.sort().reverse();
  const manifestPath = join(__dirname, manifestFiles[0]);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const validationId = manifest.scope.validation_id;

  console.log(`Validation ID: ${validationId}`);

  // Load correlation data
  const correlationDir = join(__dirname, `correlation_${validationId}`);
  const correlationFile = join(correlationDir, 'spearman_correlation.json');
  const distributionFile = join(correlationDir, 'distribution_report.json');

  let correlationData = null;
  let distributionData = null;
  let hasRealData = false;

  if (existsSync(correlationFile)) {
    correlationData = JSON.parse(readFileSync(correlationFile, 'utf-8'));
    hasRealData = !correlationData.data_quality.siva_is_mock && !correlationData.data_quality.human_is_mock;
  }

  if (existsSync(distributionFile)) {
    distributionData = JSON.parse(readFileSync(distributionFile, 'utf-8'));
  }

  // Load human eval metadata
  const humanEvalDir = join(__dirname, `human_eval_${validationId}`);
  let evaluatorCount = 0;
  let hasHumanScores = false;

  if (existsSync(humanEvalDir)) {
    const masterSheet = join(humanEvalDir, 'master_sheet.json');
    if (existsSync(masterSheet)) {
      const master = JSON.parse(readFileSync(masterSheet, 'utf-8'));
      evaluatorCount = master.evaluators.filter(e => e.packet_returned).length;
      hasHumanScores = evaluatorCount >= 3;
    }
  }

  // Generate memo
  const memo = generateMemo({
    validationId,
    manifest,
    correlationData,
    distributionData,
    evaluatorCount,
    hasRealData,
    hasHumanScores,
  });

  // Save memo
  const memoPath = join(__dirname, `SILENT_MEMO_${validationId}.md`);
  writeFileSync(memoPath, memo);

  console.log(`\n✅ Silent memo generated: ${memoPath}`);
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('                    SILENT VALIDATION COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════\n');

  if (!hasRealData) {
    console.log('⚠️  WARNING: Memo is based on MOCK data');
    console.log('   Complete human evaluation and run with real SIVA OS');
    console.log('   before using this memo for decisions.\n');
  }

  console.log('INTERNAL USE ONLY - NOT FOR EXTERNAL SHARING');
}

function generateMemo({ validationId, manifest, correlationData, distributionData, evaluatorCount, hasRealData, hasHumanScores }) {
  const today = new Date().toISOString().split('T')[0];

  const rho = correlationData?.spearman?.rho || 'N/A';
  const pValue = correlationData?.spearman?.p_value || 'N/A';
  const calibrationStatus = correlationData?.calibration_status || 'PENDING';
  const significant = correlationData?.spearman?.significant ?? false;

  const memo = `
# SILENT VALIDATION MEMO
## CRS Calibration Assessment - Employee Banking (UAE)

---

**Document Classification:** INTERNAL ONLY - NOT FOR EXTERNAL SHARING
**Validation ID:** ${validationId}
**Date:** ${today}
**Version:** v1.0

---

## 1. EXECUTIVE SUMMARY

${hasRealData ? `
This memo documents the silent validation of SIVA's Conversion Readiness Score (CRS)
against human sales judgment for Employee Banking scenarios in UAE.

**Bottom Line:** CRS calibration is **${calibrationStatus}**
` : `
⚠️ **DRAFT MEMO - MOCK DATA USED**

This is a template memo generated with mock data. Real validation requires:
1. Collection of human scores from 3-5 senior RMs
2. Execution of scenarios against live SIVA OS

Do not use this memo for decisions until real data is collected.
`}

---

## 2. METHODOLOGY

### 2.1 Scope
- **Vertical:** Banking
- **Sub-Vertical:** Employee Banking
- **Region:** UAE
- **Scope Lock:** Scenarios frozen before any scoring

### 2.2 Scenarios
- **Total Scenarios:** ${manifest.scenario_count}
- **Golden Paths:** ${manifest.golden_count} (sales advancement scenarios)
- **Kill Paths:** ${manifest.kill_count} (adversarial refusal scenarios)
- **Frozen At:** ${manifest.frozen_at}

### 2.3 Persona Groups
${Object.entries(manifest.personas).map(([name, count]) => `- ${name}: ${count} scenarios`).join('\n')}

### 2.4 Human Evaluators
- **Required:** 3-5 senior RMs or sales managers (UAE EB experience)
- **Actual:** ${evaluatorCount || '0 (pending)'}
- **Qualification:** Must close payroll deals (not data scientists, not product, not juniors)
- **Protocol:** Blind evaluation, no discussion until complete

### 2.5 Statistical Method
- **Test:** Spearman Rank Correlation (non-parametric)
- **Rationale:** Ordinal data, robust to outliers
- **Significance Level:** α = 0.05
- **Minimum Sample:** n ≥ 30

---

## 3. RESULTS

### 3.1 Spearman Correlation
| Metric | Value |
|--------|-------|
| ρ (rho) | ${rho} |
| p-value | ${pValue} |
| Significant | ${significant ? 'YES' : 'NO'} |
| n (paired) | ${correlationData?.spearman?.n || 'N/A'} |

### 3.2 Calibration Status
**${calibrationStatus}**

${calibrationStatus === 'EXCELLENT' ? `
✅ SIVA CRS strongly correlates with human sales judgment.
   Safe for customer-facing use.
` : calibrationStatus === 'GOOD' ? `
✅ SIVA CRS moderately correlates with human sales judgment.
   Safe for customer-facing use with monitoring.
` : calibrationStatus === 'ACCEPTABLE' ? `
⚠️ SIVA CRS weakly correlates with human judgment.
   Use internally only. Consider prompt tuning before customer-facing use.
` : calibrationStatus === 'INSUFFICIENT' ? `
❌ SIVA CRS does NOT meaningfully correlate with human judgment.
   DO NOT use for customer-facing features.
   Requires significant prompt tuning.
` : `
⏳ Validation incomplete. Collect data to determine calibration.
`}

### 3.3 Distribution Analysis
${distributionData ? `
| Metric | Human CRS | SIVA CRS |
|--------|-----------|----------|
| Mean | ${distributionData.statistics.human.mean.toFixed(2)} | ${distributionData.statistics.siva.mean.toFixed(2)} |
| Std Dev | ${distributionData.statistics.human.stdDev.toFixed(2)} | ${distributionData.statistics.siva.stdDev.toFixed(2)} |
| Median | ${distributionData.statistics.human.median.toFixed(2)} | ${distributionData.statistics.siva.median.toFixed(2)} |

**Diagnostics:**
- Bias: ${distributionData.diagnostics.has_bias ? `YES (mean diff = ${distributionData.statistics.mean_difference.toFixed(2)})` : 'None detected'}
- Variance Issue: ${distributionData.diagnostics.has_variance_issue ? 'YES' : 'None detected'}
` : 'Distribution analysis pending.'}

---

## 4. RECOMMENDATIONS

${calibrationStatus === 'EXCELLENT' || calibrationStatus === 'GOOD' ? `
### 4.1 Immediate Actions
- ✅ Proceed with CRS integration in Sales-Bench
- ✅ Enable CRS in discovery results (internal testing)
- ✅ Document calibration in PRD as validated

### 4.2 Future Work
- Schedule quarterly recalibration
- Expand to Corporate Banking and SME Banking verticals
- Monitor CRS-to-conversion correlation in production
` : calibrationStatus === 'ACCEPTABLE' ? `
### 4.1 Immediate Actions
- ⚠️ Use CRS for internal analytics only
- ⚠️ Do not expose CRS scores to customers yet
- Schedule prompt tuning sprint

### 4.2 Required Before Customer Use
- Improve ρ to ≥ 0.5
- Rerun validation with updated prompts
- Obtain sign-off from product lead
` : calibrationStatus === 'INSUFFICIENT' ? `
### 4.1 Immediate Actions
- ❌ DO NOT use CRS for any decisions
- ❌ DO NOT expose to customers
- Schedule prompt overhaul sprint

### 4.2 Required Before Any Use
- Root cause analysis of CRS prompts
- Complete prompt redesign
- Rerun validation from Phase 1
` : `
### 4.1 Immediate Actions
- Complete human evaluation (Phase 2)
- Run SIVA on scenarios (Phase 3)
- Rerun correlation analysis (Phase 4-5)
`}

---

## 5. APPENDIX

### 5.1 Validation Artifacts
- Manifest: \`manifest_${validationId}.json\`
- Human Eval Materials: \`human_eval_${validationId}/\`
- SIVA Results: \`siva_run_${validationId}/\`
- Correlation Results: \`correlation_${validationId}/\`

### 5.2 Scenario Sample
${manifest.scenarios.slice(0, 5).map(s => `- ${s.id}: ${s.name}`).join('\n')}
... and ${manifest.scenarios.length - 5} more

### 5.3 CRS Dimensions (PRD v1.3)
1. Qualification (15%)
2. Needs Discovery (15%)
3. Value Articulation (15%)
4. Objection Handling (15%)
5. Process Adherence (10%)
6. Compliance (10%)
7. Relationship Building (10%)
8. Next Step Secured (10%)

---

**Document Author:** Silent Validation Pipeline
**Review Required:** Founder/Product Lead
**Classification:** INTERNAL ONLY

---

*This memo documents internal calibration testing. It is not intended for marketing,
customer communication, or external sharing. Results represent point-in-time
validation and require periodic recalibration.*
`;

  return memo.trim();
}

main().catch(console.error);
