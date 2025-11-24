import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🗑️  Delete Duplicate Phase 3 Entry');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================================
// Find the duplicate Phase 3 entry
// ============================================================================

async function findDuplicatePhase3() {
  console.log('🔍 Searching for duplicate Phase 3 entry...\n');

  const response = await notion.databases.query({
    database_id: MODULE_FEATURES_DB,
    filter: {
      property: "Features",
      title: { equals: "Phase 3: RADAR Multi-Source Orchestration" }
    }
  });

  if (response.results.length === 0) {
    console.log('✅ No duplicate found - already deleted or never existed\n');
    return null;
  }

  if (response.results.length > 1) {
    console.log(`⚠️  Warning: Found ${response.results.length} entries with this title\n`);
  }

  const duplicate = response.results[0];
  const title = duplicate.properties.Features?.title?.[0]?.text?.content || 'Unknown';
  const status = duplicate.properties.Status?.select?.name || 'Unknown';
  const sprint = duplicate.properties.Sprint?.number || 'Unknown';

  console.log('📋 Found duplicate entry:');
  console.log(`   Title: ${title}`);
  console.log(`   Status: ${status}`);
  console.log(`   Sprint: ${sprint}`);
  console.log(`   Page ID: ${duplicate.id}\n`);

  return duplicate;
}

// ============================================================================
// Verify the original Phase 3 exists
// ============================================================================

async function verifyOriginalPhase3() {
  console.log('🔍 Verifying original Phase 3 exists...\n');

  const response = await notion.databases.query({
    database_id: MODULE_FEATURES_DB,
    filter: {
      property: "Features",
      title: { equals: "Phase 3: Centralized Agentic Hub Design" }
    }
  });

  if (response.results.length === 0) {
    console.log('❌ ERROR: Original Phase 3 not found!\n');
    console.log('   Expected: "Phase 3: Centralized Agentic Hub Design"\n');
    console.log('   ABORTING - will not delete duplicate without verifying original exists\n');
    return false;
  }

  const original = response.results[0];
  const title = original.properties.Features?.title?.[0]?.text?.content || 'Unknown';
  const status = original.properties.Status?.select?.name || 'Unknown';

  console.log('✅ Original Phase 3 verified:');
  console.log(`   Title: ${title}`);
  console.log(`   Status: ${status}`);
  console.log(`   Page ID: ${original.id}\n`);

  return true;
}

// ============================================================================
// Delete the duplicate
// ============================================================================

async function deleteDuplicate() {
  // Step 1: Verify original exists
  const originalExists = await verifyOriginalPhase3();
  if (!originalExists) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ ABORTED - Original Phase 3 not found');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
  }

  // Step 2: Find duplicate
  const duplicate = await findDuplicatePhase3();
  if (!duplicate) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ No action needed - duplicate not found');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return;
  }

  // Step 3: Archive (soft delete) the duplicate
  console.log('🗑️  Archiving duplicate entry...\n');

  try {
    await notion.pages.update({
      page_id: duplicate.id,
      archived: true
    });

    console.log('✅ Duplicate archived successfully\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Cleanup Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('   ✅ Original Phase 3 preserved: "Phase 3: Centralized Agentic Hub Design"');
    console.log('   ✅ Duplicate archived: "Phase 3: RADAR Multi-Source Orchestration"');
    console.log('   ✅ All Phase 3.1-3.6 subtasks remain unchanged');
    console.log('   ✅ All Phase 4.1-4.6 subtasks remain unchanged\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('❌ Failed to archive duplicate:', error.message);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
  }
}

// ============================================================================
// Run
// ============================================================================

deleteDuplicate().catch(console.error);
