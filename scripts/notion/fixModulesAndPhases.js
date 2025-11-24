import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Module IDs from Notion
const MODULES = {
  'Outreach Generator': '2a266151-dd16-811a-b560-e30f25d71022',
  'Infra & DevOps': '2a266151-dd16-8141-84ad-e20bae7c0815',
  'Discovery Engine': '2a266151-dd16-8144-a851-ebb29e824ed9',
  'Enrichment Engine': '2a266151-dd16-8146-9ea7-ee97ca4791b6',
  'Admin Console': '2a266151-dd16-8166-a864-eb985f974e8c',
  'AI Agent Core': '2a266151-dd16-816d-a2f0-c61639000cb7',
  'System Integration': '2ac66151-dd16-811d-b71b-f41fe6c21281',
  'Explainability UI': '2ac66151-dd16-8126-bd48-ffc5ae2f7e01',
  'Lead Scoring': '2ac66151-dd16-8136-b1fc-e40ffeeae3f8',
  'Multi-Agent System': '2ac66151-dd16-815d-8930-cd5b5049c8e9',
  'Siva-Mode Voice System': '2ac66151-dd16-8172-b118-ed10a8652ec6',
  'Cognitive Rule Engines': '2ac66151-dd16-8177-b5c9-cdfa81a3fa74',
  'Agent Hub': '2ac66151-dd16-8184-9149-ef4a670c9a30',
  'Documentation & Deployment': '2ac66151-dd16-81ae-a247-f2994b6fd8c8',
  'Feedback Loop': '2ac66151-dd16-81c2-9003-e54fe8e5981f',
  'Q-Score System': '2ac66151-dd16-81cd-a813-c6d90c7c6d60',
  'Opportunity Lifecycle': '2ac66151-dd16-81d6-9fb7-de9fa620ba03'
};

// Sprint to Module mapping (54-70)
const SPRINT_MODULES = {
  54: ['AI Agent Core'],  // Chat E2E Testing
  55: ['AI Agent Core', 'Lead Scoring'],  // Predictive Analytics
  56: ['AI Agent Core', 'Lead Scoring'],  // ML Pipeline Enhancement
  57: ['AI Agent Core', 'Discovery Engine'],  // Natural Language Filtering
  58: ['System Integration', 'AI Agent Core'],  // Workflow Automation
  59: ['Admin Console', 'System Integration'],  // Team Collaboration & Access Control
  60: ['Explainability UI', 'Admin Console'],  // Reporting & Analytics Designer
  61: ['Infra & DevOps', 'System Integration'],  // Mobile & PWA
  62: ['System Integration', 'Admin Console'],  // Internationalization
  63: ['Infra & DevOps', 'System Integration'],  // Quality Assurance
  64: ['System Integration', 'AI Agent Core'],  // Unified OS API Layer
  65: ['Infra & DevOps', 'Admin Console'],  // Multi-tenant Isolation
  66: ['Lead Scoring', 'AI Agent Core'],  // Ranking Engine
  67: ['Admin Console', 'System Integration'],  // Settings Unification
  68: ['System Integration', 'Discovery Engine'],  // Entity Abstraction
  69: ['System Integration', 'Infra & DevOps'],  // Orchestration Hardening
  70: ['System Integration', 'Lead Scoring']  // Vertical Engine Shell
};

// Sprint to Phases Updated mapping (64-70)
const SPRINT_PHASES = {
  64: ['Phase 4', 'Backend Enhancement'],  // Unified OS API Layer
  65: ['Phase 2: API Security', 'Infra & DevOps'],  // Multi-tenant Isolation
  66: ['Phase 12: Lead Scoring Engine', 'Backend Enhancement'],  // Ranking Engine
  67: ['Backend Enhancement', 'Phase 4'],  // Settings Unification
  68: ['Backend Enhancement', 'Phase 4'],  // Entity Abstraction
  69: ['Backend Enhancement', 'Phase 6'],  // Orchestration Hardening
  70: ['Backend Enhancement', 'Phase 5']  // Vertical Engine Shell
};

async function updateModuleFeatures() {
  console.log('=== UPDATING MODULE FEATURES (Sprints 54-70) ===\n');

  for (let sprint = 54; sprint <= 70; sprint++) {
    const moduleNames = SPRINT_MODULES[sprint];
    if (!moduleNames) continue;

    const moduleIds = moduleNames.map(name => MODULES[name]).filter(Boolean);

    console.log(`\nSprint ${sprint}: Assigning modules [${moduleNames.join(', ')}]`);

    // Get all features for this sprint
    const features = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: sprint } }
    });

    if (features.results.length === 0) {
      console.log(`  No features found for Sprint ${sprint}`);
      continue;
    }

    console.log(`  Found ${features.results.length} features`);

    for (const feature of features.results) {
      const name = feature.properties.Features?.title?.[0]?.plain_text || 'Unknown';
      const currentModules = feature.properties.Modules?.relation || [];

      // Skip if already has modules assigned
      if (currentModules.length > 0) {
        console.log(`  ⏭️  ${name} (already has modules)`);
        continue;
      }

      try {
        await notion.pages.update({
          page_id: feature.id,
          properties: {
            'Modules': {
              relation: moduleIds.map(id => ({ id }))
            }
          }
        });
        console.log(`  ✅ ${name}`);
      } catch (error) {
        console.log(`  ❌ ${name}: ${error.message}`);
      }
    }
  }
}

async function updateSprintPhases() {
  console.log('\n\n=== UPDATING SPRINTS PHASES (Sprints 64-70) ===\n');

  for (let sprint = 64; sprint <= 70; sprint++) {
    const phases = SPRINT_PHASES[sprint];
    if (!phases) continue;

    console.log(`\nSprint ${sprint}: Setting phases [${phases.join(', ')}]`);

    // Find the sprint page - use contains since titles include descriptions like "Sprint 64 - Unified OS API Layer"
    const sprintPage = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { starts_with: `Sprint ${sprint}` } }
    });

    if (sprintPage.results.length === 0) {
      console.log(`  Sprint ${sprint} not found`);
      continue;
    }

    const page = sprintPage.results[0];
    const currentPhases = page.properties['Phases Updated']?.multi_select || [];

    // Skip if already has phases
    if (currentPhases.length > 0) {
      console.log(`  ⏭️  Already has phases: ${currentPhases.map(p => p.name).join(', ')}`);
      continue;
    }

    try {
      await notion.pages.update({
        page_id: page.id,
        properties: {
          'Phases Updated': {
            multi_select: phases.map(name => ({ name }))
          }
        }
      });
      console.log(`  ✅ Updated phases`);
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

async function main() {
  try {
    await updateModuleFeatures();
    await updateSprintPhases();
    console.log('\n\n=== COMPLETE ===');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
