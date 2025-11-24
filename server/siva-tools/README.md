# SIVA Agent Tools - Implementation Progress

**Status**: Phase 1 - CompanyQualityTool Complete ✅
**Date**: November 8, 2025
**Architecture**: Based on SIVA 12-Phase Specification

---

## Overview

This directory contains the SIVA MCP (Model Context Protocol) tools that implement Sivakumar's banking intelligence as deterministic, verifiable agents. All tools follow the cognitive rules defined in `persona/siva-brain-spec-v1.md`.

**SIVA = Structured Intelligence, Verifiable Autonomy**

---

## Architecture

```
server/siva-tools/
├── CompanyQualityToolStandalone.js    ✅ IMPLEMENTED
├── CompanyQualityTool.js              ⏳ Pending AgentProtocol integration
├── schemas/
│   └── companyQualitySchemas.js       ✅ Input/output validation
├── persona/
│   └── siva-brain-spec-v1.md          ✅ Phase 1 cognitive spec
├── __tests__/
│   └── CompanyQualityTool.test.js     ⏳ Pending Jest setup
└── test-standalone.js                 ✅ Manual test suite
```

---

## Implemented Tools (4/12)

### ✅ CompanyQualityTool (STRICT)

**Implements**: SIVA Phase 1 Primitive 1 - `EVALUATE_COMPANY_QUALITY`

**Purpose**: Score company fit using Siva's formula & quality factors

**Type**: STRICT (deterministic, no LLM calls)

**SLA**: ≤300ms P50, ≤900ms P95

**Test Results**:
```bash
✓ Perfect FinTech startup in Dubai Free Zone: 98/100
✓ Enterprise brand (Emirates) auto-skip: 5/100
✓ Government entity auto-skip: 2/100
✓ Mid-size tech company (150 employees): 75/100
✓ Incomplete data with low confidence: 0/100 (confidence: 0.7)
```

**Phase 1 Logic Implemented**:
- ✅ Salary Level + UAE Presence scoring (+40 points for high salary + strong UAE)
- ✅ Company Size Sweet Spot (+20 points for 50-500 employees)
- ✅ Industry Bonus (+15 points for FinTech, Tech, Healthcare)
- ✅ Enterprise Brand Exclusion (×0.1 for Etihad, Emirates, ADNOC, Emaar, DP World)
- ✅ Government Sector Exclusion (×0.05)
- ✅ Free Zone Bonus (×1.3)
- ✅ Confidence scoring based on data completeness (0.0-1.0)
- ✅ Detailed reasoning breakdown for explainability
- ✅ Input/output schema validation (Ajv + JSON Schema)

**Sample Usage**:
```javascript
const CompanyQualityTool = require('./CompanyQualityToolStandalone');
const tool = new CompanyQualityTool();

const result = await tool.execute({
  company_name: 'PayTech DIFC',
  domain: 'paytech.ae',
  industry: 'FinTech',
  uae_signals: {
    has_ae_domain: true,
    has_uae_address: true,
    linkedin_location: 'DIFC, Dubai'
  },
  size_bucket: 'scaleup',
  size: 80,
  salary_indicators: {
    salary_level: 'high',
    avg_salary: 18000
  },
  license_type: 'Free Zone'
});

// Output:
// {
//   quality_score: 98,
//   reasoning: [
//     { factor: 'Salary & UAE Presence', points: 40, explanation: '...' },
//     { factor: 'Company Size', points: 20, explanation: '...' },
//     { factor: 'Industry', points: 15, explanation: '...' },
//     { factor: 'Edge Case: Free Zone', points: 23, explanation: '...' }
//   ],
//   confidence: 1.0,
//   policy_version: 'v1.0',
//   timestamp: '2025-11-08T...',
//   edge_cases_applied: ['FREE_ZONE_BONUS']
// }
```

### ✅ ContactTierTool (STRICT)

**Implements**: SIVA Phase 1 Primitive 2 - `SELECT_CONTACT_TIER`

**Purpose**: Map company profile to target job titles and tier classification

**Type**: STRICT (deterministic, no LLM calls)

**SLA**: ≤200ms P50, ≤600ms P95

**Test Results**:
```bash
✓ CEO of tech startup: STRATEGIC (Priority 1)
✓ HR Director in mid-size company: STRATEGIC (Priority 1)
✓ Payroll Manager in large company: PRIMARY (Priority 2)
✓ Marketing Manager: PRIMARY/SECONDARY (Priority 2-3)
✓ HR Analyst in large enterprise: SECONDARY (Priority 3)
✓ Founder of 2-month-old startup: STRATEGIC (Priority 1)
✓ VP Talent Acquisition (high hiring velocity): STRATEGIC (Priority 1)
✓ Ambiguous single-word title: SECONDARY (low confidence: 0.65)
✓ CFO of mid-size company: STRATEGIC (Priority 1)
✓ Office Manager in small company: STRATEGIC (Priority 1)

Average Latency: <1ms (SLA: ≤200ms)
Average Confidence: 0.86
Tier Distribution: 60% STRATEGIC, 20% PRIMARY, 20% SECONDARY
```

**Phase 1 Logic Implemented**:
- ✅ Seniority scoring (0-40 points): C-Level, VP, Director, Manager, Individual
- ✅ Department scoring (0-30 points): HR, Finance, Admin, C-Suite prioritized
- ✅ Company size scoring (0-30 points): Smaller companies = higher accessibility
- ✅ Tier classification (STRATEGIC/PRIMARY/SECONDARY/BACKUP)
- ✅ Seniority inference from job title keywords
- ✅ Department inference from job title keywords
- ✅ Target titles recommendation based on company profile:
  * Startups (<50, <2 years): Founder, COO, CEO
  * Scale-ups (50-500): HR Director, HR Manager
  * Large (500+): Payroll Manager, Benefits Manager
  * High hiring velocity (>10/month): Head of Talent Acquisition
- ✅ Confidence scoring based on data completeness (0.65-1.0)
- ✅ Input/output schema validation

**Sample Usage**:
```javascript
const ContactTierTool = require('./ContactTierToolStandalone');
const tool = new ContactTierTool();

const result = await tool.execute({
  title: 'HR Director',
  company_size: 250,
  hiring_velocity_monthly: 8
});

// Output:
// {
//   tier: 'STRATEGIC',
//   priority: 1,
//   confidence: 0.85,
//   reasoning: 'Director in HR department - key decision maker...',
//   target_titles: ['HR Director', 'Director of HR', 'HR Manager', ...],
//   fallback_titles: ['HR Business Partner', 'Senior HR Manager', ...],
//   metadata: {
//     score_breakdown: {
//       seniority_score: 30,
//       department_score: 30,
//       company_size_score: 25
//     },
//     inferred_seniority: 'Director',
//     inferred_department: 'HR'
//   }
// }
```

### ✅ TimingScoreTool (STRICT)

**Implements**: SIVA Phase 1 Primitive 3 - `CALCULATE_TIMING_SCORE`

**Purpose**: Calculate timing multiplier from calendar, signal recency, and UAE business context

**Type**: STRICT (deterministic, no LLM calls)

**SLA**: ≤120ms P50, ≤300ms P95

**Test Results**:
```bash
✓ Q1 budget season + fresh signal: ×1.86 (OPTIMAL)
✓ During Ramadan: ×0.3 (POOR)
✓ Summer slowdown + stale signal: ×0.01 (POOR)
✓ Q2 standard with recent signal: ×0.72 (FAIR)
✓ Q4 budget freeze + warm signal: ×0.76 (FAIR)
✓ Post-Eid recovery period: ×0.8 (FAIR)
✓ Hiring signal 60 days old: ×0.53 (fast decay)
✓ Expansion signal 60 days old: ×1.09 (slow decay, 105% higher)
✓ UAE National Day: ×0.8 (reduced activity)
✓ Pre-Ramadan rush (Q2): ×1.2 (GOOD)
✓ Very fresh signal (2 days): ×1.48 (HOT)
✓ No signal age: ×1.3 (lower confidence: 0.8)

Average Latency: 0.08ms (SLA: ≤120ms)
Average Confidence: 0.89
Category Distribution: 25% OPTIMAL, 17% GOOD, 33% FAIR, 25% POOR
```

**Phase 1 Logic Implemented**:
- ✅ **Calendar-based multipliers**:
  * Q1 Budget Season (Jan-Feb): ×1.3 (new budgets unlocked)
  * Q2 Pre-Ramadan Rush: ×1.2
  * Q2 Standard: ×1.0
  * Q3 Summer Slowdown (Jul-Aug): ×0.7
  * Q3 Early Summer (Jun): ×0.9
  * Q4 Budget Freeze (Dec): ×0.6
  * Q4 Early Freeze (Nov): ×0.9
  * **Ramadan**: ×0.3 (pause outreach)
  * **Post-Eid** (2 weeks): ×0.8 (recovery period)
  * **UAE National Day** (Dec 2-3): ×0.8

- ✅ **Signal recency multipliers**:
  * 0-7 days (HOT): ×1.5
  * 8-14 days (WARM): ×1.3
  * 15-30 days (RECENT): ×1.1
  * 31-60 days (STANDARD): ×1.0
  * 61-90 days (COOLING): ×0.8
  * 91-180 days (COLD): ×0.5
  * 180+ days (STALE): ×0.3

- ✅ **Signal type decay rates** (per week):
  * Hiring: 0.90/week (fast decay - urgent needs)
  * Funding: 0.95/week (medium decay)
  * Expansion: 0.98/week (slow decay - long-term impact)
  * Award: 0.95/week (medium decay)

- ✅ **UAE calendar integration**:
  * Ramadan periods 2025-2026
  * Eid periods with 2-week recovery
  * UAE National Day detection
  * Ramadan approaching detection (2-week window)

- ✅ **Next optimal window calculation** (for POOR/FAIR timing)
- ✅ **4-tier categorization**: OPTIMAL (≥1.3), GOOD (≥1.0), FAIR (≥0.7), POOR (<0.7)
- ✅ **Confidence scoring** based on data completeness (0.5-1.0)
- ✅ **Input/output schema validation**

**Sample Usage**:
```javascript
const TimingScoreTool = require('./TimingScoreToolStandalone');
const tool = new TimingScoreTool();

const result = await tool.execute({
  signal_age: 3,
  signal_type: 'hiring',
  current_date: '2025-01-15',
  fiscal_context: { quarter: 'Q1' }
});

// Output:
// {
//   timing_multiplier: 1.86,
//   category: 'OPTIMAL',
//   confidence: 1.0,
//   reasoning: 'Calendar: Q1_BUDGET_SEASON (×1.30) | Signal: HOT (3 days old, ×1.43) | Type: hiring signal → OPTIMAL timing (×1.86)',
//   metadata: {
//     calendar_multiplier: 1.3,
//     signal_recency_multiplier: 1.43,
//     signal_type_modifier: 1.0,
//     calendar_context: 'Q1_BUDGET_SEASON',
//     signal_freshness: 'HOT',
//     next_optimal_window: null
//   }
// }
```

### ✅ EdgeCasesTool (STRICT)

**Implements**: SIVA Phase 1 Primitive 4 - `CHECK_EDGE_CASES`

**Purpose**: Detect edge cases that should BLOCK or WARN before outreach

**Type**: STRICT (deterministic, no LLM calls)

**SLA**: ≤50ms P50, ≤150ms P95

**Test Results**:
```bash
✓ Government sector entity: BLOCK (CRITICAL - cannot override)
✓ Sanctioned entity: BLOCK (CRITICAL - cannot override)
✓ Email bounced: BLOCK (CRITICAL - cannot override)
✓ Opted out contact: BLOCK (CRITICAL - cannot override)
✓ Bankruptcy: BLOCK (HIGH - can override with approval)
✓ Legal issues: BLOCK (HIGH - can override with approval)
✓ Excessive attempts (5 tries, 0 responses): BLOCK (HIGH - spam prevention)
✓ Enterprise brand (Emirates): BLOCK (MEDIUM - can override)
✓ Active negotiation: BLOCK (MEDIUM - can override)
✓ Recent contact (45 days ago): WARN (wait 45 more days)
✓ Unverified email: WARN (deliverability risk)
✓ Company too large (5000 employees): WARN (low accessibility)
✓ Company too new (<1 year): WARN (no established processes)
✓ Multiple blockers (4 issues): BLOCK (non-overridable due to CRITICAL)
✓ Multiple warnings (5 issues): WARN (review before sending)
✓ Clean profile: PROCEED (no blockers or warnings)

Average Latency: 0.07ms (SLA: ≤50ms P50)
Decision Distribution: 67% BLOCK, 27% WARN, 7% PROCEED
```

**Phase 1 Logic Implemented**:
- ✅ **CRITICAL Blockers** (cannot override):
  * Government/semi-government sector (ENBD policy)
  * Sanctioned entities (compliance violation)
  * Email bounced (deliverability issue)
  * Contact opted out (compliance violation)
- ✅ **HIGH Severity Blockers** (difficult to override):
  * Bankruptcy (reputational risk)
  * Legal issues (reputational risk)
  * Excessive attempts (≥3 tries with 0 responses - spam prevention)
- ✅ **MEDIUM Severity Blockers** (can override):
  * Enterprise brands (Etihad, Emirates, ADNOC, Emaar, DP World)
  * Active negotiation in pipeline (avoid confusion)
- ✅ **Warnings**:
  * Recent contact (<90 days - spam perception)
  * Single attempt no response (may need different approach)
  * Unverified email (deliverability risk)
  * Company too large (>1000 employees - low accessibility)
  * Company too new (<1 year - no established payroll)
- ✅ Decision logic: BLOCK if blockers exist, WARN if warnings exist, PROCEED otherwise
- ✅ Overridability: Can only override if NO critical severity blockers
- ✅ Confidence scoring based on data completeness (0.6-1.0)
- ✅ Input/output schema validation (Ajv + JSON Schema)

**Sample Usage**:
```javascript
const EdgeCasesTool = require('./EdgeCasesToolStandalone');
const tool = new EdgeCasesTool();

const result = await tool.execute({
  company_profile: {
    name: 'TechCorp DIFC',
    sector: 'private',
    size: 250,
    year_founded: 2020,
    is_sanctioned: false,
    is_bankrupt: false,
    has_legal_issues: false
  },
  contact_profile: {
    email: 'hr@techcorp.ae',
    is_verified: true,
    has_bounced: false,
    has_opted_out: false
  },
  historical_data: {
    previous_attempts: 1,
    previous_responses: 0,
    last_contact_date: '2024-08-01',
    has_active_negotiation: false
  }
});

// Output:
// {
//   decision: 'WARN',
//   confidence: 0.85,
//   blockers: [],
//   warnings: [
//     {
//       type: 'RECENT_CONTACT',
//       severity: 'MEDIUM',
//       message: 'Last contact was 99 days ago - consider waiting...',
//       can_override: true
//     },
//     {
//       type: 'SINGLE_ATTEMPT_NO_RESPONSE',
//       severity: 'LOW',
//       message: 'Previous attempt received no response - may need different approach',
//       can_override: true
//     }
//   ],
//   reasoning: 'PROCEED WITH CAUTION: 2 warning(s) detected...',
//   metadata: {
//     blockers_count: 0,
//     warnings_count: 2,
//     critical_issues: [],
//     overridable: true
//   }
// }
```

---

## Pending Tools (8/12)

### ⏳ ContactQualityTool (STRICT)
**Implements**: SIVA Phase 1 Primitive 5 - `VERIFY_CONTACT_QUALITY`
**Purpose**: Score a contact candidate
**SLA**: ≤250ms P50, ≤700ms P95

### ⏳ QScoreTool (STRICT)
**Implements**: SIVA Phase 1 Primitive 6 - `COMPUTE_QSCORE`
**Purpose**: Compute final Q using Siva formula
**SLA**: ≤50ms P50, ≤100ms P95

### ⏳ DuplicateCheckTool (STRICT)
**Implements**: SIVA Phase 1 Primitive 7 - `CHECK_DUPLICATE_OUTREACH`
**Purpose**: Prevent re-contact inside embargo window
**SLA**: ≤80ms P50, ≤150ms P95

### ⏳ DoctrineCheckTool (STRICT)
**Implements**: SIVA Phase 1 Primitive 8 - `CHECK_OUTREACH_DOCTRINE`
**Purpose**: Validate outreach draft against Siva's rules
**SLA**: ≤400ms P50, ≤1200ms P95

### ⏳ OutreachContextTool (ASSISTED)
**Implements**: SIVA Phase 2 Tool 9 - `generate_outreach_context`
**Purpose**: Produce context paragraph using templates
**SLA**: ≤800ms P50, ≤1800ms P95

### ⏳ IntentClassifierTool (ASSISTED)
**Implements**: SIVA Phase 2 Tool 11 - `intent_classify_reply`
**Purpose**: Classify reply intent for lifecycle transitions
**SLA**: ≤900ms P50, ≤2000ms P95

### ⏳ ExplainabilityTool (STRICT)
**Implements**: SIVA Phase 2 Tool 10 - `score_explainability`
**Purpose**: Convert factor scores to human-readable breakdown
**SLA**: TBD

### ⏳ OutcomeFeedbackTool (STRICT)
**Implements**: SIVA Phase 2 Tool 12 - `update_outcome_feedback`
**Purpose**: Persist outreach outcome for learning
**SLA**: TBD

---

## Testing

### Run Manual Tests
```bash
node server/siva-tools/test-standalone.js
```

### Run Jest Tests (when configured)
```bash
npm test -- server/siva-tools/__tests__/CompanyQualityTool.test.js
```

---

## SIVA Persona Policy Version

**Current Version**: `v1.0`
**Spec Location**: `server/siva-tools/persona/siva-brain-spec-v1.md`

**Policy Enforcement**:
- ALWAYS rules: Reference specific signals, position as PoC, frame as time-saver
- NEVER rules: No pricing, no pressure language, no identical templates, no govt/enterprise without approval
- Quality standards: Verify UAE presence, validate email, check 90-day embargo, dedupe by domain
- Edge cases: Auto-skip enterprise brands, downweight government, uplift free zones

---

## Next Steps

1. ✅ **CompanyQualityTool** - COMPLETE
2. ⏳ **ContactTierTool** - Implement decision tree for contact selection
3. ⏳ **TimingScoreTool** - Add calendar and signal recency logic
4. ⏳ **EdgeCasesTool** - Consolidate edge case rules
5. ⏳ **ContactQualityTool** - Implement contact scoring
6. ⏳ **QScoreTool** - Final Q-score formula
7. ⏳ **DuplicateCheckTool** - Database integration for deduplication
8. ⏳ **DoctrineCheckTool** - Outreach validation rules
9. ⏳ **Persona Policy Engine** - Enforce ALWAYS/NEVER across all tools
10. ⏳ **REST API** - Expose tools via `/api/agent-core/v1/tools/*`
11. ⏳ **Integration** - Wire up to Discovery/Enrichment/Outreach modules
12. ⏳ **Database Tables** - Create agent_decisions, agent_overrides, persona_versions

---

## References

- **SIVA Phase 1**: `docs/siva-phases/Phase_1_-_Persona_Extraction___Cognitive_Foundation.md`
- **SIVA Phase 2**: `docs/siva-phases/Phase_2-_Cognitive_Framework_Architecture.md`
- **SIVA Phase 3**: `docs/siva-phases/Phase_3-_Centralized_Agentic_Hub_Design.md`
- **SIVA Phase 4**: `docs/siva-phases/Phase_4_-_Infrastructure___Topology.md`
- **Alignment Analysis**: `docs/SIVA_ALIGNMENT_ANALYSIS.md`

---

## Contributing

When implementing new SIVA tools:

1. Read the corresponding SIVA phase spec thoroughly
2. Create schema files in `schemas/` with Ajv validation
3. Implement tool logic as standalone class first
4. Add comprehensive test cases
5. Verify SLA targets (latency benchmarks)
6. Document in this README
7. Update alignment analysis

**Non-negotiable**: All STRICT tools must be deterministic. No LLM calls allowed except for ASSISTED tools within schema bounds.

---

**Last Updated**: November 8, 2025
**Contributors**: Claude Code, Sivakumar (Domain Expert)
**License**: Proprietary - UPR Internal
