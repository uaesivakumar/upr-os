#!/usr/bin/env node
/**
 * Link Features to Modules - Fill the Modules Relation Field
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getModulesDatabase() {
  console.log('\n' + '='.repeat(80));
  console.log('FETCHING MODULES DATABASE');
  console.log('='.repeat(80) + '\n');

  try {
    // First, get the modules database ID from .notion-db-ids.json
    const modulesDbId = dbIds.modules_db_id;

    if (!modulesDbId) {
      console.log('⚠️  modules_db_id not found in .notion-db-ids.json');
      console.log('Attempting to discover it from a sample feature...\n');

      // Get a feature that has a module relation
      const sampleResponse = await notion.databases.query({
        database_id: dbIds.module_features_db_id,
        page_size: 1
      });

      if (sampleResponse.results.length > 0) {
        const sample = sampleResponse.results[0];
        console.log('Sample feature properties:', Object.keys(sample.properties));

        // Check if Modules relation exists
        if (sample.properties.Modules?.relation) {
          console.log('✅ Modules relation field exists');
          console.log('Modules relation:', sample.properties.Modules.relation);

          // If it has relations, we can get the database ID from the API response
          if (sample.properties.Modules.relation.length > 0) {
            console.log('Sample has module relations. Fetching one to identify the database...');
            const moduleId = sample.properties.Modules.relation[0].id;
            const modulePage = await notion.pages.retrieve({ page_id: moduleId });
            console.log('Module page retrieved successfully');
            return null; // We'll query differently
          }
        }
      }

      return null;
    }

    // Query modules database
    const response = await notion.databases.query({
      database_id: modulesDbId,
      page_size: 100
    });

    console.log(`Found ${response.results.length} modules\n`);

    const modules = {};
    for (const module of response.results) {
      const moduleName = module.properties.Name?.title?.[0]?.text?.content ||
                        module.properties.Module?.title?.[0]?.text?.content ||
                        'Unknown';

      modules[moduleName] = module.id;
      console.log(`  - ${moduleName}: ${module.id}`);
    }

    return modules;

  } catch (error) {
    console.error('Error fetching modules:', error.message);
    if (error.body) {
      console.error('Body:', JSON.stringify(error.body, null, 2));
    }
    return null;
  }
}

async function linkFeaturesToModules() {
  console.log('\n' + '='.repeat(80));
  console.log('LINKING FEATURES TO MODULES');
  console.log('='.repeat(80) + '\n');

  try {
    // Get modules database (if it exists)
    const modules = await getModulesDatabase();

    if (!modules) {
      console.log('\n⚠️  Modules database not configured or not found');
      console.log('Skipping module linking for now.\n');
      console.log('Note: The "Modules" field in Module Features appears to be a relation');
      console.log('to another Notion database that we need to identify.');
      console.log('\nTo fix this, we need:');
      console.log('1. The modules_db_id added to .notion-db-ids.json');
      console.log('2. Or manually inspect the Modules relation field in Notion UI\n');
      return;
    }

    // Module name mapping
    const moduleMap = {
      'Persona': 'Persona Extraction',
      'Cognitive': 'Cognitive Framework',
      'Hub': 'Agentic Hub',
      'Agent': 'Agent Core',
      'Infrastructure': 'Infrastructure',
      'Extraction': 'Data Extraction',
      'Encoding': 'Data Encoding',
      'Prompt': 'Prompt Engineering',
      'Quantitative': 'Quantitative Intelligence',
      'Opportunity': 'Opportunity Management',
      'Lead': 'Lead Scoring',
      'Outreach': 'Outreach Generation',
      'Explainability': 'Explainability',
      'Feedback': 'Feedback System',
      'Frontend': 'Frontend',
      'Dashboard': 'Analytics Dashboard',
      'API': 'API Layer',
      'Database': 'Database Layer',
      'Testing': 'Testing',
      'Documentation': 'Documentation',
      'Security': 'Security'
    };

    // Get all features
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      page_size: 100
    });

    console.log(`Processing ${featuresResponse.results.length} features...\n`);

    let linked = 0;
    let skipped = 0;

    for (const feature of featuresResponse.results) {
      try {
        const featureName = feature.properties.Features?.title?.[0]?.text?.content ||
                           feature.properties.Feature?.title?.[0]?.text?.content ||
                           'Unknown';

        // Check if already has modules
        if (feature.properties.Modules?.relation && feature.properties.Modules.relation.length > 0) {
          console.log(`⏭️  Skipped (already has module): ${featureName.substring(0, 60)}...`);
          skipped++;
          continue;
        }

        // Determine which module(s) this feature belongs to
        let moduleIds = [];
        for (const [keyword, moduleName] of Object.entries(moduleMap)) {
          if (featureName.toLowerCase().includes(keyword.toLowerCase()) && modules[moduleName]) {
            moduleIds.push({ id: modules[moduleName] });
          }
        }

        if (moduleIds.length === 0) {
          // Default to "Core System" or first available module
          const defaultModule = modules['Core System'] || modules[Object.keys(modules)[0]];
          if (defaultModule) {
            moduleIds.push({ id: defaultModule });
          }
        }

        if (moduleIds.length > 0) {
          await notion.pages.update({
            page_id: feature.id,
            properties: {
              'Modules': {
                relation: moduleIds
              }
            }
          });

          console.log(`✅ Linked: ${featureName.substring(0, 60)}... to ${moduleIds.length} module(s)`);
          linked++;
        } else {
          console.log(`⚠️  No module found for: ${featureName.substring(0, 60)}...`);
        }

      } catch (err) {
        console.error(`❌ Error linking feature: ${err.message}`);
      }

      // Rate limiting
      if ((linked + skipped) % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('MODULE LINKING COMPLETE');
    console.log('='.repeat(80));
    console.log(`Linked: ${linked}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total processed: ${linked + skipped}\n`);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error('Body:', JSON.stringify(error.body, null, 2));
    }
  }
}

if (!process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN not set');
  process.exit(1);
}

linkFeaturesToModules();
