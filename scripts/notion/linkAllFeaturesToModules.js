#!/usr/bin/env node
/**
 * Link ALL Features to Modules Intelligently
 * Fill the 55% empty Modules column
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Get all modules from the database
async function getAllModules() {
  const response = await notion.databases.query({
    database_id: dbIds.modules_db_id,
    page_size: 100
  });

  const modules = {};
  for (const module of response.results) {
    const moduleName = module.properties.Name?.title?.[0]?.text?.content ||
                      module.properties.Module?.title?.[0]?.text?.content ||
                      'Unknown';
    modules[moduleName] = module.id;
  }

  return modules;
}

// Intelligent module mapping based on feature names
function determineModules(featureName, availableModules) {
  const moduleIds = [];
  const name = featureName.toLowerCase();

  // Keyword to module mapping
  const mappings = [
    { keywords: ['outreach', 'email', 'message'], module: 'Outreach Generator' },
    { keywords: ['infra', 'devops', 'deployment', 'pipeline', 'docker'], module: 'Infra & DevOps' },
    { keywords: ['discovery', 'search', 'find'], module: 'Discovery Engine' },
    { keywords: ['enrichment', 'enrich', 'data'], module: 'Enrichment Engine' },
    { keywords: ['admin', 'console', 'dashboard'], module: 'Admin Console' },
    { keywords: ['agent', 'ai', 'cognitive', 'siva'], module: 'AI Agent Core' },
    { keywords: ['integration', 'api', 'webhook'], module: 'System Integration' },
    { keywords: ['explainability', 'transparency'], module: 'Explainability UI' },
    { keywords: ['lead', 'scoring', 'score', 'qualification'], module: 'Lead Scoring' },
    { keywords: ['multi-agent', 'collaboration', 'reflection'], module: 'Multi-Agent System' },
    { keywords: ['siva-mode', 'voice', 'prompt'], module: 'Siva-Mode Voice System' },
    { keywords: ['rule', 'engine', 'cognitive'], module: 'Cognitive Rule Engines' },
    { keywords: ['hub', 'orchestrat'], module: 'Agent Hub' },
    { keywords: ['documentation', 'deploy', 'doc'], module: 'Documentation & Deployment' },
    { keywords: ['feedback', 'learning', 'quality'], module: 'Feedback Loop' },
    { keywords: ['q-score', 'quality'], module: 'Q-Score System' },
    { keywords: ['opportunity', 'lifecycle', 'stage'], module: 'Opportunity Lifecycle' }
  ];

  // Match by keywords
  for (const mapping of mappings) {
    for (const keyword of mapping.keywords) {
      if (name.includes(keyword) && availableModules[mapping.module]) {
        if (!moduleIds.find(m => m.id === availableModules[mapping.module])) {
          moduleIds.push({ id: availableModules[mapping.module] });
        }
      }
    }
  }

  // Default to AI Agent Core if no match
  if (moduleIds.length === 0 && availableModules['AI Agent Core']) {
    moduleIds.push({ id: availableModules['AI Agent Core'] });
  }

  return moduleIds;
}

async function linkAllFeaturesToModules() {
  console.log('\n' + '='.repeat(80));
  console.log('LINKING ALL FEATURES TO MODULES');
  console.log('Filling the 55% empty Modules column');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all modules
    console.log('Fetching modules...');
    const modules = await getAllModules();
    console.log(`✅ Found ${Object.keys(modules).length} modules\n`);

    // Get all features
    console.log('Fetching all features...');
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      page_size: 100
    });

    console.log(`✅ Found ${featuresResponse.results.length} features\n`);
    console.log('Processing features...\n');

    let linked = 0;
    let alreadyLinked = 0;
    let errors = 0;

    for (const feature of featuresResponse.results) {
      try {
        const featureName = feature.properties.Features?.title?.[0]?.text?.content ||
                           feature.properties.Feature?.title?.[0]?.text?.content ||
                           'Unknown';

        // Check if already has modules
        const currentModules = feature.properties.Modules?.relation || [];
        if (currentModules.length > 0) {
          console.log(`⏭️  Already linked: ${featureName.substring(0, 50)}...`);
          alreadyLinked++;
          continue;
        }

        // Determine appropriate modules
        const moduleIds = determineModules(featureName, modules);

        if (moduleIds.length > 0) {
          await notion.pages.update({
            page_id: feature.id,
            properties: {
              'Modules': {
                relation: moduleIds
              }
            }
          });

          const moduleNames = moduleIds.map(m => {
            for (const [name, id] of Object.entries(modules)) {
              if (id === m.id) return name;
            }
            return 'Unknown';
          });

          console.log(`✅ Linked: ${featureName.substring(0, 50)}... → ${moduleNames.join(', ')}`);
          linked++;
        } else {
          console.log(`⚠️  No module match: ${featureName.substring(0, 50)}...`);
        }

      } catch (err) {
        console.error(`❌ Error: ${err.message}`);
        errors++;
      }

      // Rate limiting - pause every 10 requests
      if ((linked + alreadyLinked + errors) % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('MODULE LINKING COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total features: ${featuresResponse.results.length}`);
    console.log(`Newly linked: ${linked}`);
    console.log(`Already linked: ${alreadyLinked}`);
    console.log(`Errors: ${errors}`);
    console.log(`Success rate: ${(((linked + alreadyLinked) / featuresResponse.results.length) * 100).toFixed(1)}%\n`);

    if (linked > 0) {
      console.log('✅ ✅ ✅ MODULES COLUMN NOW FILLED ✅ ✅ ✅\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Body:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

if (!process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN not set');
  process.exit(1);
}

linkAllFeaturesToModules();
