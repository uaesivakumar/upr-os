# Pre-Entry EB Decision Framework

**Suite:** Banking / Employee Banking / UAE
**Stage:** Pre-Entry — Opportunity Discovery
**Purpose:** Determine if a company signal warrants EB RM action

---

## Decision Outcomes (ONLY these four)

| Outcome | Meaning | RM Action |
|---------|---------|-----------|
| **ACT** | Clear, timely EB opportunity | Move now. Initiate outreach. |
| **WAIT** | Potential exists, but timing/signals are weak | Monitor. Set reminder. Do not outreach yet. |
| **IGNORE** | Not EB-relevant | Remove from queue. No follow-up. |
| **BLOCK** | Compliance/government/restricted | Do not pursue. Document reason. |

---

## 1. What Qualifies an EB Opportunity (ACT)

### 1.1 Company Profile Requirements (ALL must be true)

| Criterion | ACT Threshold |
|-----------|---------------|
| **Headcount** | 50–5,000 employees |
| **Sector** | Private sector (not government) |
| **Location** | UAE-based operations (HQ or significant presence) |
| **Entity Type** | Active trading company (not holding/shell) |
| **Payroll Status** | Not known to be locked with competitor |

### 1.2 Signal Requirements (AT LEAST ONE must be true)

| Signal Type | ACT Trigger | Freshness |
|-------------|-------------|-----------|
| **Hiring Surge** | 10+ job postings OR 20%+ headcount growth | < 30 days |
| **Office Expansion** | New UAE office opening | < 60 days |
| **Market Entry** | New UAE entity registered | < 90 days |
| **Funding Round** | Series A+ or significant investment | < 60 days |
| **Payroll Change** | Switching payroll provider OR WPS issues | < 30 days |
| **Subsidiary Creation** | New legal entity for UAE ops | < 90 days |
| **Free Zone Growth** | JAFZA/DIFC company scaling to mainland | < 60 days |

### 1.3 ACT Decision Logic

```
ACT IF:
  - Company meets ALL profile requirements
  AND
  - At least ONE strong signal exists (< 30 days)
  AND
  - No BLOCK conditions present
  AND
  - No WAIT override conditions present
```

---

## 2. What Disqualifies an Opportunity

### 2.1 BLOCK Conditions (Compliance/Policy — NEVER pursue)

| Condition | Reason | Detection |
|-----------|--------|-----------|
| **Government Entity** | Policy restriction. Cannot bank government. | Industry = government, ministry, public authority |
| **Semi-Government** | Requires special approval process | GRE (Government Related Entity) classification |
| **Sanctioned Entity** | Compliance prohibition | Sanctions list match |
| **Competitor Bank** | Conflict of interest | Company is a bank or financial institution |
| **Recently Switched** | Too early to approach | Changed banks < 6 months ago |
| **Known Bad Actor** | Reputational risk | Fraud/AML flags in system |
| **Shell Company** | No real operations | No employees, no office, no activity |

### 2.2 IGNORE Conditions (Not EB-Eligible — Remove from queue)

| Condition | Reason | Detection |
|-----------|--------|-----------|
| **Too Small** | Below EB threshold | < 20 employees |
| **Too Large** | Enterprise with locked banking | > 10,000 employees AND no expansion signals |
| **Wrong Geography** | Not UAE operations | No UAE presence or registered entity |
| **Freelancer/Sole Prop** | Not a payroll account target | 1-5 employees, single owner |
| **Winding Down** | No future business | Layoffs, closure signals, negative growth |
| **Already Banked** | Known WPS with us | Existing customer flag |
| **No Payroll Need** | No employee banking relevance | Investment holding, dormant entity |

---

## 3. WAIT vs ACT Decision Matrix

### 3.1 When to WAIT (Potential exists, timing wrong)

| Condition | Why WAIT | Re-evaluate Trigger |
|-----------|----------|---------------------|
| **Weak Signals** | Profile is good, but signals are > 60 days old | New signal emerges |
| **Leadership Change** | Instability — decisions delayed | 3 months post-transition |
| **Budget Freeze** | Q4/Q1 freeze or restructuring | New fiscal year |
| **Recent RFP Lost** | They chose competitor recently | 12 months cooling off |
| **Merger/Acquisition** | Uncertainty about future structure | Deal closes + 3 months |
| **Strong Profile, No Signal** | Looks like a fit, but no trigger | Wait for trigger event |

### 3.2 WAIT to ACT Promotion Criteria

```
Promote WAIT → ACT IF:
  - New strong signal appears (< 30 days)
  OR
  - Waiting period expires AND profile still valid
  OR
  - Direct inbound inquiry received
```

### 3.3 ACT vs WAIT Decision Tree

```
Is there a BLOCK condition?
  → YES: BLOCK (stop)
  → NO: continue

Is the company EB-eligible (profile)?
  → NO: IGNORE (stop)
  → YES: continue

Is there a strong signal < 30 days old?
  → YES: ACT
  → NO: continue

Is there any signal < 90 days old?
  → YES: WAIT
  → NO: IGNORE
```

---

## 4. Signal Strength Classification

### 4.1 Strong Signals (Support ACT)

| Signal | Strength | Why Strong |
|--------|----------|------------|
| Hiring 10+ roles in UAE | 0.8–0.9 | Direct payroll expansion |
| New UAE entity registered | 0.8–0.9 | Fresh banking need |
| Funding round announced | 0.7–0.8 | Scaling operations |
| Office opening announced | 0.7–0.8 | Physical expansion |
| Payroll vendor change | 0.9 | Active banking window |

### 4.2 Moderate Signals (Support WAIT)

| Signal | Strength | Why Moderate |
|--------|----------|--------------|
| 5-9 job postings | 0.5–0.6 | Could be replacement hiring |
| Industry expansion news | 0.4–0.5 | General, not company-specific |
| Executive hire announced | 0.5–0.6 | Change signal, but indirect |
| Conference presence | 0.3–0.4 | Visibility, not banking trigger |

### 4.3 Weak Signals (Insufficient alone)

| Signal | Strength | Why Weak |
|--------|----------|----------|
| LinkedIn page updated | 0.1–0.2 | Noise |
| General news mention | 0.1–0.2 | No action trigger |
| Old funding (> 6 months) | 0.2–0.3 | Stale |
| Industry report mention | 0.1–0.2 | No direct relevance |

---

## 5. Tool Usage Requirements

### 5.1 Required Tool Invocations per Decision

| Decision | Required Tools | Purpose |
|----------|----------------|---------|
| **ACT** | CompanyQualityTool, EdgeCasesTool | Validate profile, check blockers |
| **WAIT** | CompanyQualityTool, EdgeCasesTool | Validate profile, identify timing issue |
| **IGNORE** | CompanyQualityTool | Confirm disqualification |
| **BLOCK** | EdgeCasesTool | Identify policy gate that blocks |

### 5.2 Trace Requirements

Every scenario resolution MUST show in trace:

```json
{
  "tools_used": [
    {"tool_name": "EdgeCasesTool", "success": true, ...},
    {"tool_name": "CompanyQualityTool", "success": true, ...}
  ],
  "policy_gates_hit": [...],  // Required if BLOCK
  "router_decision": {
    "outcome": "ACT|WAIT|IGNORE|BLOCK",
    "outcome_reason": "..."
  }
}
```

If a scenario resolves without tool invocation → **Reject scenario**.

---

## 6. Scenario Tricky Factor

Every scenario MUST have an ambiguity that makes it non-trivial:

| Tricky Factor | Example |
|---------------|---------|
| **False Positive Risk** | Hiring surge is for a different country |
| **Timing Ambiguity** | Signal is 45 days old — ACT or WAIT? |
| **Edge Case Profile** | 45 employees — just below threshold |
| **Mixed Signals** | Hiring + layoffs in same company |
| **Sector Confusion** | Private company with government contract |
| **Size Transition** | Was 30, now 55 — recently crossed threshold |

If TC cannot explain why a scenario is tricky → **Scenario is weak**.

---

## 7. EB Eligibility Quick Reference

### 7.1 Eligible (Pursue if signals present)

- Private UAE companies 50–5,000 employees
- Free Zone companies expanding
- Newly registered UAE entities
- Companies with recent funding
- Companies showing hiring/expansion patterns

### 7.2 Not Eligible (IGNORE)

- < 20 employees
- Government entities (BLOCK, not IGNORE)
- Freelancers / sole proprietors
- Companies winding down
- Non-UAE operations only

### 7.3 Restricted (BLOCK)

- Government and semi-government
- Financial institutions (competitor banks)
- Sanctioned entities
- Shell companies
- Recently churned customers (< 6 months)

---

## 8. Outcome Distribution Target

For a balanced validation suite:

| Outcome | Target % | Scenario Count (of 50) |
|---------|----------|------------------------|
| **ACT** | 30% | 15 |
| **WAIT** | 25% | 12 |
| **IGNORE** | 25% | 13 |
| **BLOCK** | 20% | 10 |

This ensures coverage of all decision paths.

---

## 9. What This Suite Does NOT Cover

- Sales pitch effectiveness
- Conversion rate optimization
- Customer dialogue quality
- Post-meeting follow-up
- Pricing negotiation

This is **opportunity intelligence**, not **sales execution**.

---

## Framework Status

| Item | Status |
|------|--------|
| Decision outcomes defined | ✅ |
| ACT criteria documented | ✅ |
| BLOCK conditions documented | ✅ |
| IGNORE conditions documented | ✅ |
| WAIT vs ACT logic documented | ✅ |
| Signal classification documented | ✅ |
| Tool requirements documented | ✅ |
| Tricky factor requirement documented | ✅ |

**Ready for Scenario Creation:** PENDING FOUNDER APPROVAL

---

*Awaiting approval before proceeding with scenario generation.*
