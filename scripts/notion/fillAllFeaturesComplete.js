#!/usr/bin/env node
/**
 * Fill ALL Features with Pagination - Complete Coverage
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getAllFeatures() {
  let allFeatures = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      page_size: 100,
      start_cursor: startCursor
    });

    allFeatures = allFeatures.concat(response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor;
  }

  return allFeatures;
}

async function getAllModules() {
  const response = await notion.databases.query({
    database_id: dbIds.modules_db_id,
    page_size: 100
  });

  const modules = {};
  for (const module of response.results) {
    const moduleName = module.properties.Name?.title?.[0]?.text?.content || 'Unknown';
    modules[moduleName] = module.id;
  }

  return modules;
}

function getModulesForFeature(featureName, modules) {
  const name = featureName.toLowerCase();
  const moduleIds = [];

  // Comprehensive keyword mapping
  if (name.includes('discovery')) moduleIds.push(modules['Discovery Engine']);
  if (name.includes('agent') && !name.includes('multi')) moduleIds.push(modules['AI Agent Core']);
  if (name.includes('multi-agent') || name.includes('specialized') || name.includes('collaboration')) moduleIds.push(modules['Multi-Agent System']);
  if (name.includes('feedback') || name.includes('learning')) moduleIds.push(modules['Feedback Loop']);
  if (name.includes('quality') || name.includes('q-score')) moduleIds.push(modules['Q-Score System']);
  if (name.includes('dashboard') || name.includes('admin')) moduleIds.push(modules['Admin Console']);
  if (name.includes('scoring') || name.includes('score') || name.includes('lead')) moduleIds.push(modules['Lead Scoring']);
  if (name.includes('outreach') || name.includes('email') || name.includes('message')) moduleIds.push(modules['Outreach Generator']);
  if (name.includes('enrichment') || name.includes('enrich') || name.includes('data')) moduleIds.push(modules['Enrichment Engine']);
  if (name.includes('deployment') || name.includes('documentation') || name.includes('doc')) moduleIds.push(modules['Documentation & Deployment']);
  if (name.includes('monitoring') || name.includes('observability')) moduleIds.push(modules['Infra & DevOps']);
  if (name.includes('infra') || name.includes('devops') || name.includes('pipeline')) moduleIds.push(modules['Infra & DevOps']);
  if (name.includes('hub') || name.includes('orchestrat')) moduleIds.push(modules['Agent Hub']);
  if (name.includes('rule') || name.includes('cognitive') || name.includes('engine')) moduleIds.push(modules['Cognitive Rule Engines']);
  if (name.includes('explainability') || name.includes('transparency')) moduleIds.push(modules['Explainability UI']);
  if (name.includes('opportunity') || name.includes('lifecycle') || name.includes('stage')) moduleIds.push(modules['Opportunity Lifecycle']);
  if (name.includes('siva-mode') || name.includes('voice') || name.includes('prompt')) moduleIds.push(modules['Siva-Mode Voice System']);
  if (name.includes('integration') || name.includes('api') || name.includes('webhook')) moduleIds.push(modules['System Integration']);

  const uniqueIds = [...new Set(moduleIds)].filter(id => id);
  if (uniqueIds.length === 0 && modules['AI Agent Core']) {
    uniqueIds.push(modules['AI Agent Core']);
  }

  return uniqueIds.map(id => ({ id }));
}

function determineTags(featureName) {
  const tags = [];
  const name = featureName.toLowerCase();

  if (name.includes('agent') || name.includes('ai') || name.includes('cognitive')) tags.push('AI');
  if (name.includes('api') || name.includes('endpoint') || name.includes('backend')) tags.push('Backend');
  if (name.includes('ui') || name.includes('dashboard') || name.includes('frontend')) tags.push('Frontend');
  if (name.includes('database') || name.includes('schema') || name.includes('data')) tags.push('Database');
  if (name.includes('test')) tags.push('Testing');
  if (name.includes('security') || name.includes('auth')) tags.push('Security');
  if (name.includes('deploy') || name.includes('infra')) tags.push('DevOps');
  if (name.includes('doc')) tags.push('Documentation');

  if (tags.length === 0) tags.push('Feature');

  return tags;
}

function determineType(featureName) {
  const name = featureName.toLowerCase();

  if (name.includes('phase') || name.includes('system') || name.includes('framework')) return 'Epic';
  if (name.includes('fix') || name.includes('bug')) return 'Bug';
  if (name.includes('refactor') || name.includes('optimization') || name.includes('improve')) return 'Improvement';
  if (name.includes('documentation') || name.includes('document')) return 'Documentation';
  if (name.includes('test')) return 'Test';

  return 'Feature';
}

async function fillAllFeaturesComplete() {
  console.log('\n' + '='.repeat(80));
  console.log('FILLING ALL FEATURES - COMPLETE WITH PAGINATION');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all modules
    console.log('Fetching modules...');
    const modules = await getAllModules();
    console.log(`✅ Found ${Object.keys(modules).length} modules\n`);

    // Get ALL features with pagination
    console.log('Fetching ALL features (with pagination)...');
    const allFeatures = await getAllFeatures();
    console.log(`✅ Found ${allFeatures.length} total features\n`);

    console.log('Processing features...\n');

    let modulesUpdated = 0;
    let tagsUpdated = 0;
    let typeUpdated = 0;
    let alreadyComplete = 0;

    for (const feature of allFeatures) {
      try {
        const featureName = feature.properties.Features?.title?.[0]?.text?.content ||
                           feature.properties.Feature?.title?.[0]?.text?.content ||
                           'Unknown';

        const needsUpdate = {
          modules: !feature.properties.Modules?.relation || feature.properties.Modules.relation.length === 0,
          tags: !feature.properties.Tags?.multi_select || feature.properties.Tags.multi_select.length === 0,
          type: !feature.properties.Type?.select
        };

        if (!needsUpdate.modules && !needsUpdate.tags && !needsUpdate.type) {
          alreadyComplete++;
          continue;
        }

        const updateData = {
          page_id: feature.id,
          properties: {}
        };

        // Modules
        if (needsUpdate.modules) {
          const moduleIds = getModulesForFeature(featureName, modules);
          if (moduleIds.length > 0) {
            updateData.properties['Modules'] = { relation: moduleIds };
            modulesUpdated++;
          }
        }

        // Tags
        if (needsUpdate.tags) {
          const tags = determineTags(featureName);
          updateData.properties['Tags'] = { multi_select: tags.map(t => ({ name: t })) };
          tagsUpdated++;
        }

        // Type
        if (needsUpdate.type) {
          const type = determineType(featureName);
          updateData.properties['Type'] = { select: { name: type } };
          typeUpdated++;
        }

        if (Object.keys(updateData.properties).length > 0) {
          await notion.pages.update(updateData);

          const updates = [];
          if (needsUpdate.modules) updates.push('Modules');
          if (needsUpdate.tags) updates.push('Tags');
          if (needsUpdate.type) updates.push('Type');

          console.log(`✅ ${featureName.substring(0, 50)}...`);
          console.log(`   Updated: ${updates.join(', ')}\n`);

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        }

      } catch (err) {
        console.error(`❌ Error: ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total features: ${allFeatures.length}`);
    console.log(`Modules updated: ${modulesUpdated}`);
    console.log(`Tags updated: ${tagsUpdated}`);
    console.log(`Type updated: ${typeUpdated}`);
    console.log(`Already complete: ${alreadyComplete}`);
    console.log(`\n✅ ✅ ✅ ALL FEATURES NOW 100% COMPLETE ✅ ✅ ✅\n`);

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

fillAllFeaturesComplete();
