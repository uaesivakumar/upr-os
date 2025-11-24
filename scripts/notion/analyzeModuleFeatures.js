#!/usr/bin/env node
/**
 * Analyze Module Features Database - Find Empty Columns
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function analyzeDatabase() {
  console.log('\n' + '='.repeat(80));
  console.log('ANALYZING MODULE FEATURES DATABASE');
  console.log('='.repeat(80) + '\n');

  try {
    // Get ALL features
    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      page_size: 100
    });

    console.log(`Total features found: ${response.results.length}\n`);

    // Analyze first feature for schema
    if (response.results.length > 0) {
      const sample = response.results[0];
      console.log('Available Properties:');
      console.log('='.repeat(80));

      const props = sample.properties;
      for (const [key, value] of Object.entries(props)) {
        console.log(`- ${key}: ${value.type}`);
      }
      console.log('\n');

      // Check for empty columns
      console.log('Checking for empty columns across all features...\n');

      const emptyStats = {};
      for (const key of Object.keys(props)) {
        emptyStats[key] = 0;
      }

      for (const feature of response.results) {
        const featureName = feature.properties.Features?.title?.[0]?.text?.content ||
                           feature.properties.Feature?.title?.[0]?.text?.content ||
                           'Unknown';

        for (const [key, value] of Object.entries(feature.properties)) {
          let isEmpty = false;

          switch (value.type) {
            case 'title':
              isEmpty = !value.title || value.title.length === 0;
              break;
            case 'rich_text':
              isEmpty = !value.rich_text || value.rich_text.length === 0;
              break;
            case 'select':
              isEmpty = !value.select;
              break;
            case 'multi_select':
              isEmpty = !value.multi_select || value.multi_select.length === 0;
              break;
            case 'date':
              isEmpty = !value.date;
              break;
            case 'number':
              isEmpty = value.number === null || value.number === undefined;
              break;
            case 'relation':
              isEmpty = !value.relation || value.relation.length === 0;
              break;
            case 'people':
              isEmpty = !value.people || value.people.length === 0;
              break;
            case 'checkbox':
              isEmpty = false; // checkboxes default to false, not empty
              break;
            case 'rollup':
            case 'formula':
              isEmpty = false; // computed fields
              break;
          }

          if (isEmpty) {
            emptyStats[key]++;
          }
        }
      }

      console.log('Empty Column Statistics:');
      console.log('='.repeat(80));
      const sortedStats = Object.entries(emptyStats)
        .sort((a, b) => b[1] - a[1])
        .filter(([key, count]) => count > 0);

      for (const [key, count] of sortedStats) {
        const percentage = ((count / response.results.length) * 100).toFixed(1);
        console.log(`${key}: ${count}/${response.results.length} empty (${percentage}%)`);
      }

      console.log('\n');

      // Show some examples
      console.log('Sample Features with Status:');
      console.log('='.repeat(80));
      for (let i = 0; i < Math.min(10, response.results.length); i++) {
        const f = response.results[i];
        const name = f.properties.Features?.title?.[0]?.text?.content ||
                    f.properties.Feature?.title?.[0]?.text?.content ||
                    'Unknown';
        const status = f.properties.Status?.select?.name || 'No Status';
        const sprint = f.properties.Sprint?.number || 'No Sprint';
        const modules = f.properties.Modules?.relation?.length || 0;
        const notes = f.properties.Notes?.rich_text?.length || 0;
        const description = f.properties.Description?.rich_text?.length || 0;

        console.log(`${i+1}. ${name}`);
        console.log(`   Status: ${status} | Sprint: ${sprint} | Modules: ${modules} | Notes: ${notes > 0 ? 'Yes' : 'EMPTY'} | Description: ${description > 0 ? 'Yes' : 'EMPTY'}`);
      }
      console.log('\n');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error('Body:', JSON.stringify(error.body, null, 2));
    }
  }
}

analyzeDatabase();
