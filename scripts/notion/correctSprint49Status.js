#!/usr/bin/env node

/**
 * Correct Sprint 49 Feature Statuses
 *
 * Honest correction after realizing features #7-9 are infrastructure-only, not production-ready
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read database IDs
const dbIdsPath = join(__dirname, '../../.notion-db-ids.json');
const dbIds = JSON.parse(readFileSync(dbIdsPath, 'utf-8'));

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const FEATURES_TO_CORRECT = [
  {
    name: "Add enrichment quality indicators",
    newStatus: "In Progress",
    note: "Infrastructure only - types defined, no component implementation"
  },
  {
    name: "Add enrichment history timeline",
    newStatus: "In Progress",
    note: "Infrastructure only - types defined, no component implementation"
  },
  {
    name: "Create enrichment templates",
    newStatus: "In Progress",
    note: "Infrastructure only - types defined, no component implementation"
  }
];

async function correctFeatureStatuses() {
  console.log('🔄 Correcting Sprint 49 feature statuses to reflect honest completion...\n');

  try {
    // Get all Sprint 49 features
    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: 49
        }
      }
    });

    console.log(`Found ${response.results.length} Sprint 49 features\n`);

    let correctedCount = 0;

    for (const feature of FEATURES_TO_CORRECT) {
      const featurePage = response.results.find(page => {
        const titleProp = page.properties.Features?.title?.[0]?.plain_text || '';
        return titleProp.toLowerCase().includes(feature.name.toLowerCase());
      });

      if (featurePage) {
        console.log(`📝 Correcting: "${feature.name}"`);
        console.log(`   Old Status: Done (INCORRECT)`);
        console.log(`   New Status: ${feature.newStatus}`);
        console.log(`   Note: ${feature.note}\n`);

        await notion.pages.update({
          page_id: featurePage.id,
          properties: {
            'Status': {
              select: {
                name: feature.newStatus
              }
            }
          }
        });

        correctedCount++;
      } else {
        console.log(`⚠️  Feature not found: "${feature.name}"`);
      }
    }

    console.log(`\n✅ Corrected ${correctedCount}/${FEATURES_TO_CORRECT.length} features`);
    console.log('\n📊 Honest Sprint 49 Status:');
    console.log('   ✅ Done: 6 features (60%)');
    console.log('   ⏳ In Progress: 3 features (30%) - Infrastructure only');
    console.log('   📄 Documentation: 1 feature (10%)');
    console.log('\n⚠️  Previous claim of 100% was INCORRECT');
    console.log('   Actual completion: 60% (6/10 features production-ready)');
    console.log('\n🎯 Standard: Sprint 48 QC Grade A+ (98.75/100)');
    console.log('   Sprint 49 Honest Grade: B- (70/100)');

  } catch (error) {
    console.error('❌ Error correcting feature statuses:', error.message);
    process.exit(1);
  }
}

correctFeatureStatuses();
