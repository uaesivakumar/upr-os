# Sprint 22 Quick Reference

**Focus:** Rule Engine Integration & Learning System Foundation
**Duration:** 1 week (Nov 15-22, 2025)
**Progress Target:** 58% → 69%

## Core Objectives

1. **Integrate Rule Engine** - Tools 1-4 use rules instead of inline logic
2. **Feedback System** - Collect real-world outcomes for learning
3. **Test Expansion** - 4 → 100+ test cases
4. **Learning Foundation** - Database schema for ML training

## 12 Tasks Breakdown

### HIGH Priority (8 tasks - ~16 hours)
1. Integrate CompanyQualityTool (2h)
2. Integrate ContactTierTool (2h)
3. Integrate TimingScoreTool (2h)
4. Integrate EdgeCasesTool (2h)
5. Create feedback database schema (1h)
6. Build feedback API (2h)
7. Create golden dataset (3h)
8. Automate test execution (2h)

### MEDIUM Priority (3 tasks - ~5 hours)
9. Integrate feedback collection points (2h)
10. Create rule comparison API (2h)
11. Create training dataset schema (1h)

### LOW Priority (1 task - ~3 hours)
12. Build comparison dashboard UI (3h) - **Can defer to Sprint 23**

## Success Criteria

- ✅ 4 tools using rule engine in production
- ✅ 100+ test cases passing
- ✅ Feedback API operational
- ✅ Zero regressions (21/21 smoke tests still passing)
- ✅ Database schemas deployed

## Quick Start

```bash
# Run golden dataset tests
npm test:golden

# Submit feedback
curl -X POST https://upr-web-service.../api/agent-core/feedback \
  -H "Content-Type: application/json" \
  -d '{"decision_id":"uuid","outcome_positive":true}'

# Compare rule versions
curl https://upr-web-service.../api/agent-core/rule-comparison?tool=CompanyQualityTool&version_a=v1.0&version_b=v1.1
```

## Key Deliverables

1. **Code:** 4 integrated tools + feedback system + test suite
2. **Database:** 2 new schemas (feedback + training samples)
3. **API:** 2 new endpoints (feedback + comparison)
4. **Tests:** 100+ golden dataset test cases
5. **Documentation:** Integration guide + API docs

## Risk Mitigation

- **Integration breaks prod:** Feature flag rollback + extensive testing
- **Performance degradation:** Benchmark before/after, fallback to inline logic
- **Low feedback volume:** Manual collection if needed

## Next Sprint Preview

**Sprint 23:** ML-powered rule optimization, STRICT tools integration (5-8), A/B testing framework

---

See `SPRINT_22_KICKOFF.md` for full details.
