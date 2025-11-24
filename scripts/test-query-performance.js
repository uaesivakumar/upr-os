/**
 * Sprint 17 P1: Query Performance Testing
 * Tests before/after index performance
 */

import pkg from 'pg';
const { Pool } = pkg;

// Use DATABASE_URL from environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testQueries() {
  console.log('🧪 Testing Query Performance');
  console.log('Date:', new Date().toISOString());
  console.log('='.repeat(80));

  const tests = [
    {
      name: 'hiring_signals by company (exact)',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hiring_signals
        WHERE company = 'Amazon'
        ORDER BY created_at DESC
        LIMIT 10;
      `
    },
    {
      name: 'hiring_signals by company (ILIKE)',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hiring_signals
        WHERE company ILIKE '%Amazon%'
        ORDER BY created_at DESC
        LIMIT 10;
      `
    },
    {
      name: 'hiring_signals by date range',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hiring_signals
        WHERE created_at >= NOW() - INTERVAL '30 days'
        ORDER BY created_at DESC;
      `
    },
    {
      name: 'hiring_signals by domain',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hiring_signals
        WHERE domain = 'amazon.ae'
        LIMIT 20;
      `
    },
    {
      name: 'hiring_signals by trigger_type',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hiring_signals
        WHERE trigger_type = 'expansion'
        LIMIT 20;
      `
    },
    {
      name: 'hr_leads by company_id',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hr_leads
        WHERE company_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 50;
      `
    },
    {
      name: 'hr_leads by lead_status',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hr_leads
        WHERE lead_status = 'New'
        LIMIT 50;
      `
    },
    {
      name: 'hr_leads by email_status',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hr_leads
        WHERE email_status = 'validated'
        LIMIT 50;
      `
    },
    {
      name: 'hr_leads by tenant + status',
      query: `
        EXPLAIN ANALYZE
        SELECT * FROM hr_leads
        WHERE tenant_id IS NOT NULL
        AND lead_status = 'New'
        LIMIT 50;
      `
    }
  ];

  for (const test of tests) {
    console.log(`\n📊 Test: ${test.name}`);
    console.log('─'.repeat(80));

    try {
      const result = await pool.query(test.query);

      // Extract execution time from EXPLAIN ANALYZE
      const planRows = result.rows.map(r => r['QUERY PLAN']);

      // Find planning and execution times
      const executionLine = planRows.find(line =>
        line && line.includes('Execution Time')
      );
      const planningLine = planRows.find(line =>
        line && line.includes('Planning Time')
      );

      if (planningLine) {
        console.log(planningLine);
      }
      if (executionLine) {
        console.log(executionLine);
      }

      // Show if using index or seq scan
      const scanType = planRows.find(line =>
        line && (line.includes('Index Scan') || line.includes('Seq Scan'))
      );
      if (scanType) {
        console.log('Scan Type:', scanType.trim());
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Performance test complete');

  await pool.end();
}

testQueries().catch(console.error);
