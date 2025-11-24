#!/usr/bin/env node

/**
 * Unified CLI Dispatcher for Notion Integration
 *
 * Usage:
 *   npm run notion -- sync         # Push local → Notion
 *   npm run notion -- pull         # Pull Notion → local
 *   npm run notion -- setup        # Create databases
 *   npm run notion -- enhance      # Add Phase 2 properties
 *   npm run notion -- metrics      # Calculate and push metrics
 *   npm run notion -- close 14     # Close sprint
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = {
  'sync': {
    script: 'updateNotion.js',
    args: ['sync'],
    description: 'Push local sprint log to Notion (smart upsert)'
  },
  'pull': {
    script: 'pullNotionUpdates.js',
    args: [],
    description: 'Pull Notion updates to local sprint log'
  },
  'setup': {
    script: 'create_upr_roadmap.js',
    args: [],
    description: 'Create Notion databases (first-time setup)'
  },
  'populate': {
    script: 'populate_upr_data.js',
    args: [],
    description: 'Populate databases with historical data'
  },
  'enhance': {
    script: 'enhanceSchema.js',
    args: [],
    description: 'Add Phase 2 properties to databases'
  },
  'metrics': {
    script: 'calculateMetrics.js',
    args: [],
    description: 'Calculate and push velocity metrics'
  },
  'close': {
    script: 'updateNotion.js',
    args: ['close'],
    description: 'Close sprint and sync (e.g., notion close 14)'
  },
  'template': {
    script: 'createCheckpointTemplate.js',
    args: [],
    description: 'Generate sprint log template'
  },
  'help': {
    description: 'Show this help message'
  }
};

function showHelp() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🎯 UPR Notion Integration CLI');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Usage: npm run notion -- <command> [args]');
  console.log('');
  console.log('Available Commands:');
  console.log('');

  Object.entries(commands).forEach(([cmd, config]) => {
    const paddedCmd = cmd.padEnd(12);
    console.log(`  ${paddedCmd}  ${config.description}`);
  });

  console.log('');
  console.log('Examples:');
  console.log('  npm run notion -- sync          # Push local changes');
  console.log('  npm run notion -- pull          # Get Notion updates');
  console.log('  npm run notion -- close 14      # Close Sprint 14');
  console.log('  npm run notion -- metrics       # Update metrics');
  console.log('');
  console.log('Legacy Commands (still work):');
  console.log('  npm run sprint:sync             # Same as: notion sync');
  console.log('  npm run sprint:pull             # Same as: notion pull');
  console.log('  npm run sprint:close 14         # Same as: notion close 14');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

function runCommand(command, args) {
  const config = commands[command];

  if (!config || !config.script) {
    console.error(`❌ Unknown command: ${command}`);
    console.log('');
    showHelp();
    process.exit(1);
  }

  const scriptPath = path.join(__dirname, config.script);
  const scriptArgs = [...(config.args || []), ...args];

  console.log(`🚀 Running: ${command}...`);
  console.log('');

  const child = spawn('node', [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    cwd: __dirname
  });

  child.on('close', (code) => {
    process.exit(code);
  });

  child.on('error', (err) => {
    console.error('❌ Failed to execute command:', err);
    process.exit(1);
  });
}

// Parse command line arguments
const [command, ...args] = process.argv.slice(2);

if (!command || command === 'help' || command === '--help' || command === '-h') {
  showHelp();
  process.exit(0);
}

runCommand(command, args);
