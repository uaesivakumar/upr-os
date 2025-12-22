/**
 * Founder Trust Report Generator
 *
 * NOT A PRODUCT UI. A confidence artifact.
 *
 * Generates weekly report for manual founder review:
 * - Top 10 ACT decisions
 * - Top 10 WAIT decisions
 * - 5 IGNORE justifications
 * - 3 BLOCK explanations
 *
 * Each with:
 * - Company name
 * - Signal
 * - Reasoning trace
 * - Tools used
 * - Decision timestamp
 *
 * This is how trust is earned.
 */

import pool from '../../../server/db.js';
import fs from 'fs';
import path from 'path';

/**
 * Generate weekly Founder Trust Report
 *
 * @param {Date} weekStart - Start of the week (defaults to last Monday)
 * @returns {Object} Report data
 */
export async function generateWeeklyReport(weekStart = null) {
  // Calculate week boundaries
  if (!weekStart) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday - 7); // Last Monday
    weekStart.setHours(0, 0, 0, 0);
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  console.log(`[TRUST_REPORT] Generating report for week ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`);

  // Fetch decisions for the week
  const decisionsResult = await pool.query(`
    SELECT
      shadow_id,
      timestamp,
      company_name,
      company_industry,
      company_size,
      company_location,
      signals,
      decision,
      decision_reason,
      scores,
      tier,
      trace
    FROM sales_bench_shadow_decisions
    WHERE timestamp >= $1 AND timestamp < $2
    ORDER BY timestamp DESC
  `, [weekStart.toISOString(), weekEnd.toISOString()]);

  const decisions = decisionsResult.rows;

  // Group by decision type
  const byDecision = {
    ACT: decisions.filter(d => d.decision === 'ACT'),
    WAIT: decisions.filter(d => d.decision === 'WAIT'),
    IGNORE: decisions.filter(d => d.decision === 'IGNORE'),
    BLOCK: decisions.filter(d => d.decision === 'BLOCK'),
  };

  // Build report sections
  const report = {
    week_start: weekStart.toISOString().split('T')[0],
    week_end: weekEnd.toISOString().split('T')[0],
    generated_at: new Date().toISOString(),
    total_decisions: decisions.length,

    summary: {
      ACT: byDecision.ACT.length,
      WAIT: byDecision.WAIT.length,
      IGNORE: byDecision.IGNORE.length,
      BLOCK: byDecision.BLOCK.length,
    },

    // Top 10 ACT decisions
    top_act: byDecision.ACT.slice(0, 10).map(formatDecision),

    // Top 10 WAIT decisions
    top_wait: byDecision.WAIT.slice(0, 10).map(formatDecision),

    // 5 IGNORE justifications
    ignore_samples: byDecision.IGNORE.slice(0, 5).map(formatDecision),

    // 3 BLOCK explanations
    block_samples: byDecision.BLOCK.slice(0, 3).map(formatDecision),
  };

  return report;
}

/**
 * Format a decision for the report
 */
function formatDecision(d) {
  const signals = typeof d.signals === 'string' ? JSON.parse(d.signals) : d.signals;
  const scores = typeof d.scores === 'string' ? JSON.parse(d.scores) : d.scores;
  const trace = typeof d.trace === 'string' ? JSON.parse(d.trace) : d.trace;

  return {
    company_name: d.company_name,
    industry: d.company_industry,
    size: d.company_size,
    location: d.company_location,

    signal: signals.length > 0 ? {
      type: signals[0].type,
      age_days: signals[0].age_days,
      strength: signals[0].strength,
    } : null,

    decision: d.decision,
    reasoning: d.decision_reason,

    scores: {
      quality: scores?.quality,
      timing: scores?.timing,
      overall: scores?.overall,
    },

    trace: {
      tools_used: trace?.tools_used || [],
      policy_gates_hit: (trace?.policy_gates_hit || []).map(g => g.gate_name),
      latency_ms: trace?.latency_ms,
    },

    timestamp: d.timestamp,
  };
}

/**
 * Generate markdown report for founder review
 */
export async function generateMarkdownReport(weekStart = null) {
  const report = await generateWeeklyReport(weekStart);

  let md = `# Founder Trust Report
## Week: ${report.week_start} to ${report.week_end}

**Generated:** ${report.generated_at}
**Total Decisions:** ${report.total_decisions}

### Summary

| Decision | Count |
|----------|-------|
| ACT | ${report.summary.ACT} |
| WAIT | ${report.summary.WAIT} |
| IGNORE | ${report.summary.IGNORE} |
| BLOCK | ${report.summary.BLOCK} |

---

## Top 10 ACT Decisions

*Companies SIVA recommends pursuing now.*

`;

  for (const d of report.top_act) {
    md += formatDecisionMarkdown(d);
  }

  md += `
---

## Top 10 WAIT Decisions

*Companies with potential, but timing/signals weak.*

`;

  for (const d of report.top_wait) {
    md += formatDecisionMarkdown(d);
  }

  md += `
---

## IGNORE Samples (5)

*Companies correctly filtered out.*

`;

  for (const d of report.ignore_samples) {
    md += formatDecisionMarkdown(d);
  }

  md += `
---

## BLOCK Samples (3)

*Companies blocked by policy.*

`;

  for (const d of report.block_samples) {
    md += formatDecisionMarkdown(d);
  }

  md += `
---

*This report is for manual founder review only.*
*No automation. No outreach. Just observation.*

*DISCOVERY_V1_FROZEN — Baseline ruler.*
`;

  return md;
}

/**
 * Format a single decision as markdown
 */
function formatDecisionMarkdown(d) {
  if (!d) return '';

  return `
### ${d.company_name}

| Field | Value |
|-------|-------|
| Industry | ${d.industry || 'Unknown'} |
| Size | ${d.size || 'Unknown'} employees |
| Location | ${d.location || 'Unknown'} |
| Signal | ${d.signal ? `${d.signal.type} (${d.signal.age_days}d old)` : 'None'} |
| Quality | ${d.scores?.quality || 'N/A'} |
| Timing | ${d.scores?.timing || 'N/A'} |
| Overall | ${d.scores?.overall || 'N/A'} |
| Tools | ${d.trace?.tools_used?.join(', ') || 'None'} |
| Timestamp | ${new Date(d.timestamp).toISOString()} |

**Reasoning:** ${d.reasoning || 'N/A'}

`;
}

/**
 * Save report to file
 */
export async function saveReport(weekStart = null) {
  const report = await generateMarkdownReport(weekStart);

  const reportDir = path.join(process.cwd(), 'docs', 'sales-bench', 'trust-reports');

  // Ensure directory exists
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportData = await generateWeeklyReport(weekStart);
  const filename = `TRUST_REPORT_${reportData.week_start}_to_${reportData.week_end}.md`;
  const filepath = path.join(reportDir, filename);

  fs.writeFileSync(filepath, report);
  console.log(`[TRUST_REPORT] Saved to ${filepath}`);

  return filepath;
}

export default {
  generateWeeklyReport,
  generateMarkdownReport,
  saveReport,
};
