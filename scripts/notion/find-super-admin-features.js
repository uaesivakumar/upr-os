#!/usr/bin/env node
/**
 * find-super-admin-features.js - Find features that should be Super Admin
 */

import { Client } from '@notionhq/client';

const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

async function fetchAll(notion, dbId) {
  const all = [];
  let cursor = undefined;
  do {
    const response = await notion.databases.query({ database_id: dbId, start_cursor: cursor });
    all.push(...response.results);
    cursor = response.next_cursor || undefined;
  } while (cursor);
  return all;
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not set');
    process.exit(1);
  }

  const notion = new Client({ auth: token });
  const features = await fetchAll(notion, FEATURES_DB);

  console.log('Total features:', features.length);

  // Keywords that indicate Super Admin features
  const superAdminKeywords = [
    'super admin', 'superadmin', 'super-admin',
    'vertical config', 'verticalconfig', 'vertical-config',
    'admin panel', 'admin dashboard',
    'tenant', 'multi-tenant',
    'persona editor',
    'territory management',
    'vertical management', 'sub-vertical',
    'config editor', 'config dashboard'
  ];

  const potentialSuperAdmin = features.filter(f => {
    const title = (f.properties.Features?.title?.[0]?.plain_text || '').toLowerCase();
    const notes = (f.properties.Notes?.rich_text?.[0]?.plain_text || '').toLowerCase();
    const combined = title + ' ' + notes;

    return superAdminKeywords.some(kw => combined.includes(kw));
  });

  console.log('\nPotential Super Admin features found:', potentialSuperAdmin.length);
  console.log('\nMatched features:');
  potentialSuperAdmin.forEach(f => {
    const title = f.properties.Features?.title?.[0]?.plain_text || '';
    const currentRepo = f.properties.Repo?.select?.name || 'Not set';
    console.log('  [' + currentRepo + '] ' + title);
  });

  // Also look for features with keywords in title
  const additionalKeywords = ['vertical', 'persona', 'territory', 'config'];

  const additionalMatches = features.filter(f => {
    const title = (f.properties.Features?.title?.[0]?.plain_text || '').toLowerCase();
    const matched = additionalKeywords.some(kw => title.includes(kw));
    const alreadyFound = potentialSuperAdmin.some(p => p.id === f.id);
    return matched && !alreadyFound;
  });

  console.log('\n\nAdditional matches (by keywords in title):');
  additionalMatches.forEach(f => {
    const title = f.properties.Features?.title?.[0]?.plain_text || '';
    const currentRepo = f.properties.Repo?.select?.name || 'Not set';
    console.log('  [' + currentRepo + '] ' + title);
  });

  console.log('\n\nTotal potential Super Admin features:', potentialSuperAdmin.length + additionalMatches.length);
}

main().catch(console.error);
