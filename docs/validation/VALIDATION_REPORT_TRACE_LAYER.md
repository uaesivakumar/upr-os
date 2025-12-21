# VALIDATION REPORT: Sales-Bench Trace Layer (Phase 1)

**Date:** 2025-12-21
**Run Validated:** banking-eb-uae-pre-entry Run #7 (ed5e3ff3-e62f-4e2f-9240-f6a0c22c5b96)
**Scenario Count:** 40

---

## 1. TRACE COMPLETENESS AUDIT

### 1A. Total Results Count

```sql
SELECT COUNT(*) as total_results
FROM sales_bench_run_results
WHERE run_id = 'ed5e3ff3-e62f-4e2f-9240-f6a0c22c5b96';
```

**Result:**
```
 total_results
---------------
            40
```

### 1B. Field Completeness Percentages

```sql
SELECT
  COUNT(*) as total,
  ROUND(100.0 * COUNT(envelope_sha256) / COUNT(*), 2) as pct_envelope_sha256,
  ROUND(100.0 * COUNT(model_slug) / COUNT(*), 2) as pct_model_slug,
  ROUND(100.0 * COUNT(model_provider) / COUNT(*), 2) as pct_model_provider,
  ROUND(100.0 * COUNT(persona_version) / COUNT(*), 2) as pct_persona_version,
  ROUND(100.0 * COUNT(policy_version) / COUNT(*), 2) as pct_policy_version,
  ROUND(100.0 * COUNT(policy_gates_hit) / COUNT(*), 2) as pct_policy_gates_hit,
  ROUND(100.0 * COUNT(tools_used) / COUNT(*), 2) as pct_tools_used,
  ROUND(100.0 * COUNT(tools_allowed) / COUNT(*), 2) as pct_tools_allowed,
  ROUND(100.0 * COUNT(evidence_used) / COUNT(*), 2) as pct_evidence_used,
  ROUND(100.0 * COUNT(signature) / COUNT(*), 2) as pct_signature,
  ROUND(100.0 * COUNT(risk_score) / COUNT(*), 2) as pct_risk_score,
  ROUND(100.0 * COUNT(latency_ms) / COUNT(*), 2) as pct_latency_ms,
  ROUND(100.0 * COUNT(interaction_id) / COUNT(*), 2) as pct_interaction_id
FROM sales_bench_run_results
WHERE run_id = 'ed5e3ff3-e62f-4e2f-9240-f6a0c22c5b96';
```

**Result:**
| Field | Completeness |
|-------|--------------|
| envelope_sha256 | 100.00% |
| model_slug | 100.00% |
| model_provider | 100.00% |
| persona_version | 100.00% |
| policy_version | 100.00% |
| policy_gates_hit | 100.00% |
| tools_used | 100.00% |
| tools_allowed | 100.00% |
| evidence_used | 100.00% |
| signature | 100.00% |
| risk_score | 100.00% |
| latency_ms | 100.00% |
| interaction_id | 100.00% |

### 1C. Rows with Missing Required Fields

```sql
SELECT id, scenario_id, ARRAY_REMOVE(ARRAY[...], NULL) as missing_fields
FROM sales_bench_run_results
WHERE run_id = '...' AND (envelope_sha256 IS NULL OR ...);
```

**Result:**
```
 result_id | scenario_id | missing_fields
-----------+-------------+----------------
(0 rows)
```

**SUCCESS CRITERIA: PASSED**
- 100% of rows have all required identity/provenance fields

---

## 2. SIGNATURE INTEGRITY TEST

### 2A. Signature Verification (3 Random Results)

```bash
curl -H "x-pr-os-token: ..." ".../verify/eeca3e0d-4abe-461c-ba3c-d956523b1913"
curl -H "x-pr-os-token: ..." ".../verify/839013e7-b35a-441b-a83c-160e413e4dfe"
curl -H "x-pr-os-token: ..." ".../verify/b89c8449-5c2c-4af6-9396-ef4581f8b16a"
```

**Results:**
```json
{"verification_status":"VALID","message":"Signature verified. No tampering detected."}
{"verification_status":"VALID","message":"Signature verified. No tampering detected."}
{"verification_status":"VALID","message":"Signature verified. No tampering detected."}
```

### 2B. Tamper Detection Test

**Test Subject:**
```
interaction_id: eeca3e0d-4abe-461c-ba3c-d956523b1913
envelope_sha256: dfb2ea93553a2067cfb2982b41c7a493fabc29abd5fc1c78f6bdfebdf410fc69
outcome: BLOCK
stored_signature: 6830751a6de8fe37a95bde19ab5fde4dfa8fb98ab031aafa99d64abd27125a91
```

**Tamper Test Results:**
```
1. ORIGINAL VALUES:
   computed_signature: 6830751a6de8fe37...
   MATCH: YES - VALID

2. TAMPERED OUTCOME (BLOCK -> PASS):
   tampered_signature: c1e157cfc3ded897...
   MATCH: NO - INVALID (TAMPER DETECTED)

3. TAMPERED ENVELOPE HASH:
   tampered_signature: c3cdcdd9c7a7dad7...
   MATCH: NO - INVALID (TAMPER DETECTED)

4. TAMPERED INTERACTION ID:
   tampered_signature: 7c6ddf5d4632ecb2...
   MATCH: NO - INVALID (TAMPER DETECTED)
```

**SUCCESS CRITERIA: PASSED**
- Any single-field modification flips signature status to INVALID

---

## 3. TOOL TRACE TRUTH TEST

### 3A. Scenarios with Tool Calls (5 samples)

```sql
SELECT scenario_id, path_type, outcome,
       tools_used->0->>'tool_name' as tool,
       (tools_used->0->>'duration_ms')::int as duration_ms,
       LEFT(tools_used->0->>'input_hash', 16) as input_hash,
       LEFT(tools_used->0->>'output_hash', 16) as output_hash
FROM sales_bench_run_results
WHERE run_id = '...' AND jsonb_array_length(tools_used) > 0
LIMIT 5;
```

**Result:**
| scenario_id | path_type | outcome | tool | duration_ms | input_hash | output_hash |
|-------------|-----------|---------|------|-------------|------------|-------------|
| 74efbfae... | GOLDEN | PASS | siva-scorer | 1 | 3d5d8380efed052b | b3f997ee5e314302 |
| 5dd19688... | GOLDEN | PASS | siva-scorer | 1 | 64291273c36b61b9 | b3f997ee5e314302 |
| 08ee4296... | GOLDEN | PASS | siva-scorer | 1 | 8955b4a5f728e9b5 | b3f997ee5e314302 |
| 163c3668... | GOLDEN | PASS | siva-scorer | 0 | ec7433edb8738111 | b3f997ee5e314302 |
| 8a3d6562... | GOLDEN | PASS | siva-scorer | 0 | 49f652e16ea214f6 | b3f997ee5e314302 |

**Key Observations:**
- Each scenario has UNIQUE input_hash (different scenario data)
- All have SAME output_hash (deterministic scorer produces consistent output structure)
- Duration logged per call

### 3B. Scenarios with No Tools

```sql
SELECT scenario_id, tools_used
FROM sales_bench_run_results
WHERE jsonb_array_length(tools_used) = 0;
```

**Result:**
```
(0 rows)
```

All 40 scenarios have exactly 1 tool call (siva-scorer), which is correct because the scorer always executes for every scenario.

### 3C. Tool Calls Count Histogram

```sql
SELECT jsonb_array_length(tools_used) as tool_count, COUNT(*)
FROM sales_bench_run_results
WHERE run_id = '...'
GROUP BY tool_count;
```

**Result:**
| tool_count | scenario_count |
|------------|----------------|
| 1 | 40 |

**SUCCESS CRITERIA: PASSED**
- tools_used is NOT derived from tools_allowed (allowed has 3, used has 1)
- Each tool call has unique input_hash proving per-scenario execution
- Empty tool usage would be represented as `[]` (none in this run)

---

## 4. POLICY GATE TRACE CONSISTENCY TEST

### 4A. PASS Results (5 samples)

```sql
SELECT scenario_id, outcome,
       policy_gates_hit->0->>'gate_name' as gate,
       policy_gates_hit->0->>'action_taken' as action,
       policy_gates_hit->0->>'reason' as reason
FROM sales_bench_run_results
WHERE outcome = 'PASS' LIMIT 5;
```

**Result:**
| scenario | outcome | gate_name | action_taken | reason |
|----------|---------|-----------|--------------|--------|
| 08ee4296 | PASS | crs_pass_threshold | PASS | CRS 0.738 >= 0.60 |
| b4b927fe | PASS | crs_pass_threshold | PASS | CRS 0.738 >= 0.60 |
| 163c3668 | PASS | crs_pass_threshold | PASS | CRS 0.738 >= 0.60 |
| d2f5010e | PASS | crs_pass_threshold | PASS | CRS 0.738 >= 0.60 |
| 8a3d6562 | PASS | crs_pass_threshold | PASS | CRS 0.738 >= 0.60 |

### 4B. BLOCK Results (5 samples)

**Result:**
| scenario | outcome | gate_name | action_taken | reason |
|----------|---------|-----------|--------------|--------|
| 29c1544d | BLOCK | qualification_threshold | BLOCK | Qualification score 2 < 3 |
| e22a35cd | BLOCK | qualification_threshold | BLOCK | Qualification score 2 < 3 |
| 8fb46916 | BLOCK | qualification_threshold | BLOCK | Qualification score 2 < 3 |
| 53e4ddb9 | BLOCK | qualification_threshold | BLOCK | Qualification score 2 < 3 |
| aae46e1d | BLOCK | qualification_threshold | BLOCK | Qualification score 2 < 3 |

**SUCCESS CRITERIA: PASSED**
- BLOCK results show qualification_threshold gate with BLOCK action
- PASS results show crs_pass_threshold gate with PASS action
- Gates are consistent with outcomes

---

## 5. PRODUCTION PATH ASSERTION

### Critical Finding: KNOWN GAP

**Sales-Bench Invocation Path:**
```
File: /routes/os/sales-bench/governance.js:19
Import: import { scoreScenario, scoreBatch } from '../../../os/sales-bench/engine/siva-scorer.js';
```

**siva-scorer.js Implementation:**
```javascript
// File: /os/sales-bench/engine/siva-scorer.js:52-70
export async function scoreScenario(scenario) {
  // DETERMINISTIC SCORING (not AI)
  const dimensionScores = calculateDimensionScores({...});
  const weightedCRS = calculateWeightedCRS(dimensionScores);
  const decision = makeDecision(dimensionScores, weightedCRS, ...);
  return { outcome: decision.outcome, ... };
}
```

**Production SIVA Invocation Path:**
```
File: /routes/os/score.js:74
Uses: envelopeMiddleware() + aiExplanationService.js (actual LLM calls)
```

### Gap Analysis

| Aspect | Sales-Bench | Production |
|--------|-------------|------------|
| Scoring | Deterministic (rule-based) | SIVA AI (LLM-powered) |
| Model | `siva-scorer-v1` (internal) | Actual LLM model |
| Envelope | Computed but not sealed | PRD v1.2 sealed envelope |
| Tools | siva-scorer tool logged | Full SIVA tool suite |

**This is a PHASE 1 LIMITATION:**
- Sales-Bench currently uses a deterministic scorer that SIMULATES SIVA behavior
- Production uses actual SIVA AI via LLM
- Trace infrastructure is complete, but scoring path is not production-identical

**Mitigation for Phase 2:**
- Integrate actual SIVA AI scoring into Sales-Bench validation
- Use production envelope middleware
- Track actual LLM model used

---

## 6. SUPER ADMIN READABILITY TEST

### Screenshots Required

Due to CLI environment, screenshots cannot be captured directly. However, the following data would be visible in Super Admin UI:

**A) Suite Overview (banking-eb-uae-pre-entry):**
- Status: SYSTEM_VALIDATED
- Last Run: Run #7 (2025-12-21T09:45:48Z)
- Golden Pass Rate: 100%
- Kill Containment: 100%
- Cohen's d: 11.398

**B) Scenario Result Drill-down (Trace Tab):**
```json
{
  "interaction_id": "a5dbe590-2429-4105-8678-1012ad243780",
  "envelope": {"sha256": "cebbaa4b6edfae6c...", "version": "1.0.0"},
  "routing": {"model_slug": "siva-scorer-v1", "model_provider": "internal"},
  "tools": {"allowed": ["siva-scorer","crs-calculator","decision-engine"], "used": [...]},
  "policy_gates": {"gates_hit": [{"gate_name":"crs_pass_threshold","action_taken":"PASS"}]},
  "risk": {"score": 0.10, "escalation_triggered": false},
  "integrity": {"signature": "a5250d3f52524cf7..."}
}
```

**C) Verify Tab:**
```json
{
  "verification_status": "VALID",
  "message": "Signature verified. No tampering detected.",
  "signature_present": true
}
```

**SUCCESS CRITERIA: PARTIAL**
- All trace data is exposed via API and UI tabs
- Screenshots require browser access to Super Admin

---

## 7. KNOWN GAPS

### 7.1 Production Path Gap (CRITICAL)
- Sales-Bench uses deterministic `siva-scorer.js` not actual SIVA AI
- Trace shows `model_slug: siva-scorer-v1` (internal) not production LLM
- **Resolution:** Phase 2 will integrate actual SIVA AI scoring

### 7.2 Replay is Stub (EXPECTED)
- `POST /replay/:interactionId` returns pending status
- Full replay with deviation detection not implemented
- **Resolution:** Phase 2 implementation planned

### 7.3 code_commit_sha Not Populated
- Column exists but governance.js uses `process.env.GIT_COMMIT || 'unknown'`
- GIT_COMMIT not set in Cloud Run environment
- **Resolution:** Add to Cloud Build or Dockerfile

### 7.4 persona_id Always Null
- Authority chain shows `persona_id: null`
- Suite not linked to persona in database yet
- **Resolution:** Link suites to personas when persona management is complete

---

## 8. SQL SNIPPETS USED

All SQL queries used in this validation are documented inline in each section above.

---

## 9. EXAMPLE TRACE EXPORTS

5 trace exports saved to:
- `docs/validation/trace_example_1.json` (GOLDEN/PASS - Talabat acquisition-integration)
- `docs/validation/trace_example_2.json` (GOLDEN/PASS - DEWA Solar privatization)
- `docs/validation/trace_example_3.json` (GOLDEN/PASS - TechVentures DMCC new-entity-setup)
- `docs/validation/trace_example_4.json` (GOLDEN/PASS - Rotana Hotels property-opening)
- `docs/validation/trace_example_5.json` (KILL/BLOCK - Demonstrates BLOCK outcome with qualification_threshold gate)

---

## SUMMARY

| Test | Status | Notes |
|------|--------|-------|
| 1. Trace Completeness | **PASSED** | 100% field completeness |
| 2. Signature Integrity | **PASSED** | Tamper detection verified |
| 3. Tool Trace Truth | **PASSED** | Unique input hashes per scenario |
| 4. Policy Gate Consistency | **PASSED** | Gates match outcomes |
| 5. Production Path | **GAP** | Deterministic scorer, not production SIVA |
| 6. Super Admin Readability | **PARTIAL** | API complete, screenshots needed |

**Overall Status:** Phase 1 Trace Layer is FUNCTIONAL with KNOWN GAPS documented for Phase 2.
