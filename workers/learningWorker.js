// workers/learningWorker.js
import { pool } from '../utils/db.js';
// Change import style as a last-resort diagnostic
import * as LearningAgent from '../services/learningAgent.js';

const POLLING_INTERVAL_MS = 1000 * 60 * 60; // Run once every hour
const MIN_BATCH_SIZE = 5; // Minimum number of replied emails to trigger an analysis
const MAX_BATCH_SIZE = 20; // Maximum number of emails to analyze at once

/**
 * The core function for the learning worker. Finds replied-to emails,
 * generates an insight, and saves it to the database.
 */
async function analyzePerformance() {
  console.log('[LearningWorker] Waking up to check for performance data...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: successfulEmails } = await client.query(`
      SELECT id, body_html FROM outreach_generations
      WHERE reply_at IS NOT NULL AND is_analyzed = FALSE
      LIMIT $1;
    `, [MAX_BATCH_SIZE]);

    if (successfulEmails.length < MIN_BATCH_SIZE) {
      console.log(`[LearningWorker] Not enough new examples to run analysis (found ${successfulEmails.length}, need ${MIN_BATCH_SIZE}). Sleeping.`);
      await client.query('COMMIT');
      return;
    }

    console.log(`[LearningWorker] Analyzing a batch of ${successfulEmails.length} successful emails...`);

    // Use the new import style to call the function
    const insightSummary = await LearningAgent.generatePerformanceInsight(successfulEmails);
    const sourceIds = successfulEmails.map(email => email.id);
    
    console.log(`[LearningWorker] New insight generated: "${insightSummary}"`);

    await client.query(
        `INSERT INTO ai_learning_insights (insight_summary, source_outreach_ids, is_active)
         VALUES ($1, $2, TRUE)`,
        [insightSummary, sourceIds]
    );

    await client.query(
        `UPDATE outreach_generations SET is_analyzed = TRUE WHERE id = ANY($1::uuid[])`,
        [sourceIds]
    );

    await client.query('COMMIT');
    console.log(`[LearningWorker] Successfully saved new insight and updated ${sourceIds.length} records.`);

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[LearningWorker] Error during performance analysis:', e);
  } finally {
    client.release();
  }
}

/**
 * The main worker loop.
 */
function main() {
  console.log('[LearningWorker] Reinforcement learning worker started.');
  console.log(`[LearningWorker] Will check for data every ${POLLING_INTERVAL_MS / 1000 / 60} minutes.`);
  
  analyzePerformance();
  setInterval(analyzePerformance, POLLING_INTERVAL_MS);
}

main();