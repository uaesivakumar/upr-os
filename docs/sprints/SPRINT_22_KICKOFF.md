# Sprint 22 Kickoff: SIVA Phase 6 - Rule Engine Integration & Learning System

**Sprint:** 22
**Phase:** SIVA Phase 6 - Practical Integration & Learning Foundations
**Start Date:** November 15, 2025
**Duration:** 1 week
**Previous Sprint:** Sprint 21 (Phase 5 - Cognitive Extraction complete)
**Total SIVA Phases:** 12
**AI Agent Progress:** 42% → 50% (5/12 → 6/12 phases complete)

---

## Executive Summary

Sprint 22 focuses on **practical integration** of the rule engine built in Sprint 21 into production SIVA tools, establishing the foundation for a **learning system** that improves decision quality over time. This sprint bridges the gap between having a rule engine (Sprint 21) and having an AI system that learns from real-world outcomes.

**Key Goals:**
1. Integrate rule engine into first 4 SIVA tools (Foundation Layer)
2. Build feedback collection system for decision outcomes
3. Create rule comparison dashboard for A/B testing preparation
4. Expand test coverage to 100 test cases
5. Establish database schema for learning system

**Expected Outcome:** A production system where SIVA decisions are rule-engine powered, trackable, and ready for ML-based optimization.

---

## Sprint 21 Recap

### What We Built
- ✅ Cognitive rules extraction system (5 production rules)
- ✅ Rule engine interpreter (safe, explainable, 0-18ms execution)
- ✅ Versioning system (v1.0 via Git)
- ✅ Explainability built-in (explain() method)
- ✅ Backward compatibility maintained

### What We Deferred (Now Sprint 22 Focus)
- ⏭️ Integration into SIVA tools (Phases 5.3)
- ⏭️ Golden dataset tests (Phase 5.4)
- ⏭️ Learning system foundation

### Technical Debt from Sprint 21
1. Database table `agent_core.agent_decisions` doesn't exist
2. Only 4 rule engine tests (need 100+)
3. Rule engine not yet used in production
4. No feedback collection mechanism
5. No A/B testing capability

---

## Sprint 22 Objectives

### Primary Goal
**Transform SIVA from a static rule system into a learning system that improves from real-world outcomes.**

### Success Criteria
1. ✅ 4 SIVA tools using rule engine in production
2. ✅ Feedback collection system operational
3. ✅ 100+ test cases covering rule engine
4. ✅ Database schema for learning system deployed
5. ✅ Rule comparison dashboard functional
6. ✅ Zero regression in existing functionality

---

## Phase Breakdown

### Phase 6.1: Tool Integration - Foundation Layer (Priority 1)

**Objective:** Integrate rule engine into Tools 1-4 (CompanyQuality, ContactTier, TimingScore, EdgeCases)

**Why Start Here:**
- Foundation tools are deterministic (no LLM calls)
- Easiest to test and validate
- Highest confidence in rule accuracy
- Immediate performance benefit (rules are faster than code)

#### Task 6.1.1: Integrate CompanyQualityTool

**Effort:** 2 hours
**Priority:** HIGH

**Implementation:**
```javascript
// server/siva-tools/CompanyQualityToolStandalone.js

import { getRuleEngine } from '../agent-core/rule-engine.js';

async function _evaluateCompanyQuality(input) {
  const engine = getRuleEngine();

  // Execute rule
  const ruleResult = await engine.execute('evaluate_company_quality', {
    uae_employees: input.company.uae_employees,
    industry: input.company.industry,
    entity_type: input.company.entity_type,
    company_name: input.company.name
  });

  // Transform to existing output format
  return {
    quality_score: ruleResult.result,
    confidence: ruleResult.confidence,
    reasoning: engine.explain(ruleResult),
    metadata: {
      rule_version: ruleResult.version,
      rule_name: ruleResult.ruleName,
      execution_time_ms: ruleResult.executionTimeMs
    }
  };
}
```

**Acceptance Criteria:**
- Tool uses rule engine instead of inline logic
- Output format unchanged (backward compatible)
- All existing tests pass
- Explainability improved (rule breakdown in reasoning)
- Performance maintained or improved

#### Task 6.1.2: Integrate ContactTierTool

**Effort:** 2 hours
**Priority:** HIGH

**Implementation:**
- Similar pattern to CompanyQualityTool
- Use `select_contact_tier` rule
- Map rule output to existing tier format

**Acceptance Criteria:**
- Same as 6.1.1

#### Task 6.1.3: Integrate TimingScoreTool

**Effort:** 2 hours
**Priority:** HIGH

**Implementation:**
- Use `calculate_timing_score` rule
- Map multiplier result to existing scoring format
- Preserve key_factors array

**Acceptance Criteria:**
- Same as 6.1.1

#### Task 6.1.4: Integrate EdgeCasesTool

**Effort:** 2 hours
**Priority:** HIGH

**Implementation:**
- Use `check_edge_cases` rule
- Map rule list results to blockers/warnings format
- Preserve edge case detection logic

**Acceptance Criteria:**
- Same as 6.1.1

---

### Phase 6.2: Feedback Collection System (Priority 1)

**Objective:** Build system to collect real-world outcomes for future ML training

**Why This Matters:**
- Foundation for learning system (Phase 7+)
- Enables A/B testing
- Allows rule quality measurement
- Supports continuous improvement

#### Task 6.2.1: Create Database Schema

**Effort:** 1 hour
**Priority:** HIGH

**SQL Migration:** `db/migrations/2025_11_15_decision_feedback.sql`

```sql
-- Decision feedback for learning system
CREATE TABLE IF NOT EXISTS agent_core.decision_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES agent_core.agent_decisions(id),

  -- Feedback metadata
  feedback_type VARCHAR(50) NOT NULL, -- 'conversion', 'reply', 'bounce', 'manual_override'
  feedback_value JSONB NOT NULL, -- {converted: true, reply_rate: 0.34, ...}
  feedback_timestamp TIMESTAMP DEFAULT NOW(),

  -- Outcome tracking
  outcome_positive BOOLEAN, -- true = good outcome, false = bad outcome
  outcome_metrics JSONB, -- {reply_rate: 0.34, meeting_booked: true, ...}

  -- Context
  feedback_source VARCHAR(100), -- 'email_provider', 'crm', 'manual', 'automated'
  user_id UUID,

  -- Indexes
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_decision_feedback_decision_id ON agent_core.decision_feedback(decision_id);
CREATE INDEX idx_decision_feedback_type ON agent_core.decision_feedback(feedback_type);
CREATE INDEX idx_decision_feedback_timestamp ON agent_core.decision_feedback(feedback_timestamp);

-- Decision outcome summary (materialized view for performance)
CREATE MATERIALIZED VIEW agent_core.decision_outcomes AS
SELECT
  ad.tool_name,
  ad.rule_version,
  ad.input_hash,
  COUNT(*) as decision_count,
  AVG(CASE WHEN df.outcome_positive THEN 1 ELSE 0 END) as success_rate,
  AVG((df.outcome_metrics->>'reply_rate')::FLOAT) as avg_reply_rate,
  COUNT(CASE WHEN df.feedback_type = 'manual_override' THEN 1 END) as override_count
FROM agent_core.agent_decisions ad
LEFT JOIN agent_core.decision_feedback df ON ad.id = df.decision_id
GROUP BY ad.tool_name, ad.rule_version, ad.input_hash;

CREATE UNIQUE INDEX idx_decision_outcomes_key ON agent_core.decision_outcomes(tool_name, rule_version, input_hash);
```

**Acceptance Criteria:**
- Schema deployed to production
- Materialized view refreshes automatically
- Indexes optimize query performance

#### Task 6.2.2: Build Feedback API

**Effort:** 2 hours
**Priority:** HIGH

**Endpoint:** `POST /api/agent-core/feedback`

**Request:**
```json
{
  "decision_id": "uuid",
  "feedback_type": "conversion",
  "outcome_positive": true,
  "outcome_metrics": {
    "reply_rate": 0.34,
    "meeting_booked": true,
    "reply_time_hours": 24
  },
  "feedback_source": "email_provider"
}
```

**Implementation:**
- Validate decision_id exists
- Store feedback with timestamp
- Refresh decision_outcomes materialized view (async)
- Return confirmation

**Acceptance Criteria:**
- API accepts feedback for all SIVA tools
- Validation prevents invalid data
- Performance: <100ms response time
- Error tracking via Sentry

#### Task 6.2.3: Integrate Feedback Collection Points

**Effort:** 2 hours
**Priority:** MEDIUM

**Integration Points:**
1. Email replies detected → positive feedback
2. Manual overrides → negative feedback (rule was wrong)
3. Meeting bookings → positive feedback
4. Bounces/unsubscribes → negative feedback

**Acceptance Criteria:**
- Feedback automatically collected at key points
- No manual intervention required
- Privacy-compliant (no PII in feedback)

---

### Phase 6.3: Rule Comparison Dashboard (Priority 2)

**Objective:** Build dashboard to compare rule versions (A/B testing preparation)

**Why This Matters:**
- Validate rule changes before production
- Compare v1.0 vs v1.1 performance
- Identify which rules need improvement
- Support data-driven decision making

#### Task 6.3.1: Create Comparison API

**Effort:** 2 hours
**Priority:** MEDIUM

**Endpoint:** `GET /api/agent-core/rule-comparison`

**Query Params:**
```
?tool_name=CompanyQualityTool
&version_a=v1.0
&version_b=v1.1
&start_date=2025-11-01
&end_date=2025-11-15
```

**Response:**
```json
{
  "tool_name": "CompanyQualityTool",
  "comparison_period": "2025-11-01 to 2025-11-15",
  "version_a": {
    "version": "v1.0",
    "decisions": 1500,
    "success_rate": 0.68,
    "avg_reply_rate": 0.34,
    "overrides": 45,
    "avg_execution_ms": 15
  },
  "version_b": {
    "version": "v1.1",
    "decisions": 1500,
    "success_rate": 0.72,
    "avg_reply_rate": 0.38,
    "overrides": 32,
    "avg_execution_ms": 12
  },
  "winner": "v1.1",
  "confidence": 0.95
}
```

**Acceptance Criteria:**
- Compares two rule versions statistically
- Calculates winner with confidence interval
- Returns key metrics for decision making

#### Task 6.3.2: Build Comparison Dashboard UI

**Effort:** 3 hours
**Priority:** LOW (can defer to Sprint 23)

**UI Components:**
- Rule version selector (v1.0, v1.1, v1.2)
- Date range picker
- Comparison metrics table
- Winner indicator with confidence
- Detailed breakdown charts

**Acceptance Criteria:**
- Dashboard accessible to product team
- Real-time data (refreshes every 5 minutes)
- Export to CSV for deeper analysis

---

### Phase 6.4: Test Coverage Expansion (Priority 2)

**Objective:** Expand test coverage from 4 to 100+ test cases

**Why This Matters:**
- Prevents regressions when rules change
- Validates rule accuracy across edge cases
- Builds confidence in rule engine
- Enables safe experimentation

#### Task 6.4.1: Create Golden Dataset

**Effort:** 3 hours
**Priority:** HIGH

**Dataset Structure:**
```javascript
// scripts/testing/golden-dataset.json
[
  {
    "test_id": "company_quality_001",
    "rule_name": "evaluate_company_quality",
    "input": {
      "uae_employees": 50,
      "industry": "Technology",
      "entity_type": "private",
      "company_name": "TechCorp"
    },
    "expected_output": {
      "quality_score": 75,
      "confidence_min": 0.85
    },
    "description": "Small tech company should get mid-tier quality score"
  },
  // ... 99 more test cases
]
```

**Test Case Categories:**
1. **Boundary Testing** (20 cases)
   - Employee counts: 0, 1, 49, 50, 99, 100, 499, 500, 1000+
   - Edge of quality tiers

2. **Industry Coverage** (20 cases)
   - All industries: Technology, Banking, Healthcare, etc.
   - Industry-specific multipliers

3. **Edge Cases** (20 cases)
   - Government entities
   - Enterprise brands
   - Cultural events (Ramadan, etc.)

4. **Combination Testing** (20 cases)
   - Multiple factors combining
   - Complex scenarios

5. **Regression Tests** (20 cases)
   - Known bugs from production
   - Previous manual overrides

**Acceptance Criteria:**
- 100+ test cases documented
- All test cases pass with current rules
- Test suite runs in <10 seconds
- CI/CD integration (tests run on every commit)

#### Task 6.4.2: Automate Test Execution

**Effort:** 2 hours
**Priority:** HIGH

**Script:** `scripts/testing/runGoldenDatasetTests.js`

**Features:**
- Loads golden dataset
- Executes each test case through rule engine
- Compares output to expected
- Reports pass/fail with details
- Generates test coverage report

**Acceptance Criteria:**
- Test suite executable via `npm test:golden`
- Clear pass/fail output
- Detailed error messages for failures
- Integration with CI/CD pipeline

---

### Phase 6.5: Database Schema for Learning System (Priority 3)

**Objective:** Create tables needed for ML training in future sprints

**Why This Matters:**
- Foundation for Phase 7 (ML-powered rule optimization)
- Historical data collection starts now
- Training dataset grows organically

#### Task 6.5.1: Create Training Dataset Schema

**Effort:** 1 hour
**Priority:** MEDIUM

**SQL Migration:** `db/migrations/2025_11_15_training_dataset.sql`

```sql
-- Training dataset for ML model
CREATE TABLE IF NOT EXISTS agent_core.training_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Input features (normalized)
  features JSONB NOT NULL, -- {uae_employees: 120, industry_idx: 3, ...}

  -- Target labels
  labels JSONB NOT NULL, -- {quality_score: 95, should_contact: true, ...}

  -- Metadata
  rule_version VARCHAR(20) NOT NULL,
  decision_id UUID REFERENCES agent_core.agent_decisions(id),
  outcome_verified BOOLEAN DEFAULT false, -- true = real-world outcome known
  outcome_timestamp TIMESTAMP,

  -- Training metadata
  sample_weight FLOAT DEFAULT 1.0, -- importance weight for training
  train_split VARCHAR(20) DEFAULT 'train', -- 'train', 'validation', 'test'

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_training_samples_verified ON agent_core.training_samples(outcome_verified);
CREATE INDEX idx_training_samples_split ON agent_core.training_samples(train_split);
CREATE INDEX idx_training_samples_version ON agent_core.training_samples(rule_version);
```

**Acceptance Criteria:**
- Schema deployed to production
- Sample collection starts automatically
- 80/10/10 train/validation/test split maintained

---

## Task Summary

| Task | Phase | Effort | Priority | Owner |
|------|-------|--------|----------|-------|
| 6.1.1: Integrate CompanyQualityTool | 6.1 | 2h | HIGH | Dev |
| 6.1.2: Integrate ContactTierTool | 6.1 | 2h | HIGH | Dev |
| 6.1.3: Integrate TimingScoreTool | 6.1 | 2h | HIGH | Dev |
| 6.1.4: Integrate EdgeCasesTool | 6.1 | 2h | HIGH | Dev |
| 6.2.1: Create Feedback Schema | 6.2 | 1h | HIGH | Dev |
| 6.2.2: Build Feedback API | 6.2 | 2h | HIGH | Dev |
| 6.2.3: Integrate Feedback Points | 6.2 | 2h | MEDIUM | Dev |
| 6.3.1: Create Comparison API | 6.3 | 2h | MEDIUM | Dev |
| 6.3.2: Build Comparison Dashboard | 6.3 | 3h | LOW | Dev |
| 6.4.1: Create Golden Dataset | 6.4 | 3h | HIGH | QA |
| 6.4.2: Automate Test Execution | 6.4 | 2h | HIGH | Dev |
| 6.5.1: Create Training Dataset Schema | 6.5 | 1h | MEDIUM | Dev |

**Total Effort:** ~24 hours (3 days of focused work)
**Buffer:** 2 days for testing, debugging, documentation

---

## Success Metrics

### Code Metrics
- ✅ 4 tools using rule engine (100% of Foundation Layer)
- ✅ 100+ test cases passing
- ✅ 0 regressions in existing functionality
- ✅ Test coverage: >90% for rule engine code

### Performance Metrics
- ✅ Rule execution: <20ms (maintain Sprint 21 performance)
- ✅ Feedback API: <100ms response time
- ✅ Comparison API: <500ms response time
- ✅ Golden dataset tests: <10s total execution

### Quality Metrics
- ✅ 21/21 smoke tests passing (maintain)
- ✅ 0% error rate in stress tests (maintain)
- ✅ Zero production incidents
- ✅ Backward compatibility: 100%

### Learning System Metrics
- ✅ Feedback collection: >100 samples/day
- ✅ Outcome verification: >80% of decisions
- ✅ Training dataset: >1000 samples by sprint end

---

## Risk Assessment

### High Risk
1. **Rule Engine Integration Breaking Production**
   - Mitigation: Extensive testing before deployment
   - Rollback plan: Feature flag to disable rule engine
   - Monitoring: Sentry alerts on any rule execution errors

2. **Performance Degradation**
   - Mitigation: Benchmark before/after integration
   - Rollback plan: Revert to inline logic
   - Monitoring: APM tracking for all SIVA tools

### Medium Risk
1. **Golden Dataset Incomplete**
   - Mitigation: Start with 50 cases, expand to 100
   - Fallback: Prioritize critical paths first

2. **Feedback Collection Low Volume**
   - Mitigation: Start manual collection if needed
   - Fallback: Use synthetic feedback for testing

### Low Risk
1. **Dashboard UI Incomplete**
   - Mitigation: API more important than UI
   - Fallback: Use API directly via Postman

---

## Dependencies

### External Dependencies
- None (all work self-contained)

### Internal Dependencies
- Sprint 21 completion (✅ DONE)
- Database access for migrations
- Production deployment access

### Blockers
- None identified

---

## Definition of Done

A Sprint 22 task is "Done" when:
1. ✅ Code reviewed and approved
2. ✅ All tests passing (unit + integration + golden dataset)
3. ✅ Deployed to production
4. ✅ Smoke tests passing (21/21)
5. ✅ Stress tests passing (0% error rate)
6. ✅ Documentation updated
7. ✅ Notion tasks marked complete

A Sprint 22 is "Done" when:
1. ✅ All HIGH priority tasks complete
2. ✅ 4 tools using rule engine in production
3. ✅ Feedback system operational
4. ✅ 100+ test cases passing
5. ✅ Zero regressions
6. ✅ AI Agent Core progress: 50% (6/12 phases complete - halfway milestone!)

---

## Next Steps (Sprint 23 Preview)

Based on Sprint 22 completion, Sprint 23 will focus on:

**Sprint 23: SIVA Phase 7 - Quantitative Intelligence Layer**
1. Integrate rule engine into STRICT tools (Tools 5-8)
2. Build ML model to suggest rule improvements
3. Implement A/B testing framework
4. Create rule optimization pipeline
5. Deploy first ML-suggested rule changes

**Target:** AI Agent Core progress 50% → 58% (7/12 phases complete)

---

## Appendix: Technical Specifications

### Rule Engine Integration Pattern

**Standard Integration Template:**
```javascript
import { getRuleEngine } from '../agent-core/rule-engine.js';

async function _executeTool(input) {
  const engine = getRuleEngine();

  try {
    // Execute rule
    const ruleResult = await engine.execute('rule_name', normalizedInput);

    // Log decision for learning
    await logDecision({
      tool_name: 'ToolName',
      rule_version: ruleResult.version,
      input: normalizedInput,
      output: ruleResult.result,
      confidence: ruleResult.confidence,
      execution_time_ms: ruleResult.executionTimeMs
    });

    // Transform to existing format (backward compatible)
    return transformOutput(ruleResult);

  } catch (error) {
    // Fallback to inline logic if rule engine fails
    console.error('Rule engine failed, using fallback:', error);
    Sentry.captureException(error);
    return _executeFallbackLogic(input);
  }
}
```

### Feedback Collection Pattern

**Automatic Feedback Trigger:**
```javascript
// In email reply handler
async function onEmailReply(email) {
  const decision = await getOriginalDecision(email.in_reply_to);

  await submitFeedback({
    decision_id: decision.id,
    feedback_type: 'reply',
    outcome_positive: true,
    outcome_metrics: {
      reply_time_hours: calculateReplyTime(email),
      sentiment: analyzeSentiment(email.body)
    },
    feedback_source: 'email_provider'
  });
}
```

---

**Document Created:** November 14, 2025
**Status:** Ready for Sprint 22 Kickoff
**Estimated Duration:** 1 week (5 working days)
**Next Review:** Sprint 22 completion (November 22, 2025)
