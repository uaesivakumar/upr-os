#!/usr/bin/env node
/**
 * Inspect a Sprint 49 feature to see all available properties
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function inspectFeature() {
  try {
    const features = JSON.parse(readFileSync('./sprint-49-features.json', 'utf-8'));
    const firstFeatureId = features.features[0].id;
    
    console.log('🔍 Inspecting first Sprint 49 feature...\n');
    console.log(`Feature ID: ${firstFeatureId}\n`);
    
    const page = await notion.pages.retrieve({ page_id: firstFeatureId });
    
    console.log('📊 Available properties:\n');
    Object.keys(page.properties).forEach(key => {
      const prop = page.properties[key];
      console.log(`${key}:`);
      console.log(`  Type: ${prop.type}`);
      
      let value = 'N/A';
      if (prop.title?.[0]) value = prop.title[0].plain_text;
      else if (prop.rich_text?.[0]) value = prop.rich_text[0].plain_text;
      else if (prop.select) value = prop.select?.name || 'None';
      else if (prop.number !== null && prop.number !== undefined) value = prop.number;
      else if (prop.relation) value = `${prop.relation.length} relations`;
      else if (prop.multi_select) value = prop.multi_select.map(s => s.name).join(', ');
      
      console.log(`  Value: ${value}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

inspectFeature();
