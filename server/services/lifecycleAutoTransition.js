/**
 * Lifecycle Auto-Transition Logic
 * Automatically executes state transitions based on rules and conditions
 *
 * Responsibilities:
 * - Run periodic checks for auto-transitions
 * - Execute bulk transitions
 * - Log transition results
 * - Handle errors gracefully
 * - Schedule next runs
 */

import { TriggerTypes } from './lifecycleStateEngine.js';

export class LifecycleAutoTransition {
  constructor(engine, triggers, options = {}) {
    this.engine = engine;
    this.triggers = triggers;
    this.options = {
      batchSize: options.batchSize || 50,
      dryRun: options.dryRun || false,
      logResults: options.logResults !== false,
      maxErrorsPerBatch: options.maxErrorsPerBatch || 5
    };

    this.stats = {
      totalChecked: 0,
      totalTransitioned: 0,
      totalErrors: 0,
      lastRun: null,
      runHistory: []
    };
  }

  /**
   * Execute a single auto-transition
   */
  async executeTransition(opportunityId, toState, rule, metadata = {}) {
    try {
      const result = await this.engine.transition(opportunityId, toState, {
        triggerType: TriggerTypes.AUTO,
        triggerReason: `Auto-transition: ${rule.rule_name} - ${rule.description || ''}`,
        metadata: {
          ...metadata,
          rule_name: rule.rule_name,
          rule_id: rule.id,
          auto_transition: true
        }
      });

      return {
        success: true,
        opportunityId,
        toState,
        result
      };
    } catch (error) {
      console.error(`Auto-transition error for ${opportunityId}:`, error.message);

      return {
        success: false,
        opportunityId,
        toState,
        error: error.message
      };
    }
  }

  /**
   * Execute transitions for a batch of opportunities
   */
  async executeBatch(rule, opportunities) {
    const results = {
      rule: rule.rule_name,
      total: opportunities.length,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (const opp of opportunities) {
      // Check if we've hit max errors for this batch
      if (results.failed >= this.options.maxErrorsPerBatch) {
        console.warn(`Stopping batch ${rule.rule_name} - max errors reached`);
        break;
      }

      if (this.options.dryRun) {
        console.log(`[DRY RUN] Would transition ${opp.opportunity_id}: ${rule.from_state} → ${rule.to_state}`);
        results.succeeded++;
        continue;
      }

      const result = await this.executeTransition(
        opp.opportunity_id,
        rule.to_state,
        rule,
        opp.metadata
      );

      if (result.success) {
        results.succeeded++;
      } else {
        results.failed++;
        results.errors.push({
          opportunityId: opp.opportunity_id,
          error: result.error
        });
      }

      // Small delay to avoid overwhelming the database
      await this.sleep(10);
    }

    return results;
  }

  /**
   * Run all auto-transition checks
   */
  async runAll() {
    const startTime = Date.now();

    console.log('\n' + '='.repeat(70));
    console.log('AUTO-TRANSITION CHECK STARTED');
    console.log('='.repeat(70));
    console.log(`Mode: ${this.options.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('');

    try {
      // Get all eligible transitions
      const eligible = await this.triggers.checkAllRules();

      console.log(`📊 Found ${eligible.length} rules with eligible opportunities\n`);

      const batchResults = [];

      for (const { rule, opportunities } of eligible) {
        console.log(`🔄 Processing: ${rule.rule_name}`);
        console.log(`   From: ${rule.from_state} → To: ${rule.to_state}`);
        console.log(`   Eligible: ${opportunities.length} opportunities`);

        // Process in batches
        const batches = this.chunkArray(opportunities, this.options.batchSize);

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          console.log(`   Batch ${i + 1}/${batches.length}: ${batch.length} opportunities`);

          const result = await this.executeBatch(rule, batch);
          batchResults.push(result);

          console.log(`   ✅ Succeeded: ${result.succeeded}`);
          if (result.failed > 0) {
            console.log(`   ❌ Failed: ${result.failed}`);
          }
        }

        console.log('');
      }

      // Calculate totals
      const totalChecked = eligible.reduce((sum, e) => sum + e.opportunities.length, 0);
      const totalSucceeded = batchResults.reduce((sum, r) => sum + r.succeeded, 0);
      const totalFailed = batchResults.reduce((sum, r) => sum + r.failed, 0);

      // Update stats
      this.stats.totalChecked += totalChecked;
      this.stats.totalTransitioned += totalSucceeded;
      this.stats.totalErrors += totalFailed;
      this.stats.lastRun = new Date().toISOString();

      const runStats = {
        timestamp: this.stats.lastRun,
        checked: totalChecked,
        transitioned: totalSucceeded,
        errors: totalFailed,
        duration: Date.now() - startTime,
        batches: batchResults
      };

      this.stats.runHistory.push(runStats);

      // Keep only last 100 runs
      if (this.stats.runHistory.length > 100) {
        this.stats.runHistory.shift();
      }

      // Print summary
      console.log('='.repeat(70));
      console.log('AUTO-TRANSITION SUMMARY');
      console.log('='.repeat(70));
      console.log(`Total Checked: ${totalChecked}`);
      console.log(`Total Transitioned: ${totalSucceeded} ✅`);
      console.log(`Total Errors: ${totalFailed} ❌`);
      console.log(`Duration: ${Math.round((Date.now() - startTime) / 1000)}s`);
      console.log('='.repeat(70));
      console.log('');

      return runStats;

    } catch (error) {
      console.error('❌ Auto-transition check failed:', error);
      throw error;
    }
  }

  /**
   * Run specific transition check (e.g., QUALIFIED → OUTREACH)
   */
  async runSpecific(transitionType) {
    const handlers = {
      'qualified_to_outreach': async () => {
        const opps = await this.triggers.getReadyForOutreach();
        return { from: 'QUALIFIED', to: 'OUTREACH', opportunities: opps };
      },
      'engaged_to_dormant': async () => {
        const opps = await this.triggers.getReadyForDormantFromEngaged();
        return { from: 'ENGAGED', to: 'DORMANT', opportunities: opps };
      },
      'negotiating_to_dormant': async () => {
        const opps = await this.triggers.getReadyForDormantFromNegotiating();
        return { from: 'NEGOTIATING', to: 'DORMANT', opportunities: opps };
      },
      'dormant_to_outreach': async () => {
        const opps = await this.triggers.getReadyForReengagement();
        return { from: 'DORMANT', to: 'OUTREACH', opportunities: opps };
      },
      'outreach_to_dormant': async () => {
        const opps = await this.triggers.getReadyForDormantFromOutreach();
        return { from: 'OUTREACH', to: 'DORMANT', opportunities: opps };
      }
    };

    if (!handlers[transitionType]) {
      throw new Error(`Unknown transition type: ${transitionType}`);
    }

    console.log(`\n🔄 Running specific transition: ${transitionType}`);

    const { from, to, opportunities } = await handlers[transitionType]();

    console.log(`   From: ${from} → To: ${to}`);
    console.log(`   Eligible: ${opportunities.length} opportunities\n`);

    if (opportunities.length === 0) {
      console.log('✅ No opportunities eligible for this transition');
      return { total: 0, succeeded: 0, failed: 0 };
    }

    const rule = {
      rule_name: transitionType,
      from_state: from,
      to_state: to,
      description: `Auto-transition: ${from} → ${to}`
    };

    return await this.executeBatch(rule, opportunities);
  }

  /**
   * Get transition summary without executing
   */
  async getSummary() {
    return await this.triggers.getTransitionSummary();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      averagePerRun: this.stats.runHistory.length > 0
        ? Math.round(this.stats.totalTransitioned / this.stats.runHistory.length)
        : 0,
      errorRate: this.stats.totalChecked > 0
        ? ((this.stats.totalErrors / this.stats.totalChecked) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Schedule periodic checks (returns interval ID)
   */
  schedule(intervalMinutes = 60) {
    console.log(`⏰ Scheduling auto-transitions every ${intervalMinutes} minutes`);

    const intervalMs = intervalMinutes * 60 * 1000;

    return setInterval(async () => {
      try {
        await this.runAll();
      } catch (error) {
        console.error('Scheduled auto-transition failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Helper: Split array into chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Helper: Sleep for ms milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enable/disable dry run mode
   */
  setDryRun(enabled) {
    this.options.dryRun = enabled;
    console.log(`Dry run mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
}

export default LifecycleAutoTransition;
