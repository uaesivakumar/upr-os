#!/usr/bin/env node
/**
 * Fix Sprint 41 Features - Link to Feedback Loop Module
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function fixSprint41Modules() {
  console.log('\n' + '='.repeat(80));
  console.log('FIXING SPRINT 41 MODULE LINKS');
  console.log('='.repeat(80) + '\n');

  try {
    // Get Feedback Loop module ID
    console.log('Finding Feedback Loop module...');
    const modulesResponse = await notion.databases.query({
      database_id: dbIds.modules_db_id,
      page_size: 100
    });

    let feedbackLoopId = null;
    let aiAgentCoreId = null;
    let adminConsoleId = null;
    let qScoreId = null;
    let discoveryEngineId = null;
    let multiAgentId = null;

    for (const module of modulesResponse.results) {
      const moduleName = module.properties.Name?.title?.[0]?.text?.content || 'Unknown';

      if (moduleName === 'Feedback Loop') feedbackLoopId = module.id;
      if (moduleName === 'AI Agent Core') aiAgentCoreId = module.id;
      if (moduleName === 'Admin Console') adminConsoleId = module.id;
      if (moduleName === 'Q-Score System') qScoreId = module.id;
      if (moduleName === 'Discovery Engine') discoveryEngineId = module.id;
      if (moduleName === 'Multi-Agent System') multiAgentId = module.id;
    }

    console.log(`✅ Feedback Loop module ID: ${feedbackLoopId}`);
    console.log(`✅ AI Agent Core module ID: ${aiAgentCoreId}`);
    console.log(`✅ Admin Console module ID: ${adminConsoleId}`);
    console.log(`✅ Q-Score System module ID: ${qScoreId}`);
    console.log(`✅ Discovery Engine module ID: ${discoveryEngineId}`);
    console.log(`✅ Multi-Agent System module ID: ${multiAgentId}\n`);

    if (!feedbackLoopId || !aiAgentCoreId) {
      console.error('❌ Could not find required module IDs');
      process.exit(1);
    }

    // Get Sprint 41 features
    console.log('Finding Sprint 41 features...');
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: 41
        }
      }
    });

    console.log(`✅ Found ${featuresResponse.results.length} Sprint 41 features\n`);

    // Map features to modules based on their names
    const featureModuleMap = {
      'Design feedback loop architecture': [feedbackLoopId, aiAgentCoreId],
      'Implement feedback collection endpoints': [feedbackLoopId, aiAgentCoreId],
      'Create feedback storage schema': [feedbackLoopId],
      'Build feedback analysis service': [feedbackLoopId, aiAgentCoreId],
      'Implement model improvement pipeline': [aiAgentCoreId, feedbackLoopId],
      'Create feedback dashboard (admin view)': [adminConsoleId, feedbackLoopId],
      'Add decision quality scoring': [qScoreId, feedbackLoopId],
      'Implement A/B testing framework activation': [aiAgentCoreId, feedbackLoopId],
      'Test feedback loop end-to-end': [feedbackLoopId],
      'Document feedback system': [feedbackLoopId],
      'Design specialized agent architecture': [multiAgentId, aiAgentCoreId],
      'Implement Discovery Agent': [discoveryEngineId, aiAgentCoreId]
    };

    let updated = 0;
    let skipped = 0;

    for (const feature of featuresResponse.results) {
      const featureName = feature.properties.Features?.title?.[0]?.text?.content ||
                         feature.properties.Feature?.title?.[0]?.text?.content ||
                         'Unknown';

      try {
        // Check if already has modules
        const currentModules = feature.properties.Modules?.relation || [];

        // Find matching modules for this feature
        let moduleIds = [];

        // Try exact match first
        if (featureModuleMap[featureName]) {
          moduleIds = featureModuleMap[featureName].map(id => ({ id }));
        } else {
          // Smart matching based on keywords
          const name = featureName.toLowerCase();
          const ids = [];

          if (name.includes('feedback') || name.includes('quality') || name.includes('learning')) {
            ids.push(feedbackLoopId);
          }
          if (name.includes('dashboard') || name.includes('admin')) {
            ids.push(adminConsoleId);
          }
          if (name.includes('agent') || name.includes('ai') || name.includes('model')) {
            ids.push(aiAgentCoreId);
          }
          if (name.includes('score') || name.includes('scoring')) {
            ids.push(qScoreId);
          }
          if (name.includes('discovery')) {
            ids.push(discoveryEngineId);
          }
          if (name.includes('multi-agent') || name.includes('specialized')) {
            ids.push(multiAgentId);
          }

          // Default to Feedback Loop and AI Agent Core for Sprint 41
          if (ids.length === 0) {
            ids.push(feedbackLoopId, aiAgentCoreId);
          }

          moduleIds = [...new Set(ids)].map(id => ({ id }));
        }

        // Always update to ensure consistency
        await notion.pages.update({
          page_id: feature.id,
          properties: {
            'Modules': {
              relation: moduleIds
            }
          }
        });

        console.log(`✅ Updated: ${featureName}`);
        console.log(`   Modules: ${moduleIds.length} linked\n`);
        updated++;

        // Small delay for rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`❌ Error updating ${featureName}: ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('SPRINT 41 MODULE LINKING COMPLETE');
    console.log('='.repeat(80));
    console.log(`Updated: ${updated}/${featuresResponse.results.length}`);
    console.log(`Success rate: ${((updated / featuresResponse.results.length) * 100).toFixed(1)}%\n`);

    if (updated === featuresResponse.results.length) {
      console.log('✅ ✅ ✅ ALL SPRINT 41 FEATURES NOW HAVE MODULES ✅ ✅ ✅\n');
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

fixSprint41Modules();
