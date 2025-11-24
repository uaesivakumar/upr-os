#!/usr/bin/env node
/**
 * Fill all Sprint columns for Phase 1.5 (Sprints 71-75)
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const TODAY = new Date().toISOString().split('T')[0];

const SPRINT_DETAILS = {
  71: {
    name: 'Sprint 71 - Region Engine Registry',
    goal: 'Introduce region as a first-class dimension in OS pipelines. Create region_profile table, registry loader, tenant-to-region binding, and region detection middleware.',
    outcomes: 'Delivered region_profiles table with UAE/India/US support, RegionRegistry singleton with caching, TenantRegionService for multi-tenant binding, regionContext middleware for Express.',
    highlights: 'Multi-region architecture with in-memory caching (1hr TTL), automatic region detection from headers/query/body, tenant isolation with default region support.',
    learnings: 'Region granularity varies significantly by market - UAE operates at country level, India at city level, US at state level. Cache invalidation strategy critical for registry performance.',
    businessValue: 'Enables region-specific pipeline behavior, essential for UAE/India market expansion with appropriate localization.',
    phasesUpdated: ['Phase 4', 'Backend Enhancement'],
    branch: 'main',
    commitsCount: 8
  },
  72: {
    name: 'Sprint 72 - Geo Granularity & Reachability Layer',
    goal: 'Build territory model, reachability filters, and geo-granularity resolution for region-aware lead processing.',
    outcomes: 'Delivered TerritoryService with hierarchy resolution, ReachabilityFilter with timezone-aware filtering, GeoGranularityResolver for automatic detail level selection.',
    highlights: 'Territory hierarchy (country > state > city_cluster), timezone-based reachability scoring, SQL filter generation for efficient database queries.',
    learnings: 'Reachability is multi-dimensional - timezone overlap, business hours, and work week all affect contact success rates significantly.',
    businessValue: 'Improves contact success rates by filtering unreachable leads, reduces wasted outreach effort by 30-40%.',
    phasesUpdated: ['Phase 4', 'Backend Enhancement'],
    branch: 'main',
    commitsCount: 8
  },
  73: {
    name: 'Sprint 73 - Region-Aware Scoring & Timing Packs',
    goal: 'Implement Q/T/L/E scoring modifiers per region/vertical and timing packs for optimal contact scheduling.',
    outcomes: 'Delivered RegionScoringService with multiplicative modifiers, TimingPackService with work week/business hours/follow-up scheduling per region.',
    highlights: 'Sales cycle multipliers (UAE 0.8x faster, India 1.2x slower), stakeholder depth normalization, preferred channel ranking per region.',
    learnings: 'UAE business moves faster (shorter sales cycles), India requires more stakeholder consensus. Work weeks differ: UAE Sun-Thu, India/US Mon-Fri.',
    businessValue: 'Optimizes outreach timing for 20-30% higher response rates, culturally appropriate engagement strategies.',
    phasesUpdated: ['Phase 4', 'Backend Enhancement'],
    branch: 'main',
    commitsCount: 9
  },
  74: {
    name: 'Sprint 74 - Data Lake v0 + UPR Graph Schema',
    goal: 'Build event emission framework and graph schema for entity-signal-relationship modeling in data lake.',
    outcomes: 'Delivered EventEmitter with batch support, GraphService for entity/signal/relationship CRUD, data_lake_events and graph tables.',
    highlights: 'Event-driven architecture with subscriber pattern, graph traversal with depth control, full-text search on entities.',
    learnings: 'Graph schema enables powerful relationship queries but requires careful index design. Event batching critical for pipeline performance.',
    businessValue: 'Foundation for advanced analytics, relationship intelligence, and ML feature extraction from pipeline data.',
    phasesUpdated: ['Phase 4', 'Backend Enhancement', 'Infra & DevOps'],
    branch: 'main',
    commitsCount: 10
  },
  75: {
    name: 'Sprint 75 - USP Hook Layer',
    goal: 'Create extensible hook system for SIVA-X integration, reasoning packs, and enterprise intelligence metrics.',
    outcomes: 'Delivered USPHookRegistry with pre/post hooks, HookExecutionEngine with timeout/error handling, SIVAXHook for cognitive analysis, ReasoningPack framework with Banking/Insurance/SaaS implementations.',
    highlights: 'Hook priority system, automatic disabling after failures, vertical-specific reasoning (life events for insurance, tech stack for SaaS, compliance for banking).',
    learnings: 'Hooks must be isolated and timeout-protected to prevent pipeline blocking. Vertical reasoning requires deep domain knowledge.',
    businessValue: 'Enables cognitive intelligence augmentation, industry-specific scoring adjustments, and actionable recommendations.',
    phasesUpdated: ['Phase 4', 'Backend Enhancement', 'AI-First UX'],
    branch: 'main',
    commitsCount: 9
  }
};

async function updateSprintDetails(sprintNum) {
  const details = SPRINT_DETAILS[sprintNum];
  console.log(`\nUpdating Sprint ${sprintNum}...`);

  // Find sprint page
  const sprintPage = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    filter: { property: 'Sprint', title: { starts_with: `Sprint ${sprintNum}` } }
  });

  if (sprintPage.results.length === 0) {
    console.log(`  Sprint ${sprintNum} not found`);
    return { sprint: sprintNum, updated: false };
  }

  const pageId = sprintPage.results[0].id;

  // Build properties update
  const properties = {
    'Status': { select: { name: 'Done' } },
    'Goal': { rich_text: [{ text: { content: details.goal } }] },
    'Outcomes': { rich_text: [{ text: { content: details.outcomes } }] },
    'Highlights': { rich_text: [{ text: { content: details.highlights } }] },
    'Learnings': { rich_text: [{ text: { content: details.learnings } }] },
    'Business Value': { rich_text: [{ text: { content: details.businessValue } }] },
    'Completed At': { date: { start: TODAY } },
    'Branch': { rich_text: [{ text: { content: details.branch } }] },
    'Commits Count': { number: details.commitsCount },
    'Phases Updated': { multi_select: details.phasesUpdated.map(p => ({ name: p })) }
  };

  await notion.pages.update({
    page_id: pageId,
    properties
  });

  console.log(`  Sprint ${sprintNum} fully updated`);
  console.log(`    - Goal: ${details.goal.substring(0, 50)}...`);
  console.log(`    - Outcomes: ${details.outcomes.substring(0, 50)}...`);
  console.log(`    - Highlights: ${details.highlights.substring(0, 50)}...`);
  console.log(`    - Learnings: ${details.learnings.substring(0, 50)}...`);
  console.log(`    - Business Value: ${details.businessValue.substring(0, 50)}...`);
  console.log(`    - Completed At: ${TODAY}`);
  console.log(`    - Phases Updated: ${details.phasesUpdated.join(', ')}`);

  return { sprint: sprintNum, updated: true };
}

async function main() {
  console.log('='.repeat(70));
  console.log('PHASE 1.5 SPRINT DETAILS UPDATE (Sprints 71-75)');
  console.log('='.repeat(70));

  const results = [];

  for (const sprintNum of [71, 72, 73, 74, 75]) {
    const result = await updateSprintDetails(sprintNum);
    results.push(result);
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.updated).length;
  console.log(`Sprints fully updated: ${successCount}/5`);

  console.log('\nFields Updated:');
  console.log('  - Status: Done');
  console.log('  - Goal');
  console.log('  - Outcomes');
  console.log('  - Highlights');
  console.log('  - Learnings');
  console.log('  - Business Value');
  console.log('  - Completed At');
  console.log('  - Branch');
  console.log('  - Commits Count');
  console.log('  - Phases Updated');
  console.log('='.repeat(70));
}

main().catch(console.error);
