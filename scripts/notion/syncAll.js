/**
 * Sync All - Complete Notion Sync
 *
 * Runs all Notion sync operations in sequence:
 * 1. SIVA Progress (with docs)
 * 2. Markdown Documentation
 *
 * Usage: npm run notion:sync-all
 */

import { execSync } from 'child_process';

console.log('🔄 Complete Notion Sync\n');
console.log('='.repeat(80));
console.log('');

try {
  // Step 1: Sync SIVA Progress
  console.log('📊 Step 1/2: Syncing SIVA Progress...\n');
  execSync('node scripts/notion/syncSIVAProgressWithDocs.js', { stdio: 'inherit' });
  console.log('\n✅ SIVA Progress synced\n');

  console.log('='.repeat(80));
  console.log('');

  // Step 2: Sync Markdown Documentation
  console.log('📚 Step 2/2: Syncing Markdown Documentation...\n');
  execSync('node scripts/notion/syncMarkdownDocs.js', { stdio: 'inherit' });
  console.log('\n✅ Documentation synced\n');

  console.log('='.repeat(80));
  console.log('');
  console.log('✅ Complete Notion Sync Finished!\n');
  console.log('All updates pushed to Notion:');
  console.log('  • SIVA Progress updated in MODULE FEATURES');
  console.log('  • Markdown docs synced to Documentation');
  console.log('');

} catch (error) {
  console.error('\n❌ Sync failed:', error.message);
  process.exit(1);
}
