#!/usr/bin/env node
/**
 * UPR 2030 Sprint Restructure Script
 *
 * This script updates Notion with the rewritten sprint roadmap (54-63)
 * Based on the 6 architecture reports as truth sources.
 *
 * Actions:
 * 1. Updates Sprint 54-63 goals
 * 2. Adds features to each sprint
 * 3. Logs all changes
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Load database IDs
const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const sprintsDbId = dbIds.sprints_db_id;
const featuresDbId = dbIds.module_features_db_id;

// New Sprint Definitions (UPR 2030)
const SPRINTS = [
  {
    number: 54,
    name: 'Sprint 54',
    goal: 'Chat OS Enhancement - Harden Chat Gateway as master interface',
    features: [
      { name: 'Command Palette (Cmd+K)', priority: 'High', module: 'Chat' },
      { name: 'Inline Copilot Suggestions', priority: 'High', module: 'Chat' },
      { name: 'Proactive Alert System', priority: 'High', module: 'Chat' },
      { name: 'Smart Form Auto-Fill', priority: 'Medium', module: 'Chat' },
      { name: 'Stream Reconnection Logic', priority: 'High', module: 'Chat' },
      { name: 'Offline Message Queue', priority: 'Medium', module: 'Chat' },
      { name: 'Connect SIVA Page to Real SSE', priority: 'High', module: 'SIVA' },
      { name: 'Register 7 More SIVA Tools in Chat', priority: 'High', module: 'Chat' },
    ],
  },
  {
    number: 55,
    name: 'Sprint 55',
    goal: 'Predictive Intelligence Engine - AI predictions and risk scoring',
    features: [
      { name: 'Time-Series Forecasting Service', priority: 'High', module: 'Analytics' },
      { name: 'Lead Risk Scoring', priority: 'High', module: 'SIVA' },
      { name: 'AI Explanation Panel', priority: 'High', module: 'UI' },
      { name: 'Anomaly Detection Alerts', priority: 'Medium', module: 'Analytics' },
      { name: 'Trend Visualization Component', priority: 'Medium', module: 'UI' },
      { name: 'Prediction API Integration with Chat', priority: 'High', module: 'Chat' },
    ],
  },
  {
    number: 56,
    name: 'Sprint 56',
    goal: 'Knowledge Graph Intelligence UI - Neo4j visualization and agent config',
    features: [
      { name: 'Knowledge Graph Explorer Page', priority: 'High', module: 'UI' },
      { name: 'Similar Companies Feature', priority: 'High', module: 'Knowledge Graph' },
      { name: 'Relationship Insights Panel', priority: 'Medium', module: 'UI' },
      { name: 'Neo4j API Integration', priority: 'High', module: 'Backend' },
      { name: 'Agent Configuration UI', priority: 'Medium', module: 'SIVA' },
      { name: 'Tool Registry Dashboard', priority: 'Medium', module: 'SIVA' },
      { name: 'Graph-Based Lead Discovery', priority: 'Low', module: 'Knowledge Graph' },
      { name: 'Knowledge Graph Chat Integration', priority: 'High', module: 'Chat' },
    ],
  },
  {
    number: 57,
    name: 'Sprint 57',
    goal: 'Advanced Filter + Query Builder - Visual filter builder for complex queries',
    features: [
      { name: 'Visual Filter Builder Component', priority: 'High', module: 'UI' },
      { name: 'Saved Searches/Filters', priority: 'High', module: 'Leads' },
      { name: 'Boolean Query Support', priority: 'Medium', module: 'Backend' },
      { name: 'Smart Filter Suggestions', priority: 'Medium', module: 'UI' },
      { name: 'Filter Presets', priority: 'Low', module: 'UI' },
      { name: 'Export Filtered Results', priority: 'Medium', module: 'Leads' },
      { name: 'Filter Chat Integration', priority: 'High', module: 'Chat' },
    ],
  },
  {
    number: 58,
    name: 'Sprint 58',
    goal: 'Workflow Builder (Automation Layer) - No-code workflow automation',
    features: [
      { name: 'Workflow Builder UI', priority: 'High', module: 'Automation' },
      { name: 'Trigger Types', priority: 'High', module: 'Automation' },
      { name: 'Action Types', priority: 'High', module: 'Automation' },
      { name: 'Condition Types', priority: 'Medium', module: 'Automation' },
      { name: 'Scheduled Workflows', priority: 'High', module: 'Automation' },
      { name: 'Workflow Execution History', priority: 'Medium', module: 'Automation' },
      { name: 'Workflow Chat Integration', priority: 'High', module: 'Chat' },
    ],
  },
  {
    number: 59,
    name: 'Sprint 59',
    goal: 'Collaboration + RBAC - Multi-user support with access control',
    features: [
      { name: 'Team Workspaces', priority: 'High', module: 'Core' },
      { name: 'Role-Based Access Control', priority: 'High', module: 'Core' },
      { name: 'Lead Assignment', priority: 'High', module: 'Leads' },
      { name: 'Activity Audit Log', priority: 'Medium', module: 'Core' },
      { name: 'Notification System', priority: 'High', module: 'Core' },
      { name: 'Commenting on Leads', priority: 'Medium', module: 'Leads' },
      { name: 'Shared Templates', priority: 'Medium', module: 'Templates' },
      { name: 'Collaboration Chat Integration', priority: 'High', module: 'Chat' },
    ],
  },
  {
    number: 60,
    name: 'Sprint 60',
    goal: 'Custom Report Designer - User-configurable reports and dashboards',
    features: [
      { name: 'Report Designer UI', priority: 'High', module: 'Analytics' },
      { name: 'Pivot Table Component', priority: 'High', module: 'Analytics' },
      { name: 'Scheduled Reports', priority: 'Medium', module: 'Analytics' },
      { name: 'Report Templates', priority: 'Medium', module: 'Analytics' },
      { name: 'Dashboard Sharing', priority: 'Medium', module: 'Analytics' },
      { name: 'Custom Metrics/KPIs', priority: 'Low', module: 'Analytics' },
      { name: 'Report Chat Integration', priority: 'High', module: 'Chat' },
    ],
  },
  {
    number: 61,
    name: 'Sprint 61',
    goal: 'Mobile + PWA (Offline Mode) - Full mobile experience with offline capability',
    features: [
      { name: 'PWA Service Worker', priority: 'High', module: 'Core' },
      { name: 'Offline Data Sync', priority: 'High', module: 'Core' },
      { name: 'Mobile Navigation', priority: 'High', module: 'UI' },
      { name: 'Touch-Optimized Components', priority: 'Medium', module: 'UI' },
      { name: 'Mobile Chat Experience', priority: 'High', module: 'Chat' },
      { name: 'Offline Chat Queue', priority: 'Medium', module: 'Chat' },
    ],
  },
  {
    number: 62,
    name: 'Sprint 62',
    goal: 'i18n + RTL Support - Arabic language and RTL layout for UAE market',
    features: [
      { name: 'i18n Framework Setup', priority: 'High', module: 'Core' },
      { name: 'English Strings Extraction', priority: 'High', module: 'Core' },
      { name: 'Arabic Translation', priority: 'High', module: 'Core' },
      { name: 'RTL Layout Support', priority: 'High', module: 'UI' },
      { name: 'RTL Chat Interface', priority: 'High', module: 'Chat' },
      { name: 'Localized Date/Time/Numbers', priority: 'Medium', module: 'Core' },
      { name: 'Localized Email Templates', priority: 'Medium', module: 'Templates' },
      { name: 'AI Responses in Arabic', priority: 'High', module: 'Chat' },
    ],
  },
  {
    number: 63,
    name: 'Sprint 63',
    goal: 'Integration Testing + Stability - Production-ready QA and security',
    features: [
      { name: 'Chat E2E Test Suite', priority: 'High', module: 'Test' },
      { name: 'SIVA Tool Integration Tests', priority: 'High', module: 'Test' },
      { name: 'Security Audit', priority: 'High', module: 'Security' },
      { name: 'Performance Testing', priority: 'High', module: 'Test' },
      { name: 'Accessibility Audit', priority: 'Medium', module: 'UI' },
      { name: 'Error Monitoring Enhancement', priority: 'Medium', module: 'Core' },
      { name: 'Documentation Completion', priority: 'Low', module: 'Docs' },
      { name: 'Production Readiness Checklist', priority: 'High', module: 'DevOps' },
    ],
  },
];

async function findOrCreateSprint(sprintNum, goal) {
  // Check if sprint exists
  const response = await notion.databases.query({
    database_id: sprintsDbId,
    filter: {
      property: 'Sprint',
      title: {
        equals: `Sprint ${sprintNum}`,
      },
    },
  });

  if (response.results.length > 0) {
    const sprintId = response.results[0].id;
    // Update goal
    await notion.pages.update({
      page_id: sprintId,
      properties: {
        Goal: {
          rich_text: [{ type: 'text', text: { content: goal } }],
        },
        Status: {
          select: { name: 'Planned' },
        },
      },
    });
    console.log(`  Updated Sprint ${sprintNum} goal`);
    return sprintId;
  } else {
    // Create sprint
    const created = await notion.pages.create({
      parent: { database_id: sprintsDbId },
      properties: {
        Sprint: {
          title: [{ type: 'text', text: { content: `Sprint ${sprintNum}` } }],
        },
        Goal: {
          rich_text: [{ type: 'text', text: { content: goal } }],
        },
        Status: {
          select: { name: 'Planned' },
        },
      },
    });
    console.log(`  Created Sprint ${sprintNum}`);
    return created.id;
  }
}

async function clearExistingFeatures(sprintNum) {
  // Find all features for this sprint
  const response = await notion.databases.query({
    database_id: featuresDbId,
    filter: {
      property: 'Sprint',
      number: {
        equals: sprintNum,
      },
    },
  });

  // Archive existing features
  for (const page of response.results) {
    await notion.pages.update({
      page_id: page.id,
      archived: true,
    });
  }

  if (response.results.length > 0) {
    console.log(`  Archived ${response.results.length} existing features`);
  }
}

async function createFeature(sprintNum, feature, index) {
  await notion.pages.create({
    parent: { database_id: featuresDbId },
    properties: {
      Features: {
        title: [{ type: 'text', text: { content: feature.name } }],
      },
      Sprint: {
        number: sprintNum,
      },
      Priority: {
        select: { name: feature.priority },
      },
      Status: {
        select: { name: 'Planned' },
      },
      Tags: {
        multi_select: [{ name: feature.module }],
      },
    },
  });
}

async function restructureSprints() {
  console.log('='.repeat(60));
  console.log('UPR 2030 Sprint Restructure');
  console.log('='.repeat(60));
  console.log('');

  const changelog = [];

  for (const sprint of SPRINTS) {
    console.log(`\nProcessing Sprint ${sprint.number}...`);

    try {
      // Find or create sprint
      await findOrCreateSprint(sprint.number, sprint.goal);

      // Clear existing features
      await clearExistingFeatures(sprint.number);

      // Create new features
      console.log(`  Creating ${sprint.features.length} features...`);
      for (let i = 0; i < sprint.features.length; i++) {
        await createFeature(sprint.number, sprint.features[i], i);
      }

      changelog.push({
        sprint: sprint.number,
        goal: sprint.goal,
        features: sprint.features.length,
        status: 'SUCCESS',
      });

      console.log(`  Done: ${sprint.features.length} features created`);
    } catch (error) {
      console.error(`  ERROR: ${error.message}`);
      changelog.push({
        sprint: sprint.number,
        goal: sprint.goal,
        status: 'ERROR',
        error: error.message,
      });
    }
  }

  // Print summary
  console.log('\n');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  let totalFeatures = 0;
  for (const entry of changelog) {
    if (entry.status === 'SUCCESS') {
      console.log(`Sprint ${entry.sprint}: ${entry.features} features - ${entry.goal.substring(0, 50)}...`);
      totalFeatures += entry.features;
    } else {
      console.log(`Sprint ${entry.sprint}: ERROR - ${entry.error}`);
    }
  }

  console.log('');
  console.log(`Total Sprints: ${SPRINTS.length}`);
  console.log(`Total Features: ${totalFeatures}`);
  console.log('');
  console.log('Changelog:');
  console.log('- Deleted old Sprint 54 (Real-Time AI Suggestions) - Obsoleted by Chat');
  console.log('- Deleted old Sprint 56 (NL Query System) - Obsoleted by Chat');
  console.log('- Merged old Sprint 58 (Agent Hub UI) into new Sprint 56');
  console.log('- Renumbered Sprints 57-65 to 56-63');
  console.log('- Total reduction: 12 sprints -> 10 sprints');
}

restructureSprints().catch(console.error);
