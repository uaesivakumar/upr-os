// jobs/radarJob.js
// RADAR Job - Pure function for Cloud Scheduler execution
// Called via API route, not direct HTTP endpoint

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Run RADAR discovery scan
 * @param {string} trigger - 'scheduler', 'manual', or 'replay'
 * @param {string} tenantId - Tenant UUID
 * @param {object} options - { promptVersion, budgetLimitUsd }
 * @returns {Promise<object>} Scan results
 */
async function runRadarScan(trigger = 'scheduler', tenantId = null, options = {}) {
  const runId = options.runId || uuidv4();  // Use existing runId if provided
  const startTime = Date.now();

  console.log(`🎯 RADAR SCAN INITIATED [run_id=${runId}] [trigger=${trigger}] [existing=${!!options.runId}]`);

  try {
    // Lazy-load dependencies to avoid circular imports
    const pool = require('../server/db.js').default;
    const RadarAgent = require('../server/agents/radarAgent.js').default;
    const RadarService = require('../server/services/radar.js').default;

    // Get config
    const radarEnabled = process.env.RADAR_ENABLED !== 'false';
    const maxBudget = options.budgetLimitUsd || parseFloat(process.env.MAX_RUN_BUDGET_USD || '2.00');
    const promptVersion = options.promptVersion || 'v1.0';

    if (!radarEnabled) {
      console.log('⚠️ RADAR DISABLED via feature flag');
      return { success: false, reason: 'radar_disabled' };
    }

    // Get tenant
    if (!tenantId) {
      tenantId = process.env.TENANT_ID;
      if (!tenantId) {
        const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
        if (tenantResult.rows.length === 0) {
          throw new Error('No tenant found');
        }
        tenantId = tenantResult.rows[0].id;
      }
    }

    // Generate inputs hash for idempotency (daily runs)
    const inputsHash = crypto
      .createHash('sha256')
      .update(`${tenantId}-${trigger}-${new Date().toISOString().split('T')[0]}`)
      .digest('hex');

    // Check if already ran today with same config
    const existingRun = await RadarService.findDuplicateRun(inputsHash);

    if (existingRun && existingRun.status === 'completed') {
      console.log(`✅ Already ran today with config ${inputsHash.slice(0, 8)}`);
      return {
        success: true,
        cached: true,
        run_id: existingRun.run_id,
        companies_found: existingRun.companies_found,
        companies_accepted: existingRun.companies_accepted,
        cost_usd: parseFloat(existingRun.cost_usd)
      };
    }

    // Create run record (or use existing if runId provided)
    let run;
    if (options.runId) {
      // Run already created by POST endpoint, just fetch it
      run = await RadarService.getRun(runId);
      console.log(`📝 Using existing run record: ${run.run_id}`);
    } else {
      // Create new run record
      run = await RadarService.createRun({
        tenantId,
        trigger,
        promptVersion,
        budgetLimitUsd: maxBudget,
        metadata: {
          inputs_hash: inputsHash,
          started_by: 'radar_job'
        }
      });
      console.log(`📝 Run record created: ${run.run_id}`);
    }

    // Get enabled sources (ordered by cost efficiency)
    const allSources = await RadarService.getSources();
    const enabledSources = allSources.slice(0, 3); // Top 3 sources

    console.log(`📡 Selected sources: ${enabledSources.map(s => s.name).join(', ')}`);

    if (enabledSources.length === 0) {
      throw new Error('No discovery sources available');
    }

    // Execute scan for each source
    let totalCompaniesFound = 0;
    let totalCompaniesAccepted = 0;
    let totalCost = 0;
    const errors = [];

    for (const source of enabledSources) {
      // Check budget before each source
      if (totalCost >= maxBudget) {
        console.warn(`⚠️ Budget limit reached: $${totalCost.toFixed(4)}`);
        break;
      }

      try {
        console.log(`🔍 Running discovery for source: ${source.name}`);

        const result = await RadarAgent.runDiscovery({
          sourceId: source.source_id,
          sourceName: source.name,
          sourceType: source.type,
          runId: run.run_id,
          tenantId,
          budgetLimitUsd: maxBudget - totalCost // Remaining budget
        });

        totalCompaniesFound += result.companiesFound;
        totalCompaniesAccepted += result.companies.length;
        totalCost += result.costUsd;

        console.log(`✅ Source ${source.name}: ${result.companiesFound} found, $${result.costUsd.toFixed(4)}`);

      } catch (error) {
        console.error(`❌ Error processing source ${source.name}:`, error);
        errors.push({ source: source.name, error: error.message });
        // Continue with next source instead of failing entire run
      }
    }

    // Update run record
    const endTime = Date.now();
    const latency = endTime - startTime;

    await RadarService.completeRun(run.run_id, {
      companiesFound: totalCompaniesFound,
      companiesAccepted: totalCompaniesAccepted,
      costUsd: totalCost,
      latencyMs: latency
    });

    console.log(`✅ RADAR SCAN COMPLETE [run_id=${run.run_id}] [companies=${totalCompaniesAccepted}] [cost=$${totalCost.toFixed(4)}] [latency=${(latency/1000).toFixed(1)}s]`);

    return {
      success: true,
      run_id: run.run_id,
      companies_found: totalCompaniesFound,
      companies_accepted: totalCompaniesAccepted,
      cost_usd: parseFloat(totalCost.toFixed(4)),
      latency_ms: latency,
      sources_used: enabledSources.length,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    console.error(`❌ RADAR SCAN FAILED [run_id=${runId}]`, error);

    // Try to update run status if it was created
    try {
      const RadarService = require('../server/services/radar.js').default;
      await RadarService.failRun(runId, error.message);
    } catch (updateError) {
      console.error('Failed to mark run as failed:', updateError);
    }

    throw error;
  }
}

module.exports = { runRadarScan };
