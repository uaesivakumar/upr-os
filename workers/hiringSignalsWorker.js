// workers/hiringSignalsWorker.js
// Background worker for hiring signals enrichment using BullMQ
import express from 'express';
import IORedis from 'ioredis';
import bullmq from 'bullmq';
import { pool } from '../utils/db.js';

// Import enrichment functions
import { enrichWithApollo } from '../routes/enrich/lib/apollo.js';
import { enrichWithPatternEngine } from '../server/lib/emailIntelligence/integration.js';
import { roleBucket, bucketSeniority, calculatePreviewScore } from '../routes/enrich/lib/person.js';
import { discoverDomainAndPattern, getCachedDiscovery, cacheDiscoveryResult } from '../server/agents/domainPatternDiscoveryAgent.js';
import { simpleDiscovery } from '../server/agents/simpleDiscoveryAgent.js';

console.log('[HiringSignalsWorker Module] Top-level module execution.');

const { Worker } = bullmq;

// Main function to run the worker
export async function run() {
  console.log('[HiringSignalsWorker] run() function has been called.');

  // Variables defined in outer scope for SIGTERM handler access
  let connection;
  let worker;

  const app = express();
  const port = process.env.PORT || 8080;

  console.log('[HiringSignalsWorker] Setting up HTTP shim routes (/ and /health).');
  app.get("/", (_req, res) => res.status(200).send("UPR Hiring Signals Worker is running."));
  app.get("/health", (_req, res) => res.status(200).send("ok"));

  const server = app.listen(port, '0.0.0.0', async () => {
    console.log(`[HiringSignalsWorker] HTTP shim is now listening on port ${port}.`);
    console.log('[HiringSignalsWorker] --- BEGINNING WORKER INITIALIZATION ---');

    try {
      // Step 1: Establish and verify Redis Connection
      console.log('[HiringSignalsWorker] Step 1: Reading REDIS_URL from environment...');
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error("CRITICAL: REDIS_URL environment variable is not set or empty.");
      }
      console.log(`[HiringSignalsWorker] Step 1: REDIS_URL found. Attempting to connect...`);

      connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        connectTimeout: 10000,
      });

      console.log('[HiringSignalsWorker] Step 2: Waiting for Redis client to be ready...');

      await new Promise((resolve, reject) => {
        connection.on('ready', () => {
          console.log('[HiringSignalsWorker Redis] Connection is READY.');
          resolve();
        });
        connection.on('error', (err) => {
          console.error('[HiringSignalsWorker Redis] FATAL: Connection error:', err.message);
          reject(err);
        });
      });

      console.log('[HiringSignalsWorker] Step 2: Redis connection successful.');

      // Step 2: Initialize BullMQ Worker for hiring signals
      console.log('[HiringSignalsWorker] Step 3: Creating BullMQ Worker instance for "hiring-signals-queue"...');

      worker = new Worker('hiring-signals-queue', async (job) => {
        const { taskId, company_name, domain, sector, location, signal_id, tenantId, force_refresh = false } = job.data;
        console.log(`[HiringSignalsWorker] Processing job ${job.id}: ${company_name} (taskId: ${taskId}, force_refresh: ${force_refresh})`);

        // Helper function to update progress in enrichment_jobs table
        const updateProgress = async (step, message) => {
          console.log(`[HiringSignalsWorker][${taskId}] ${step}: ${message}`);

          try {
            const progressData = {
              step: step,
              message: message,
              timestamp: new Date().toISOString()
            };

            await pool.query(`
              UPDATE enrichment_jobs
              SET payload = jsonb_set(
                COALESCE(payload, '{}'::jsonb),
                '{progress}',
                $2::jsonb,
                true
              )
              WHERE id = $1
            `, [taskId, JSON.stringify(progressData)]);

          } catch (err) {
            console.error(`[HiringSignalsWorker][${taskId}] Failed to update progress:`, err.message);
          }
        };

        try {
          // Update status to RUNNING
          await pool.query(`
            UPDATE enrichment_jobs
            SET status = 'RUNNING', started_at = NOW()
            WHERE id = $1
          `, [taskId]);

          await updateProgress('initializing', '🚀 Initializing enrichment process...');

          // Step 0: Force refresh - delete existing cached leads if requested
          if (force_refresh) {
            console.log(`[HiringSignalsWorker] ⚠️  FORCE_REFRESH enabled - clearing existing leads for ${company_name}`);
            await updateProgress('cache_clear', `🔄 Force refresh: clearing cached leads for ${company_name}...`);

            try {
              // Delete leads by matching signal_feed->'company_name' or by company lookup
              // This ensures we clear ALL leads for this company regardless of company_id
              const deleteResult = await pool.query(`
                DELETE FROM hr_leads
                WHERE tenant_id = $1
                AND (
                  signal_feed->>'company_name' = $2
                  OR company_id IN (
                    SELECT id FROM targeted_companies
                    WHERE LOWER(TRIM(name)) = LOWER(TRIM($2))
                    OR domain = $3
                  )
                )
              `, [tenantId, company_name, domain]);

              console.log(`[HiringSignalsWorker] Deleted ${deleteResult.rowCount} existing leads for ${company_name}`);
              await updateProgress('cache_cleared', `✅ Cleared ${deleteResult.rowCount} cached leads - processing fresh data`);
            } catch (deleteErr) {
              console.error('[HiringSignalsWorker] Failed to delete cached leads:', deleteErr);
              // Continue anyway - not a critical error
            }
          }

          // Step 1: Find or create company in targeted_companies table
          await updateProgress('company_lookup', '🏢 Looking up company in database...');

          let targetCompanyId = null;
          let targetCompany = null;
          // Look up by domain first (unique constraint), fallback to name
          const companyLookup = await pool.query(`
            SELECT id, name, domain, industry, locations FROM targeted_companies
            WHERE domain = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($2))
            LIMIT 1
          `, [domain, company_name]);

          if (companyLookup.rows.length > 0) {
            targetCompanyId = companyLookup.rows[0].id;
            targetCompany = companyLookup.rows[0];
            console.log('[HiringSignalsWorker] Found existing company:', targetCompanyId, companyLookup.rows[0].name);
            await updateProgress('company_found', `✅ Found ${company_name} in database`);
          } else {
            // Create company in targeted_companies table
            console.log('[HiringSignalsWorker] Creating new company in targeted_companies:', company_name);
            await updateProgress('company_create', `🏢 Creating company profile for ${company_name}...`);

            const locations = location ? [location] : [];

            const insertResult = await pool.query(`
              INSERT INTO targeted_companies (
                id,
                name,
                domain,
                industry,
                locations,
                created_at,
                updated_at
              ) VALUES (
                gen_random_uuid(),
                $1,
                $2,
                $3,
                $4,
                NOW(),
                NOW()
              )
              RETURNING id, name, domain, industry, locations
            `, [
              company_name,
              domain,
              sector,
              locations
            ]);

            targetCompanyId = insertResult.rows[0].id;
            targetCompany = insertResult.rows[0];
            console.log('[HiringSignalsWorker] Created company in targeted_companies:', targetCompanyId);
            await updateProgress('company_created', `✅ Created company profile`);
          }

          // Step 2: Domain + Pattern Discovery via SERP (eliminates hallucination, $0.005)
          let discoveredDomain = null;
          let discoveredPattern = null;
          let discoveryConfidence = 0;
          let discoverySource = null;
          let officialCompanyName = company_name; // Will be updated by simple discovery

          // Use SERP discovery if no domain provided OR to verify/enhance existing domain
          if (process.env.SERPAPI_KEY && company_name) {
            await updateProgress('discovery_search', '🔍 Discovering domain + pattern via SERP...');

            try {
              console.log(`[HiringSignalsWorker] 🎯 SIMPLE 2-SERP DISCOVERY for: ${company_name}`);

              // NEW APPROACH: Simple 2-SERP discovery
              // SERP Call #1: Find company info (official name + domain)
              // SERP Call #2: Find email pattern
              // Result: 3x faster, 10x simpler, same accuracy
              const discovery = await simpleDiscovery(company_name, location);

              console.log(`[HiringSignalsWorker] Simple discovery result:`, {
                official_name: discovery.official_name,
                domain: discovery.domain,
                pattern: discovery.pattern,
                confidence: discovery.confidence,
                source: discovery.source
              });

              if (discovery && discovery.domain && discovery.confidence >= 0.6) {
                discoveredDomain = discovery.domain;
                discoveredPattern = discovery.pattern;
                discoveryConfidence = discovery.confidence;
                discoverySource = discovery.source;
                officialCompanyName = discovery.official_name || company_name; // Use official name from SERP

                console.log(`[HiringSignalsWorker] ✅ SERP discovery successful!`);
                console.log(`[HiringSignalsWorker]    Official Name: ${officialCompanyName} ${officialCompanyName !== company_name ? `(corrected from "${company_name}")` : ''}`);
                console.log(`[HiringSignalsWorker]    Domain: ${discoveredDomain} ${domain && discoveredDomain !== domain ? `(corrected from ${domain}!)` : ''}`);
                console.log(`[HiringSignalsWorker]    Pattern suggested: ${discoveredPattern}`);
                console.log(`[HiringSignalsWorker]    Confidence: ${discoveryConfidence.toFixed(3)}`);
                console.log(`[HiringSignalsWorker]    Source: ${discoverySource}`);
                console.log(`[HiringSignalsWorker]    ⚠️  MUST VALIDATE pattern with REAL Apollo employees!`);

                await updateProgress('discovery_success',
                  `✅ Found ${discoveredDomain} via ${discoverySource} - validating with real employees...`);

              } else {
                console.log(`[HiringSignalsWorker] SERP discovery failed or low confidence`);
                await updateProgress('discovery_fallback', '⚠️ SERP discovery unavailable, using provided domain');
              }

            } catch (discoveryErr) {
              console.error('[HiringSignalsWorker] SERP discovery error:', discoveryErr.message);
              await updateProgress('discovery_error', '⚠️ SERP discovery failed');
            }
          } else {
            console.log('[HiringSignalsWorker] SERP API not configured, using provided domain');
          }

          // Step 3: Apollo Enrichment - ALWAYS REQUIRED for pattern validation
          const hasApollo = !!process.env.APOLLO_API_KEY;
          let effectiveDomain = discoveredDomain || domain;  // Changed to 'let' for domain fallback reassignment
          const isManualOverride = discoverySource === 'manual_override';

          console.log('[HiringSignalsWorker] Apollo API available:', hasApollo);
          console.log('[HiringSignalsWorker] Effective domain for Apollo lookup:', effectiveDomain);
          if (isManualOverride) {
            console.log('[HiringSignalsWorker] 🔒 Manual override detected - domain is LOCKED (no fallback)');
          }

          let apolloLeads = [];

          if (hasApollo && effectiveDomain) {
            // CRITICAL: ALWAYS call Apollo to get REAL employees for pattern validation
            await updateProgress('apollo_search', '🔎 Fetching real employees from Apollo for validation...');

            try {
              // Generate domain fallback alternatives
              // IMPORTANT: Skip fallback if domain came from manual override
              const domainsToTry = [effectiveDomain];

              if (!isManualOverride) {
                // Only try alternatives if NOT a manual override

                // If subdomain exists, try root domain (ae.lulumea.com → lulumea.com)
                const parts = effectiveDomain.split('.');
                if (parts.length > 2) {
                  const rootDomain = parts.slice(-2).join('.');
                  if (rootDomain !== effectiveDomain) {
                    domainsToTry.push(rootDomain);
                  }
                }

                // Try .com if .ae (khansaheb.ae → khansaheb.com)
                if (effectiveDomain.endsWith('.ae')) {
                  const comDomain = effectiveDomain.replace('.ae', '.com');
                  domainsToTry.push(comDomain);
                }

                // Try .ae if .com
                if (effectiveDomain.endsWith('.com')) {
                  const aeDomain = effectiveDomain.replace('.com', '.ae');
                  domainsToTry.push(aeDomain);
                }

                // Filter out .gov.ae domains, try .ae instead (et.gov.ae → et.ae)
                if (effectiveDomain.endsWith('.gov.ae')) {
                  const corporateDomain = effectiveDomain.replace('.gov.ae', '.ae');
                  domainsToTry.push(corporateDomain);
                }
              }

              console.log(`[HiringSignalsWorker] Will try ${domainsToTry.length} domain(s): ${domainsToTry.join(', ')}`);

              // Try each domain until we get results
              for (const domain of domainsToTry) {
                console.log(`[HiringSignalsWorker] Calling Apollo with official name: "${officialCompanyName}" for domain: ${domain}`);

                const apolloResult = await enrichWithApollo({
                  name: officialCompanyName, // Use official company name from SERP discovery
                  domain: domain,
                  strategy: 'wide_net'
                });

                if (apolloResult.ok && apolloResult.results && apolloResult.results.length > 0) {
                  apolloLeads = apolloResult.results;

                  // Extract company size from Apollo metadata
                  if (apolloResult.metadata && apolloResult.metadata.organization_num_employees) {
                    const empCount = apolloResult.metadata.organization_num_employees;
                    targetCompany.size = String(empCount);  // Store employee count for scoring
                    console.log(`[HiringSignalsWorker] 📊 Company size from Apollo: ${empCount} employees`);
                  }

                  // Only update domain if NOT a manual override
                  if (!isManualOverride) {
                    effectiveDomain = domain; // Update to the working domain
                  } else {
                    console.log(`[HiringSignalsWorker] 🔒 Manual override: keeping domain ${effectiveDomain} (not changing to ${domain})`);
                  }

                  console.log(`[HiringSignalsWorker] ✅ Apollo returned ${apolloLeads.length} leads for ${domain}`);
                  await updateProgress('apollo_complete', `✅ Found ${apolloLeads.length} contacts from Apollo (domain: ${domain})`);
                  break;
                } else {
                  console.warn(`[HiringSignalsWorker] Apollo returned no results for ${domain}, trying next...`);
                }
              }

              if (apolloLeads.length === 0) {
                console.warn(`[HiringSignalsWorker] Apollo returned no results for any of ${domainsToTry.length} domain variants`);
                await updateProgress('apollo_empty', `⚠️ Apollo found no contacts for ${domainsToTry.length} domain(s) tried`);
              }

            } catch (apolloErr) {
              console.error('[HiringSignalsWorker] Apollo API error:', apolloErr);
              await updateProgress('apollo_error', '⚠️ Apollo unavailable, using fallback');
            }
          } else {
            console.log('[HiringSignalsWorker] Apollo not available, generating mock leads');
            await updateProgress('mock_mode', '⚠️ Using mock data (Apollo API not configured)');

            // Generate mock leads as fallback
            apolloLeads = [
              {
                name: 'HR Director',
                designation: 'HR Director',
                linkedin_url: null,
                location: location,
                email: null
              },
              {
                name: 'Talent Acquisition Manager',
                designation: 'Talent Acquisition Manager',
                linkedin_url: null,
                location: location,
                email: null
              },
              {
                name: 'People Operations Lead',
                designation: 'People Operations Lead',
                linkedin_url: null,
                location: location,
                email: null
              }
            ];
          }

          if (apolloLeads.length === 0) {
            console.log('[HiringSignalsWorker] No leads found, marking as complete with 0 leads');
            await updateProgress('complete', '🔍 No HR contacts found for this company');

            await pool.query(`
              UPDATE enrichment_jobs
              SET status = 'DONE', leads_found = 0, finished_at = NOW()
              WHERE id = $1
            `, [taskId]);

            return { success: true, leadsFound: 0 };
          }

          // Step 4: Process leads using role bucketing and seniority detection
          await updateProgress('process_roles', '✨ Analyzing roles and seniority levels...');

          const processedLeads = [];

          for (const lead of apolloLeads) {
            // Apply role bucketing
            const role = roleBucket(lead.designation);

            // Apply seniority detection
            const seniority = bucketSeniority(lead.designation);

            // Only keep HR/Finance/Admin roles (same as original enrichment)
            if (['hr', 'finance', 'admin'].includes(role)) {
              processedLeads.push({
                ...lead,
                function: role,
                seniority: seniority
              });
            }
          }

          console.log(`[HiringSignalsWorker] Filtered to ${processedLeads.length} qualified HR/Finance/Admin leads`);

          if (processedLeads.length === 0) {
            console.log('[HiringSignalsWorker] No qualified leads after role filtering');
            await updateProgress('complete', '🔍 No HR/Finance/Admin contacts found');

            await pool.query(`
              UPDATE enrichment_jobs
              SET status = 'DONE', leads_found = 0, finished_at = NOW()
              WHERE id = $1
            `, [taskId]);

            return { success: true, leadsFound: 0 };
          }

          // Step 4: Pattern Validation with EmailPatternEngine
          // ALWAYS validate patterns with real Apollo employees - NEVER skip validation!
          if (effectiveDomain) {
            await updateProgress('email_enrich', '🤖 Validating email pattern with real employees...');

            try {
              // Transform processedLeads to match EmailPatternEngine's expected format
              const candidates = processedLeads.map(lead => {
                // Split name into first and last (Apollo gives us combined name)
                const nameParts = (lead.name || '').trim().split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                return {
                  name: lead.name,
                  first_name: firstName,
                  last_name: lastName,
                  title: lead.designation,  // Map designation → title for pattern engine
                  job_title: lead.designation,
                  linkedin_url: lead.linkedin_url,
                  location: lead.location,
                  function: lead.function,      // PRESERVE role_bucket for scoring
                  seniority: lead.seniority     // PRESERVE seniority for scoring
                };
              });

              // CRITICAL: If manual override, FORCE domain to be the discovered domain
              // This prevents ANY cache or fallback from overriding the manual setting
              if (isManualOverride && discoveredDomain) {
                effectiveDomain = discoveredDomain;
                console.log(`[HiringSignalsWorker] 🔒🔒🔒 MANUAL OVERRIDE ENFORCED: ${effectiveDomain}`);
              }

              console.log(`[HiringSignalsWorker] Calling EmailPatternEngine:`);
              console.log(`  - Apollo employees: ${processedLeads.length}`);
              console.log(`  - SERP suggested pattern: ${discoveredPattern || 'none'}`);
              console.log(`  - SERP confidence: ${discoveryConfidence || 0}`);
              console.log(`  - Effective domain: ${effectiveDomain}`);
              console.log(`  - Is manual override: ${isManualOverride}`);
              console.log(`  - Discovery source: ${discoverySource}`);
              console.log(`  - Will test SERP pattern with real names before storing!`);

              // Call EmailPatternEngine with REAL Apollo data + SERP hints
              const patternResult = await enrichWithPatternEngine({
                company_name: company_name,
                domain: effectiveDomain,
                sector: sector,
                region: location,
                company_size: null,
                candidates: candidates,
                db: pool,  // Pass database connection for pattern storage
                // NEW: Pass SERP hints for validation
                serp_suggested_pattern: discoveredPattern,
                serp_confidence: discoveryConfidence,
                serp_source: discoverySource
              });

              console.log(`[HiringSignalsWorker] Pattern engine result:`, {
                pattern: patternResult.pattern,
                confidence: patternResult.confidence,
                source: patternResult.source,
                validated: patternResult.validation?.valid || 0
              });

              // Check for validation errors
              if (patternResult.error) {
                if (patternResult.error.includes('INSUFFICIENT_REAL_LEADS') ||
                    patternResult.error.includes('INSUFFICIENT_VALID_LEADS')) {
                  console.error('[HiringSignalsWorker] ⚠️  Validation failed: Need more real employees from Apollo');
                  console.error(`[HiringSignalsWorker] Found ${candidates.length} candidates, need 3+ with full names and titles`);
                  await updateProgress('email_error', `⚠️ Need more employees: ${candidates.length}/3 qualified`);
                } else if (patternResult.requires_apollo_data) {
                  console.error('[HiringSignalsWorker] ❌ Apollo integration required but data insufficient');
                  await updateProgress('email_error', '⚠️ Apollo data quality insufficient');
                } else {
                  console.error('[HiringSignalsWorker] Pattern learning error:', patternResult.error);
                  await updateProgress('email_error', '⚠️ Pattern validation failed');
                }

                // Continue with unvalidated emails (processedLeads stay as-is)
                console.warn('[HiringSignalsWorker] Continuing with unvalidated email patterns');
              } else {
                // Success! Update processedLeads with validated emails
                processedLeads.length = 0;
                processedLeads.push(...patternResult.candidates.map(c => ({
                  name: c.name || `${c.first_name} ${c.last_name}`.trim(),
                  designation: c.title || c.job_title,
                  email: c.email,
                  email_status: c.email_validated ? 'validated' : 'patterned',
                  email_confidence: c.email_confidence,
                  email_pattern: c.email_pattern,
                  email_source: c.email_source,
                  linkedin_url: c.linkedin_url,
                  location: c.location,
                  function: candidates.find(orig => orig.name === c.name)?.function || 'unknown',
                  seniority: candidates.find(orig => orig.name === c.name)?.seniority || 'unknown'
                })));

                console.log('[HiringSignalsWorker] ✅ Email enrichment complete with validated pattern');
                await updateProgress('email_complete',
                  `✅ Pattern: ${patternResult.pattern} (confidence: ${(patternResult.confidence * 100).toFixed(0)}%)`
                );
              }

            } catch (emailErr) {
              console.error('[HiringSignalsWorker] Email enrichment error:', emailErr);
              console.error('[HiringSignalsWorker] Stack trace:', emailErr.stack);
              await updateProgress('email_error', `⚠️ Email validation failed: ${emailErr.message}`);
              // Continue with processedLeads as-is (no emails)
            }
          } else {
            console.log('[HiringSignalsWorker] No domain provided, skipping email enrichment');
          }

          // Step 6: Calculate confidence scores
          await updateProgress('scoring', '🎯 Calculating confidence scores...');

          // Build rich company context for scoring
          const companyContext = {
            name: targetCompany.name || company_name,
            size: targetCompany.size || (sector === 'Technology' ? '500+' : '100+'),
            locations: targetCompany.locations || (location ? [location] : []),
            industry: targetCompany.industry || sector
          };

          console.log('[HiringSignalsWorker] Scoring with company context:', JSON.stringify(companyContext));

          for (const lead of processedLeads) {
            lead.confidence = calculatePreviewScore(lead, companyContext);
          }

          // Step 7: Save to hr_leads table
          await updateProgress('save_leads', '💾 Saving qualified leads to database...');

          let savedCount = 0;

          for (const lead of processedLeads) {
            try {
              // Build signal_feed jsonb
              const signal_feed = {
                signal_id: signal_id || taskId,
                trigger_type: 'hiring_signal',
                company_name: company_name,
                sector: sector,
                location: location,
                enrichment_date: new Date().toISOString()
              };

              await pool.query(`
                INSERT INTO hr_leads (
                  id,
                  tenant_id,
                  company_id,
                  name,
                  designation,
                  email,
                  email_status,
                  linkedin_url,
                  location,
                  role_bucket,
                  seniority,
                  confidence,
                  source,
                  signal_feed,
                  created_at,
                  updated_at
                ) VALUES (
                  gen_random_uuid(),
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                  NOW(), NOW()
                )
                ON CONFLICT (linkedin_url) WHERE linkedin_url IS NOT NULL
                DO UPDATE SET
                  email_status = EXCLUDED.email_status,
                  confidence = EXCLUDED.confidence,
                  seniority = EXCLUDED.seniority,
                  signal_feed = EXCLUDED.signal_feed,
                  updated_at = NOW()
              `, [
                tenantId,
                targetCompanyId,
                lead.name,
                lead.designation,
                lead.email,
                lead.email_status || 'patterned',
                lead.linkedin_url,
                lead.location,
                lead.function,
                lead.seniority,
                lead.confidence,
                hasApollo ? 'apollo' : 'mock',
                JSON.stringify(signal_feed)
              ]);

              savedCount++;
              console.log('[HiringSignalsWorker] Saved lead:', lead.name, lead.email, `(confidence: ${Math.round(lead.confidence * 100)}%)`);

            } catch (saveErr) {
              // Log ALL errors for debugging
              console.error('[HiringSignalsWorker] Failed to save lead:', lead.name, '-', saveErr.message);
              console.error('[HiringSignalsWorker] Error details:', saveErr.stack);
            }
          }

          console.log(`[HiringSignalsWorker] Successfully saved ${savedCount} leads to hr_leads table`);

          await updateProgress('complete', `🎉 Found ${savedCount} verified HR contacts!`);

          // Mark task as DONE
          await pool.query(`
            UPDATE enrichment_jobs
            SET status = 'DONE', leads_found = $2, finished_at = NOW()
            WHERE id = $1
          `, [taskId, savedCount]);

          console.log('[HiringSignalsWorker] Task completed successfully:', taskId);

          return { success: true, leadsFound: savedCount };

        } catch (err) {
          console.error('[HiringSignalsWorker] Processing error:', err);
          console.error('[HiringSignalsWorker] Error stack:', err.stack);

          await updateProgress('error', `❌ Error: ${err.message}`);

          // Update job to ERROR
          try {
            await pool.query(`
              UPDATE enrichment_jobs
              SET status = 'ERROR', error = $2, finished_at = NOW()
              WHERE id = $1
            `, [taskId, err.message]);
          } catch (updateErr) {
            console.error('[HiringSignalsWorker] Failed to update task status:', updateErr);
          }

          throw err; // Re-throw to mark BullMQ job as failed
        }
      }, {
        connection,
        concurrency: 5  // Process 5 jobs in parallel (up from default 1)
      });

      worker.on('failed', (job, err) => {
        console.log(`[HiringSignalsWorker] Job ${job?.id || 'unknown'} has failed with ${err.message}`);
      });

      worker.on('completed', (job, result) => {
        console.log(`[HiringSignalsWorker] Job ${job.id} completed successfully. Leads found: ${result.leadsFound}`);
      });

      console.log("[HiringSignalsWorker] --- WORKER INITIALIZATION SUCCEEDED ---. Ready for jobs.");

    } catch (err) {
      console.error("======================================================");
      console.error("[HiringSignalsWorker] FATAL: A critical error occurred during worker startup.");
      console.error(err);
      console.error("======================================================");
      server.close(() => process.exit(1));
    }
  });

  // Graceful shutdown handler
  process.on('SIGTERM', async () => {
    console.log('[HiringSignalsWorker] SIGTERM received. Shutting down gracefully...');
    if (worker) {
      console.log('[HiringSignalsWorker] Closing BullMQ worker...');
      await worker.close();
      console.log('[HiringSignalsWorker] BullMQ worker closed.');
    }
    if (connection) {
      console.log('[HiringSignalsWorker] Quitting Redis connection...');
      await connection.quit();
      console.log('[HiringSignalsWorker] Redis connection quit.');
    }
    server.close(() => {
      console.log('[HiringSignalsWorker] HTTP server closed.');
      process.exit(0);
    });
  });
}
