/**
 * SILENT VALIDATION - PHASE 2: Human Evaluation Protocol
 *
 * Creates evaluation infrastructure for senior sales managers to score scenarios.
 *
 * REQUIREMENTS (from playbook):
 * - 3-5 senior evaluators (RMs or sales managers who close payroll deals)
 * - ❌ Not data scientists ❌ Not product people ❌ Not juniors
 * - Blind evaluation (no SIVA outputs shown)
 * - Each evaluator scores each scenario on CRS dimensions
 * - Compute inter-rater reliability (Krippendorff's alpha or ICC)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
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

// CRS Dimensions (8 fixed weights from PRD v1.3)
const CRS_DIMENSIONS = [
  { key: 'qualification', name: 'Qualification', weight: 0.15, description: 'Identifies BANT (Budget, Authority, Need, Timeline)' },
  { key: 'needs_discovery', name: 'Needs Discovery', weight: 0.15, description: 'Uncovers pain points and requirements' },
  { key: 'value_articulation', name: 'Value Articulation', weight: 0.15, description: 'Connects solution to customer needs' },
  { key: 'objection_handling', name: 'Objection Handling', weight: 0.15, description: 'Addresses concerns professionally' },
  { key: 'process_adherence', name: 'Process Adherence', weight: 0.10, description: 'Follows sales methodology' },
  { key: 'compliance', name: 'Compliance', weight: 0.10, description: 'Maintains regulatory compliance' },
  { key: 'relationship_building', name: 'Relationship Building', weight: 0.10, description: 'Builds rapport and trust' },
  { key: 'next_step_secured', name: 'Next Step Secured', weight: 0.10, description: 'Advances deal to next stage' },
];

// Score scale (1-5 Likert)
const SCORE_SCALE = {
  1: 'Very Poor - Would lose the deal immediately',
  2: 'Poor - Unlikely to advance',
  3: 'Average - May or may not advance',
  4: 'Good - Likely to advance',
  5: 'Excellent - Would definitely advance',
};

// ============================================================================
// EVALUATOR PROTOCOL
// ============================================================================

const EVALUATOR_PROTOCOL = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SILENT VALIDATION - EVALUATOR PROTOCOL                     ║
║                     Employee Banking (UAE) - CRS Calibration                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

CONFIDENTIAL - INTERNAL USE ONLY

PURPOSE
-------
You are helping calibrate our AI sales assistant (SIVA) by providing your
expert judgment on sales scenarios. Your input will ensure SIVA gives advice
that matches what experienced sales professionals would recommend.

YOUR ROLE
---------
- You are evaluating SCENARIOS, not actual sales calls
- For each scenario, imagine you are the salesperson
- Score how well each CRS dimension applies to this situation

INSTRUCTIONS
------------
1. Read each scenario carefully
2. For each of the 8 dimensions, assign a score from 1-5
3. Use your gut feeling - there are no "right" answers
4. Do not discuss with other evaluators until all are complete
5. Complete ALL scenarios in one sitting if possible

SCORING SCALE
-------------
1 = Very Poor - Would lose the deal immediately
2 = Poor - Unlikely to advance the deal
3 = Average - May or may not advance
4 = Good - Likely to advance the deal
5 = Excellent - Would definitely advance

CRS DIMENSIONS
--------------
1. QUALIFICATION (15%): Does this scenario allow proper BANT discovery?
2. NEEDS DISCOVERY (15%): Can pain points be effectively uncovered?
3. VALUE ARTICULATION (15%): Can solution value be clearly communicated?
4. OBJECTION HANDLING (15%): Are objections addressable professionally?
5. PROCESS ADHERENCE (10%): Does this follow good sales methodology?
6. COMPLIANCE (10%): Are regulatory requirements handleable?
7. RELATIONSHIP BUILDING (10%): Can rapport and trust be established?
8. NEXT STEP SECURED (10%): Can the deal be advanced to next stage?

IMPORTANT REMINDERS
-------------------
⚠️  Score based on YOUR sales experience, not theory
⚠️  Golden paths should generally score higher than Kill paths
⚠️  Kill paths with BLOCK triggers should score very low on compliance
⚠️  Trust your instincts - you've closed these deals before

`;

// ============================================================================
// GENERATE EVALUATION SHEETS
// ============================================================================

function generateEvaluationSheets(manifest) {
  const outputDir = `${__dirname}/human_eval_${manifest.scope.validation_id}`;
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Generate per-evaluator packets
  const evaluatorCount = 5; // Max evaluators
  for (let e = 1; e <= evaluatorCount; e++) {
    generateEvaluatorPacket(manifest, outputDir, e);
  }

  // Generate master tracking sheet
  generateMasterSheet(manifest, outputDir);

  // Generate scoring collection script
  generateScoringCollector(manifest, outputDir);

  console.log(`\nEvaluation sheets generated in: ${outputDir}`);
  return outputDir;
}

function generateEvaluatorPacket(manifest, outputDir, evaluatorNum) {
  let content = EVALUATOR_PROTOCOL;

  content += `
════════════════════════════════════════════════════════════════════════════════
                           EVALUATOR ${evaluatorNum} - SCORING SHEET
════════════════════════════════════════════════════════════════════════════════

Evaluator ID: EVAL_${evaluatorNum}
Session Date: _______________
Start Time: _______________
End Time: _______________

BEFORE YOU BEGIN:
□ I understand my scores are confidential
□ I will not discuss scenarios with other evaluators
□ I will complete all scenarios in this session
□ I am a senior RM or sales manager with UAE payroll deal experience

Signature: ________________________________

`;

  // Add each scenario (randomize order per evaluator for bias reduction)
  const scenarios = [...manifest.scenarios];
  shuffleWithSeed(scenarios, evaluatorNum * 12345);

  scenarios.forEach((scenario, idx) => {
    // Golden path evaluation
    content += generateScenarioSheet(scenario, 'GOLDEN', idx * 2 + 1);

    // Kill path evaluation
    content += generateScenarioSheet(scenario, 'KILL', idx * 2 + 2);
  });

  content += `
════════════════════════════════════════════════════════════════════════════════
                              END OF EVALUATION
════════════════════════════════════════════════════════════════════════════════

Total Scenarios Evaluated: ${manifest.scenario_count}
Time Completed: _______________

EVALUATOR FEEDBACK (Optional):
Were any scenarios confusing? ________________________________________________
Any scenarios that don't reflect real UAE EB situations? _____________________
Additional comments: _________________________________________________________
_____________________________________________________________________________

Thank you for your expertise!
`;

  writeFileSync(`${outputDir}/evaluator_${evaluatorNum}_packet.txt`, content);
}

function generateScenarioSheet(scenario, pathType, sequenceNum) {
  const path = pathType === 'GOLDEN' ? scenario.golden : scenario.kill;
  const triggerInfo = pathType === 'KILL' && scenario.kill.trigger
    ? `\nKill Trigger: ${scenario.kill.trigger}`
    : '';

  return `
────────────────────────────────────────────────────────────────────────────────
SCENARIO ${sequenceNum}: ${scenario.id} (${pathType} PATH)
────────────────────────────────────────────────────────────────────────────────

Name: ${scenario.name}
Persona: ${scenario.persona}
Path Type: ${pathType}
Expected Outcome: ${path.expected_outcome}${triggerInfo}

SCORES (Circle one per dimension):

1. QUALIFICATION       [1]  [2]  [3]  [4]  [5]    Notes: _______________
   (BANT discovery)

2. NEEDS DISCOVERY     [1]  [2]  [3]  [4]  [5]    Notes: _______________
   (Pain points)

3. VALUE ARTICULATION  [1]  [2]  [3]  [4]  [5]    Notes: _______________
   (Solution value)

4. OBJECTION HANDLING  [1]  [2]  [3]  [4]  [5]    Notes: _______________
   (Address concerns)

5. PROCESS ADHERENCE   [1]  [2]  [3]  [4]  [5]    Notes: _______________
   (Methodology)

6. COMPLIANCE          [1]  [2]  [3]  [4]  [5]    Notes: _______________
   (Regulatory)

7. RELATIONSHIP        [1]  [2]  [3]  [4]  [5]    Notes: _______________
   (Rapport/Trust)

8. NEXT STEP SECURED   [1]  [2]  [3]  [4]  [5]    Notes: _______________
   (Deal advancement)

OVERALL ASSESSMENT:
Would you pursue this deal? [ ] YES  [ ] NO  [ ] MAYBE

Confidence in your scores (1-5): [___]

`;
}

function generateMasterSheet(manifest, outputDir) {
  const content = {
    validation_id: manifest.scope.validation_id,
    created_at: new Date().toISOString(),
    scenario_count: manifest.scenario_count,
    evaluators: [
      { id: 'EVAL_1', name: '', role: '', years_experience: null, packet_distributed: null, packet_returned: null },
      { id: 'EVAL_2', name: '', role: '', years_experience: null, packet_distributed: null, packet_returned: null },
      { id: 'EVAL_3', name: '', role: '', years_experience: null, packet_distributed: null, packet_returned: null },
      { id: 'EVAL_4', name: '', role: '', years_experience: null, packet_distributed: null, packet_returned: null },
      { id: 'EVAL_5', name: '', role: '', years_experience: null, packet_distributed: null, packet_returned: null },
    ],
    crs_dimensions: CRS_DIMENSIONS,
    score_scale: SCORE_SCALE,
    instructions: {
      minimum_evaluators: 3,
      maximum_evaluators: 5,
      evaluator_requirements: [
        'Senior Relationship Manager OR Sales Manager',
        'UAE Employee Banking experience',
        'Actually closes payroll deals',
        'NOT data scientists',
        'NOT product people',
        'NOT juniors',
      ],
      blind_evaluation: true,
      discussion_prohibited_until: 'all_complete',
    },
    status: 'PENDING',
    scores_collected: 0,
    inter_rater_reliability: null,
  };

  writeFileSync(`${outputDir}/master_sheet.json`, JSON.stringify(content, null, 2));
}

function generateScoringCollector(manifest, outputDir) {
  const content = `/**
 * PHASE 2 Score Collection
 *
 * Run this script to enter human evaluator scores from paper packets.
 * Usage: node collect-scores.js <evaluator_id>
 */

import readline from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const SCENARIOS = ${JSON.stringify(manifest.scenarios.map(s => ({
  id: s.id,
  name: s.name,
  golden_id: s.golden.scenario_id,
  kill_id: s.kill.scenario_id,
})), null, 2)};

const CRS_KEYS = ${JSON.stringify(CRS_DIMENSIONS.map(d => d.key))};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function collectScores() {
  const evaluatorId = process.argv[2];
  if (!evaluatorId) {
    console.error('Usage: node collect-scores.js EVAL_1');
    process.exit(1);
  }

  const outputFile = \`scores_\${evaluatorId}.json\`;
  const scores = { evaluator_id: evaluatorId, collected_at: new Date().toISOString(), scores: [] };

  console.log(\`\\nCollecting scores for \${evaluatorId}\\n\`);

  for (const scenario of SCENARIOS) {
    // Golden path
    console.log(\`\\n=== \${scenario.id} (GOLDEN) ===\`);
    const goldenScores = {};
    for (const key of CRS_KEYS) {
      const score = await question(\`  \${key} (1-5): \`);
      goldenScores[key] = parseInt(score) || 3;
    }
    scores.scores.push({
      scenario_id: scenario.golden_id,
      path_type: 'GOLDEN',
      crs_scores: goldenScores,
    });

    // Kill path
    console.log(\`\\n=== \${scenario.id} (KILL) ===\`);
    const killScores = {};
    for (const key of CRS_KEYS) {
      const score = await question(\`  \${key} (1-5): \`);
      killScores[key] = parseInt(score) || 3;
    }
    scores.scores.push({
      scenario_id: scenario.kill_id,
      path_type: 'KILL',
      crs_scores: killScores,
    });
  }

  writeFileSync(outputFile, JSON.stringify(scores, null, 2));
  console.log(\`\\nScores saved to \${outputFile}\`);
  rl.close();
}

collectScores().catch(console.error);
`;

  writeFileSync(`${outputDir}/collect-scores.js`, content);
}

// ============================================================================
// INTER-RATER RELIABILITY CALCULATOR
// ============================================================================

function generateReliabilityCalculator(manifest, outputDir) {
  const content = `/**
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

console.log(\`Found \${scoreFiles.length} evaluator score files\`);

const allScores = scoreFiles.map(f => JSON.parse(readFileSync(f, 'utf-8')));

// Build score matrix [evaluator][scenario][dimension]
const scenarios = allScores[0].scores.map(s => s.scenario_id);
const dimensions = Object.keys(allScores[0].scores[0].crs_scores);

console.log(\`\\nScenarios: \${scenarios.length}\`);
console.log(\`Dimensions: \${dimensions.length}\`);

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
  console.log(\`  \${dim}: ICC = \${icc.toFixed(3)}\`);
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
console.log(\`\\nOverall CRS ICC: \${overallICC.toFixed(3)}\`);

// Interpretation
console.log(\`\\nInterpretation:\`);
if (overallICC >= 0.75) {
  console.log(\`  ✅ EXCELLENT agreement (ICC >= 0.75)\`);
} else if (overallICC >= 0.50) {
  console.log(\`  ⚠️  MODERATE agreement (0.50 <= ICC < 0.75)\`);
} else {
  console.log(\`  ❌ POOR agreement (ICC < 0.50) - Review evaluator training\`);
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
console.log(\`\\nResults saved to inter_rater_reliability.json\`);

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
`;

  writeFileSync(`${outputDir}/compute-reliability.js`, content);
}

// ============================================================================
// DIGITAL ENTRY FORM GENERATOR (JSON Schema)
// ============================================================================

function generateDigitalForm(manifest, outputDir) {
  const formSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'CRS Human Evaluation Form',
    description: 'Silent Validation Phase 2 - Human CRS Scoring',
    type: 'object',
    properties: {
      evaluator_id: {
        type: 'string',
        enum: ['EVAL_1', 'EVAL_2', 'EVAL_3', 'EVAL_4', 'EVAL_5'],
        description: 'Your assigned evaluator ID',
      },
      evaluator_name: {
        type: 'string',
        description: 'Your full name (confidential)',
      },
      evaluator_role: {
        type: 'string',
        description: 'Your job title',
      },
      years_experience: {
        type: 'integer',
        minimum: 1,
        description: 'Years in UAE Employee Banking sales',
      },
      session_date: {
        type: 'string',
        format: 'date',
      },
      scenarios: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            scenario_id: { type: 'string' },
            path_type: { type: 'string', enum: ['GOLDEN', 'KILL'] },
            crs_scores: {
              type: 'object',
              properties: Object.fromEntries(
                CRS_DIMENSIONS.map(d => [d.key, {
                  type: 'integer',
                  minimum: 1,
                  maximum: 5,
                  description: d.description,
                }])
              ),
              required: CRS_DIMENSIONS.map(d => d.key),
            },
            would_pursue: { type: 'string', enum: ['YES', 'NO', 'MAYBE'] },
            confidence: { type: 'integer', minimum: 1, maximum: 5 },
          },
          required: ['scenario_id', 'path_type', 'crs_scores'],
        },
        minItems: manifest.scenario_count,
        maxItems: manifest.scenario_count,
      },
    },
    required: ['evaluator_id', 'scenarios'],
  };

  writeFileSync(`${outputDir}/form_schema.json`, JSON.stringify(formSchema, null, 2));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function shuffleWithSeed(array, seed) {
  // Seeded random shuffle for reproducible evaluator ordering
  let m = array.length;
  while (m) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const i = seed % m--;
    [array[m], array[i]] = [array[i], array[m]];
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       SILENT VALIDATION - PHASE 2: Human Evaluation Setup        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Load manifest
  console.log(`Loading manifest from: ${MANIFEST_PATH}`);
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

  console.log(`\nScope: ${manifest.scope.vertical}/${manifest.scope.sub_vertical}/${manifest.scope.region}`);
  console.log(`Scenarios: ${manifest.scenario_count} (${manifest.golden_count} Golden + ${manifest.kill_count} Kill)`);
  console.log(`Frozen: ${manifest.scope.frozen ? 'YES' : 'NO'}`);

  if (!manifest.scope.frozen) {
    throw new Error('Manifest not frozen! Cannot proceed with Phase 2.');
  }

  // Generate evaluation materials
  const outputDir = generateEvaluationSheets(manifest);
  generateReliabilityCalculator(manifest, outputDir);
  generateDigitalForm(manifest, outputDir);

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('                    PHASE 2 SETUP COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('\nGenerated files:');
  console.log(`  ${outputDir}/`);
  console.log('    ├── evaluator_1_packet.txt  (Print for Evaluator 1)');
  console.log('    ├── evaluator_2_packet.txt  (Print for Evaluator 2)');
  console.log('    ├── evaluator_3_packet.txt  (Print for Evaluator 3)');
  console.log('    ├── evaluator_4_packet.txt  (Print for Evaluator 4)');
  console.log('    ├── evaluator_5_packet.txt  (Print for Evaluator 5)');
  console.log('    ├── master_sheet.json       (Track evaluator status)');
  console.log('    ├── collect-scores.js       (Enter paper scores digitally)');
  console.log('    ├── compute-reliability.js  (Calculate ICC after collection)');
  console.log('    └── form_schema.json        (JSON schema for digital entry)');

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                        NEXT STEPS                                ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ 1. Identify 3-5 senior RMs/sales managers (UAE EB experience)    ║');
  console.log('║ 2. Print evaluator packets (one per evaluator)                   ║');
  console.log('║ 3. Brief evaluators (do NOT discuss scenarios between them)      ║');
  console.log('║ 4. Collect completed packets                                     ║');
  console.log('║ 5. Run: node collect-scores.js EVAL_1  (for each evaluator)      ║');
  console.log('║ 6. Run: node compute-reliability.js                              ║');
  console.log('║ 7. Proceed to Phase 3 if ICC >= 0.50                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  console.log('\n⚠️  REMINDER: Evaluators must be senior sales professionals!');
  console.log('    ❌ Not data scientists  ❌ Not product people  ❌ Not juniors');
  console.log('    ✅ Senior RMs who close UAE payroll deals');
}

main().catch(console.error);
