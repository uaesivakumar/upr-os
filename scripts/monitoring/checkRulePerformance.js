#!/usr/bin/env node
/**
 * Automated Rule Performance Monitoring - Sprint 27
 *
 * Monitors rule engine performance and triggers alerts when degradation detected
 *
 * Trigger Conditions (any one):
 * 1. Success rate < 85% (100+ feedback samples)
 * 2. Avg confidence < 0.75 (200+ decisions)
 * 3. Pending feedback > 100 (unanalyzed decisions)
 * 4. Match rate degraded > 10% (inline vs rule mismatch)
 *
 * Actions on Trigger:
 * - Send Sentry alert
 * - Log to Slack (if webhook configured)
 * - Create training samples from failed decisions
 * - Generate analysis report
 *
 * Usage:
 *   node scripts/monitoring/checkRulePerformance.js [--tool=CompanyQualityTool]
 *
 * Scheduled via Cloud Scheduler:
 *   Every 6 hours: 0 */6 * * *
 */

const db = require('../../utils/db');
const Sentry = require('@sentry/node');

// Configuration
const THRESHOLDS = {
  MIN_SUCCESS_RATE: 0.85,           // 85%
  MIN_CONFIDENCE: 0.75,             // 0.75
  MAX_PENDING_FEEDBACK: 100,        // 100 decisions
  MAX_MATCH_RATE_DEGRADATION: 0.10  // 10%
};

const SAMPLE_SIZE_REQUIREMENTS = {
  SUCCESS_RATE: 100,   // Need 100+ feedback samples
  CONFIDENCE: 200,     // Need 200+ decisions
  MATCH_RATE: 50       // Need 50+ decisions
};

async function checkRulePerformance(toolName = null) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Automated Rule Performance Check');
  console.log(`Tool Filter: ${toolName || 'ALL'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const alerts = [];

  try {
    // Build tool filter
    const toolFilter = toolName ? `AND tool_name = '${toolName}'` : '';

    // ═══════════════════════════════════════════════════════
    // CHECK 1: Success Rate (from feedback)
    // ═══════════════════════════════════════════════════════
    console.log('📊 Check 1: Success Rate Analysis\n');

    const successRateQuery = await db.query(`
      SELECT
        d.tool_name,
        d.rule_version,
        COUNT(DISTINCT d.decision_id) as total_decisions,
        COUNT(DISTINCT f.feedback_id) as feedback_count,
        AVG(CASE WHEN f.outcome_positive = true THEN 1.0
                 WHEN f.outcome_positive = false THEN 0.0
                 ELSE NULL END) as success_rate,
        COUNT(CASE WHEN f.outcome_positive = false THEN 1 END) as failed_count
      FROM agent_core.agent_decisions d
      LEFT JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
      WHERE d.decided_at >= NOW() - INTERVAL '7 days'
        ${toolFilter}
      GROUP BY d.tool_name, d.rule_version
      HAVING COUNT(DISTINCT f.feedback_id) >= $1
      ORDER BY success_rate ASC NULLS FIRST
    `, [SAMPLE_SIZE_REQUIREMENTS.SUCCESS_RATE]);

    for (const row of successRateQuery.rows) {
      const successRate = row.success_rate !== null ? parseFloat(row.success_rate) : null;

      if (successRate !== null && successRate < THRESHOLDS.MIN_SUCCESS_RATE) {
        const alert = {
          severity: 'critical',
          trigger: 'SUCCESS_RATE_LOW',
          tool: row.tool_name,
          rule_version: row.rule_version,
          metric: 'success_rate',
          current_value: successRate,
          threshold: THRESHOLDS.MIN_SUCCESS_RATE,
          sample_size: parseInt(row.feedback_count),
          failed_decisions: parseInt(row.failed_count),
          message: `Success rate below threshold: ${(successRate * 100).toFixed(1)}% < ${(THRESHOLDS.MIN_SUCCESS_RATE * 100).toFixed(0)}%`,
          recommendation: 'Review failed decisions and consider rule adjustment'
        };

        alerts.push(alert);
        console.log(`❌ ALERT: ${alert.tool} ${alert.rule_version}`);
        console.log(`   Success Rate: ${(successRate * 100).toFixed(1)}% (threshold: ${(THRESHOLDS.MIN_SUCCESS_RATE * 100).toFixed(0)}%)`);
        console.log(`   Failed Decisions: ${row.failed_count}/${row.feedback_count}`);
        console.log(`   Recommendation: ${alert.recommendation}\n`);
      } else if (successRate !== null) {
        console.log(`✅ OK: ${row.tool_name} ${row.rule_version}`);
        console.log(`   Success Rate: ${(successRate * 100).toFixed(1)}% (${row.feedback_count} samples)\n`);
      }
    }

    if (successRateQuery.rows.length === 0) {
      console.log('⚠️  No tools with sufficient feedback samples (need 100+)\n');
    }

    // ═══════════════════════════════════════════════════════
    // CHECK 2: Confidence Score
    // ═══════════════════════════════════════════════════════
    console.log('📊 Check 2: Confidence Score Analysis\n');

    const confidenceQuery = await db.query(`
      SELECT
        tool_name,
        rule_version,
        COUNT(DISTINCT decision_id) as total_decisions,
        AVG(confidence_score) as avg_confidence,
        MIN(confidence_score) as min_confidence,
        COUNT(CASE WHEN confidence_score < 0.75 THEN 1 END) as low_confidence_count
      FROM agent_core.agent_decisions
      WHERE decided_at >= NOW() - INTERVAL '7 days'
        AND confidence_score IS NOT NULL
        ${toolFilter}
      GROUP BY tool_name, rule_version
      HAVING COUNT(DISTINCT decision_id) >= $1
      ORDER BY avg_confidence ASC
    `, [SAMPLE_SIZE_REQUIREMENTS.CONFIDENCE]);

    for (const row of confidenceQuery.rows) {
      const avgConfidence = parseFloat(row.avg_confidence);

      if (avgConfidence < THRESHOLDS.MIN_CONFIDENCE) {
        const alert = {
          severity: 'warning',
          trigger: 'CONFIDENCE_LOW',
          tool: row.tool_name,
          rule_version: row.rule_version,
          metric: 'avg_confidence',
          current_value: avgConfidence,
          threshold: THRESHOLDS.MIN_CONFIDENCE,
          sample_size: parseInt(row.total_decisions),
          low_confidence_count: parseInt(row.low_confidence_count),
          message: `Average confidence below threshold: ${avgConfidence.toFixed(3)} < ${THRESHOLDS.MIN_CONFIDENCE.toFixed(2)}`,
          recommendation: 'Review low-confidence decisions and improve rule clarity'
        };

        alerts.push(alert);
        console.log(`⚠️  ALERT: ${alert.tool} ${alert.rule_version}`);
        console.log(`   Avg Confidence: ${avgConfidence.toFixed(3)} (threshold: ${THRESHOLDS.MIN_CONFIDENCE.toFixed(2)})`);
        console.log(`   Low Confidence Count: ${row.low_confidence_count}/${row.total_decisions}`);
        console.log(`   Recommendation: ${alert.recommendation}\n`);
      } else {
        console.log(`✅ OK: ${row.tool_name} ${row.rule_version}`);
        console.log(`   Avg Confidence: ${avgConfidence.toFixed(3)} (${row.total_decisions} decisions)\n`);
      }
    }

    if (confidenceQuery.rows.length === 0) {
      console.log('⚠️  No tools with sufficient decisions (need 200+)\n');
    }

    // ═══════════════════════════════════════════════════════
    // CHECK 3: Pending Feedback
    // ═══════════════════════════════════════════════════════
    console.log('📊 Check 3: Pending Feedback Analysis\n');

    const pendingFeedbackQuery = await db.query(`
      SELECT
        d.tool_name,
        d.rule_version,
        COUNT(DISTINCT d.decision_id) as total_decisions,
        COUNT(DISTINCT f.feedback_id) as feedback_count,
        COUNT(DISTINCT d.decision_id) - COUNT(DISTINCT f.feedback_id) as pending_feedback
      FROM agent_core.agent_decisions d
      LEFT JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
      WHERE d.decided_at >= NOW() - INTERVAL '7 days'
        ${toolFilter}
      GROUP BY d.tool_name, d.rule_version
      HAVING (COUNT(DISTINCT d.decision_id) - COUNT(DISTINCT f.feedback_id)) > $1
      ORDER BY pending_feedback DESC
    `, [THRESHOLDS.MAX_PENDING_FEEDBACK]);

    for (const row of pendingFeedbackQuery.rows) {
      const pendingFeedback = parseInt(row.pending_feedback);

      const alert = {
        severity: 'info',
        trigger: 'PENDING_FEEDBACK_HIGH',
        tool: row.tool_name,
        rule_version: row.rule_version,
        metric: 'pending_feedback',
        current_value: pendingFeedback,
        threshold: THRESHOLDS.MAX_PENDING_FEEDBACK,
        total_decisions: parseInt(row.total_decisions),
        feedback_count: parseInt(row.feedback_count),
        message: `High pending feedback count: ${pendingFeedback} decisions without feedback`,
        recommendation: 'Encourage feedback collection or reduce decision logging'
      };

      alerts.push(alert);
      console.log(`ℹ️  ALERT: ${alert.tool} ${alert.rule_version}`);
      console.log(`   Pending Feedback: ${pendingFeedback} (${row.total_decisions} total, ${row.feedback_count} with feedback)`);
      console.log(`   Recommendation: ${alert.recommendation}\n`);
    }

    if (pendingFeedbackQuery.rows.length === 0) {
      console.log('✅ All tools have acceptable pending feedback levels\n');
    }

    // ═══════════════════════════════════════════════════════
    // CHECK 4: Match Rate (Inline vs Rule Engine)
    // ═══════════════════════════════════════════════════════
    console.log('📊 Check 4: Match Rate Analysis (Shadow Mode)\n');

    const matchRateQuery = await db.query(`
      SELECT
        tool_name,
        rule_version,
        COUNT(DISTINCT decision_id) as total_decisions,
        COUNT(CASE
          WHEN output_data->'comparison'->>'match' = 'true' THEN 1
        END) as match_count,
        COUNT(CASE
          WHEN output_data->'comparison'->>'match' = 'false' THEN 1
        END) as mismatch_count,
        AVG(CASE
          WHEN output_data->'comparison'->>'match' = 'true' THEN 1.0
          WHEN output_data->'comparison'->>'match' = 'false' THEN 0.0
          ELSE NULL
        END) as match_rate
      FROM agent_core.agent_decisions
      WHERE decided_at >= NOW() - INTERVAL '7 days'
        AND output_data->'comparison' IS NOT NULL
        AND output_data->'comparison'->>'match' IS NOT NULL
        ${toolFilter}
      GROUP BY tool_name, rule_version
      HAVING COUNT(DISTINCT decision_id) >= $1
      ORDER BY match_rate ASC NULLS FIRST
    `, [SAMPLE_SIZE_REQUIREMENTS.MATCH_RATE]);

    for (const row of matchRateQuery.rows) {
      const matchRate = row.match_rate !== null ? parseFloat(row.match_rate) : null;

      if (matchRate !== null) {
        const degradation = 1.0 - matchRate;

        if (degradation > THRESHOLDS.MAX_MATCH_RATE_DEGRADATION) {
          const alert = {
            severity: 'warning',
            trigger: 'MATCH_RATE_DEGRADED',
            tool: row.tool_name,
            rule_version: row.rule_version,
            metric: 'match_rate',
            current_value: matchRate,
            threshold: 1.0 - THRESHOLDS.MAX_MATCH_RATE_DEGRADATION,
            sample_size: parseInt(row.total_decisions),
            mismatch_count: parseInt(row.mismatch_count),
            message: `Match rate degraded: ${(matchRate * 100).toFixed(1)}% (${(degradation * 100).toFixed(1)}% degradation)`,
            recommendation: 'Review mismatched decisions and align inline logic with rule engine'
          };

          alerts.push(alert);
          console.log(`⚠️  ALERT: ${alert.tool} ${alert.rule_version}`);
          console.log(`   Match Rate: ${(matchRate * 100).toFixed(1)}% (degradation: ${(degradation * 100).toFixed(1)}%)`);
          console.log(`   Mismatches: ${row.mismatch_count}/${row.total_decisions}`);
          console.log(`   Recommendation: ${alert.recommendation}\n`);
        } else {
          console.log(`✅ OK: ${row.tool_name} ${row.rule_version}`);
          console.log(`   Match Rate: ${(matchRate * 100).toFixed(1)}% (${row.total_decisions} decisions)\n`);
        }
      }
    }

    if (matchRateQuery.rows.length === 0) {
      console.log('⚠️  No shadow mode data available (need 50+ decisions with comparison)\n');
    }

    // ═══════════════════════════════════════════════════════
    // SUMMARY & ACTIONS
    // ═══════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Summary\n');

    if (alerts.length === 0) {
      console.log('✅ No alerts triggered. All metrics within acceptable thresholds.\n');
    } else {
      console.log(`⚠️  ${alerts.length} alert(s) triggered:\n`);

      // Group by severity
      const critical = alerts.filter(a => a.severity === 'critical');
      const warnings = alerts.filter(a => a.severity === 'warning');
      const info = alerts.filter(a => a.severity === 'info');

      if (critical.length > 0) {
        console.log(`🔴 Critical Alerts: ${critical.length}`);
        critical.forEach(a => console.log(`   - ${a.tool} ${a.rule_version}: ${a.message}`));
        console.log();
      }

      if (warnings.length > 0) {
        console.log(`🟡 Warning Alerts: ${warnings.length}`);
        warnings.forEach(a => console.log(`   - ${a.tool} ${a.rule_version}: ${a.message}`));
        console.log();
      }

      if (info.length > 0) {
        console.log(`🔵 Info Alerts: ${info.length}`);
        info.forEach(a => console.log(`   - ${a.tool} ${a.rule_version}: ${a.message}`));
        console.log();
      }

      // Send alerts to Sentry
      console.log('📤 Sending alerts to Sentry...');
      for (const alert of alerts) {
        Sentry.captureMessage(`Rule Performance Alert: ${alert.trigger}`, {
          level: alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info',
          tags: {
            alert_type: 'rule_performance',
            trigger: alert.trigger,
            tool: alert.tool,
            rule_version: alert.rule_version,
            metric: alert.metric
          },
          extra: alert
        });
      }
      console.log(`✅ ${alerts.length} alert(s) sent to Sentry\n`);

      // Send to Slack (if webhook configured)
      const slackWebhook = process.env.SLACK_WEBHOOK_URL;
      if (slackWebhook) {
        console.log('📤 Sending alerts to Slack...');
        await sendSlackAlert(slackWebhook, alerts);
        console.log('✅ Alerts sent to Slack\n');
      }

      // Create training samples from failed decisions (critical alerts only)
      if (critical.length > 0) {
        console.log('📝 Creating training samples from failed decisions...');
        await createTrainingSamples(critical);
        console.log('✅ Training samples created\n');
      }
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    // Return status code
    process.exit(alerts.filter(a => a.severity === 'critical').length > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Error checking rule performance:', error.message);
    console.error(error);
    Sentry.captureException(error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

/**
 * Send alerts to Slack
 */
async function sendSlackAlert(webhookUrl, alerts) {
  const fetch = require('node-fetch');

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  const color = criticalCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'good';

  const payload = {
    username: 'Rule Performance Monitor',
    icon_emoji: ':robot_face:',
    attachments: [
      {
        color: color,
        title: '⚠️ Rule Performance Alerts',
        text: `${alerts.length} alert(s) triggered`,
        fields: [
          {
            title: 'Critical',
            value: criticalCount.toString(),
            short: true
          },
          {
            title: 'Warnings',
            value: warningCount.toString(),
            short: true
          },
          {
            title: 'Info',
            value: infoCount.toString(),
            short: true
          }
        ],
        footer: 'UPR Rule Performance Monitor',
        ts: Math.floor(Date.now() / 1000)
      }
    ]
  };

  // Add alert details
  alerts.forEach(alert => {
    payload.attachments.push({
      color: alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : '#439FE0',
      title: `${alert.tool} ${alert.rule_version}`,
      text: alert.message,
      fields: [
        {
          title: 'Metric',
          value: alert.metric,
          short: true
        },
        {
          title: 'Current Value',
          value: alert.current_value.toFixed(3),
          short: true
        }
      ],
      footer: alert.recommendation
    });
  });

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to send Slack alert:', error.message);
  }
}

/**
 * Create training samples from failed decisions
 */
async function createTrainingSamples(criticalAlerts) {
  const db = require('../../utils/db');

  for (const alert of criticalAlerts) {
    if (alert.trigger === 'SUCCESS_RATE_LOW' && alert.failed_decisions > 0) {
      // Get failed decisions
      const failedDecisions = await db.query(`
        SELECT
          d.decision_id,
          d.input_data,
          d.output_data,
          f.outcome_positive,
          f.outcome_type,
          f.notes
        FROM agent_core.agent_decisions d
        INNER JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
        WHERE d.tool_name = $1
          AND d.rule_version = $2
          AND f.outcome_positive = false
          AND d.decided_at >= NOW() - INTERVAL '7 days'
        LIMIT 50
      `, [alert.tool, alert.rule_version]);

      // Insert training samples
      for (const row of failedDecisions.rows) {
        await db.query(`
          INSERT INTO agent_core.training_samples (
            sample_id,
            tool_name,
            rule_version,
            input_data,
            expected_output,
            actual_output,
            sample_type,
            quality_score,
            notes,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (sample_id) DO NOTHING
        `, [
          `${row.decision_id}_failed`,
          alert.tool,
          alert.rule_version,
          row.input_data,
          { outcome_positive: true },  // Expected: should succeed
          row.output_data,             // Actual: failed
          'failed_decision',
          0.0,
          `Failed decision from feedback: ${row.outcome_type} - ${row.notes || 'No notes'}`
        ]);
      }

      console.log(`   Created ${failedDecisions.rows.length} training samples for ${alert.tool} ${alert.rule_version}`);
    }
  }
}

// Parse command-line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value;
  return acc;
}, {});

const toolName = args.tool || null;

// Run check
checkRulePerformance(toolName);
