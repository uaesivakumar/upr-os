// workers/enrichmentWorker.js
import express from 'express';
import IORedis from 'ioredis';
import bullmq from 'bullmq';
// DO NOT import the database pool here at the top level.

// These imports are safe as they don't create external connections on load.
import { runEnrichmentChain } from '../services/enrichmentProviders.js';
import { calculateLeadScore } from '../routes/enrich/lib/person.js';

console.log('[Worker Module] Top-level of enrichmentWorker.js has been executed.');

const { Worker } = bullmq;

// Main function to run the worker
export async function run() {
  console.log('[Worker] run() function has been called.');

  // CRITICAL FIX 1: Variables are defined in the outer scope of the 'run' function
  // so they are accessible by the SIGTERM handler.
  let connection;
  let worker;

  const app = express();
  const port = process.env.PORT || 8080;

  console.log('[Worker] Setting up HTTP shim routes (/ and /health).');
  app.get("/", (_req, res) => res.status(200).send("UPR Enrichment Worker is running."));
  app.get("/health", (_req, res) => res.status(200).send("ok"));

  const server = app.listen(port, '0.0.0.0', async () => {
    console.log(`[UPR Worker] HTTP shim is now listening on port ${port}.`);
    console.log('[UPR Worker] --- BEGINNING WORKER INITIALIZATION ---');

    try {
      // Step 1: Establish and verify Redis Connection FIRST
      console.log('[UPR Worker] Step 1: Reading REDIS_URL from environment variables...');
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error("CRITICAL: REDIS_URL environment variable is not set or empty.");
      }
      console.log(`[UPR Worker] Step 1: REDIS_URL found. Attempting to connect...`);

      connection = new IORedis(redisUrl, { 
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        connectTimeout: 10000,
      });
      
      console.log('[UPR Worker] Step 2: Waiting for Redis client to be ready...');

      await new Promise((resolve, reject) => {
        connection.on('ready', () => {
          console.log('[Redis] Connection is READY.');
          resolve();
        });
        connection.on('error', (err) => {
          console.error('[Redis] FATAL: A Redis connection error occurred:', err.message);
          reject(err);
        });
      });
      
      console.log('[UPR Worker] Step 2: Redis connection successful.');

      // Step 2: Initialize BullMQ Worker
      console.log('[UPR Worker] Step 3: Creating BullMQ Worker instance for "enrichment-queue"...');
      worker = new Worker('enrichment-queue', async (job) => {
        const { pool } = await import('../utils/db.js');
        const { name, email } = job.data;
        console.log(`[Worker] Processing job ${job.id}: ${name} <${email}>`);
        
        try {
          // ... (job processing logic remains the same)
          const { data: enrichedLead, sources } = await runEnrichmentChain(email, name);
          const { score, reasons } = calculateLeadScore(enrichedLead, {});
          const finalData = { ...enrichedLead, confidence: score / 100, sources: [...new Set(sources)], score_reasons: reasons };

          let companyId = null;
          const companyName = finalData.company_name?.trim();
          if (companyName) {
            const { rows } = await pool.query(
              `INSERT INTO targeted_companies (name, domain) VALUES ($1, $2)
               ON CONFLICT (domain) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
              [companyName, email.split('@')[1]]
            );
            companyId = rows[0].id;
          }

          if (!companyId) throw new Error(`Could not find or create company for ${companyName}`);

          const { confidence, score_reasons, ...leadPayload } = finalData;
          leadPayload.company_id = companyId;
          delete leadPayload.company_name;

          await pool.query(
            `INSERT INTO hr_leads (name, email, company_id, designation, linkedin_url, location, email_status, enrich_meta)
             VALUES ($1, $2, $3, $4, $5, $6, 'validated_user', $7)
             ON CONFLICT (email) DO NOTHING`,
            [
              leadPayload.name,
              leadPayload.email,
              leadPayload.company_id,
              leadPayload.designation,
              leadPayload.linkedin_url,
              leadPayload.location,
              { confidence, sources, score_reasons }
            ]
          );
          
          console.log(`[Worker] ✅ Successfully processed and saved lead: ${name}`);
          return { success: true, lead: name };

        } catch (err) { // CRITICAL FIX 2: Correct syntax for catch block
          console.error(`[Worker] ❌ Job ${job.id} for ${name} failed:`, err.message);
          throw err;
        }
      }, { connection });

      worker.on('failed', (job, err) => console.log(`[Worker] Job ${job?.id || 'unknown'} has failed with ${err.message}`)); // CRITICAL FIX 2: Correct syntax
      
      console.log("[EnrichmentWorker] --- WORKER INITIALIZATION SUCCEEDED ---. Ready for jobs.");

    } catch (err) {
      console.error("======================================================");
      console.error("[UPR Worker] FATAL: A critical error occurred during worker startup.");
      console.error(err);
      console.error("======================================================");
      server.close(() => process.exit(1)); // CRITICAL FIX 2: Correct syntax
    }
  });

  process.on('SIGTERM', async () => {
    console.log('[UPR Worker] SIGTERM received. Shutting down gracefully...');
    if (worker) {
      console.log('[UPR Worker] Closing BullMQ worker...');
      await worker.close();
      console.log('[UPR Worker] BullMQ worker closed.');
    }
    if (connection) {
      console.log('[UPR Worker] Quitting Redis connection...');
      await connection.quit();
      console.log('[UPR Worker] Redis connection quit.');
    }
    server.close(() => {
      console.log('[UPR Worker] HTTP server closed.');
      process.exit(0);
    });
  });
}