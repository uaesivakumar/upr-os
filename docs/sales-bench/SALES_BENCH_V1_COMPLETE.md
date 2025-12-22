# Sales-Bench v1 — Complete Documentation

**Version:** 1.0.0
**PRD:** v1.3 Appendix
**Status:** PRODUCTION

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Philosophy](#2-core-philosophy)
3. [Architecture](#3-architecture)
4. [Components Deep Dive](#4-components-deep-dive)
5. [Governance Model](#5-governance-model)
6. [Validation Framework](#6-validation-framework)
7. [Wiring Parity](#7-wiring-parity)
8. [Shadow Mode](#8-shadow-mode)
9. [API Reference](#9-api-reference)
10. [Founder Learning Guide](#10-founder-learning-guide)

---

## 1. Executive Summary

### What is Sales-Bench?

Sales-Bench is the **behavioral validation system** for SIVA (the AI sales intelligence agent inside UPR OS). It answers one critical question:

> **"Is SIVA making the right sales decisions?"**

### Key Principle

```
┌────────────────────────────────────────────────────────────────┐
│  SALES-BENCH IS ADVISORY ONLY                                  │
│  CRS (Composite Readiness Score) NEVER alters SIVA runtime     │
│  It observes, scores, reports — but never changes behavior     │
└────────────────────────────────────────────────────────────────┘
```

### The Three Laws of Sales-Bench

| Law | Description |
|-----|-------------|
| **Authority Invariance** | Cannot modify envelopes, personas, or policies |
| **Production Isolation** | Never impacts live SIVA decisions |
| **Advisory Only** | CRS informs humans, never controls SIVA |

---

## 2. Core Philosophy

### Why Sales-Bench Exists

Traditional sales AI validation is broken:

| Problem | How Most Do It | How Sales-Bench Does It |
|---------|---------------|-------------------------|
| **Accuracy** | Compare to historical data | Simulate realistic buyer behavior |
| **Edge Cases** | Hope they don't happen | Mandatory adversarial testing |
| **Government Entities** | Block with hardcoded lists | Intelligent policy detection |
| **Enterprise Brands** | Miss or over-contact | Score-based prioritization |
| **Replay** | Impossible | Deterministic seed-based replay |

### The "Golden/Kill" Paradigm

Every sales scenario has two possible paths:

```
                    ┌─────────────────┐
                    │   SCENARIO      │
                    │  (Company Data) │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │   GOLDEN PATH   │           │    KILL PATH    │
    │   (Should WIN)  │           │  (Should LOSE)  │
    └────────┬────────┘           └────────┬────────┘
             │                             │
             ▼                             ▼
    SIVA pursues, closes         SIVA blocks, warns, or
    deal successfully            correctly rejects
```

- **Golden Path:** SIVA should pursue and WIN this deal
- **Kill Path:** SIVA should recognize danger and REFUSE

---

## 3. Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         SUPER ADMIN                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────────┐  │
│  │ Sales-Bench│  │  Founder   │  │    Learning System         │  │
│  │ Dashboard  │  │   Bible    │  │  (This Documentation)      │  │
│  └─────┬──────┘  └────────────┘  └────────────────────────────┘  │
└────────┼─────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                      UPR OS (Backend)                             │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    SALES-BENCH ENGINE                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │   │
│  │  │   Suites    │  │  Scenarios  │  │  Buyer Bots │        │   │
│  │  │  (Groups)   │  │  (Tests)    │  │  (Personas) │        │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │   │
│  │         └────────────────┼────────────────┘               │   │
│  │                          ▼                                │   │
│  │  ┌──────────────────────────────────────────────────┐     │   │
│  │  │              PATH EXECUTOR                        │    │   │
│  │  │   - Execute Golden Path (should PASS)            │    │   │
│  │  │   - Execute Kill Path (should BLOCK)             │    │   │
│  │  └──────────────────────┬───────────────────────────┘    │   │
│  │                         ▼                                │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │              DIMENSION SCORER                     │   │   │
│  │  │   - 8 CRS Dimensions                             │   │   │
│  │  │   - Fixed Weights (PRD v1.3)                     │   │   │
│  │  └──────────────────────┬───────────────────────────┘   │   │
│  │                         ▼                               │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │              CALIBRATION ENGINE                   │  │   │
│  │  │   - Human Scoring                                │  │   │
│  │  │   - Spearman Correlation                         │  │   │
│  │  │   - Cohen's d Effect Size                        │  │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                        SIVA CORE                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                   scoreSIVA()                             │   │
│  │              (os/siva/core-scorer.js)                     │   │
│  │                                                           │   │
│  │   THE SINGLE SOURCE OF TRUTH                              │   │
│  │   - Both Frontend and Sales-Bench call THIS               │   │
│  │   - No parallel intelligence paths                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Suite Created (e.g., "Banking EB UAE Pre-Entry")
       │
       ▼
2. Scenarios Generated (31 test cases)
       │
       ├── Golden Path Scenarios (expected: PASS)
       │   - Tech Startup with hiring signals
       │   - Fintech with funding round
       │
       └── Kill Path Scenarios (expected: BLOCK)
           - Government entity
           - Enterprise without signals
       │
       ▼
3. Validation Run Triggered
       │
       ├── Each scenario executed through SIVA
       │
       ▼
4. Results Collected
       │
       ├── Golden Pass Rate: % of golden scenarios that PASS
       ├── Kill Containment Rate: % of kill scenarios that BLOCK
       ├── Cohen's d: Statistical separation
       │
       ▼
5. Report Generated for Founder Review
```

---

## 4. Components Deep Dive

### 4.1 Suites

A **Suite** is a collection of related scenarios for a specific context.

| Field | Description | Example |
|-------|-------------|---------|
| `suite_key` | Unique identifier | `banking-eb-uae-pre-entry` |
| `name` | Human-readable name | Banking EB UAE Pre-Entry |
| `vertical` | Industry vertical | `banking` |
| `sub_vertical` | Role within vertical | `employee_banking` |
| `region` | Geographic region | `UAE` |
| `type` | Suite type | `PRE_ENTRY`, `POST_ENTRY`, `DISCOVERY` |
| `is_frozen` | Locked for modification | `true` after validation |

**Suite Lifecycle:**

```
DRAFT → VALIDATING → SYSTEM_VALIDATED → FROZEN
                          ↓
                  HUMAN_CALIBRATING
                          ↓
                  HUMAN_CALIBRATED
                          ↓
                     GA_APPROVED
```

### 4.2 Scenarios

A **Scenario** is a single test case with:

```javascript
{
  scenario_id: "uuid",
  suite_id: "uuid",
  path_type: "GOLDEN" | "KILL",      // Expected outcome type
  expected_outcome: "PASS" | "BLOCK", // What SIVA should return

  company_profile: {
    name: "TechCorp Ltd",
    industry: "technology",
    employees: 150,
    location: "Dubai",
    domain: "techcorp.ae",
    license_type: "LLC",
  },

  signal_context: {
    type: "hiring-expansion",
    strength: 0.85,
    age_days: 10,
  },

  contact_profile: {
    role: "CFO",
    decision_maker: true,
  },

  edge_case_flags: ["FREE_ZONE", "RECENT_FUNDING"],

  // Immutability
  content_hash: "sha256...",
  created_at: "2025-12-22T...",
}
```

### 4.3 Buyer Bots (S243)

Buyer Bots simulate realistic buyer behavior:

| Category | Description | Example |
|----------|-------------|---------|
| `EAGER_BUYER` | Ready to engage, minimal objections | Easy win scenario |
| `SKEPTICAL_BUYER` | Questions everything, needs proof | Requires persuasion |
| `PRICE_SENSITIVE` | Focus on cost, competitor mentions | Discount seeking |
| `TECHNICAL_BUYER` | Deep technical questions | IT/Security focus |
| `HOSTILE_BUYER` | Actively resistant, rude | Adversarial test |
| `SILENT_BUYER` | Minimal responses | Engagement test |
| `COMPETITOR_LOYAL` | Mentions competitor satisfaction | Switching barrier |

**Hidden States:**

Buyer Bots have hidden states that SIVA cannot see directly:

```javascript
{
  type: "BUDGET_CONSTRAINT",
  severity: "HIGH",
  trigger_condition: "price_mentioned > $10000",
  effect: "Immediate objection, potential walkaway"
}
```

### 4.4 Mandatory Adversarial Bots (S244)

Every suite MUST include these adversarial scenarios:

| Bot Type | Test Purpose |
|----------|--------------|
| `GOVERNMENT_DECOY` | Verify government detection |
| `ENTERPRISE_NO_SIGNALS` | Large company without expansion signals |
| `SANCTIONED_ENTITY` | Compliance/AML detection |
| `COMPETITOR_EMPLOYEE` | Competitive intelligence protection |
| `BUDGET_FREEZE` | Year-end timing detection |

### 4.5 CRS (Composite Readiness Score) — S245-S246

CRS measures SIVA's sales readiness across 8 dimensions:

| # | Dimension | Weight | What It Measures |
|---|-----------|--------|------------------|
| 1 | **Engagement Quality** | 15% | How well SIVA engages buyers |
| 2 | **Objection Handling** | 15% | Response to buyer resistance |
| 3 | **Product Knowledge** | 12% | Accuracy of product info |
| 4 | **Personalization** | 12% | Context-aware responses |
| 5 | **Timing Sensitivity** | 12% | Right time, right approach |
| 6 | **Value Articulation** | 12% | Clear value proposition |
| 7 | **Compliance Adherence** | 12% | Policy and regulatory compliance |
| 8 | **Close Readiness** | 10% | Ability to advance deals |

**Scoring:**

```
CRS = Σ (dimension_score × weight)

Example:
  Engagement: 85 × 0.15 = 12.75
  Objection:  70 × 0.15 = 10.50
  Knowledge:  90 × 0.12 = 10.80
  ...
  Total CRS = 78.5
```

**CRS Tiers:**

| Range | Tier | Meaning |
|-------|------|---------|
| 90-100 | EXCELLENT | Production ready |
| 75-89 | GOOD | Minor improvements needed |
| 60-74 | ACCEPTABLE | Usable with monitoring |
| 40-59 | NEEDS_WORK | Significant improvements needed |
| 0-39 | CRITICAL | Not production ready |

### 4.6 Path Executor (S247)

Executes scenarios through SIVA:

**Golden Path Execution:**

```
1. Load scenario
2. Create envelope (sealed context)
3. Call scoreSIVA()
4. Verify outcome = PASS
5. Record trace (tools used, gates hit)
6. Calculate CRS dimensions
```

**Kill Path Execution:**

```
1. Load scenario
2. Create envelope (sealed context)
3. Call scoreSIVA()
4. Verify outcome = BLOCK
5. Record WHY blocked (policy gate)
6. Validate blocker is correct type
```

### 4.7 Calibration Engine (S248)

Human calibration ensures SIVA aligns with human judgment:

**Process:**

1. Select 30+ scenarios (minimum for statistical validity)
2. Human evaluator scores each 1-5
3. SIVA scores each automatically
4. Calculate Spearman rank correlation
5. Calculate Cohen's d effect size

**Thresholds:**

| Metric | Threshold | Meaning |
|--------|-----------|---------|
| Spearman ρ | ≥ 0.70 | Strong agreement |
| Cohen's d | ≥ 0.80 | Large effect size |
| Inter-rater κ | ≥ 0.60 | Substantial agreement |

---

## 5. Governance Model

### Authority Invariance Guard

Sales-Bench operates under strict isolation:

```javascript
// FORBIDDEN operations:
assertNoEnvelopeModification(operation);     // Cannot change envelopes
assertNoPersonaModification(operation);       // Cannot change personas
assertNoPolicyBypass(operation);              // Cannot bypass policies
assertNoProductionImpact(operation);          // Cannot affect live SIVA

// Allowed operations:
assertOperationAllowed('READ', 'scenarios');  // Read scenarios ✓
assertOperationAllowed('WRITE', 'runs');      // Write run results ✓
assertOperationAllowed('READ', 'siva_output'); // Read SIVA decisions ✓
```

### Suite Governance Commands

Super Admin can trigger these commands:

| Command | Description |
|---------|-------------|
| `run-system-validation` | Execute all scenarios in suite |
| `start-human-calibration` | Begin human scoring process |
| `approve-for-ga` | Mark suite as production approved |
| `deprecate-suite` | Archive suite, prevent further runs |
| `freeze-suite` | Lock suite from modifications |

### Audit Trail

Every operation is logged:

```javascript
{
  timestamp: "2025-12-22T04:49:06.705Z",
  operation: "run-system-validation",
  suite_key: "banking-eb-uae-pre-entry",
  triggered_by: "FOUNDER",
  results: {
    golden_pass_rate: 56,
    kill_containment_rate: 100,
    cohens_d: 2.34
  }
}
```

---

## 6. Validation Framework

### Metrics Explained

#### Golden Pass Rate

```
Golden Pass Rate = (Golden scenarios that returned PASS) / (Total Golden scenarios) × 100

Example:
  Golden scenarios: 9
  Returned PASS: 5
  Golden Pass Rate = 5/9 × 100 = 56%
```

**Interpretation:**

| Rate | Meaning |
|------|---------|
| 95%+ | Excellent - SIVA pursuing almost all good leads |
| 80-94% | Good - Minor false negatives |
| 60-79% | Acceptable - Some good leads missed |
| <60% | Needs Work - Too many false negatives |

#### Kill Containment Rate

```
Kill Containment Rate = (Kill scenarios that returned BLOCK) / (Total Kill scenarios) × 100

Example:
  Kill scenarios: 6
  Returned BLOCK: 6
  Kill Containment Rate = 6/6 × 100 = 100%
```

**Interpretation:**

| Rate | Meaning |
|------|---------|
| 95%+ | Excellent - Blocking almost all bad leads |
| 80-94% | Good - Most bad leads blocked |
| <80% | Critical - Too many bad leads getting through |

#### Cohen's d (Effect Size)

Measures statistical separation between Golden and Kill paths:

```
Cohen's d = (Mean_Golden - Mean_Kill) / Pooled_StdDev
```

**Interpretation:**

| d | Effect Size | Meaning |
|---|-------------|---------|
| ≥0.80 | Large | Clear separation between paths |
| 0.50-0.79 | Medium | Moderate separation |
| 0.20-0.49 | Small | Weak separation |
| <0.20 | Negligible | No meaningful difference |

### Validation Run Report

```
═══════════════════════════════════════════════════════════════
VALIDATION RUN REPORT
Suite: Banking EB UAE Pre-Entry Discovery
Date: 2025-12-22
═══════════════════════════════════════════════════════════════

SUMMARY:
  Total Scenarios: 31
  Golden Scenarios: 15
  Kill Scenarios: 16

RESULTS:
  Golden Pass Rate: 56% (5/9 within threshold)
  Kill Containment: 100% (6/6 blocked)
  Cohen's d: 2.34 (Large effect)

BREAKDOWN BY OUTCOME:
  ACT: 5 scenarios
  WAIT: 1 scenario
  IGNORE: 8 scenarios
  BLOCK: 17 scenarios

NOTABLE FINDINGS:
  - Government entity detection: 100% effective
  - Free Zone boost: Working correctly (+30%)
  - Enterprise detection: Triggered for 15000+ employees
  - Year-end freeze warning: Active (December)

═══════════════════════════════════════════════════════════════
```

---

## 7. Wiring Parity

### Why Parity Matters

The most critical requirement: **Frontend and Sales-Bench must use IDENTICAL SIVA logic.**

If they diverge, validation is meaningless.

### Parity Architecture

```
Frontend Discovery          Sales-Bench
        │                        │
        ▼                        ▼
  discovery.js             productionScorer.js
        │                        │
        └────────┬───────────────┘
                 │
                 ▼
          scoreSIVA()
     (os/siva/core-scorer.js)
                 │
                 ▼
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
EdgeCases   CompanyQuality  TimingScore
  Tool         Tool           Tool

      NO PARALLEL INTELLIGENCE PATHS
```

### Parity Test Cases

| # | Test Case | Expected Outcome |
|---|-----------|------------------|
| 1 | Tech Startup (150 emp, hiring) | PASS (73, HOT) |
| 2 | Enterprise No Signals (15k emp) | BLOCK (11, COOL) |
| 3 | Government Entity | BLOCK (6, COOL) |
| 4 | Free Zone Fintech | PASS (91, HOT) |
| 5 | Small Company (12 emp) | BLOCK (38, COOL) |

### Parity Certification

```
CERTIFICATION STATUS: ✅ CERTIFIED

Test Results:
  ✅ CASE_1_TECH_STARTUP - PASS (73)
  ✅ CASE_2_ENTERPRISE_NO_SIGNALS - BLOCK (11)
  ✅ CASE_3_GOVERNMENT_ENTITY - BLOCK (6)
  ✅ CASE_4_FREE_ZONE_FINTECH - PASS (91)
  ✅ CASE_5_SMALL_COMPANY - BLOCK (38)

All 5 tests: IDENTICAL between Frontend and Sales-Bench
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/os/sales-bench/parity/certify` | Run full certification |
| `GET /api/os/sales-bench/parity/status` | Get current status |
| `GET /api/os/sales-bench/parity/results` | Get test history |

---

## 8. Shadow Mode

### Purpose

Silent observation mode to build founder trust before automation.

### Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│  "Show me SIVA is making the right decisions."              │
│  "I will decide when to trust it."                          │
│                                                             │
│  NO threshold changes.                                      │
│  NO scenario regeneration.                                  │
│  NO industry rules.                                         │
│  NO CRS weight tuning.                                      │
│  NO outreach automation.                                    │
│                                                             │
│  JUST OBSERVE.                                              │
└─────────────────────────────────────────────────────────────┘
```

### Shadow Mode Flow

```
1. Real company signals arrive
       │
       ▼
2. SIVA evaluates (shadow mode)
       │
       ├── Decision: ACT / WAIT / IGNORE / BLOCK
       ├── Scores: Quality, Timing, Overall
       ├── Trace: Tools used, Gates hit
       │
       ▼
3. Log decision (NO ACTION TAKEN)
       │
       ▼
4. Weekly Founder Trust Report
       │
       ├── Top 10 ACT decisions
       ├── Top 10 WAIT decisions
       ├── 5 IGNORE justifications
       └── 3 BLOCK explanations
```

### Founder Trust Report

```
════════════════════════════════════════════════════════════════
FOUNDER TRUST REPORT
Week: 2025-12-16 to 2025-12-22
════════════════════════════════════════════════════════════════

SUMMARY:
  Total Decisions: 45
  ACT: 12
  WAIT: 8
  IGNORE: 18
  BLOCK: 7

TOP 10 ACT DECISIONS:
────────────────────────────────────────────────────────────────
1. TechVentures Dubai
   Industry: Technology
   Size: 150 employees
   Signal: hiring-expansion (10d old)
   Quality: 65
   Timing: 75
   Overall: 73
   Reasoning: "Strong UAE presence, recent hiring signal..."

2. PayFlow MENA
   ...

BLOCK EXPLANATIONS:
────────────────────────────────────────────────────────────────
1. Dubai Municipality
   Industry: Government
   Blocked By: GOVERNMENT_SECTOR gate
   Reason: "ENBD policy prohibits direct employee banking..."

════════════════════════════════════════════════════════════════
```

### V2 Intent (Future)

Current quality scoring is industry-biased:
- Tech/Fintech/Healthcare → High quality (40+)
- All other industries → Low quality (25)

**V2 Thesis:** Quality should be based on **payroll patterns**, not industry.

| Signal | What It Tells Us |
|--------|------------------|
| WPS Patterns | Active payroll, employee count trends |
| Workforce Type | White-collar vs blue-collar mix |
| Visa Clustering | Multiple visa types = diverse workforce |
| Salary Bands | Premium vs basic salary distribution |
| Headcount Stability | Growing, stable, or declining |

**Status:** INTENT ONLY — Requires 2-4 weeks shadow validation data.

---

## 9. API Reference

### Suite Management

```
GET /api/os/sales-bench/suites
GET /api/os/sales-bench/suites/:suiteKey
POST /api/os/sales-bench/suites
PATCH /api/os/sales-bench/suites/:suiteKey
```

### Governance Commands

```
POST /api/os/sales-bench/governance/commands/run-system-validation
  Body: { suite_key: string, triggered_by: string }

POST /api/os/sales-bench/governance/commands/start-human-calibration
  Body: { suite_key: string, evaluator_email: string }

POST /api/os/sales-bench/governance/commands/approve-for-ga
  Body: { suite_key: string }
```

### Scenarios

```
GET /api/os/sales-bench/scenarios?suite_key=xxx
POST /api/os/sales-bench/scenarios
DELETE /api/os/sales-bench/scenarios/:scenarioId
```

### Runs & Results

```
GET /api/os/sales-bench/suites/:suiteKey/runs
GET /api/os/sales-bench/suites/:suiteKey/runs/:runId/results
GET /api/os/sales-bench/suites/:suiteKey/runs/:runId/results/:resultId/trace
```

### Shadow Mode

```
POST /api/os/sales-bench/shadow/run
  Body: { company: {...} } or { companies: [...] }

GET /api/os/sales-bench/shadow/report
  Query: format=json|markdown, week_start=ISO_DATE

GET /api/os/sales-bench/shadow/status
```

### Parity Testing

```
POST /api/os/sales-bench/parity/certify
GET /api/os/sales-bench/parity/status
GET /api/os/sales-bench/parity/results
```

---

## 10. Founder Learning Guide

### Module 1: Understanding Sales-Bench (30 min)

**Learning Objectives:**
- Explain what Sales-Bench is and why it exists
- Describe the Golden/Kill path paradigm
- Understand authority invariance

**Key Concepts:**

1. **Sales-Bench = Quality Assurance for AI Sales**
   - Like unit tests for code, but for sales decisions
   - Catches errors before they reach customers

2. **Golden Path = "Should Win"**
   - Test cases where SIVA should pursue and close
   - Measures false negatives (missed opportunities)

3. **Kill Path = "Should Refuse"**
   - Test cases where SIVA should block or warn
   - Measures false positives (wasted effort)

4. **Authority Invariance**
   - Sales-Bench observes, never changes
   - CRS is advisory only

**Quiz:**
1. What does CRS stand for?
   - A) Customer Relationship Score
   - B) Composite Readiness Score ✓
   - C) Conversion Rate Statistics

2. Can Sales-Bench modify SIVA's persona settings?
   - A) Yes, for testing purposes
   - B) No, authority invariance forbids it ✓
   - C) Only in shadow mode

---

### Module 2: Reading Validation Reports (20 min)

**Learning Objectives:**
- Interpret Golden Pass Rate
- Interpret Kill Containment Rate
- Understand Cohen's d

**Key Concepts:**

1. **Golden Pass Rate**
   - Formula: Correct PASS / Total Golden × 100
   - Target: ≥80%
   - Low rate = missing good leads

2. **Kill Containment Rate**
   - Formula: Correct BLOCK / Total Kill × 100
   - Target: ≥95%
   - Low rate = wasting effort on bad leads

3. **Cohen's d**
   - Measures statistical separation
   - Target: ≥0.80 (large effect)
   - Low d = paths not clearly separated

**Practical Exercise:**
Given: Golden Pass 56%, Kill Containment 100%, Cohen's d 2.34
- Is Golden Pass acceptable? (No, below 80%)
- Is Kill Containment acceptable? (Yes, 100%)
- Is separation strong? (Yes, d=2.34 is large)

---

### Module 3: Shadow Mode & Trust Building (25 min)

**Learning Objectives:**
- Explain the purpose of shadow mode
- Read Founder Trust Reports
- Understand the V2 quality thesis

**Key Concepts:**

1. **Shadow Mode Purpose**
   - Silent observation, no automation
   - Build trust before action

2. **What's Forbidden in Shadow Mode:**
   - ❌ Threshold changes
   - ❌ Industry rules
   - ❌ CRS weight tuning
   - ❌ Outreach automation

3. **Founder Trust Report**
   - Weekly summary of SIVA decisions
   - Top ACT/WAIT/IGNORE/BLOCK with reasoning
   - Full trace for transparency

4. **V2 Quality Thesis**
   - Industry ≠ EB Quality
   - Payroll pattern = EB Quality
   - WPS data, visa types, salary bands

**Quiz:**
1. Can you tune CRS weights during shadow mode?
   - A) Yes, to improve accuracy
   - B) No, observation only ✓

2. What does the V2 thesis propose?
   - A) Industry determines quality
   - B) Payroll patterns determine quality ✓
   - C) Company size determines quality

---

### Module 4: Wiring Parity (15 min)

**Learning Objectives:**
- Explain why parity matters
- Understand the parity test
- Verify certification status

**Key Concepts:**

1. **Why Parity Matters**
   - If frontend and Sales-Bench diverge, validation is meaningless
   - Both must call the SAME scoreSIVA() function

2. **What's Tested:**
   - outcome (ACT/WAIT/IGNORE/BLOCK)
   - tools_used (which SIVA tools ran)
   - policy_gates_hit (which gates triggered)
   - envelope_sha256 (input determinism)
   - scores.overall (final score)

3. **Certification:**
   - 5 fixed test cases
   - All must match between paths
   - Run: `POST /api/os/sales-bench/parity/certify`

**Quiz:**
1. What happens if parity test fails?
   - A) Nothing, it's just advisory
   - B) Validation results are unreliable ✓
   - C) SIVA stops working

---

### Module 5: Governance & Operations (20 min)

**Learning Objectives:**
- Trigger validation runs
- Manage suite lifecycle
- Read audit trails

**Key Concepts:**

1. **Suite Lifecycle:**
   ```
   DRAFT → VALIDATING → SYSTEM_VALIDATED → FROZEN
                              ↓
                      HUMAN_CALIBRATING
                              ↓
                      GA_APPROVED
   ```

2. **Governance Commands:**
   - `run-system-validation`: Execute all scenarios
   - `start-human-calibration`: Begin human scoring
   - `approve-for-ga`: Mark production ready
   - `freeze-suite`: Lock from changes

3. **Audit Trail:**
   - Every operation logged
   - Who, when, what, results
   - Immutable for compliance

**Practical Exercise:**
Navigate to Super Admin → Sales-Bench → Select a suite → Click "Run Validation"

---

## Summary

Sales-Bench v1 is the behavioral validation system that ensures SIVA makes correct sales decisions. It operates under strict authority invariance, never modifying production behavior. Through Golden/Kill path testing, CRS scoring, and human calibration, it provides confidence that SIVA is ready for production use.

**Key Files:**
- `os/sales-bench/index.js` - Main module
- `os/siva/core-scorer.js` - SIVA scoring entrypoint
- `routes/os/sales-bench/` - API routes
- `docs/sales-bench/` - Documentation

**Key Metrics:**
- Golden Pass Rate ≥80%
- Kill Containment ≥95%
- Cohen's d ≥0.80
- Spearman ρ ≥0.70 (human calibration)

**Remember:**
```
SALES-BENCH IS ADVISORY ONLY.
CRS NEVER ALTERS SIVA RUNTIME.
OBSERVE. SCORE. REPORT. NEVER CHANGE.
```

---

*Document Version: 1.0.0*
*Last Updated: 2025-12-22*
*PRD Reference: v1.3 Appendix*
