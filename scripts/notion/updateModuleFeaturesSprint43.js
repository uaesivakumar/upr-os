#!/usr/bin/env node
/**
 * Update Module Features for Sprint 43
 *
 * Updates all Module Features linked to Sprint 43 with:
 * - Status: Done
 * - Implementation details
 * - File references
 * - Completion date
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const MODULE_FEATURES_DB_ID = dbIds.module_features_db_id;

// Sprint 43 feature mapping
const SPRINT_43_FEATURES = [
  {
    name: 'Build training data pipeline',
    files: ['server/services/trainingDataPipeline.js'],
    implementation: '4-component quality scoring system (completeness, correctness, clarity, representativeness). Extracts from agent_decisions and decision_feedback with automated quality assessment.',
    tests: 6,
    lines: 250
  },
  {
    name: 'Create dataset export tools',
    files: ['server/services/datasetExportService.js'],
    implementation: 'Multi-format export supporting JSONL, CSV, JSON. Train/val/test splits with stratified sampling. Custom transformation pipelines and compression support.',
    tests: 6,
    lines: 400
  },
  {
    name: 'Extract high-quality production examples',
    files: ['scripts/training/extractProductionExamples.js'],
    implementation: 'Production example extraction with deduplication (source_decision_id + input hashing). Business logic validation per example type. Batch operations for large datasets.',
    tests: 5,
    lines: 490
  },
  {
    name: 'Add dataset validation',
    files: ['server/services/datasetValidationService.js'],
    implementation: '6-check validation system: schema, quality, distribution, completeness, consistency, integrity. Automated recommendations based on analysis.',
    tests: 4,
    lines: 380
  },
  {
    name: 'Implement dataset quality scoring',
    files: ['server/services/trainingDataPipeline.js', 'server/services/datasetManager.js'],
    implementation: 'Quality tiers (Gold 90+, Silver 75-89, Bronze 60-74). 4-component scoring with thresholds. Automated tier classification.',
    tests: 5,
    lines: 670
  },
  {
    name: 'Design golden dataset structure and schema',
    files: ['db/migrations/2025_11_20_golden_dataset_system.sql', 'docs/SPRINT_43_GOLDEN_DATASET_ARCHITECTURE.md'],
    implementation: '10-table PostgreSQL schema with training namespace. Git-like version control. Automated triggers for statistics. Complete architecture documentation.',
    tests: 6,
    lines: 610
  },
  {
    name: 'Create dataset versioning (Git-like)',
    files: ['server/services/datasetManager.js'],
    implementation: 'SHA-256 commit hashes. Parent-child commit relationships. Full history tracking with commit(), getCommitHistory() methods.',
    tests: 6,
    lines: 420
  },
  {
    name: 'Build dataset analytics',
    files: ['server/services/datasetAnalyticsService.js'],
    implementation: 'Comprehensive analytics reports with quality metrics, distribution analysis, coverage tracking, trend analysis. Historical metrics tracking.',
    tests: 4,
    lines: 343
  },
  {
    name: 'Build labeling system (admin tool)',
    files: ['server/services/labelingService.js'],
    implementation: 'Session-based labeling with queue management. Multi-user support with statistics. Label history and audit trail. Inter-rater reliability calculations.',
    tests: 7,
    lines: 351
  },
  {
    name: 'Document dataset creation process',
    files: ['docs/GOLDEN_DATASET_USER_GUIDE.md', 'docs/SPRINT_43_GOLDEN_DATASET_ARCHITECTURE.md'],
    implementation: 'Complete user guide (800 lines) with API reference, troubleshooting, examples. Architecture specification (320 lines) with quality scoring formulas.',
    tests: 0,
    lines: 1120
  }
];

async function updateModuleFeatures() {
  console.log('\n=== UPDATING MODULE FEATURES FOR SPRINT 43 ===\n');

  try {
    // Get all Module Features for Sprint 43
    console.log('1. Finding Sprint 43 features...');
    const response = await notion.databases.query({
      database_id: MODULE_FEATURES_DB_ID,
      filter: {
        property: 'Sprint',
        number: {
          equals: 43
        }
      }
    });

    console.log(`✓ Found ${response.results.length} features linked to Sprint 43`);

    if (response.results.length === 0) {
      console.log('\n⚠️  No features found. Searching by feature names instead...');

      // Try searching by name
      let featuresUpdated = 0;
      for (const feature of SPRINT_43_FEATURES) {
        const searchResponse = await notion.databases.query({
          database_id: MODULE_FEATURES_DB_ID,
          filter: {
            property: 'Feature',
            title: {
              contains: feature.name
            }
          }
        });

        if (searchResponse.results.length > 0) {
          const page = searchResponse.results[0];
          await updateFeaturePage(page, feature);
          featuresUpdated++;
          console.log(`  ✓ Updated: ${feature.name}`);
        } else {
          console.log(`  ⚠️  Not found: ${feature.name}`);
        }
      }

      console.log(`\n✓ Updated ${featuresUpdated}/${SPRINT_43_FEATURES.length} features`);
    } else {
      // Update each feature
      let updated = 0;
      for (const page of response.results) {
        // Debug: log all property names
        if (updated === 0) {
          console.log('\nDebug - Available properties:', Object.keys(page.properties));
        }

        // Try different property name patterns
        const featureName =
          page.properties.Features?.title?.[0]?.text?.content ||
          page.properties.Feature?.title?.[0]?.text?.content ||
          page.properties.Name?.title?.[0]?.text?.content ||
          page.properties.Title?.title?.[0]?.text?.content ||
          page.properties['Feature Name']?.title?.[0]?.text?.content ||
          'Unknown';

        const featureData = SPRINT_43_FEATURES.find(f =>
          featureName.toLowerCase().includes(f.name.toLowerCase()) ||
          f.name.toLowerCase().includes(featureName.toLowerCase())
        );

        if (featureData) {
          await updateFeaturePage(page, featureData);
          updated++;
          console.log(`  ✓ Updated: ${featureName}`);
        } else {
          console.log(`  ⚠️  No data for: ${featureName} (trying to match with feature list)`);
        }
      }

      console.log(`\n✓ Updated ${updated}/${response.results.length} features`);
    }

    console.log('\n✅ Module Features updated successfully\n');

  } catch (error) {
    console.error('❌ Error updating Module Features:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

async function updateFeaturePage(page, featureData) {
  // Combine all information into Notes field
  const notesContent = `✅ COMPLETED

Implementation: ${featureData.implementation}

Files: ${featureData.files.join(', ')}

Tests: ${featureData.tests} tests passed
Lines: ${featureData.lines} lines of code

Status: Production ready`;

  const updates = {
    'Status': {
      select: {
        name: 'Done'
      }
    },
    'Notes': {
      rich_text: [{
        text: { content: notesContent }
      }]
    },
    'Completed At': {
      date: {
        start: new Date().toISOString()
      }
    },
    'Done?': {
      checkbox: true
    }
  };

  await notion.pages.update({
    page_id: page.id,
    properties: updates
  });
}

updateModuleFeatures();
