// workers/broadcastWorker.js
// ... (imports are unchanged)
import { pool } from '../utils/db.js';
import { conductResearch } from '../services/researchAgent.js';
import { verifyFacts } from '../services/factChecker.js';
import { composeEmail } from '../services/composeAgent.js';
import { runComplianceChecks } from '../services/complianceAgent.js';
import { optimizeForDelivery } from '../services/deliverabilityAgent.js';

const BATCH_SIZE = 5;
const POLLING_INTERVAL_MS = 10000;

async function processTask() {
  const client = await pool.connect();
  try {
    const taskRes = await client.query(`
      SELECT * FROM broadcast_tasks 
      WHERE status = 'queued' 
      ORDER BY id 
      LIMIT 1 
      FOR UPDATE SKIP LOCKED;
    `);

    if (taskRes.rowCount === 0) return;
    const task = taskRes.rows[0];
    console.log(`[Worker] Picked up task ${task.id} for lead ${task.lead_id}`);

    try {
      const [jobRes, leadRes] = await Promise.all([
        client.query('SELECT * FROM broadcast_jobs WHERE id = $1', [task.job_id]),
        client.query('SELECT * FROM hr_leads WHERE id = $1', [task.lead_id]),
      ]);
      const job = jobRes.rows[0];
      const lead = leadRes.rows[0];

      const templateRes = await client.query('SELECT * FROM template_versions WHERE id = $1', [job.template_version_id]);
      const template = templateRes.rows[0];
      
      // --- MODIFICATION: Get the userId from the template version ---
      const userId = template.created_by;

      if (!job || !lead || !template) throw new Error('Associated job, lead, or template not found.');
      
      await client.query("UPDATE broadcast_tasks SET status = 'researching', started_at = NOW() WHERE id = $1", [task.id]);
      const factPack = await conductResearch(lead.company_id);
      const verifiedFacts = await verifyFacts(factPack);
      
      await client.query("UPDATE broadcast_tasks SET status = 'composing' WHERE id = $1", [task.id]);
      // --- MODIFICATION: Pass the userId to the compose agent ---
      const composedEmail = await composeEmail(verifiedFacts, lead, template, userId);

      await client.query("UPDATE broadcast_tasks SET status = 'guardrail' WHERE id = $1", [task.id]);
      const complianceResult = await runComplianceChecks(composedEmail, lead);
      if (!complianceResult.isCompliant) throw new Error(`Compliance check failed: ${complianceResult.reason}`);

      await client.query("UPDATE broadcast_tasks SET status = 'sending' WHERE id = $1", [task.id]);
      const finalEmail = await optimizeForDelivery(composedEmail);
      
      const generationRes = await client.query(/* ... (unchanged) */);
      await client.query(/* ... (unchanged) */);
      await client.query(/* ... (unchanged) */);

      await client.query("UPDATE broadcast_tasks SET status = 'done', finished_at = NOW() WHERE id = $1", [task.id]);
      await client.query("UPDATE broadcast_jobs SET processed = processed + 1 WHERE id = $1", [task.job_id]);
      console.log(`[Worker] Successfully processed task ${task.id}`);

    } catch (taskError) {
      // ... (error handling is unchanged)
    } finally {
      // ... (job completion check is unchanged)
    }
  } finally {
    client.release();
  }
}

function main() {
  // ... (This function is unchanged)
}

main();