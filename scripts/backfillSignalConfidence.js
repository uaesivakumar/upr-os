/**
 * Backfill Signal Confidence Scores
 * Sprint 18, Task 7: Signal Confidence Scoring
 *
 * Populates confidence_score and source_type for existing hiring_signals
 * that don't have these values yet.
 *
 * Usage:
 *   node scripts/backfillSignalConfidence.js [options]
 *
 * Options:
 *   --dry-run         Show what would be updated without making changes
 *   --batch-size N    Process N signals at a time (default: 100)
 *   --tenant-id ID    Only backfill signals for specific tenant
 */

import dotenv from 'dotenv';
import SignalConfidenceService from '../server/services/signalConfidence.js';

// Load environment variables
dotenv.config();

const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 100,
  tenantId: args.find(arg => arg.startsWith('--tenant-id='))?.split('=')[1] || null
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Signal Confidence Backfill Script');
  console.log('Sprint 18, Task 7');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Options:');
  console.log(`  Dry Run: ${options.dryRun ? 'YES (no changes will be made)' : 'NO (will update database)'}`);
  console.log(`  Batch Size: ${options.batchSize}`);
  console.log(`  Tenant ID: ${options.tenantId || 'ALL'}`);
  console.log('');

  try {
    const result = await SignalConfidenceService.backfillConfidenceScores(options);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('BACKFILL COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`✅ Total Processed: ${result.totalProcessed}`);
    console.log(`✅ Total Updated: ${result.totalUpdated}`);
    console.log(`⚠️  Errors: ${result.errors}`);
    console.log(`⏱️  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
    console.log('');

    if (result.errors > 0 && result.errorDetails.length > 0) {
      console.log('First 10 errors:');
      result.errorDetails.forEach((err, i) => {
        console.log(`  ${i + 1}. Signal ${err.signalId}: ${err.error}`);
      });
      console.log('');
    }

    if (options.dryRun) {
      console.log('⚠️  DRY RUN MODE - No changes were made');
      console.log('   Run without --dry-run to apply changes');
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════');

    process.exit(result.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ BACKFILL FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
