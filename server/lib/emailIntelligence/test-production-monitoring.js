/**
 * Production Monitoring Dashboard
 *
 * Real-time metrics for pattern learning and failure learning
 * UPR (Universal People Radar) - EmailPatternEngine v3.1.0
 *
 * Run: node server/lib/emailIntelligence/test-production-monitoring.js
 */

import pg from 'pg';
import { initDb } from './db.js';

const DATABASE_URL = process.env.DATABASE_URL;

async function displayProductionMetrics() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('EmailPatternEngine v3.1.0 - Production Monitoring Dashboard');
  console.log('UPR (Universal People Radar)');
  console.log('═'.repeat(70));
  console.log('');

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000
  });

  initDb(pool);

  try {
    // ========================================
    // PATTERN LEARNING METRICS
    // ========================================
    console.log('📊 PATTERN LEARNING METRICS');
    console.log('-'.repeat(70));

    const patternMetrics = await pool.query(`
      SELECT
        COUNT(*) as total_patterns,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as learned_today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as learned_this_week,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as learned_this_month,
        COALESCE(SUM(usage_count), 0) as total_uses,
        ROUND(COUNT(*) * 0.024, 2) as total_investment,
        ROUND((COUNT(*) * 0.024) / NULLIF(SUM(usage_count), 0), 6) as cost_per_use,
        ROUND(SUM(usage_count) * 0.50, 2) as estimated_market_value,
        ROUND((SUM(usage_count) * 0.50) / NULLIF(COUNT(*) * 0.024, 0), 2) as roi_multiple
      FROM email_patterns
    `);

    const pm = patternMetrics.rows[0];

    console.log(`Total Patterns: ${pm.total_patterns}`);
    console.log(`  Today: ${pm.learned_today}`);
    console.log(`  This Week: ${pm.learned_this_week}`);
    console.log(`  This Month: ${pm.learned_this_month}`);
    console.log('');
    console.log(`Total Uses: ${pm.total_uses}`);
    console.log(`Reuse Rate: ${pm.total_uses > 0 ? (pm.total_uses / pm.total_patterns).toFixed(2) : '0.00'}×`);
    console.log('');
    console.log(`💰 Investment: $${pm.total_investment}`);
    console.log(`💎 Cost Per Use: $${pm.cost_per_use || '0.000000'}`);
    console.log(`📈 Market Value: $${pm.estimated_market_value || '0.00'}`);
    console.log(`🚀 ROI Multiple: ${pm.roi_multiple || '0.00'}×`);
    console.log('');

    // ========================================
    // FAILURE LEARNING METRICS
    // ========================================
    console.log('🧠 FAILURE LEARNING METRICS');
    console.log('-'.repeat(70));

    const failureMetrics = await pool.query(`
      SELECT
        COUNT(*) as total_failures,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as failures_today,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as failures_this_week,
        COALESCE(SUM(cost_wasted), 0) as total_cost_wasted,
        COUNT(*) FILTER (WHERE correct_pattern IS NOT NULL) as failures_corrected,
        COALESCE(SUM(prevented_repeats), 0) as total_prevented,
        COUNT(DISTINCT domain) as unique_domains_failed
      FROM pattern_failures
    `);

    const fm = failureMetrics.rows[0];

    if (parseInt(fm.total_failures) > 0) {
      const estimated_prevention_savings = parseFloat(fm.total_prevented) * 0.024;

      console.log(`Total Failures: ${fm.total_failures}`);
      console.log(`  Today: ${fm.failures_today}`);
      console.log(`  This Week: ${fm.failures_this_week}`);
      console.log(`  Unique Domains: ${fm.unique_domains_failed}`);
      console.log('');
      console.log(`💸 Cost Wasted: $${parseFloat(fm.total_cost_wasted).toFixed(4)}`);
      console.log(`✅ Failures Corrected: ${fm.failures_corrected}`);
      console.log(`🛡️  Repeats Prevented: ${fm.total_prevented}`);
      console.log(`💰 Prevention Savings: $${estimated_prevention_savings.toFixed(4)}`);
      console.log(`📉 Net Waste: $${(parseFloat(fm.total_cost_wasted) - estimated_prevention_savings).toFixed(4)}`);
      console.log('');
    } else {
      console.log('✅ No failures recorded yet!');
      console.log('   Pattern learning is working flawlessly.');
      console.log('');
    }

    // ========================================
    // TOP PERFORMING PATTERNS
    // ========================================
    console.log('⭐ TOP PERFORMING PATTERNS');
    console.log('-'.repeat(70));

    const topPatterns = await pool.query(`
      SELECT
        pattern,
        COUNT(*) as count,
        ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1) as percentage,
        COALESCE(SUM(usage_count), 0) as uses,
        AVG(confidence) as avg_confidence
      FROM email_patterns
      GROUP BY pattern
      ORDER BY count DESC
      LIMIT 5
    `);

    if (topPatterns.rows.length > 0) {
      topPatterns.rows.forEach((p, idx) => {
        console.log(`${idx + 1}. ${p.pattern.padEnd(20)} ${p.count.toString().padStart(5)} patterns (${p.percentage}%) - ${p.uses} uses - conf: ${parseFloat(p.avg_confidence).toFixed(2)}`);
      });
    } else {
      console.log('No patterns found.');
    }
    console.log('');

    // ========================================
    // RECENT ACTIVITY (Last 24 Hours)
    // ========================================
    console.log('📅 RECENT ACTIVITY (Last 24 Hours)');
    console.log('-'.repeat(70));

    const recentActivity = await pool.query(`
      SELECT
        domain,
        pattern,
        confidence,
        last_source,
        created_at
      FROM email_patterns
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (recentActivity.rows.length > 0) {
      recentActivity.rows.forEach((a, idx) => {
        const time = a.created_at.toISOString().split('T')[1].substring(0, 8);
        console.log(`${idx + 1}. [${time}] ${a.domain.padEnd(30)} → ${a.pattern.padEnd(15)} (${parseFloat(a.confidence).toFixed(2)}) [${a.last_source}]`);
      });
    } else {
      console.log('No activity in last 24 hours');
    }
    console.log('');

    // ========================================
    // CACHE STATISTICS
    // ========================================
    console.log('💾 NEVERBOUNCE CACHE STATISTICS');
    console.log('-'.repeat(70));

    const cacheStats = await pool.query(`
      SELECT
        COUNT(*) as total_cached,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as cached_24h,
        SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END) as valid_cached,
        SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) as invalid_cached
      FROM nb_cache
    `);

    const cs = cacheStats.rows[0];

    console.log(`Total Cached: ${cs.total_cached}`);
    console.log(`  Last 24h: ${cs.cached_24h}`);
    console.log(`  Valid: ${cs.valid_cached}`);
    console.log(`  Invalid: ${cs.invalid_cached}`);

    if (parseInt(cs.total_cached) > 0) {
      const hit_rate = (parseInt(cs.total_cached) / (parseInt(pm.total_patterns) * 3 || 1) * 100).toFixed(1);
      const savings = parseInt(cs.total_cached) * 0.008;
      console.log(`  Cache Hit Rate: ${hit_rate}%`);
      console.log(`  💰 Savings: $${savings.toFixed(2)} (avoided NeverBounce calls)`);
    }
    console.log('');

    // ========================================
    // HEALTH CHECK
    // ========================================
    console.log('🏥 SYSTEM HEALTH');
    console.log('-'.repeat(70));

    // Check if learning is happening
    const learningHealthy = parseInt(pm.learned_this_week) > 0;
    console.log(`Pattern Learning: ${learningHealthy ? '✅ ACTIVE' : '⚠️  INACTIVE (no patterns learned this week)'}`);

    // Check failure rate
    const totalAttempts = parseInt(pm.total_patterns) + parseInt(fm.total_failures);
    const failureRate = totalAttempts > 0 ? (parseInt(fm.total_failures) / totalAttempts * 100) : 0;
    const failureHealthy = failureRate < 10;
    console.log(`Failure Rate: ${failureHealthy ? '✅' : '⚠️ '} ${failureRate.toFixed(1)}% ${failureHealthy ? '(healthy)' : '(high - investigate)'}`);

    // Check ROI
    const roiHealthy = parseFloat(pm.roi_multiple) > 5 || pm.total_uses == 0;
    console.log(`ROI Multiple: ${roiHealthy ? '✅' : '⚠️ '} ${pm.roi_multiple || '0.00'}× ${roiHealthy ? '(excellent)' : '(building)'}`);

    console.log('');

    // ========================================
    // INVESTMENT PROGRESS
    // ========================================
    console.log('🎯 INVESTMENT PROGRESS');
    console.log('-'.repeat(70));

    const monthlyTarget = 1000; // 1,000 patterns per month
    const yearlyTarget = 10000; // 10,000 patterns per year

    const monthlyProgress = (parseInt(pm.learned_this_month) / monthlyTarget * 100).toFixed(1);
    const yearlyProgress = (parseInt(pm.total_patterns) / yearlyTarget * 100).toFixed(1);

    console.log(`Month 1 Target: ${pm.learned_this_month}/${monthlyTarget} patterns (${monthlyProgress}%)`);
    console.log(`Year 1 Target: ${pm.total_patterns}/${yearlyTarget} patterns (${yearlyProgress}%)`);
    console.log('');

    // Projected completion
    if (parseInt(pm.learned_this_month) > 0) {
      const dailyRate = parseInt(pm.learned_this_month) / 30;
      const daysToYearlyTarget = Math.ceil((yearlyTarget - parseInt(pm.total_patterns)) / dailyRate);
      console.log(`Daily Rate: ${dailyRate.toFixed(1)} patterns/day`);
      if (daysToYearlyTarget > 0) {
        console.log(`Est. Time to 10K: ${daysToYearlyTarget} days (~${Math.ceil(daysToYearlyTarget / 30)} months)`);
      } else {
        console.log(`🎉 Yearly target already achieved!`);
      }
    }

    console.log('');
    console.log('═'.repeat(70));
    console.log('Dashboard Last Updated: ' + new Date().toISOString());
    console.log('═'.repeat(70));
    console.log('');

  } catch (error) {
    console.error('❌ Error fetching metrics:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

// Run dashboard
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  console.error('');
  console.error('Usage:');
  console.error('  export DATABASE_URL="postgresql://..."');
  console.error('  node server/lib/emailIntelligence/test-production-monitoring.js');
  console.error('');
  process.exit(1);
}

displayProductionMetrics().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
