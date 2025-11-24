# 🚀 Sprint 21 Kickoff: SIVA Phase 5 - Cognitive Extraction & Encoding

**Start Date:** November 14, 2025
**Sprint Duration:** 2 weeks
**Status:** Active
**Owner:** Sivakumar

---

## 🎯 Sprint Goal

**Translate Siva's decision patterns into machine-readable JSON rules with a rule engine interpreter and comprehensive testing.**

Transform the hardcoded decision logic in SIVA tools into a dynamic, versioned, explainable rule system that enables rapid evolution without code changes.

---

## 📊 Sprint Context

### Coming from Sprint 20 ✅
- **Achievement:** SIVA Phase 4 - Infrastructure & Integration COMPLETE
- **Test Results:** 21/21 smoke tests passing (100%), 0% error rate in stress tests
- **Deliverables:** 12 SIVA tools operational, REST API (14 endpoints), Database persistence (3 tables), OpenTelemetry monitoring
- **Project Progress:** 40% → 50%

### Moving to Sprint 21 🎯
- **Focus:** SIVA Phase 5 - Cognitive Extraction & Encoding
- **Approach:** Extract decision patterns → Build rule engine → Integrate → Test → Version → Govern
- **Target Progress:** 50% → 60%

---

## 📦 Sprint 21 Tasks (6 Total, 66 Hours Estimated)

### Phase 5.1: Extract Cognitive Rules from Decision Patterns
**Priority:** P1
**Estimated:** 12 hours
**Tags:** Cognitive Rules, Pattern Extraction, JSON Schema

**Objective:**
Record and analyze 30 real decisions (contact/skip companies) to extract patterns for company quality, contact tier selection, timing scores, and edge cases.

**Deliverables:**
- 30 decision examples documented with company metadata + reasoning
- Pattern analysis completed (size sweet spot, industry bias, gov exceptions)
- `cognitive_extraction_logic.json` v1.0 with 10-15 rules
- Rule types: formula, decision_tree, lookup, threshold

**Acceptance Criteria:**
- ✅ 30 decision examples documented with company metadata + reasoning
- ✅ Pattern analysis completed (size sweet spot, industry bias, gov exceptions)
- ✅ cognitive_extraction_logic.json v1.0 created with 10-15 rules
- ✅ Rule types: formula, decision_tree, lookup, threshold
- ✅ All rules versioned and documented

**Dependencies:** None - starts fresh after Phase 4

**Technical Notes:**
Use existing SIVA tool decisions from `agent_decisions` table as input data. Focus on evaluate_company_quality, select_contact_tier, calculate_timing_score, check_edge_cases rules first.

---

### Phase 5.2: Build Rule Engine Interpreter
**Priority:** P1
**Estimated:** 16 hours
**Tags:** Rule Engine, Interpreter, Formulas, Decision Trees

**Objective:**
Implement rule-engine.js with methods to execute formulas, decision trees, lookups, and condition checking. Support safe math evaluation (mathjs), variable resolution, and explainability output.

**Deliverables:**
- `rule-engine.js` created with execute(), executeFormula(), executeDecisionTree() methods
- safeEval() using mathjs parser (no eval())
- evaluateVariable() resolves lookups, mappings, range_lookups
- checkCondition() supports eq, lt, gt, between, in, and, or operators
- explain() generates human-readable breakdown
- All executions return {result, variables, breakdown, formula, version}

**Acceptance Criteria:**
- ✅ rule-engine.js created with execute(), executeFormula(), executeDecisionTree() methods
- ✅ safeEval() using mathjs parser (no eval())
- ✅ evaluateVariable() resolves lookups, mappings, range_lookups
- ✅ checkCondition() supports eq, lt, gt, between, in, and, or operators
- ✅ explain() generates human-readable breakdown
- ✅ All executions return {result, variables, breakdown, formula, version}

**Dependencies:** Phase 5.1 (needs cognitive_extraction_logic.json schema)

**Technical Notes:**
File location: `/server/agent-core/rule-engine.js`. Use mathjs library for safe formula evaluation. Return explainability data for every rule execution.

---

### Phase 5.3: Integrate Rule Engine with SIVA Tools
**Priority:** P1
**Estimated:** 14 hours
**Tags:** Integration, SIVA Tools, Rule Engine, Backward Compatibility

**Objective:**
Wire rule engine into existing SIVA tools (CompanyQualityTool, ContactTierTool, TimingScoreTool, EdgeCasesTool) to replace hardcoded logic with dynamic JSON rules. Maintain backward compatibility.

**Deliverables:**
- CompanyQualityTool uses evaluate_company_quality rule
- ContactTierTool uses select_contact_tier rule
- TimingScoreTool uses calculate_timing_score rule
- EdgeCasesTool uses check_edge_cases rule
- All tools return explainability breakdown from rule engine
- Backward compatibility maintained (existing API contracts unchanged)
- Tool response times remain under SLA (p95 < 500ms for Foundation tools)

**Acceptance Criteria:**
- ✅ CompanyQualityTool uses evaluate_company_quality rule
- ✅ ContactTierTool uses select_contact_tier rule
- ✅ TimingScoreTool uses calculate_timing_score rule
- ✅ EdgeCasesTool uses check_edge_cases rule
- ✅ All tools return explainability breakdown from rule engine
- ✅ Backward compatibility maintained (existing API contracts unchanged)
- ✅ Tool response times remain under SLA (p95 < 500ms for Foundation tools)

**Dependencies:** Phase 5.2 (needs rule-engine.js operational)

**Technical Notes:**
Update tool files: `CompanyQualityToolStandalone.js`, `ContactTierToolStandalone.js`, `TimingScoreToolStandalone.js`, `EdgeCasesToolStandalone.js`. Add rule engine as dependency, call execute() method instead of inline logic.

---

### Phase 5.4: Build Golden Dataset Test Suite
**Priority:** P1
**Estimated:** 10 hours
**Tags:** Testing, Golden Dataset, Unit Tests, Integration Tests

**Objective:**
Create comprehensive test suite with ~50 golden dataset examples covering all rule types. Include unit tests for each rule and integration tests for end-to-end workflows (should_i_contact_this_company).

**Deliverables:**
- Golden dataset created: 50+ test examples in JSON fixture file
- Unit tests for each rule (evaluate_company_quality.test.js, select_contact_tier.test.js, etc.)
- Integration tests for full contact decision workflow
- Test coverage > 90% for rule-engine.js
- All tests passing in CI/CD pipeline
- Edge case tests for government entities, enterprise exceptions

**Acceptance Criteria:**
- ✅ Golden dataset created: 50+ test examples in JSON fixture file
- ✅ Unit tests for each rule (evaluate_company_quality.test.js, select_contact_tier.test.js, etc.)
- ✅ Integration tests for full contact decision workflow
- ✅ Test coverage > 90% for rule-engine.js
- ✅ All tests passing in CI/CD pipeline
- ✅ Edge case tests for government entities, enterprise exceptions

**Dependencies:** Phase 5.3 (needs integrated system to test)

**Technical Notes:**
Use Jest + Supertest. Create fixtures in `/server/agent-core/test-fixtures/golden-dataset.json`. Test file location: `/server/agent-core/__tests__/`. Include regression tests to prevent rule drift.

---

### Phase 5.5: Implement Rule Versioning & Deployment Workflow
**Priority:** P2
**Estimated:** 8 hours
**Tags:** Versioning, Deployment, DevOps, Rollback, A/B Testing

**Objective:**
Build versioning system for cognitive rules with validation, deployment, health checks, and rollback capabilities. Support A/B testing for rule changes and backtest metrics.

**Deliverables:**
- Rule validation command: `npm run validate-rules`
- Version naming: cognitive_extraction_logic.v1.0.json → v1.1.json
- persona_versions table updated on each deployment
- Health check endpoint: `GET /api/agent-core/health` returns current version
- Rollback procedure documented (switch Cloud Run revision)
- Backtest script: compare rule v1.x vs v1.y on last 90 days data

**Acceptance Criteria:**
- ✅ Rule validation command: npm run validate-rules
- ✅ Version naming: cognitive_extraction_logic.v1.0.json → v1.1.json
- ✅ persona_versions table updated on each deployment
- ✅ Health check endpoint: GET /api/agent-core/health returns current version
- ✅ Rollback procedure documented (switch Cloud Run revision)
- ✅ Backtest script: compare rule v1.x vs v1.y on last 90 days data

**Dependencies:** Phase 5.4 (needs tests passing before versioning)

**Technical Notes:**
Add validation script: `scripts/validate-rules.js`. Update persona_versions table schema if needed. Document promotion criteria: ≥5% conversion lift vs previous version.

---

### Phase 5.6: Add Explainability UI & Governance Policies
**Priority:** P2
**Estimated:** 6 hours
**Tags:** Explainability, Governance, Audit Trail, Maintenance

**Objective:**
Create explainability output format for rule decisions, add governance policies (change log, audit trail, review cycle), and implement maintenance schedule triggers.

**Deliverables:**
- Explainability format standardized: {result, breakdown[], formula, confidence, version}
- Breakdown shows 3 main reasons for each decision
- Change log format defined in Git commit messages
- Audit trail captured in persona_versions table
- Quarterly review process documented
- Maintenance triggers defined: quarterly backtest, new pattern, drift detection

**Acceptance Criteria:**
- ✅ Explainability format standardized: {result, breakdown[], formula, confidence, version}
- ✅ Breakdown shows 3 main reasons for each decision
- ✅ Change log format defined in Git commit messages
- ✅ Audit trail captured in persona_versions table
- ✅ Quarterly review process documented
- ✅ Maintenance triggers defined: quarterly backtest, new pattern, drift detection

**Dependencies:** Phase 5.5 (needs versioning system in place)

**Technical Notes:**
Add governance doc: `/docs/siva-phases/Phase_5_Governance.md`. Owner: Sivakumar (sole approver v1). Review cycle: quarterly rule health check. Audit using Git history + persona_versions table.

---

## 🎯 Success Criteria

At the end of Sprint 21, we should have:

1. ✅ **cognitive_extraction_logic.json v1.0** - 10-15 rules extracted from 30 decision examples
2. ✅ **rule-engine.js operational** - Interprets formulas, decision trees, lookups with explainability
3. ✅ **4 SIVA tools integrated** - CompanyQuality, ContactTier, TimingScore, EdgeCases using rule engine
4. ✅ **Golden dataset test suite** - 50+ examples with >90% test coverage
5. ✅ **Versioning workflow** - Validation, deployment, health checks, rollback procedures
6. ✅ **Explainability & governance** - Standardized output, audit trail, maintenance schedule

---

## 📈 Expected Impact

### Technical Impact
- **Transition from hardcoded logic → dynamic JSON rules**
- **Enable rapid rule evolution without code changes**
- **Full explainability for every decision**
- **Foundation for continuous learning & improvement**

### Business Impact
- **Faster iteration on decision logic** (minutes vs hours/days)
- **Better decision transparency** for stakeholders
- **Data-driven rule optimization** via backtesting
- **Reduced technical debt** in SIVA tools

### Project Metrics
- **Project Progress:** 50% → 60%
- **SIVA Phases Complete:** 2 of 12 (Phase 4, Phase 12)
- **SIVA Phases In Progress:** Phase 2 (30% - 12 tools), Phase 5 (0% → 100% this sprint)

---

## 🗂️ File Structure

```
/server/agent-core/
├── cognitive_extraction_logic.json         # v1.0 rules (Phase 5.1)
├── rule-engine.js                          # Interpreter (Phase 5.2)
├── test-fixtures/
│   └── golden-dataset.json                 # 50+ test examples (Phase 5.4)
└── __tests__/
    ├── evaluate_company_quality.test.js
    ├── select_contact_tier.test.js
    ├── calculate_timing_score.test.js
    └── check_edge_cases.test.js

/server/siva-tools/
├── CompanyQualityToolStandalone.js         # Updated with rule engine (Phase 5.3)
├── ContactTierToolStandalone.js            # Updated with rule engine (Phase 5.3)
├── TimingScoreToolStandalone.js            # Updated with rule engine (Phase 5.3)
└── EdgeCasesToolStandalone.js              # Updated with rule engine (Phase 5.3)

/scripts/
└── validate-rules.js                       # Rule validation (Phase 5.5)

/docs/siva-phases/
└── Phase_5_Governance.md                   # Governance policies (Phase 5.6)
```

---

## 🔗 Related Documentation

- **Phase 5 Spec:** `/docs/siva-phases/Phase_5_-_Cognitive_Extraction___Encoding.md`
- **Phase 5 Description:** `/docs/siva-phases/Phase_5_Description.md`
- **Phase 5 README:** `/docs/siva-phases/Phase_5_README.md`
- **Sprint 20 Completion:** `/docs/SPRINT_20_COMPLETE.md`
- **Notion Dashboard:** https://notion.so/2aa66151dd1681de8cb7de1b836c22cc

---

## 🚦 Status Tracking

### Week 1 (Nov 14-20)
- [ ] Phase 5.1: Extract Cognitive Rules from Decision Patterns
- [ ] Phase 5.2: Build Rule Engine Interpreter
- [ ] Phase 5.3: Integrate Rule Engine with SIVA Tools

### Week 2 (Nov 21-27)
- [ ] Phase 5.4: Build Golden Dataset Test Suite
- [ ] Phase 5.5: Implement Rule Versioning & Deployment Workflow
- [ ] Phase 5.6: Add Explainability UI & Governance Policies

---

## 📝 Notes

- **Rule Extraction Source:** Use existing `agent_decisions` table for real decision examples
- **Library Choice:** mathjs for safe formula evaluation (no eval())
- **Backward Compatibility:** Critical - maintain existing API contracts unchanged
- **Performance SLA:** Foundation tools p95 < 500ms (currently 510ms, need to stay under)
- **Test Coverage:** Target >90% for rule-engine.js
- **Versioning Strategy:** Semantic versioning (v1.0 → v1.1 for minor changes, v2.0 for breaking)
- **Promotion Criteria:** ≥5% conversion lift vs previous version before promoting new rules

---

**Last Updated:** November 14, 2025
**Next Review:** November 20, 2025 (Mid-Sprint Check-in)
**Created By:** Claude Code Automation

