/**
 * UPR OS v1.0 Validation Script
 * Phase-2 Health Check for:
 * - OS API Contract
 * - Pipeline Execution
 * - SaaS -> OS Connectivity
 * - Worker -> OS Job Trigger
 */

const OS_BASE = "https://upr-os-service-191599223867.us-central1.run.app";
const SAAS_BASE = "https://premiumradar-saas-service-191599223867.us-central1.run.app";
const WORKER_BASE = "https://upr-os-worker-191599223867.us-central1.run.app";

// Test payloads matching OS API contract
const TEST_DISCOVERY = {
  company: "Example Company",
  region: "UAE",
  vertical: "banking_employee"
};

const TEST_ENRICH = {
  entity_data: {
    name: "Example Company",
    type: "company",
    region: "UAE"
  }
};

const TEST_SCORE = {
  entity_data: {
    name: "Example Company",
    type: "company",
    region: "UAE",
    signals: []
  }
};

const TEST_RANK = {
  entities: [{
    name: "Example Company",
    type: "company",
    region: "UAE"
  }],
  profile: "banking_employee"
};

const TEST_OUTREACH = {
  leads: [{
    name: "Example Company",
    contact: "decision.maker@example.com",
    region: "UAE"
  }],
  template: "default"
};

const TEST_PIPELINE = {
  company: "Example Company",
  region: "UAE",
  vertical: "banking_employee"
};

async function test(name, fn) {
  console.log(`\n🔵 TEST: ${name}`);
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`🟢 PASS (${Date.now() - start}ms)`);
    if (result) console.dir(result, { depth: 4 });
    return { name, status: 'pass', duration: Date.now() - start };
  } catch (err) {
    console.log(`🔴 FAIL (${Date.now() - start}ms)`);
    console.error(err.message);
    return { name, status: 'fail', duration: Date.now() - start, error: err.message };
  }
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} - ${await res.text()}`);
  return await res.json();
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${await res.text()}`);
  return await res.json();
}

// -----------------------------
// VALIDATION SUITE
// -----------------------------
(async () => {
  console.log("=======================================");
  console.log("  UPR OS v1.0 VALIDATION SUITE STARTED ");
  console.log("=======================================");
  console.log(`  OS:     ${OS_BASE}`);
  console.log(`  SaaS:   ${SAAS_BASE}`);
  console.log(`  Worker: ${WORKER_BASE}`);
  console.log("=======================================");

  const results = [];

  // 0. HEALTH CHECK
  results.push(await test("OS /health", () => get(`${OS_BASE}/health`)));

  // 1. DISCOVERY
  results.push(await test("OS /api/os/discovery", () =>
    post(`${OS_BASE}/api/os/discovery`, TEST_DISCOVERY)
  ));

  // 2. ENRICHMENT
  results.push(await test("OS /api/os/enrich", () =>
    post(`${OS_BASE}/api/os/enrich`, TEST_ENRICH)
  ));

  // 3. SCORING
  results.push(await test("OS /api/os/score", () =>
    post(`${OS_BASE}/api/os/score`, TEST_SCORE)
  ));

  // 4. RANKING
  results.push(await test("OS /api/os/rank", () =>
    post(`${OS_BASE}/api/os/rank`, TEST_RANK)
  ));

  // 5. OUTREACH
  results.push(await test("OS /api/os/outreach", () =>
    post(`${OS_BASE}/api/os/outreach`, TEST_OUTREACH)
  ));

  // 6. FULL PIPELINE
  results.push(await test("OS /api/os/pipeline (full E2E)", () =>
    post(`${OS_BASE}/api/os/pipeline`, TEST_PIPELINE)
  ));

  // 7. WORKER HEALTH
  results.push(await test("Worker /health", () => get(`${WORKER_BASE}/health`)));

  // 8. WORKER JOB TRIGGER
  results.push(await test("Worker → Job Trigger", () =>
    post(`${WORKER_BASE}/jobs/trigger`, {
      jobType: "analytics.aggregate",
      payload: { tenantId: "test", period: "daily" }
    })
  ));

  // 9. SAAS HEALTH
  results.push(await test("SaaS /health", () => get(`${SAAS_BASE}/health`)));

  // SUMMARY
  console.log("\n=======================================");
  console.log("  VALIDATION SUMMARY");
  console.log("=======================================");

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  results.forEach(r => {
    const icon = r.status === 'pass' ? '✅' : '❌';
    console.log(`  ${icon} ${r.name} (${r.duration}ms)`);
  });

  console.log("---------------------------------------");
  console.log(`  PASSED: ${passed}/${results.length}`);
  console.log(`  FAILED: ${failed}/${results.length}`);
  console.log("=======================================");

  if (failed > 0) {
    console.log("\n🔴 VALIDATION FAILED - Some tests did not pass");
    process.exit(1);
  } else {
    console.log("\n🟢 ALL TESTS COMPLETED — VALIDATION OK");
    process.exit(0);
  }
})();
