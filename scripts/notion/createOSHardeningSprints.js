#!/usr/bin/env node
/**
 * Create UPR OS Hardening Sprints 64-70 in Notion
 * This script creates both sprints and their features
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Sprint definitions with their features
const sprintDefinitions = [
  {
    sprint: 64,
    name: "Sprint 64 - Unified OS API Layer",
    goal: "Create unified /api/os/* endpoints. Combine all intelligence into one standard OS interface.",
    businessValue: "UPR OS becomes a true operating system usable by external apps, partners, and API marketplace.",
    features: [
      { name: "Create OS Facade Layer - /api/os/discovery", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create OS Facade Layer - /api/os/enrich", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create OS Facade Layer - /api/os/score", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create OS Facade Layer - /api/os/rank", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create OS Facade Layer - /api/os/outreach", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create OS Pipeline Endpoint - /api/os/pipeline", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create shared OS response schema", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Remove UI-dependence from functional code", priority: "High", complexity: "Medium", type: "Tech Debt" },
      { name: "OS API Integration Tests", priority: "High", complexity: "Medium", type: "Testing" }
    ]
  },
  {
    sprint: 65,
    name: "Sprint 65 - Multi-Tenant Isolation Layer",
    goal: "Eliminate 35/100 score. Fix tenant risks permanently with enterprise-grade isolation.",
    businessValue: "Enterprise-ready isolation. Zero data leakage. Bank-grade safety.",
    features: [
      { name: "Create Tenant Context Middleware", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Fix admin routes tenant filtering", priority: "Critical", complexity: "Medium", type: "Bug Fix" },
      { name: "Fix analytics routes tenant filtering", priority: "Critical", complexity: "Medium", type: "Bug Fix" },
      { name: "Fix enrichment routes tenant filtering", priority: "Critical", complexity: "Medium", type: "Bug Fix" },
      { name: "Fix export routes tenant filtering", priority: "Critical", complexity: "Medium", type: "Bug Fix" },
      { name: "Fix report routes tenant filtering", priority: "Critical", complexity: "Medium", type: "Bug Fix" },
      { name: "Enforce RLS on ALL database tables", priority: "Critical", complexity: "High", type: "Infra" },
      { name: "Create Tenant-Safe ORM layer", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Implement cross-tenant query rejection", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Add tenant violation logging", priority: "High", complexity: "Low", type: "Feature" },
      { name: "Multi-tenant isolation test suite (50 tests)", priority: "High", complexity: "High", type: "Testing" }
    ]
  },
  {
    sprint: 66,
    name: "Sprint 66 - Dedicated Ranking Engine",
    goal: "Replace implicit ranking with industry-aware, explainable ranking system.",
    businessValue: "Ranking becomes a science, not a coincidence. Full explainability for enterprise clients.",
    features: [
      { name: "Create Ranking Microservice - POST /api/os/rank", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create banking_employee ranking profile", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create banking_corporate ranking profile", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create insurance_individual ranking profile", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create recruitment_hiring ranking profile", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create saas_b2b ranking profile", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Implement configurable weight overrides", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Implement ranking explainability (why #1, why not #2)", priority: "High", complexity: "High", type: "Feature" },
      { name: "Ranking Engine unit and integration tests", priority: "High", complexity: "Medium", type: "Testing" }
    ]
  },
  {
    sprint: 67,
    name: "Sprint 67 - OS Settings Unification Layer",
    goal: "Centralize all hardcoded values into configurable settings tables.",
    businessValue: "OS becomes configurable, not brittle. Verticals become plug-and-play.",
    features: [
      { name: "Create os_settings database table", priority: "Critical", complexity: "Medium", type: "Feature" },
      { name: "Create scoring_settings database table", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create discovery_settings database table", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create outreach_settings database table", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create vertical_settings database table", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create persona_settings database table", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Migrate hardcoded scoring weights to settings", priority: "High", complexity: "High", type: "Tech Debt" },
      { name: "Migrate hardcoded enrichment priorities to settings", priority: "High", complexity: "Medium", type: "Tech Debt" },
      { name: "Migrate hardcoded signal thresholds to settings", priority: "High", complexity: "Medium", type: "Tech Debt" },
      { name: "Create Settings API - GET/POST /api/os/settings", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Settings management test suite", priority: "Medium", complexity: "Medium", type: "Testing" }
    ]
  },
  {
    sprint: 68,
    name: "Sprint 68 - Entity Abstraction Layer",
    goal: "Prepare OS for multi-vertical future (company + individual + hybrid entities).",
    businessValue: "UPR OS becomes universal engine for ANY industry including Insurance, Real Estate, Healthcare.",
    features: [
      { name: "Create Generic Lead Schema (company|individual|hybrid)", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create entity_core database table", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Refactor entity_company from current model", priority: "High", complexity: "High", type: "Tech Debt" },
      { name: "Create entity_person abstraction", priority: "High", complexity: "High", type: "Feature" },
      { name: "Refactor signals to apply to both company AND person", priority: "High", complexity: "High", type: "Tech Debt" },
      { name: "Implement scoring for individual entities", priority: "High", complexity: "High", type: "Feature" },
      { name: "Implement enrichment for individual entities", priority: "High", complexity: "High", type: "Feature" },
      { name: "Create OS entity-resolution for individuals", priority: "High", complexity: "High", type: "Feature" },
      { name: "Entity abstraction integration tests", priority: "High", complexity: "Medium", type: "Testing" }
    ]
  },
  {
    sprint: 69,
    name: "Sprint 69 - Orchestration Hardening + Fail-Safe",
    goal: "Make pipelines stable under all failure scenarios with graceful degradation.",
    businessValue: "OS behaves like mature enterprise engine. Never fails catastrophically.",
    features: [
      { name: "Add orchestration loop detection", priority: "Critical", complexity: "Medium", type: "Feature" },
      { name: "Add orchestration timeouts", priority: "Critical", complexity: "Medium", type: "Feature" },
      { name: "Add circuit breakers to pipeline", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Implement retry queues", priority: "High", complexity: "High", type: "Feature" },
      { name: "Implement partial-failure recovery", priority: "High", complexity: "High", type: "Feature" },
      { name: "Build Degraded Mode (skip failed steps)", priority: "High", complexity: "High", type: "Feature" },
      { name: "Build Pipeline Transaction Logs", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Build pipeline-level monitoring metrics", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Build SIVA CPU/latency monitoring hooks", priority: "Medium", complexity: "Medium", type: "Feature" },
      { name: "Orchestration resilience test suite", priority: "High", complexity: "High", type: "Testing" }
    ]
  },
  {
    sprint: 70,
    name: "Sprint 70 - Vertical Engine Shell",
    goal: "Make future verticals load dynamically. Final OS component for multi-vertical readiness.",
    businessValue: "UPR OS becomes multi-vertical-ready without rewriting code. Ready for SaaS phase.",
    features: [
      { name: "Create Vertical Registry database table", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Implement Vertical Loader service", priority: "Critical", complexity: "High", type: "Feature" },
      { name: "Create banking_vertical.json profile", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create insurance_vertical.json profile", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create recruitment_vertical.json profile", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Implement vertical scoring overrides", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Implement vertical outreach tone settings", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Implement vertical discovery source config", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Implement vertical daily plan logic", priority: "High", complexity: "Medium", type: "Feature" },
      { name: "Create Vertical Simulator for demos", priority: "Medium", complexity: "High", type: "Feature" },
      { name: "Vertical Engine integration tests", priority: "High", complexity: "Medium", type: "Testing" }
    ]
  }
];

async function createSprint(sprintDef) {
  console.log(`\nCreating ${sprintDef.name}...`);

  try {
    // Create the sprint in Sprints database
    const sprintPage = await notion.pages.create({
      parent: { database_id: dbIds.sprints_db_id },
      properties: {
        "Sprint": {
          title: [{ text: { content: sprintDef.name } }]
        },
        "Status": {
          select: { name: "Planned" }
        },
        "Goal": {
          rich_text: [{ text: { content: sprintDef.goal } }]
        },
        "Business Value": {
          rich_text: [{ text: { content: sprintDef.businessValue } }]
        }
      }
    });
    console.log(`  ✓ Sprint created: ${sprintDef.name}`);
    return sprintPage.id;
  } catch (error) {
    console.error(`  ✗ Failed to create sprint: ${error.message}`);
    return null;
  }
}

async function createFeature(sprintNum, feature) {
  try {
    await notion.pages.create({
      parent: { database_id: dbIds.module_features_db_id },
      properties: {
        "Features": {
          title: [{ text: { content: feature.name } }]
        },
        "Sprint": {
          number: sprintNum
        },
        "Status": {
          select: { name: "Not Started" }
        },
        "Priority": {
          select: { name: feature.priority }
        },
        "Complexity": {
          select: { name: feature.complexity }
        },
        "Type": {
          select: { name: feature.type }
        }
      }
    });
    console.log(`    ✓ ${feature.name}`);
    return true;
  } catch (error) {
    console.error(`    ✗ Failed: ${feature.name} - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('UPR OS HARDENING - Creating Sprints 64-70 in Notion');
  console.log('='.repeat(60));

  let totalFeatures = 0;
  let createdFeatures = 0;

  for (const sprintDef of sprintDefinitions) {
    // Create sprint
    await createSprint(sprintDef);

    // Create features for this sprint
    console.log(`  Creating ${sprintDef.features.length} features...`);
    for (const feature of sprintDef.features) {
      totalFeatures++;
      const success = await createFeature(sprintDef.sprint, feature);
      if (success) createdFeatures++;

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Sprints created: 7 (64-70)`);
  console.log(`Features created: ${createdFeatures}/${totalFeatures}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
