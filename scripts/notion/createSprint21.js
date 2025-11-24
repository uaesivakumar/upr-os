import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const SPRINTS_DB = process.env.JOURNAL_DB_ID || process.env.NOTION_JOURNAL_DB;
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 Sprint 21: SIVA Phase 5 - Cognitive Extraction & Encoding');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================================
// Sprint 21 Tasks Definition
// ============================================================================

const sprint21Tasks = [
  {
    title: 'Phase 5.1: Extract Cognitive Rules from Decision Patterns',
    description: 'Record and analyze 30 real decisions (contact/skip companies) to extract patterns for company quality, contact tier selection, timing scores, and edge cases. Deliver cognitive_extraction_logic.json v1.0 with 10-15 initial rules.',
    priority: 'P1',
    estimatedHours: 12,
    acceptanceCriteria: [
      '30 decision examples documented with company metadata + reasoning',
      'Pattern analysis completed (size sweet spot, industry bias, gov exceptions)',
      'cognitive_extraction_logic.json v1.0 created with 10-15 rules',
      'Rule types: formula, decision_tree, lookup, threshold',
      'All rules versioned and documented'
    ],
    tags: ['Cognitive Rules', 'Pattern Extraction', 'JSON Schema'],
    dependencies: 'None - starts fresh after Phase 4',
    technicalNotes: 'Use existing SIVA tool decisions from agent_decisions table as input data. Focus on evaluate_company_quality, select_contact_tier, calculate_timing_score, check_edge_cases rules first.'
  },
  {
    title: 'Phase 5.2: Build Rule Engine Interpreter',
    description: 'Implement rule-engine.js with methods to execute formulas, decision trees, lookups, and condition checking. Support safe math evaluation (mathjs), variable resolution, and explainability output.',
    priority: 'P1',
    estimatedHours: 16,
    acceptanceCriteria: [
      'rule-engine.js created with execute(), executeFormula(), executeDecisionTree() methods',
      'safeEval() using mathjs parser (no eval())',
      'evaluateVariable() resolves lookups, mappings, range_lookups',
      'checkCondition() supports eq, lt, gt, between, in, and, or operators',
      'explain() generates human-readable breakdown',
      'All executions return {result, variables, breakdown, formula, version}'
    ],
    tags: ['Rule Engine', 'Interpreter', 'Formulas', 'Decision Trees'],
    dependencies: 'Phase 5.1 (needs cognitive_extraction_logic.json schema)',
    technicalNotes: 'File location: /server/agent-core/rule-engine.js. Use mathjs library for safe formula evaluation. Return explainability data for every rule execution.'
  },
  {
    title: 'Phase 5.3: Integrate Rule Engine with SIVA Tools',
    description: 'Wire rule engine into existing SIVA tools (CompanyQualityTool, ContactTierTool, TimingScoreTool, EdgeCasesTool) to replace hardcoded logic with dynamic JSON rules. Maintain backward compatibility.',
    priority: 'P1',
    estimatedHours: 14,
    acceptanceCriteria: [
      'CompanyQualityTool uses evaluate_company_quality rule',
      'ContactTierTool uses select_contact_tier rule',
      'TimingScoreTool uses calculate_timing_score rule',
      'EdgeCasesTool uses check_edge_cases rule',
      'All tools return explainability breakdown from rule engine',
      'Backward compatibility maintained (existing API contracts unchanged)',
      'Tool response times remain under SLA (p95 < 500ms for Foundation tools)'
    ],
    tags: ['Integration', 'SIVA Tools', 'Rule Engine', 'Backward Compatibility'],
    dependencies: 'Phase 5.2 (needs rule-engine.js operational)',
    technicalNotes: 'Update tool files: CompanyQualityToolStandalone.js, ContactTierToolStandalone.js, TimingScoreToolStandalone.js, EdgeCasesToolStandalone.js. Add rule engine as dependency, call execute() method instead of inline logic.'
  },
  {
    title: 'Phase 5.4: Build Golden Dataset Test Suite',
    description: 'Create comprehensive test suite with ~50 golden dataset examples covering all rule types. Include unit tests for each rule and integration tests for end-to-end workflows (should_i_contact_this_company).',
    priority: 'P1',
    estimatedHours: 10,
    acceptanceCriteria: [
      'Golden dataset created: 50+ test examples in JSON fixture file',
      'Unit tests for each rule (evaluate_company_quality.test.js, select_contact_tier.test.js, etc.)',
      'Integration tests for full contact decision workflow',
      'Test coverage > 90% for rule-engine.js',
      'All tests passing in CI/CD pipeline',
      'Edge case tests for government entities, enterprise exceptions'
    ],
    tags: ['Testing', 'Golden Dataset', 'Unit Tests', 'Integration Tests'],
    dependencies: 'Phase 5.3 (needs integrated system to test)',
    technicalNotes: 'Use Jest + Supertest. Create fixtures in /server/agent-core/test-fixtures/golden-dataset.json. Test file location: /server/agent-core/__tests__/. Include regression tests to prevent rule drift.'
  },
  {
    title: 'Phase 5.5: Implement Rule Versioning & Deployment Workflow',
    description: 'Build versioning system for cognitive rules with validation, deployment, health checks, and rollback capabilities. Support A/B testing for rule changes and backtest metrics.',
    priority: 'P2',
    estimatedHours: 8,
    acceptanceCriteria: [
      'Rule validation command: npm run validate-rules',
      'Version naming: cognitive_extraction_logic.v1.0.json → v1.1.json',
      'persona_versions table updated on each deployment',
      'Health check endpoint: GET /api/agent-core/health returns current version',
      'Rollback procedure documented (switch Cloud Run revision)',
      'Backtest script: compare rule v1.x vs v1.y on last 90 days data'
    ],
    tags: ['Versioning', 'Deployment', 'DevOps', 'Rollback', 'A/B Testing'],
    dependencies: 'Phase 5.4 (needs tests passing before versioning)',
    technicalNotes: 'Add validation script: scripts/validate-rules.js. Update persona_versions table schema if needed. Document promotion criteria: ≥5% conversion lift vs previous version.'
  },
  {
    title: 'Phase 5.6: Add Explainability UI & Governance Policies',
    description: 'Create explainability output format for rule decisions, add governance policies (change log, audit trail, review cycle), and implement maintenance schedule triggers.',
    priority: 'P2',
    estimatedHours: 6,
    acceptanceCriteria: [
      'Explainability format standardized: {result, breakdown[], formula, confidence, version}',
      'Breakdown shows 3 main reasons for each decision',
      'Change log format defined in Git commit messages',
      'Audit trail captured in persona_versions table',
      'Quarterly review process documented',
      'Maintenance triggers defined: quarterly backtest, new pattern, drift detection'
    ],
    tags: ['Explainability', 'Governance', 'Audit Trail', 'Maintenance'],
    dependencies: 'Phase 5.5 (needs versioning system in place)',
    technicalNotes: 'Add governance doc: /docs/siva-phases/Phase_5_Governance.md. Owner: Sivakumar (sole approver v1). Review cycle: quarterly rule health check. Audit using Git history + persona_versions table.'
  }
];

// ============================================================================
// Helper: Create Sprint 21 Entry
// ============================================================================

async function createSprint21Entry() {
  console.log('📊 Creating Sprint 21 entry in SPRINTS database...\n');

  try {
    const sprint21 = await notion.pages.create({
      parent: { database_id: SPRINTS_DB },
      properties: {
        'Sprint': {
          title: [{ text: { content: 'Sprint 21' } }]
        },
        'Status': {
          select: { name: 'Active' }
        },
        'Goal': {
          rich_text: [{
            text: {
              content: 'SIVA Phase 5: Cognitive Extraction & Encoding - Translate Siva\'s decision patterns into machine-readable JSON rules with a rule engine interpreter and comprehensive testing'
            }
          }]
        },
        'Business Value': {
          rich_text: [{
            text: {
              content: 'Extract 30 decision patterns into cognitive_extraction_logic.json v1.0 with 10-15 rules. Build rule engine interpreter. Integrate with SIVA tools. Create golden dataset test suite (50+ examples). Implement versioning workflow. Add explainability & governance.'
            }
          }]
        },
        'Phases Updated': {
          multi_select: [
            { name: 'Phase 5.1: Extract Cognitive Rules' },
            { name: 'Phase 5.2: Rule Engine Interpreter' },
            { name: 'Phase 5.3: SIVA Tools Integration' },
            { name: 'Phase 5.4: Golden Dataset Tests' },
            { name: 'Phase 5.5: Rule Versioning' },
            { name: 'Phase 5.6: Explainability & Governance' }
          ]
        }
      }
    });

    console.log(`✅ Sprint 21 created: ${sprint21.id}\n`);
    return sprint21.id;
  } catch (error) {
    console.error('❌ Error creating Sprint 21:', error.message);
    throw error;
  }
}

// ============================================================================
// Helper: Create Task in MODULE FEATURES
// ============================================================================

async function createTask(task, taskNumber) {
  console.log(`📝 Creating ${task.title}...\n`);

  try {
    const page = await notion.pages.create({
      parent: { database_id: MODULE_FEATURES_DB },
      properties: {
        'Features': {
          title: [{ text: { content: task.title } }]
        },
        'Status': {
          select: { name: 'To-Do' }
        },
        'Priority': {
          select: { name: task.priority }
        },
        'Sprint': {
          number: 21
        },
        'ETA': {
          number: task.estimatedHours
        },
        'Done?': {
          checkbox: false
        },
        'Type': {
          select: { name: 'AI Agent Core' }
        },
        'Notes': {
          rich_text: [{
            text: { content: task.description }
          }]
        },
        'Tags': {
          multi_select: task.tags.map(tag => ({ name: tag }))
        },
        'Dependencies': {
          rich_text: [{
            text: { content: task.dependencies }
          }]
        }
      }
    });

    console.log(`   ✅ Created: ${task.title}`);
    console.log(`   📄 Page ID: ${page.id}`);
    console.log(`   ⏱️  Estimated: ${task.estimatedHours}h`);
    console.log(`   🏷️  Tags: ${task.tags.join(', ')}\n`);

    // Add detailed content as page children
    await notion.blocks.children.append({
      block_id: page.id,
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '✅ Acceptance Criteria' } }]
          }
        },
        ...task.acceptanceCriteria.map(criteria => ({
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [{ text: { content: criteria } }],
            checked: false
          }
        })),
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '🔗 Dependencies' } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: task.dependencies } }]
          }
        },
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '💡 Technical Notes' } }]
          }
        },
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [{ text: { content: task.technicalNotes } }],
            icon: { type: 'emoji', emoji: '⚙️' },
            color: 'blue_background'
          }
        }
      ]
    });

    console.log(`   ✅ Added detailed content blocks\n`);
    return page.id;
  } catch (error) {
    console.error(`   ❌ Error creating task: ${error.message}\n`);
    throw error;
  }
}

// ============================================================================
// Main: Create Sprint 21 with all tasks
// ============================================================================

async function createSprint21() {
  try {
    // Step 1: Create Sprint 21 entry
    const sprintId = await createSprint21Entry();

    // Step 2: Create all tasks
    console.log('📋 Creating MODULE FEATURES tasks...\n');
    console.log(`   Total tasks: ${sprint21Tasks.length}\n`);

    const taskIds = [];
    for (let i = 0; i < sprint21Tasks.length; i++) {
      const taskId = await createTask(sprint21Tasks[i], i + 1);
      taskIds.push(taskId);
    }

    // Step 3: Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Sprint 21 Creation Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Sprint: Sprint 21 - Active`);
    console.log(`   Goal: SIVA Phase 5 - Cognitive Extraction & Encoding`);
    console.log(`   Tasks Created: ${taskIds.length}/6`);
    console.log(`   Total Estimated Hours: ${sprint21Tasks.reduce((sum, t) => sum + t.estimatedHours, 0)}h`);
    console.log(`   Timeline: ~2 weeks (4 weeks in Phase 5 spec, condensed)\n`);

    console.log('📦 Tasks:');
    sprint21Tasks.forEach((task, i) => {
      console.log(`   ${i + 1}. ${task.title} (${task.estimatedHours}h)`);
    });

    console.log('\n🎯 Success Criteria:');
    console.log('   ✅ cognitive_extraction_logic.json v1.0 (10-15 rules)');
    console.log('   ✅ rule-engine.js interpreter operational');
    console.log('   ✅ 4 SIVA tools integrated with rule engine');
    console.log('   ✅ Golden dataset test suite (50+ examples)');
    console.log('   ✅ Versioning workflow & deployment pipeline');
    console.log('   ✅ Explainability format & governance policies\n');

    console.log('📈 Impact:');
    console.log('   - Transition from hardcoded logic → dynamic JSON rules');
    console.log('   - Enable rapid rule evolution without code changes');
    console.log('   - Full explainability for every decision');
    console.log('   - Foundation for continuous learning & improvement');
    console.log('   - Project Progress: 50% → 60%\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Sprint 21 creation failed:', error);
    throw error;
  }
}

// ============================================================================
// Run
// ============================================================================

createSprint21().catch(console.error);
