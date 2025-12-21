# VALIDATION REPORT: Sales-Bench Production Path (Phase 1.5)

**Date:** 2025-12-21
**Requirement:** Sales-Bench must invoke the SAME SIVA runtime path as production

---

## A) PRODUCTION PATH IDENTITY PROOF

### A1. Single Production Entrypoint

**File:** `/os/siva/core-scorer.js`
**Function:** `scoreSIVA(companyProfile, envelope, options)`
**Export:** `export async function scoreSIVA(...)`

This is THE production SIVA entrypoint. Both production and Sales-Bench call this SAME function.

```javascript
// File: os/siva/core-scorer.js:48-70
/**
 * Score a company using SIVA tools
 *
 * THIS IS THE PRODUCTION SIVA ENTRYPOINT.
 * Both production APIs and Sales-Bench call this SAME function.
 *
 * PRD v1.2 Laws enforced:
 * - Law 1: Authority precedes intelligence (envelope required)
 * - Law 2: Persona is policy (tool access gated by envelope.allowed_tools)
 * - Law 5: If it cannot be replayed, it did not happen (full trace returned)
 */
export async function scoreSIVA(companyProfile, envelope, options = {}) {
  // ... scoring logic using EdgeCasesTool, CompanyQualityTool ...
}
```

---

### A2. Production Invocation Path

**File:** `/routes/os/discovery.js`
**Function:** `scoreCompanyWithSIVA(company, envelope)` (line 305)

```javascript
// File: routes/os/discovery.js:54-56
// Phase 1.5: Import SINGLE production SIVA entrypoint
// CRITICAL: Both discovery.js and Sales-Bench call the SAME scoreSIVA()
import { scoreSIVA } from '../../os/siva/core-scorer.js';

// File: routes/os/discovery.js:330-336
  // CRITICAL: Call the SAME scoreSIVA() that Sales-Bench uses
  const result = await scoreSIVA(companyProfile, envelope, {
    signals,
    latestSignalDate: company.latestSignalDate,
    contactProfile: {},
    historicalData: {},
  });
```

---

### A3. Sales-Bench Invocation Path

**File:** `/os/siva/productionScorer.js`
**Function:** `scoreWithProductionSIVA(scenario, persona)` (line 124)

```javascript
// File: os/siva/productionScorer.js:21-22
// CRITICAL: Import the SINGLE production entrypoint
import { scoreSIVA } from './core-scorer.js';

// File: os/siva/productionScorer.js:132-138
  // CRITICAL: Call the SAME scoreSIVA() that production uses
  const result = await scoreSIVA(companyProfile, envelope, {
    signals,
    latestSignalDate: scenario.signal_context?.date,
    contactProfile: scenario.contact_profile || {},
    historicalData: {},
  });
```

---

### A4. Path Identity Verification

| Aspect | Production (discovery.js) | Sales-Bench (productionScorer.js) |
|--------|---------------------------|-----------------------------------|
| Import statement | `import { scoreSIVA } from '../../os/siva/core-scorer.js'` | `import { scoreSIVA } from './core-scorer.js'` |
| Function called | `scoreSIVA(companyProfile, envelope, options)` | `scoreSIVA(companyProfile, envelope, options)` |
| Same function? | **YES - IDENTICAL** | **YES - IDENTICAL** |
| Same tools used? | EdgeCasesTool, CompanyQualityTool | EdgeCasesTool, CompanyQualityTool |

**PROOF: Both paths call the SAME `scoreSIVA()` function from `/os/siva/core-scorer.js`**

---

## B) POST-DEPLOY VERIFICATION

*(To be populated after deployment)*

### B1. Health Check
```bash
GET /api/os/health
# Expected: {"status":"healthy",...}
```

### B2. Diagnostics
```bash
GET /__diag
# Expected: {"db_ok":true,...}
```

### B3. Validation Run
```bash
POST /api/os/sales-bench/governance/commands/run-system-validation
# Body: {"suite_key":"banking-eb-uae-pre-entry","triggered_by":"TC"}
```

### B4. Trace Verification (3 results)
For each result, verify:
- `code_commit_sha` populated
- `persona_id` populated (NOT NULL)
- `capability_key` present
- `router_decision` present
- `policy_gates_evaluated` and `policy_gates_hit` present
- `tools_allowed` list + `tools_used` list present

---

## C) 12-TOOLS COVERAGE PROOF

### C1. Allowed Tools (12 total)

| # | Tool Name | Purpose |
|---|-----------|---------|
| 1 | EdgeCasesTool | Primitive 4: CHECK_EDGE_CASES |
| 2 | CompanyQualityTool | Primitive 1: Q-Score |
| 3 | TimingScoreTool | Primitive 2: T-Score |
| 4 | BankingProductMatchTool | Primitive 3: Product fit |
| 5 | ContactPriorityTool | Primitive 5: Contact ranking |
| 6 | OutreachDoctrineTool | Primitive 6: Outreach rules |
| 7 | HiringSignalExtractionTool | Tool 13: Signal extraction |
| 8 | SignalClassifierTool | Signal classification |
| 9 | MessageDraftTool | Message generation |
| 10 | DecisionChainTool | Decision logic |
| 11 | SIVABrainTool | Core reasoning |
| 12 | FeedbackLoopTool | Learning from feedback |

### C2. Tools Used in Scoring
*(To be populated from actual run trace)*

| Tool | Used? | Count | Reason if not used |
|------|-------|-------|-------------------|
| EdgeCasesTool | ✅ | - | Required for edge case detection |
| CompanyQualityTool | ✅ | - | Required for Q-score |
| TimingScoreTool | ❌ | 0 | Heuristic fallback used |
| BankingProductMatchTool | ❌ | 0 | Heuristic fallback used |
| Others | ❌ | 0 | Not needed for PASS/BLOCK decision |

---

## D) POLICY APPLICATION PROOF

*(To be populated from KILL scenario trace)*

### D1. KILL Scenario Example
```json
{
  "scenario_id": "...",
  "path_type": "KILL",
  "expected_outcome": "BLOCK",
  "actual_outcome": "BLOCK"
}
```

### D2. Policy Gate That Caused BLOCK
```json
{
  "gate_name": "...",
  "triggered": true,
  "reason": "...",
  "action_taken": "BLOCK",
  "refusal_reason_code": "..."
}
```

### D3. Evidence Pointer
```json
{
  "source": "...",
  "content_hash": "...",
  "fetched_at": "..."
}
```

---

## FILES CHANGED

```
os/siva/core-scorer.js                            (NEW - Single production entrypoint)
os/siva/productionScorer.js                       (MODIFIED - Calls core-scorer.js)
routes/os/discovery.js                            (MODIFIED - Calls core-scorer.js)
db/migrations/2025_12_21_s235_sales_bench_persona_binding.sql (NEW)
Dockerfile                                        (MODIFIED - GIT_COMMIT ARG/ENV)
scripts/deploy.sh                                 (MODIFIED - capture git commit)
```

---

## ACCEPTANCE CRITERIA STATUS

| Criteria | Status |
|----------|--------|
| Production and Sales-Bench call SAME scoreSIVA() | **MET** |
| persona_id populated and traceable | **PENDING DEPLOY** |
| code_commit_sha populated | **PENDING DEPLOY** |
| 12-tools coverage proof | **PENDING DEPLOY** |
| Policy application proof for KILL | **PENDING DEPLOY** |

---

**Next Step:** Deploy to staging and run verification commands.
