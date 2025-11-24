#!/usr/bin/env node

/**
 * Sprint 19 Stress Test / Database Seeder
 *
 * Populates the database with realistic data for Sprint 19 smoke tests:
 * - orchestration_runs
 * - source_performance_metrics
 * - hiring_signals (with quality scores, deduplication data)
 * - source_health (circuit breaker states)
 */

const { Pool } = require('pg');
const https = require('https');

const DB_URL = process.env.DATABASE_URL || 'postgresql://upr_postgres_user:dCO8kY3mpy7WhAnwrNCdcb69LiVf7eGi@dpg-d2venebipnbc73cjpa30-a.frankfurt-postgres.render.com:5432/upr_postgres?sslmode=require';
const BASE_URL = 'https://upr-web-service-191599223867.us-central1.run.app';

const pool = new Pool({
  connectionString: DB_URL
});

// Helper to make API requests
function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Generate random data
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randomDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysAgo));
  return date;
}

const SOURCES = ['linkedin', 'news', 'jobs', 'social'];
const SECTORS = ['Banking', 'Technology', 'Healthcare', 'Retail', 'Manufacturing'];
const LOCATIONS = ['Dubai', 'Abu Dhabi', 'Sharjah', 'UAE'];
const COMPANIES = [
  'Emirates NBD', 'First Abu Dhabi Bank', 'Dubai Islamic Bank',
  'Mashreq Bank', 'Abu Dhabi Commercial Bank', 'ADIB',
  'Commercial Bank of Dubai', 'Noor Bank', 'Union National Bank',
  'Sharjah Islamic Bank', 'Ajman Bank', 'Bank of Sharjah'
];

console.log('════════════════════════════════════════════════════════');
console.log('  Sprint 19 Stress Test / Database Seeder');
console.log('  Populating database with realistic test data');
console.log('════════════════════════════════════════════════════════');
console.log('');

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Seed source_performance_metrics
    console.log('[1/6] Seeding source_performance_metrics...');
    for (const source of SOURCES) {
      const totalRuns = randomInt(50, 200);
      const successfulRuns = randomInt(Math.floor(totalRuns * 0.7), totalRuns);
      const totalSignals = randomInt(100, 1000);
      const highQualitySignals = randomInt(Math.floor(totalSignals * 0.4), Math.floor(totalSignals * 0.8));

      await client.query(`
        INSERT INTO source_performance_metrics (
          source_id, total_runs, successful_runs, failed_runs,
          total_signals, high_quality_signals, avg_response_time,
          last_success_at, manual_priority_override, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW())
        ON CONFLICT (source_id) DO UPDATE SET
          total_runs = $2,
          successful_runs = $3,
          failed_runs = $4,
          total_signals = $5,
          high_quality_signals = $6,
          avg_response_time = $7,
          last_success_at = NOW(),
          manual_priority_override = $8,
          last_updated = NOW()
      `, [
        source,
        totalRuns,
        successfulRuns,
        totalRuns - successfulRuns,
        totalSignals,
        highQualitySignals,
        randomInt(1000, 5000),
        source === 'linkedin' ? 0.85 : null // Manual priority for LinkedIn
      ]);
    }
    console.log(`   ✅ Created ${SOURCES.length} source performance records`);

    // 2. Seed source_health (circuit breaker)
    console.log('[2/6] Seeding source_health...');
    for (const source of SOURCES) {
      const isHealthy = Math.random() > 0.2; // 80% healthy
      await client.query(`
        INSERT INTO source_health (
          source_id, is_healthy, failure_count, last_failure_at,
          circuit_breaker_state, last_checked_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (source_id) DO UPDATE SET
          is_healthy = $2,
          failure_count = $3,
          last_failure_at = $4,
          circuit_breaker_state = $5,
          last_checked_at = NOW()
      `, [
        source,
        isHealthy,
        isHealthy ? 0 : randomInt(1, 2),
        isHealthy ? null : randomDate(7),
        isHealthy ? 'closed' : (Math.random() > 0.5 ? 'open' : 'half_open')
      ]);
    }
    console.log(`   ✅ Created ${SOURCES.length} source health records`);

    // 3. Seed hiring_signals
    console.log('[3/6] Seeding hiring_signals...');
    const signalCount = 100;
    const tenantId = 'stress-test-tenant-' + Date.now();

    for (let i = 0; i < signalCount; i++) {
      const company = COMPANIES[randomInt(0, COMPANIES.length - 1)];
      const source = SOURCES[randomInt(0, SOURCES.length - 1)];
      const qualityScore = randomFloat(0.3, 0.95);
      const confidenceScore = randomFloat(0.5, 0.95);

      await client.query(`
        INSERT INTO hiring_signals (
          tenant_id, company, domain, sector, location,
          trigger_type, description, source_url, source_date,
          source_type, confidence_score, quality_score, quality_tier,
          quality_breakdown, dedupe_hash, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        tenantId,
        company,
        company.toLowerCase().replace(/ /g, '') + '.ae',
        SECTORS[randomInt(0, SECTORS.length - 1)],
        LOCATIONS[randomInt(0, LOCATIONS.length - 1)],
        'EXPANSION',
        `${company} is expanding operations in ${LOCATIONS[randomInt(0, LOCATIONS.length - 1)]}`,
        `https://linkedin.com/company/${company.toLowerCase().replace(/ /g, '-')}`,
        randomDate(30),
        'SOCIAL_MEDIA',
        confidenceScore,
        qualityScore,
        qualityScore >= 0.7 ? 'HIGH' : (qualityScore >= 0.5 ? 'MEDIUM' : 'LOW'),
        JSON.stringify({
          confidence: confidenceScore,
          reliability: randomFloat(0.6, 0.9),
          freshness: randomFloat(0.5, 0.95),
          completeness: randomFloat(0.7, 1.0)
        }),
        `${company}-${source}-${i}`,
        randomDate(30)
      ]);
    }
    console.log(`   ✅ Created ${signalCount} hiring signals`);

    // 4. Seed orchestration_runs
    console.log('[4/6] Seeding orchestration_runs...');
    const runCount = 50;

    for (let i = 0; i < runCount; i++) {
      const sourcesUsed = randomInt(1, 4);
      const selectedSources = SOURCES.slice(0, sourcesUsed);
      const totalSignals = randomInt(0, 20);
      const uniqueSignals = randomInt(Math.floor(totalSignals * 0.7), totalSignals);

      await client.query(`
        INSERT INTO orchestration_runs (
          tenant_id, orchestration_id, sources_requested, sources_executed,
          sources_successful, sources_failed, filters, total_signals,
          unique_signals, execution_time_ms, deduplication_stats,
          quality_stats, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        tenantId,
        `orch_stress_${Date.now()}_${i}`,
        selectedSources,
        selectedSources,
        selectedSources.slice(0, randomInt(1, sourcesUsed)),
        [],
        JSON.stringify({ location: 'UAE', sector: 'Banking' }),
        totalSignals,
        uniqueSignals,
        randomInt(1000, 5000),
        JSON.stringify({
          originalCount: totalSignals,
          uniqueCount: uniqueSignals,
          duplicatesRemoved: totalSignals - uniqueSignals
        }),
        JSON.stringify({
          averageScore: randomFloat(0.5, 0.8),
          highQualityCount: randomInt(0, Math.floor(uniqueSignals * 0.6)),
          highQualityRate: randomFloat(0.4, 0.7)
        }),
        randomDate(7)
      ]);
    }
    console.log(`   ✅ Created ${runCount} orchestration runs`);

    await client.query('COMMIT');
    console.log('');
    console.log('✅ Database seeding complete!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function runStressTest() {
  console.log('[5/6] Running API stress test (20 orchestration calls)...');
  const stressCount = 20;
  const results = [];

  for (let i = 0; i < stressCount; i++) {
    try {
      const res = await makeRequest('/api/orchestration/discover', 'POST', {
        sources: SOURCES.slice(0, randomInt(1, 4)),
        filters: {
          location: LOCATIONS[randomInt(0, LOCATIONS.length - 1)],
          sector: SECTORS[randomInt(0, SECTORS.length - 1)]
        },
        maxParallel: 4,
        tenantId: 'stress-test-tenant-' + Date.now()
      });

      results.push({
        success: res.status === 200,
        orchestrationId: res.data?.orchestrationId
      });

      process.stdout.write('.');
    } catch (error) {
      process.stdout.write('x');
    }
  }

  console.log('');
  const successCount = results.filter(r => r.success).length;
  console.log(`   ✅ ${successCount}/${stressCount} orchestration calls successful`);
}

async function verifyData() {
  console.log('[6/6] Verifying seeded data...');

  const checks = [
    { name: 'source_performance_metrics', query: 'SELECT COUNT(*) FROM source_performance_metrics' },
    { name: 'source_health', query: 'SELECT COUNT(*) FROM source_health' },
    { name: 'hiring_signals', query: 'SELECT COUNT(*) FROM hiring_signals WHERE quality_score IS NOT NULL' },
    { name: 'orchestration_runs', query: 'SELECT COUNT(*) FROM orchestration_runs' }
  ];

  for (const check of checks) {
    const result = await pool.query(check.query);
    const count = parseInt(result.rows[0].count);
    console.log(`   ${check.name}: ${count} records`);
  }
}

async function main() {
  try {
    await seedDatabase();
    await runStressTest();
    await verifyData();

    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('🎉 Stress test complete! Database is ready for smoke tests.');
    console.log('════════════════════════════════════════════════════════');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
