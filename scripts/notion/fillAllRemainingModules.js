#!/usr/bin/env node
/**
 * Fill ALL Remaining Empty Modules - Complete Fix
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function fillAllRemainingModules() {
  console.log('\n' + '='.repeat(80));
  console.log('FILLING ALL REMAINING EMPTY MODULES');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all modules
    console.log('Fetching modules...');
    const modulesResponse = await notion.databases.query({
      database_id: dbIds.modules_db_id,
      page_size: 100
    });

    const modules = {};
    for (const module of modulesResponse.results) {
      const moduleName = module.properties.Name?.title?.[0]?.text?.content || 'Unknown';
      modules[moduleName] = module.id;
    }

    console.log(`✅ Found ${Object.keys(modules).length} modules\n`);

    // Get ALL features
    console.log('Fetching all features...');
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      page_size: 100
    });

    console.log(`✅ Found ${featuresResponse.results.length} features\n`);

    // Function to determine modules intelligently
    function getModulesForFeature(featureName) {
      const name = featureName.toLowerCase();
      const moduleIds = [];

      // Keyword to module mapping
      if (name.includes('discovery')) moduleIds.push(modules['Discovery Engine']);
      if (name.includes('agent') && !name.includes('multi')) moduleIds.push(modules['AI Agent Core']);
      if (name.includes('multi-agent') || name.includes('specialized') || name.includes('collaboration')) moduleIds.push(modules['Multi-Agent System']);
      if (name.includes('feedback') || name.includes('learning')) moduleIds.push(modules['Feedback Loop']);
      if (name.includes('quality') || name.includes('q-score')) moduleIds.push(modules['Q-Score System']);
      if (name.includes('dashboard') && name.includes('admin')) moduleIds.push(modules['Admin Console']);
      if (name.includes('dashboard') && !name.includes('admin')) moduleIds.push(modules['Admin Console']);
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

      // Remove duplicates and nulls
      const uniqueIds = [...new Set(moduleIds)].filter(id => id);

      // Default to AI Agent Core if no match
      if (uniqueIds.length === 0 && modules['AI Agent Core']) {
        uniqueIds.push(modules['AI Agent Core']);
      }

      return uniqueIds.map(id => ({ id }));
    }

    // Filter features with empty modules
    const emptyModuleFeatures = featuresResponse.results.filter(f => {
      const currentModules = f.properties.Modules?.relation || [];
      return currentModules.length === 0;
    });

    console.log(`Found ${emptyModuleFeatures.length} features with empty modules\n`);

    if (emptyModuleFeatures.length === 0) {
      console.log('✅ No features with empty modules found!\n');
      return;
    }

    console.log('Filling empty modules...\n');

    let updated = 0;
    let errors = 0;

    for (const feature of emptyModuleFeatures) {
      try {
        const featureName = feature.properties.Features?.title?.[0]?.text?.content ||
                           feature.properties.Feature?.title?.[0]?.text?.content ||
                           'Unknown';

        const moduleIds = getModulesForFeature(featureName);

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
            return '?';
          });

          console.log(`✅ ${featureName.substring(0, 50)}...`);
          console.log(`   → ${moduleNames.join(', ')}\n`);
          updated++;

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        }

      } catch (err) {
        console.error(`❌ Error: ${err.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total empty: ${emptyModuleFeatures.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Errors: ${errors}`);
    console.log(`Success rate: ${((updated / emptyModuleFeatures.length) * 100).toFixed(1)}%\n`);

    if (updated === emptyModuleFeatures.length) {
      console.log('✅ ✅ ✅ ALL MODULES COLUMN NOW 100% FILLED ✅ ✅ ✅\n');
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

fillAllRemainingModules();
