#!/usr/bin/env node
/**
 * COMPREHENSIVE SPRINT SYNC - Fills ALL Notion columns automatically
 *
 * Usage: NOTION_TOKEN=xxx node scripts/notion/syncSprintComplete.js <sprint_number>
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

const sprintNumber = process.argv[2] ? parseInt(process.argv[2]) : null;

if (!sprintNumber) {
  console.error('❌ Usage: node syncSprintComplete.js <sprint_number>');
  process.exit(1);
}

/**
 * Get git information for a sprint
 */
function getGitInfo(sprintNumber) {
  try {
    // Find commits for this sprint
    const commits = execSync(`git log --oneline | grep -iE "(sprint.${sprintNumber}|Sprint ${sprintNumber})" || echo ""`)
      .toString().trim().split('\n').filter(c => c);

    if (commits.length === 0) {
      return {
        branch: 'main',
        commit: execSync('git log -1 --format=%h').toString().trim(),
        commitRange: '',
        commitsCount: 0,
        gitTag: '',
        startedAt: new Date().toISOString().split('T')[0],
        completedAt: new Date().toISOString().split('T')[0]
      };
    }

    // Get first and last commit
    const firstCommit = commits[commits.length - 1].split(' ')[0];
    const lastCommit = commits[0].split(' ')[0];

    // Get commit dates
    const firstDate = execSync(`git log ${firstCommit} -1 --format=%ci`).toString().trim().split(' ')[0];
    const lastDate = execSync(`git log ${lastCommit} -1 --format=%ci`).toString().trim().split(' ')[0];

    // Get branch
    const branch = execSync('git branch --show-current').toString().trim() || 'main';

    // Build commit range
    const commitRange = commits.length > 1 ? `${firstCommit}..${lastCommit}` : lastCommit;

    return {
      branch,
      commit: lastCommit,
      commitRange,
      commitsCount: commits.length,
      gitTag: `sprint-${sprintNumber}`,
      startedAt: firstDate,
      completedAt: lastDate
    };
  } catch (error) {
    console.error('Warning: Could not get git info:', error.message);
    return {
      branch: 'main',
      commit: '',
      commitRange: '',
      commitsCount: 0,
      gitTag: '',
      startedAt: new Date().toISOString().split('T')[0],
      completedAt: new Date().toISOString().split('T')[0]
    };
  }
}

/**
 * Sprint-specific content configurations
 */
const SPRINT_CONFIGS = {
  42: {
    goal: 'Implement Multi-Agent System with Discovery, Validation, and Critic Agents',
    highlights: [
      '✅ Multi-Agent System with 3 specialized agents',
      '✅ Agent communication protocol (REQUEST/RESPONSE/NOTIFICATION)',
      '✅ Consensus mechanism with weighted voting',
      '✅ 18/18 tests passing (3 checkpoints)',
      '✅ 14 files created, 3,806 lines of code'
    ],
    outcomes: 'Implemented complete multi-agent coordination system with Discovery Agent (pattern analysis), Validation Agent (data verification), and Critic Agent (quality evaluation). Built agent protocol, message routing, consensus algorithm, decision logging, and comprehensive testing framework.',
    businessValue: 'Enables intelligent collaboration between AI agents for better decision-making quality, automated quality assurance, and scalable agent orchestration. Foundation for advanced multi-agent workflows.',
    learnings: [
      'Event-driven architecture essential for agent communication',
      'Consensus mechanisms require careful weight balancing',
      'Health monitoring critical for distributed agent systems',
      'Message correlation IDs enable request/response tracking',
      'Adapter pattern simplifies agent integration'
    ],
    sprintNotes: 'Successfully implemented multi-agent infrastructure with 3 specialized agents. Key challenges: database schema alignment, message routing to coordinator, agent health status tracking. All resolved with comprehensive testing. System ready for production use.'
  },
  // Add more sprint configs as needed
  43: {
    goal: 'Next Sprint Goal',
    highlights: [],
    outcomes: '',
    businessValue: '',
    learnings: [],
    sprintNotes: ''
  }
};

async function syncSprint(sprintNumber) {
  console.log(`\n🚀 COMPREHENSIVE SYNC: Sprint ${sprintNumber}\n`);
  console.log('=' .repeat(80));

  try {
    // Get git information
    console.log('📊 Gathering git information...');
    const gitInfo = getGitInfo(sprintNumber);
    console.log(`   Branch: ${gitInfo.branch}`);
    console.log(`   Commit: ${gitInfo.commit}`);
    console.log(`   Commits: ${gitInfo.commitsCount}`);
    console.log(`   Range: ${gitInfo.commitRange}`);
    console.log(`   Started: ${gitInfo.startedAt}`);
    console.log(`   Completed: ${gitInfo.completedAt}\n`);

    // Get sprint configuration
    const config = SPRINT_CONFIGS[sprintNumber];
    if (!config) {
      console.error(`❌ No configuration found for Sprint ${sprintNumber}`);
      console.log('   Add configuration to SPRINT_CONFIGS object');
      process.exit(1);
    }

    // Find Sprint page in Notion
    console.log('🔍 Finding Sprint page in Notion...');
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: `Sprint ${sprintNumber}` } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log(`❌ Sprint ${sprintNumber} not found in Notion`);
      process.exit(1);
    }

    const sprint = sprintsResponse.results[0];
    console.log(`✅ Found Sprint ${sprintNumber}\n`);

    // Update ALL fields
    console.log('✏️  Updating ALL fields in Notion...\n');

    const updates = {
      // Status
      Status: { select: { name: 'Complete' } },

      // Git information
      Branch: { rich_text: [{ text: { content: gitInfo.branch } }] },
      Commit: { rich_text: [{ text: { content: gitInfo.commit } }] },
      'Commit Range': { rich_text: [{ text: { content: gitInfo.commitRange } }] },
      'Commits Count': { number: gitInfo.commitsCount },
      'Git Tag': { rich_text: [{ text: { content: gitInfo.gitTag } }] },

      // Dates
      Date: { date: { start: gitInfo.startedAt } },
      'Started At': { date: { start: gitInfo.startedAt } },
      'Completed At': { date: { start: gitInfo.completedAt } },
      'Synced At': { date: { start: new Date().toISOString().split('T')[0] } },

      // Content
      Goal: { rich_text: [{ text: { content: config.goal } }] },
      Highlights: { rich_text: [{ text: { content: config.highlights.join('\n') } }] },
      Outcomes: { rich_text: [{ text: { content: config.outcomes } }] },
      'Business Value': { rich_text: [{ text: { content: config.businessValue } }] },
      Learnings: { rich_text: [{ text: { content: config.learnings.join('\n') } }] },
      'Sprint Notes': { rich_text: [{ text: { content: config.sprintNotes } }] }
    };

    await notion.pages.update({
      page_id: sprint.id,
      properties: updates
    });

    // Print summary
    console.log('✅ SYNC COMPLETE - All fields updated:\n');
    console.log('   STATUS & TRACKING:');
    console.log(`      Status: Complete`);
    console.log(`      Synced At: ${new Date().toISOString().split('T')[0]}`);
    console.log('   \n   GIT INFORMATION:');
    console.log(`      Branch: ${gitInfo.branch}`);
    console.log(`      Commit: ${gitInfo.commit}`);
    console.log(`      Commit Range: ${gitInfo.commitRange}`);
    console.log(`      Commits Count: ${gitInfo.commitsCount}`);
    console.log(`      Git Tag: ${gitInfo.gitTag}`);
    console.log('   \n   DATES:');
    console.log(`      Date: ${gitInfo.startedAt}`);
    console.log(`      Started At: ${gitInfo.startedAt}`);
    console.log(`      Completed At: ${gitInfo.completedAt}`);
    console.log('   \n   CONTENT:');
    console.log(`      Goal: ${config.goal.substring(0, 60)}...`);
    console.log(`      Highlights: ${config.highlights.length} items`);
    console.log(`      Outcomes: ${config.outcomes.substring(0, 60)}...`);
    console.log(`      Business Value: ${config.businessValue.substring(0, 60)}...`);
    console.log(`      Learnings: ${config.learnings.length} items`);
    console.log(`      Sprint Notes: ${config.sprintNotes.substring(0, 60)}...`);

    console.log('\n' + '='.repeat(80));
    console.log(`✅ Sprint ${sprintNumber} - ALL COLUMNS SYNCED TO NOTION`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  process.exit(1);
}

syncSprint(sprintNumber);
