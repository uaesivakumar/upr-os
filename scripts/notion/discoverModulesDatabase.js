#!/usr/bin/env node
/**
 * Discover the Modules Database ID
 */

import { Client } from '@notionhq/client';
import { readFileSync, writeFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function discoverModulesDatabase() {
  console.log('\n' + '='.repeat(80));
  console.log('DISCOVERING MODULES DATABASE');
  console.log('='.repeat(80) + '\n');

  try {
    // Get a feature that has a module relation
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      page_size: 5
    });

    console.log(`Checking ${featuresResponse.results.length} features for module relations...\n`);

    for (const feature of featuresResponse.results) {
      const featureName = feature.properties.Features?.title?.[0]?.text?.content || 'Unknown';

      if (feature.properties.Modules?.relation && feature.properties.Modules.relation.length > 0) {
        const moduleId = feature.properties.Modules.relation[0].id;
        console.log(`✅ Found feature with module relation: "${featureName}"`);
        console.log(`   Module ID: ${moduleId}\n`);

        // Fetch the module page
        const modulePage = await notion.pages.retrieve({ page_id: moduleId });
        console.log('Module page details:');
        console.log('   Page ID:', modulePage.id);
        console.log('   Parent type:', modulePage.parent.type);

        if (modulePage.parent.type === 'database_id') {
          const modulesDbId = modulePage.parent.database_id;
          console.log('   ✅ Parent Database ID:', modulesDbId);
          console.log();

          // Update .notion-db-ids.json
          dbIds.modules_db_id = modulesDbId;
          writeFileSync('./.notion-db-ids.json', JSON.stringify(dbIds, null, 2));

          console.log('✅ Updated .notion-db-ids.json with modules_db_id\n');

          // Now query the modules database to see what modules exist
          console.log('Querying modules database...\n');
          const modulesResponse = await notion.databases.query({
            database_id: modulesDbId,
            page_size: 100
          });

          console.log(`Found ${modulesResponse.results.length} modules:\n`);

          for (const module of modulesResponse.results) {
            const moduleName = module.properties.Name?.title?.[0]?.text?.content ||
                              module.properties.Module?.title?.[0]?.text?.content ||
                              module.properties.title?.title?.[0]?.text?.content ||
                              'Unknown';

            console.log(`  - ${moduleName} (${module.id})`);
          }

          console.log('\n✅ Modules database discovered and documented!\n');
          return;
        }

        break;
      }
    }

    console.log('⚠️  No features found with module relations\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Body:', JSON.stringify(error.body, null, 2));
    }
  }
}

if (!process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN not set');
  process.exit(1);
}

discoverModulesDatabase();
