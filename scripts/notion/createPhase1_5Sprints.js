#!/usr/bin/env node
/**
 * Phase 1.5 Sprint Setup (71-75)
 * Creates Sprints and Module Features in Notion for Region Engine & Data Lake
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Module IDs from Notion
const MODULES = {
  'Outreach Generator': '2a266151-dd16-811a-b560-e30f25d71022',
  'Infra & DevOps': '2a266151-dd16-8141-84ad-e20bae7c0815',
  'Discovery Engine': '2a266151-dd16-8144-a851-ebb29e824ed9',
  'Enrichment Engine': '2a266151-dd16-8146-9ea7-ee97ca4791b6',
  'Admin Console': '2a266151-dd16-8166-a864-eb985f974e8c',
  'AI Agent Core': '2a266151-dd16-816d-a2f0-c61639000cb7',
  'System Integration': '2ac66151-dd16-811d-b71b-f41fe6c21281',
  'Explainability UI': '2ac66151-dd16-8126-bd48-ffc5ae2f7e01',
  'Lead Scoring': '2ac66151-dd16-8136-b1fc-e40ffeeae3f8',
  'Multi-Agent System': '2ac66151-dd16-815d-8930-cd5b5049c8e9'
};

// Sprint 71-75 Definitions
const SPRINTS = [
  {
    number: 71,
    name: 'Sprint 71 - Region Engine Registry',
    goal: 'Introduce region as a first-class dimension in OS pipelines. Create region_profile table, registry loader, tenant-to-region binding, and region detection middleware.',
    phases: ['Phase 4', 'Backend Enhancement'],
    modules: ['System Integration', 'Infra & DevOps'],
    features: [
      {
        title: 'Create region_profile database table',
        description: 'Design and implement region_profile table with columns: region_id, region_code, country_code, granularity_level, timezone, currency, regulations JSON, active flag',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Implement Region Registry Loader',
        description: 'Build RegionRegistry service with loadRegions(), getRegionByCode(), getRegionsByCountry() methods. Cache in memory with 1hr TTL refresh.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 6
      },
      {
        title: 'Create Region Profile Schema types',
        description: 'Define TypeScript interfaces for RegionProfile including country/state/city_cluster rules, granularity settings, territory_model, and regulation constraints',
        priority: 'P1',
        complexity: 'Low',
        type: 'Backend Enhancement',
        hours: 3
      },
      {
        title: 'Build Tenant-to-Region Binding service',
        description: 'Implement TenantRegionService with bindTenantToRegion(), getTenantRegions(), setDefaultRegion(). Support multi-region tenants.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Create Region Detection Middleware',
        description: 'Build Express middleware that extracts region from request (header, query, tenant default). Attach to req.context for downstream use.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Seed initial region profiles (UAE, India, US)',
        description: 'Create seed data for 3 initial regions: UAE (country-level), India (city-level), US (state-level) with appropriate granularity configs',
        priority: 'P2',
        complexity: 'Low',
        type: 'Backend Enhancement',
        hours: 2
      },
      {
        title: 'Add region context to OS Pipeline',
        description: 'Modify OSPipeline class to accept region context, pass through all pipeline steps (Discovery, Enrichment, Scoring, Ranking, Outreach)',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Write Region Engine unit tests',
        description: 'Create comprehensive test suite for RegionRegistry, TenantRegionService, and middleware. Include edge cases for unknown regions.',
        priority: 'P2',
        complexity: 'Medium',
        type: 'Testing',
        hours: 4
      }
    ]
  },
  {
    number: 72,
    name: 'Sprint 72 - Geo Granularity & Reachability Layer',
    goal: 'Implement territory model (country/state/city_cluster), reachability filters, and territory resolution service for intelligent geo-based lead routing.',
    phases: ['Phase 4', 'Backend Enhancement'],
    modules: ['System Integration', 'Discovery Engine'],
    features: [
      {
        title: 'Design Territory Model schema',
        description: 'Create territory_definition table with hierarchy: country -> state -> city_cluster. Support flexible depth per region (UAE=1, India=3, US=2)',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Build Territory Resolution Service',
        description: 'Implement TerritoryService with resolveTerritory(location), getParentTerritory(), getChildTerritories(), matchTerritoryPattern()',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 8
      },
      {
        title: 'Create Reachability Filter Engine',
        description: 'Build ReachabilityFilter that determines if a lead is within sales reach based on territory, timezone offset, and coverage rules',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 6
      },
      {
        title: 'Implement Geo Granularity Resolver',
        description: 'Create GeoGranularityResolver that returns appropriate detail level: UAE->country, India->city, US->state based on region config',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Add territory data seeding scripts',
        description: 'Create seed scripts for UAE (all emirates), India (top 20 cities), US (all states). Include metro area clusters.',
        priority: 'P2',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Integrate reachability into Discovery step',
        description: 'Modify DiscoveryEngine to filter out unreachable leads early in pipeline based on tenant territory coverage',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Build Territory Coverage Admin UI',
        description: 'Create admin interface for viewing and managing territory coverage per tenant. Map visualization optional.',
        priority: 'P2',
        complexity: 'Medium',
        type: 'UI Enhancement',
        hours: 6
      },
      {
        title: 'Write Geo Granularity test suite',
        description: 'Comprehensive tests for territory resolution, reachability filtering, and edge cases (borderline locations, unknown territories)',
        priority: 'P2',
        complexity: 'Medium',
        type: 'Testing',
        hours: 4
      }
    ]
  },
  {
    number: 73,
    name: 'Sprint 73 - Region-Aware Scoring & Timing Packs',
    goal: 'Implement Q/T/L/E score modifiers per region, sales cycle multipliers, stakeholder depth normalization, and preferred channel configuration.',
    phases: ['Phase 12: Lead Scoring Engine', 'Backend Enhancement'],
    modules: ['Lead Scoring', 'AI Agent Core'],
    features: [
      {
        title: 'Create Region Score Modifier schema',
        description: 'Design region_score_modifiers table with q_modifier, t_modifier, l_modifier, e_modifier per region. Support vertical-specific overrides.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Implement RegionScoringService',
        description: 'Build service with applyRegionModifiers(scores, region), getSalesMultiplier(region), normalizeStakeholderDepth(depth, region)',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 8
      },
      {
        title: 'Add sales_cycle_multiplier configuration',
        description: 'Implement sales cycle multipliers: UAE (0.8x - faster), India (1.2x - longer), US (1.0x baseline). Store in region_profile.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 3
      },
      {
        title: 'Build Stakeholder Depth Normalizer',
        description: 'Create normalizer that adjusts stakeholder expectations: UAE (fewer, senior), India (many, hierarchical), US (mid-level empowered)',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Implement Preferred Channels per Region',
        description: 'Create region_channels config: UAE (WhatsApp/LinkedIn), India (Email/Phone), US (Email/LinkedIn). Use in Outreach step.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Create Timing Pack configurations',
        description: 'Build timing packs with optimal contact hours, days, and frequency per region. Consider work week (Sun-Thu UAE, Mon-Fri US/India)',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Integrate region scoring into Scoring step',
        description: 'Modify ScoringEngine to apply region modifiers after base score calculation. Log modifier impact for explainability.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Add region scoring to explainability output',
        description: 'Extend explainability panel to show region modifier breakdown: base_score, modifier, final_score with reasoning',
        priority: 'P2',
        complexity: 'Medium',
        type: 'UI Enhancement',
        hours: 4
      },
      {
        title: 'Write Region Scoring test suite',
        description: 'Tests for modifier application, sales cycle adjustments, channel selection, and timing pack generation',
        priority: 'P2',
        complexity: 'Medium',
        type: 'Testing',
        hours: 4
      }
    ]
  },
  {
    number: 74,
    name: 'Sprint 74 - Data Lake v0 + UPR Graph Schema',
    goal: 'Implement event emission framework, data lake storage, and UPR Graph schema for entities, signals, and relationships.',
    phases: ['Phase 6', 'Backend Enhancement'],
    modules: ['Infra & DevOps', 'System Integration'],
    features: [
      {
        title: 'Design Event Emission Framework',
        description: 'Create EventEmitter service with emit(event_type, payload), subscribe(event_type, handler), batch capability. Event types: lead_discovered, lead_enriched, lead_scored, lead_ranked, outreach_sent',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 8
      },
      {
        title: 'Create Data Lake schema and tables',
        description: 'Design data_lake_events table: event_id, event_type, entity_id, tenant_id, region_id, payload JSONB, created_at. Partitioned by date.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Implement Event Persistence Service',
        description: 'Build EventPersistenceService with persistEvent(), batchPersist(), queryEvents(filters). Support async write with retry.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 6
      },
      {
        title: 'Design UPR Graph Schema - Entities',
        description: 'Create graph_entities table: entity_id, entity_type (company/individual/hybrid), properties JSONB, region_id, tenant_id, version',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Design UPR Graph Schema - Signals',
        description: 'Create graph_signals table: signal_id, signal_type, source_entity_id, strength, decay_rate, captured_at, expires_at',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Design UPR Graph Schema - Relationships',
        description: 'Create graph_relationships table: rel_id, from_entity_id, to_entity_id, rel_type (works_at, reports_to, connected_to), strength, metadata',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 4
      },
      {
        title: 'Build Graph Query Service',
        description: 'Implement GraphQueryService with getEntity(), getRelatedEntities(), getSignals(), traverseGraph(depth). Support Cypher-like queries.',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 8
      },
      {
        title: 'Integrate event emission into OS Pipeline',
        description: 'Add event emission calls at each pipeline step. Include step timing, entity count, and key metrics in payload.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Create Data Lake Admin Dashboard',
        description: 'Build admin UI for viewing event streams, querying data lake, and monitoring event throughput. Include basic charts.',
        priority: 'P2',
        complexity: 'Medium',
        type: 'UI Enhancement',
        hours: 6
      },
      {
        title: 'Write Data Lake and Graph test suite',
        description: 'Comprehensive tests for event emission, persistence, graph queries, and data integrity across tenant boundaries',
        priority: 'P2',
        complexity: 'Medium',
        type: 'Testing',
        hours: 5
      }
    ]
  },
  {
    number: 75,
    name: 'Sprint 75 - USP Hook Layer',
    goal: 'Implement SIVA-X hooks, Reasoning Pack interface, and Enterprise Intelligence Metrics integration for differentiated intelligence.',
    phases: ['Phase 5', 'Backend Enhancement'],
    modules: ['AI Agent Core', 'Lead Scoring'],
    features: [
      {
        title: 'Design USP Hook Architecture',
        description: 'Create hook registration system with USPHookRegistry. Support pre/post hooks at each pipeline step. Define hook interface: execute(context, data) -> Promise<HookResult>',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 6
      },
      {
        title: 'Implement SIVA-X Hook Interface',
        description: 'Build SIVAXHook class that integrates cognitive intelligence at scoring step. Call SIVA reasoning for complex entity evaluation.',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 8
      },
      {
        title: 'Create Reasoning Pack Framework',
        description: 'Design ReasoningPack interface with analyze(entity, context), explain(), suggest(). Support pluggable packs for different verticals.',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 8
      },
      {
        title: 'Build Enterprise Intelligence Metrics Hook',
        description: 'Implement EnterpriseMetricsHook for capturing deal complexity, stakeholder mapping depth, competitive signals, and buying committee analysis',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 7
      },
      {
        title: 'Create Industry-Specific Reasoning Packs',
        description: 'Build reasoning packs for Banking (compliance signals), Insurance (life event detection), SaaS (tech stack analysis)',
        priority: 'P1',
        complexity: 'High',
        type: 'Backend Enhancement',
        hours: 8
      },
      {
        title: 'Implement Hook Execution Engine',
        description: 'Build HookExecutionEngine with executeHooks(step, context), handleHookFailure(hook, error), measureHookPerformance()',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Add Hook Configuration Admin UI',
        description: 'Create admin interface for enabling/disabling hooks, configuring hook parameters, and viewing hook execution logs',
        priority: 'P2',
        complexity: 'Medium',
        type: 'UI Enhancement',
        hours: 5
      },
      {
        title: 'Integrate hooks into OS Pipeline',
        description: 'Wire hook execution into each pipeline step. Support async hooks with timeout. Log hook impact for observability.',
        priority: 'P1',
        complexity: 'Medium',
        type: 'Backend Enhancement',
        hours: 5
      },
      {
        title: 'Write USP Hook test suite',
        description: 'Tests for hook registration, execution order, failure handling, reasoning pack outputs, and integration with SIVA-X',
        priority: 'P2',
        complexity: 'Medium',
        type: 'Testing',
        hours: 5
      }
    ]
  }
];

async function createSprint(sprint) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Creating ${sprint.name}...`);
  console.log('='.repeat(60));

  try {
    // Create Sprint entry
    const sprintPage = await notion.pages.create({
      parent: { database_id: dbIds.sprints_db_id },
      properties: {
        'Sprint': {
          title: [{ text: { content: sprint.name } }]
        },
        'Status': {
          select: { name: 'To-Do' }
        },
        'Goal': {
          rich_text: [{ text: { content: sprint.goal } }]
        },
        'Phases Updated': {
          multi_select: sprint.phases.map(p => ({ name: p }))
        }
      }
    });

    console.log(`  Sprint created: ${sprintPage.id}`);

    // Get module IDs
    const moduleIds = sprint.modules
      .map(m => MODULES[m])
      .filter(Boolean);

    // Create features
    console.log(`  Creating ${sprint.features.length} features...`);

    for (const feature of sprint.features) {
      try {
        await notion.pages.create({
          parent: { database_id: dbIds.module_features_db_id },
          properties: {
            'Features': {
              title: [{ text: { content: feature.title } }]
            },
            'Status': {
              select: { name: 'Not Started' }
            },
            'Priority': {
              select: { name: feature.priority }
            },
            'Complexity': {
              select: { name: feature.complexity }
            },
            'Sprint': {
              number: sprint.number
            },
            'ETA': {
              number: feature.hours
            },
            'Type': {
              select: { name: feature.type }
            },
            'Notes': {
              rich_text: [{ text: { content: feature.description } }]
            },
            'Modules': {
              relation: moduleIds.map(id => ({ id }))
            }
          }
        });
        console.log(`    + ${feature.title}`);
      } catch (err) {
        console.log(`    ! ${feature.title}: ${err.message}`);
      }
    }

    const totalHours = sprint.features.reduce((sum, f) => sum + f.hours, 0);
    console.log(`  Total ETA: ${totalHours} hours`);

    return true;
  } catch (error) {
    console.error(`  Error creating sprint: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('PHASE 1.5 SPRINT SETUP (71-75)');
  console.log('Region Engine, Geo Granularity, Data Lake, USP Hooks');
  console.log('='.repeat(60));

  let created = 0;
  for (const sprint of SPRINTS) {
    if (await createSprint(sprint)) {
      created++;
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Sprints created: ${created}/${SPRINTS.length}`);
  console.log(`Total features: ${SPRINTS.reduce((sum, s) => sum + s.features.length, 0)}`);
  console.log(`Total estimated hours: ${SPRINTS.reduce((sum, s) => sum + s.features.reduce((h, f) => h + f.hours, 0), 0)}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
