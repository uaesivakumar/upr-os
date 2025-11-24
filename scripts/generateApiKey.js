#!/usr/bin/env node
// scripts/generateApiKey.js
// Generate API keys for external CRM integrations

import { pool } from '../utils/db.js';
import { generateApiKey, hashApiKey } from '../middleware/apiAuth.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('🔐 UPR API Key Generator\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Gather information
    const name = await question('API Key Name (e.g., "HubSpot Production"): ');
    const organization = await question('Organization (e.g., "ACME Corp"): ');
    const environment = await question('Environment (live/test) [live]: ') || 'live';
    const rateLimitPerMinute = parseInt(await question('Rate limit per minute [60]: ') || '60');
    const rateLimitPerDay = parseInt(await question('Rate limit per day [10000]: ') || '10000');

    if (!name) {
      console.error('\n❌ Error: API Key Name is required');
      process.exit(1);
    }

    // Generate API key
    const apiKey = generateApiKey(environment);
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 8) + '****';

    // Default scopes for external integrations
    const scopes = ['propensity:read', 'batch:score'];

    // Insert into database
    await pool.query(`
      INSERT INTO api_keys (
        key_hash,
        key_prefix,
        name,
        organization,
        scopes,
        rate_limit_per_minute,
        rate_limit_per_day,
        environment,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'cli')
    `, [
      keyHash,
      keyPrefix,
      name,
      organization || null,
      JSON.stringify(scopes),
      rateLimitPerMinute,
      rateLimitPerDay,
      environment
    ]);

    console.log('\n✅ API Key Created Successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📋 Name:         ${name}`);
    console.log(`🏢 Organization: ${organization || 'N/A'}`);
    console.log(`🌍 Environment:  ${environment}`);
    console.log(`⏱️  Rate Limit:   ${rateLimitPerMinute}/min, ${rateLimitPerDay}/day`);
    console.log(`🔓 Scopes:       ${scopes.join(', ')}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔑 API Key (SAVE THIS - IT WILL NOT BE SHOWN AGAIN):\n');
    console.log(`   ${apiKey}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Usage examples:\n');
    console.log('  curl -H "Authorization: Bearer ' + apiKey + '" \\');
    console.log('       https://upr.sivakumar.ai/api/v1/propensity/health\n');
    console.log('  curl -H "x-api-key: ' + apiKey + '" \\');
    console.log('       -X POST https://upr.sivakumar.ai/api/v1/propensity/score \\');
    console.log('       -H "Content-Type: application/json" \\');
    console.log('       -d \'{"company": {...}, "contact": {...}}\'');
    console.log('\n⚠️  IMPORTANT: Store this key securely. It will not be shown again.\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error creating API key:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
