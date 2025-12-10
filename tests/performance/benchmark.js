#!/usr/bin/env node

/**
 * Performance Benchmark Script
 * S151: Performance & Caching
 *
 * Baseline metrics for critical operations:
 * - Discovery search: < 2s
 * - Company enrichment: < 3s
 * - QTLE scoring: < 500ms
 *
 * Run: node tests/performance/benchmark.js [--url=http://localhost:3001]
 */

const http = require('http');
const https = require('https');

// Configuration
const DEFAULT_URL = process.env.OS_URL || 'http://localhost:3001';
const BASE_URL = process.argv.find(a => a.startsWith('--url='))?.split('=')[1] || DEFAULT_URL;

// Test data
const TEST_DOMAIN = 'acme.com';
const TEST_VERTICAL = 'banking';
const TEST_SEARCH_QUERY = 'technology companies hiring dubai';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  healthCheck: 100,
  verticalConfig: 500,
  signalTypes: 500,
  enrichment: 3000,
  scoring: 500,
  ranking: 1000,
  discovery: 2000,
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// HTTP client
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    };

    const startTime = Date.now();

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json, duration });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data, duration });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Benchmark runner
async function runBenchmark(name, fn, threshold) {
  const iterations = 3;
  const durations = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const result = await fn();
      durations.push(result.duration);
    } catch (error) {
      return {
        name,
        success: false,
        error: error.message,
        threshold,
      };
    }
  }

  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const passed = avg <= threshold;

  return {
    name,
    success: true,
    passed,
    avgMs: avg,
    minMs: min,
    maxMs: max,
    threshold,
  };
}

// Individual benchmarks
const benchmarks = {
  async healthCheck() {
    return request('GET', '/health');
  },

  async verticalConfig() {
    return request('GET', `/api/os/verticals/${TEST_VERTICAL}/config`);
  },

  async signalTypes() {
    return request('GET', `/api/os/verticals/${TEST_VERTICAL}/signals`);
  },

  async scoring() {
    return request('POST', '/api/os/score', {
      entity: {
        domain: TEST_DOMAIN,
        name: 'Acme Corp',
        industry: 'Technology',
        headcount: 500,
      },
      vertical: TEST_VERTICAL,
    });
  },

  async ranking() {
    return request('POST', '/api/os/rank', {
      entities: [
        { id: '1', domain: 'acme.com', headcount: 500 },
        { id: '2', domain: 'techcorp.ae', headcount: 200 },
        { id: '3', domain: 'innovate.ae', headcount: 1000 },
      ],
      vertical: TEST_VERTICAL,
    });
  },

  async enrichment() {
    return request('POST', '/api/os/enrich', {
      domain: TEST_DOMAIN,
      sources: ['apollo'],
    });
  },
};

// Main execution
async function main() {
  console.log('');
  log('═══════════════════════════════════════════════════════════', 'blue');
  log('  UPR OS Performance Benchmark', 'blue');
  log('═══════════════════════════════════════════════════════════', 'blue');
  console.log('');
  log(`Base URL: ${BASE_URL}`, 'dim');
  log(`Timestamp: ${new Date().toISOString()}`, 'dim');
  console.log('');

  const results = [];

  // Run benchmarks
  log('Running benchmarks...', 'blue');
  console.log('');

  for (const [name, fn] of Object.entries(benchmarks)) {
    const threshold = THRESHOLDS[name] || 1000;
    process.stdout.write(`  ${name.padEnd(20)} `);

    const result = await runBenchmark(name, fn, threshold);
    results.push(result);

    if (!result.success) {
      log(`ERROR: ${result.error}`, 'red');
    } else if (result.passed) {
      log(`${result.avgMs}ms (threshold: ${threshold}ms) ✓`, 'green');
    } else {
      log(`${result.avgMs}ms (threshold: ${threshold}ms) ✗`, 'red');
    }
  }

  // Summary
  console.log('');
  log('═══════════════════════════════════════════════════════════', 'blue');

  const passed = results.filter(r => r.success && r.passed).length;
  const failed = results.filter(r => !r.success || !r.passed).length;
  const total = results.length;

  if (failed === 0) {
    log(`  All benchmarks passed (${passed}/${total})`, 'green');
  } else {
    log(`  ${failed} benchmark(s) failed (${passed}/${total} passed)`, 'red');
  }

  log('═══════════════════════════════════════════════════════════', 'blue');
  console.log('');

  // Detailed results table
  log('Detailed Results:', 'bold');
  console.log('');
  console.log('  Name                  Avg      Min      Max      Threshold  Status');
  console.log('  ────────────────────  ───────  ───────  ───────  ─────────  ──────');

  for (const r of results) {
    if (!r.success) {
      console.log(`  ${r.name.padEnd(20)}  ERROR: ${r.error}`);
    } else {
      const status = r.passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
      console.log(
        `  ${r.name.padEnd(20)}  ${String(r.avgMs + 'ms').padStart(6)}   ${String(r.minMs + 'ms').padStart(6)}   ${String(r.maxMs + 'ms').padStart(6)}   ${String(r.threshold + 'ms').padStart(8)}   ${status}`
      );
    }
  }

  console.log('');

  // Export JSON for CI/CD
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      results,
      summary: { passed, failed, total },
    }, null, 2));
  }

  // Exit with error if any benchmark failed
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Benchmark error:', error);
  process.exit(1);
});
