# Sprint 22 - Real Action Plan

**Created:** November 15, 2025
**Status:** Ready to Execute
**Estimated Time:** 30-40 hours actual work

---

## Problem Discovered

The `cognitive_extraction_logic.json` rules DON'T match the current tool implementations:

**Cognitive Rules Expect:**
- Simple input: `uae_employees`, `industry`, `entity_type`, `company_name`
- Simple formula: `base * industry_mult * size_mult * entity_mult`

**Current CompanyQualityTool Uses:**
- Complex input: `uae_signals{}`, `salary_indicators{}`, `size`, `size_bucket`, `license_type`, `sector`
- Sophisticated scoring: 4-factor additive + edge case multipliers
- Natural language reasoning

**Conclusion:** The tools evolved beyond the extracted rules. Sprint 21 created educational rules, not production-ready ones.

---

## Sprint 22 Real Tasks

### Task 1: Update Cognitive Rules to Match Current Logic
**Effort:** 6-8 hours
**Deliverable:** New `cognitive_extraction_logic_v2.json` matching actual tool behavior

For CompanyQualityTool, create rules that:
1. Accept current input structure
2. Implement current 4-factor scoring
3. Handle edge cases correctly
4. Return same output format

### Task 2-4: Do Same for Other 3 Tools
**Effort:** 12-18 hours (4-6 hours each)
- ContactTierTool
- TimingScoreTool
- EdgeCasesTool

### Task 5: Integrate Rule Engine into Tools
**Effort:** 4-6 hours
Once rules match, update each tool to:
- Import rule engine
- Call rule engine with input
- Use rule engine output
- Keep original as fallback
- Log decisions with decision_id

### Task 6: Deploy Database Schemas
**Effort:** 1-2 hours
- Run migration SQL
- Verify tables created
- Test queries

### Task 7: Build Feedback API
**Effort:** 3-4 hours
- POST `/api/agent-core/feedback` endpoint
- Validation
- Database insert
- Response

### Task 8: Build Comparison API
**Effort:** 2-3 hours
- GET `/api/agent-core/rule-comparison` endpoint
- Query decision_performance view
- Statistical comparison
- Response

### Task 9: Create 100+ Real Test Cases
**Effort:** 6-8 hours
- 25+ cases per tool
- Cover happy path, edge cases, boundaries
- Expected outputs calculated
- JSON format

### Task 10: Test Automation
**Effort:** 2-3 hours
- Test runner script
- Load test cases
- Execute against tools
- Compare actual vs expected
- Report results

### Task 11: Deploy & Integration Test
**Effort:** 2-3 hours
- Deploy code
- Run smoke tests
- Run stress tests
- Verify performance

---

## Total Effort: 38-49 hours

This is honest engineering time, not documentation time.

---

## Recommendation

Given this is 1 week+ of focused work, I recommend:

**Path A: Do It Right (1-2 weeks)**
- Complete all tasks properly
- Ship Sprint 22 fully functional
- SIVA Phase 6 truly complete

**Path B: Simplify Scope**
- Deploy database schemas (Task 6)
- Build APIs (Tasks 7-8)
- Create infrastructure without full integration
- Mark Sprint 22 as "Learning Infrastructure"
- Do full rule integration in Sprint 23

---

## Which Path?

Tell me which path and I'll execute it completely and honestly.

