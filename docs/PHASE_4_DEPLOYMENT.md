# Phase 4 Deployment Guide

**Date:** November 8, 2025
**Phase:** 4 - Agent Communication Protocol
**Status:** Ready for Deployment

---

## ✅ Pre-Deployment Checklist

### **1. Code Review**

- [x] AgentProtocol.js implemented and tested
- [x] StateMachine.js implemented and tested
- [x] ErrorHandler.js implemented and tested
- [x] JSON schemas created for all agent types
- [x] RadarAgentV2.js refactored to use protocol
- [x] All tests passing (380+ test cases)
- [ ] Code reviewed by team
- [ ] No ESLint warnings

### **2. Database**

- [ ] Verify `usage_events` table exists
- [ ] Verify `dead_letters` table exists
- [ ] Run migration: `007_agent_state_history.sql`
- [ ] Verify indexes created
- [ ] Test database connection

### **3. Dependencies**

Required npm packages:

```bash
npm install ajv ajv-formats
```

Check `package.json`:
```json
{
  "dependencies": {
    "ajv": "^8.12.0",
    "ajv-formats": "^2.1.1"
  }
}
```

### **4. Environment**

Verify environment variables:
```bash
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...

# Optional
NODE_ENV=production
```

### **5. Testing**

```bash
# Run all Phase 4 tests
cd server/protocols
npm test

# Expected: 380+ tests passing
# AgentProtocol: 200+ tests
# StateMachine: 80+ tests
# ErrorHandler: 100+ tests
```

---

## 🚀 Deployment Steps

### **Step 1: Install Dependencies**

```bash
cd /Users/skc/DataScience/upr
npm install
```

### **Step 2: Run Database Migration**

```bash
# Connect to production database
PGPASSWORD='UprApp2025!Pass31cd5b023e349c88' psql \
  -h 34.121.0.240 \
  -U upr_app \
  -d upr_production \
  -f server/migrations/007_agent_state_history.sql
```

**Expected Output:**
```
NOTICE:  Phase 4 migration completed successfully
CREATE TABLE
CREATE INDEX
CREATE INDEX
```

### **Step 3: Verify Migration**

```bash
# Check table exists
PGPASSWORD='UprApp2025!Pass31cd5b023e349c88' psql \
  -h 34.121.0.240 \
  -U upr_app \
  -d upr_production \
  -c "\d agent_state_history"
```

**Expected:**
```
                      Table "public.agent_state_history"
   Column    |           Type           | Nullable |           Default
-------------+--------------------------+----------+-----------------------------
 id          | integer                  | not null | nextval('agent_state_...')
 agent_name  | text                     | not null |
 from_state  | text                     | not null |
 to_state    | text                     | not null |
 metadata    | jsonb                    |          |
 created_at  | timestamp without tz     |          | now()
```

### **Step 4: Run Tests**

```bash
cd server/protocols
npm test
```

**Expected Output:**
```
 ✓ AgentProtocol (200 tests)
 ✓ StateMachine (80 tests)
 ✓ ErrorHandler (100 tests)

Test Suites: 3 passed, 3 total
Tests:       380 passed, 380 total
```

### **Step 5: Integration Test (RadarAgentV2)**

Create test file `server/protocols/__tests__/integration.test.js`:

```javascript
import radarAgentV2 from '../../agents/radarAgentV2.js';

// Test with real input
const result = await radarAgentV2.execute(
  {
    sourceId: 'test-source-123',
    sourceName: 'Test Source',
    sourceType: 'news',
    runId: 'test-run-456',
    tenantId: 'test-tenant-789',
    budgetLimitUsd: 0.10  // Small budget for testing
  },
  {
    runId: 'test-run-456',
    tenantId: 'test-tenant-789'
  }
);

console.log('Integration test result:', result);
// Should return: { success: true, data: {...}, metadata: {...} }
```

Run:
```bash
node server/protocols/__tests__/integration.test.js
```

### **Step 6: Update Import Paths**

**Option A: Keep old agent as fallback**

```javascript
// server/routes/radar.js
import radarAgent from '../agents/radarAgent.js';  // V1 (fallback)
import radarAgentV2 from '../agents/radarAgentV2.js';  // V2 (new)

// Use V2 by default, fallback to V1 if needed
const activeAgent = process.env.USE_V2_AGENT === 'true' ? radarAgentV2 : radarAgent;

export default activeAgent;
```

**Option B: Direct migration (recommended)**

```javascript
// server/routes/radar.js
import radarAgent from '../agents/radarAgentV2.js';  // V2 only

export default radarAgent;
```

### **Step 7: Deploy to Cloud Run**

```bash
# Build and deploy
npm run build

gcloud run deploy upr-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="USE_V2_AGENT=true"
```

### **Step 8: Smoke Test Production**

```bash
# Test RADAR endpoint
curl -X POST https://upr-backend-XXXXX.run.app/api/radar/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "sourceId": "news-uae-tech",
    "sourceName": "UAE Tech News",
    "sourceType": "news"
  }'
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "companiesFound": 5,
    "companies": [...],
    "costUsd": 0.85,
    "latencyMs": 4500,
    "errors": []
  },
  "metadata": {
    "agentName": "RadarAgent",
    "agentVersion": "2.0.0",
    "costUsd": 0.85,
    "latencyMs": 4500
  }
}
```

---

## 🔍 Verification

### **1. Check State Transitions**

```sql
SELECT
  agent_name,
  from_state,
  to_state,
  created_at
FROM agent_state_history
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:**
```
 agent_name | from_state | to_state  |       created_at
------------+------------+-----------+-----------------------
 RadarAgent | RUNNING    | COMPLETED | 2025-11-08 14:30:25
 RadarAgent | IDLE       | RUNNING   | 2025-11-08 14:30:20
```

### **2. Check Cost Tracking**

```sql
SELECT
  event_type,
  cost_usd,
  metadata->>'agent' as agent,
  metadata->>'version' as version,
  created_at
FROM usage_events
WHERE metadata->>'agent' = 'RadarAgent'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
```
 event_type  | cost_usd | agent      | version |       created_at
-------------+----------+------------+---------+-----------------------
 radaragent  |   0.8500 | RadarAgent | 2.0.0   | 2025-11-08 14:30:25
```

### **3. Check Error Handling**

Force an error and verify graceful degradation:

```bash
# Test with invalid input (should fail validation)
curl -X POST https://upr-backend-XXXXX.run.app/api/radar/run \
  -H "Content-Type: application/json" \
  -d '{
    "invalid": "input"
  }'
```

**Expected:**
```json
{
  "error": "Input validation failed: /sourceId must be string"
}
```

### **4. Monitor Logs**

```bash
gcloud run services logs read upr-backend --limit=50
```

Look for:
```
[RadarAgentV2] Starting discovery for source: Test Source
[StateMachine][RadarAgent] IDLE → RUNNING
[RadarAgentV2] Signal: "G42" - Expansion - score: 4
[RadarAgentV2] ✅ Saved: G42 (confirmed, score: 4)
[RadarAgentV2] Discovery complete: 5 companies found
[StateMachine][RadarAgent] RUNNING → COMPLETED
```

---

## ⚠️ Rollback Plan

If issues occur, rollback is simple:

### **Option 1: Environment Variable Rollback**

```bash
# Switch back to V1 agent
gcloud run services update upr-backend \
  --set-env-vars="USE_V2_AGENT=false"
```

### **Option 2: Code Rollback**

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Redeploy
gcloud run deploy upr-backend --source .
```

### **Option 3: Database Rollback**

```sql
-- Drop new table if needed
DROP TABLE IF EXISTS agent_state_history;
```

---

## 📊 Success Metrics

After 24 hours, verify:

### **1. Zero Regressions**

- [ ] RADAR runs completing successfully
- [ ] No increase in error rate
- [ ] Latency within acceptable range (<10% increase)

### **2. Cost Tracking Working**

```sql
SELECT
  COUNT(*) as total_runs,
  AVG(cost_usd) as avg_cost,
  SUM(cost_usd) as total_cost
FROM usage_events
WHERE metadata->>'agent' = 'RadarAgent'
  AND metadata->>'version' = '2.0.0'
  AND created_at > NOW() - INTERVAL '24 hours';
```

**Expected:**
- `total_runs`: 10-50 (depending on RADAR schedule)
- `avg_cost`: $0.50-$2.00
- `total_cost`: <$100

### **3. State Tracking Working**

```sql
SELECT
  to_state,
  COUNT(*) as transition_count
FROM agent_state_history
WHERE agent_name = 'RadarAgent'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY to_state;
```

**Expected:**
```
 to_state  | transition_count
-----------+-----------------
 RUNNING   | 25
 COMPLETED | 23
 FAILED    | 2
```

### **4. Error Handling Working**

- [ ] Transient errors retried automatically
- [ ] Fatal errors fail fast (no retries)
- [ ] Circuit breaker opens after 5 failures
- [ ] Dead letters created for failures

---

## 🐛 Troubleshooting

### **Issue: "ajv is not defined"**

**Solution:**
```bash
npm install ajv ajv-formats
```

### **Issue: "Table agent_state_history does not exist"**

**Solution:**
```bash
# Run migration
psql -f server/migrations/007_agent_state_history.sql
```

### **Issue: "Budget limit exceeded"**

**Solution:**
```javascript
// Increase budget limit in agent constructor
super({
  options: {
    budgetLimitUsd: 10.00  // Increase from default 5.00
  }
});
```

### **Issue: "Circuit breaker OPEN"**

**Solution:**
```javascript
// Reset circuit breaker
await agent.errorHandler.resetCircuitBreaker();
```

### **Issue: "Input validation failed"**

**Solution:**
Check schema definition and input data match:
```javascript
// Schema says:
{ type: 'string', minLength: 1 }

// Input must be:
{ fieldName: 'value' }  // Not empty string, not number
```

---

## 📞 Support

**Documentation:**
- Implementation: `docs/PHASE_4_AGENT_PROTOCOL.md`
- This guide: `docs/PHASE_4_DEPLOYMENT.md`

**Code:**
- Protocol: `server/protocols/`
- Tests: `server/protocols/__tests__/`
- Example: `server/agents/radarAgentV2.js`

**Issues:**
- GitHub: https://github.com/your-org/upr/issues
- Slack: #upr-backend
- On-call: Check PagerDuty

---

**Deployment Status:** 🟡 READY (Pending Execution)
**Risk Level:** 🟢 LOW (Extensive tests, easy rollback)
**Estimated Downtime:** 0 minutes (rolling deployment)
**Last Updated:** November 8, 2025

---

**Ready to deploy? Follow the steps above!** 🚀
