# SIVA Cognitive Pillars

**Extracted**: November 15, 2025
**Source**: 959 production shadow mode decisions (Sprints 22-24)
**Tools**: CompanyQuality (309), ContactTier (230), TimingScore (226), BankingProductMatch (194)

---

## Quick Reference

| Pillar | Name | Impact |  Tools Affected |
|--------|------|--------|----------------|
| **#1** | Company Size as Primary Discriminator | 🔴 Critical | All 4 tools |
| **#2** | Title-Based Seniority Hierarchy | 🔴 Critical | ContactTier |
| **#3** | Signal Age Decay Function | 🟡 High | TimingScore |
| **#4** | Department-Driven Decision Modifiers | 🟡 High | ContactTier |
| **#5** | Data Completeness → Confidence Mapping | 🟢 Medium | All 4 tools |
| **#6** | Industry-Specific Optimization | 🟢 Medium | CompanyQuality, BankingProductMatch |

---

## Pillar #1: Company Size as Primary Discriminator

### Core Principle
Every SIVA tool uses company employee count as the first-order filter, dividing companies into 5 buckets.

### Size Buckets
```
Micro:      1-9 employees
Small:      10-49 employees
Midsize:    50-199 employees
Large:      200-999 employees
Enterprise: 1000+ employees
```

### Sweet Spot
**Midsize (50-200 employees)** represents the highest-value segment:
- 67 CompanyQuality decisions (21.7%)
- 197 ContactTier decisions (85.7%)

### Decision Impact
- **CompanyQuality**: Midsize companies score 30/30 points (maximum size score)
- **ContactTier**: Midsize unlocks STRATEGIC tier for Director+ contacts
- **BankingProductMatch**: Midsize companies get different product recommendations

### Implementation
```javascript
// server/agent-core/contact_tier_v2.0.json
"company_size_score": {
  "buckets": [
    { "range": [50, 200], "label": "Midsize", "score": 30 },
    { "range": [200, 1000], "label": "Large", "score": 25 },
    { "range": [10, 50], "label": "Small", "score": 15 },
    { "range": [1, 10], "label": "Micro", "score": 5 }
  ]
}
```

---

## Pillar #2: Title-Based Seniority Hierarchy

### Core Principle
Job titles are parsed using keyword matching to infer seniority, following a strict 5-level hierarchy.

### Hierarchy
```
C-Level    > VP    > Director    > Manager    > Individual
(Priority 1) (Priority 2) (Priority 3) (Priority 4) (Priority 5)
```

### Keywords (from 230 ContactTier decisions)
```javascript
'C-Level':     ['ceo', 'cto', 'cfo', 'coo', 'president', 'founder', 'owner']
'VP':          ['vp', 'vice president', 'evp', 'svp']
'Director':    ['director', 'head of']  // 196 occurrences (85.2%)
'Manager':     ['manager', 'lead', 'supervisor']
'Individual':  ['specialist', 'analyst', 'coordinator', 'associate']
```

### Scoring Weights
- C-Level: 40/40 points
- VP: 30/40 points
- Director: 25/40 points
- Manager: 15/40 points
- Individual: 5/40 points
- Unknown: 5/40 points

### Inference Penalty
When seniority is inferred from title (not explicit):
- Confidence: -0.15 penalty
- Example: "Director of HR" (inferred) = 0.85 confidence vs explicit Director = 1.00 confidence

### Implementation
```javascript
// server/agent-core/ContactTierRuleEngineV2.js:139-150
_inferSeniority(titleLower) {
  const { keywords } = this.rules.inference_rules.infer_seniority;
  for (const [level, keywordList] of Object.entries(keywords)) {
    const matchedKeywords = keywordList.filter(kw => titleLower.includes(kw));
    if (matchedKeywords.length > 0) return { level, keywords: matchedKeywords };
  }
  return { level: 'Unknown', keywords: [] };
}
```

---

## Pillar #3: Signal Age Decay Function

### Core Principle
Recent signals receive exponentially higher scores than old signals, with 4 distinct priority tiers.

### Age Thresholds
```
Fresh:  ≤7 days    → HOT  priority (score: 90)
Recent: 8-30 days  → WARM priority (score: 70)
Stale:  31-90 days → COOL priority (score: 40)
Old:    >90 days   → COLD priority (score: 10)
```

### Evidence (226 TimingScore decisions)
- Old signals (>90 days): 226 decisions (100%)
- Fresh/Recent/Stale: 0 decisions (test data limitation)

### Decay Formula
```javascript
function calculateTimingScore(signalAgeDays) {
  if (signalAgeDays <= 7)  return { priority: 'HOT',  score: 90, urgency: 'immediate' };
  if (signalAgeDays <= 30) return { priority: 'WARM', score: 70, urgency: 'high' };
  if (signalAgeDays <= 90) return { priority: 'COOL', score: 40, urgency: 'medium' };
  return { priority: 'COLD', score: 10, urgency: 'low' };
}
```

### Fiscal Context Modifier
Signals occurring near fiscal year-end receive +10 score boost:
```javascript
if (fiscalContext === 'q4' || fiscalContext === 'year_end') {
  score += 10;
}
```

### Implementation
`server/siva-tools/TimingScoreTool.js:65-85`

---

## Pillar #4: Department-Driven Decision Modifiers

### Core Principle
HR, Finance, and Admin departments receive priority classification, especially when combined with Director+ seniority.

### Department Distribution (230 ContactTier decisions)
```
HR:          196 (85.2%)  ← Dominant department
Other:       31  (13.5%)
Admin:       1   (0.4%)
Engineering: 1   (0.4%)
Finance:     0   (0.0%)
Sales:       0   (0.0%)
```

### Scoring Weights
```javascript
{
  'HR':          30 points  // Maximum department score
  'Finance':     25 points
  'Admin':       20 points
  'Sales':       15 points
  'Engineering': 10 points
  'Other':       5  points
}
```

### Strategic Tier Boosting
**Condition**: Director+ seniority AND HR/Finance/Admin department → STRATEGIC tier (priority 1)

**Examples**:
- ✅ HR Director (196 occurrences) → STRATEGIC
- ✅ Finance VP → STRATEGIC
- ✅ Admin Director → STRATEGIC
- ❌ Sales Director → PRIMARY (not strategic department)
- ❌ HR Manager → PRIMARY (not senior enough)

### Implementation
```json
// server/agent-core/contact_tier_v2.0.json
"STRATEGIC": {
  "priority": 1,
  "conditions": [
    { "seniority": "C-Level" },
    {
      "seniority": ["VP", "Director"],
      "department": ["HR", "Finance", "Admin"]
    }
  ]
}
```

---

## Pillar #5: Data Completeness → Confidence Mapping

### Core Principle
Decision confidence is directly proportional to input data completeness. More fields = higher confidence.

### Data Quality Tiers
```
Complete:  ≥8 fields  → Confidence: 0.85-1.00
Partial:   5-7 fields → Confidence: 0.60-0.84
Minimal:   ≤4 fields  → Confidence: 0.40-0.59
```

### Evidence

**CompanyQuality** (309 decisions):
- Complete data: 309 decisions (100%)
- Confidence range: 0.70 - 1.00
- Average: ~0.92

**ContactTier** (230 decisions):
- All decisions had explicit seniority + department (complete data)
- Seniority inferred: 0 decisions (0%)
- Department inferred: 0 decisions (0%)

### Confidence Penalties
```javascript
const penalties = {
  seniority_inferred:   -0.15,  // Title parsed to infer seniority
  department_inferred:  -0.10,  // Title parsed to infer department
  short_title:          -0.10   // Title ≤1 word (e.g., "CEO")
};
```

### Calculation
```javascript
function calculateConfidence(input, inferences) {
  let confidence = 1.0;  // Base confidence

  if (inferences.seniorityInferred) confidence -= 0.15;
  if (inferences.departmentInferred) confidence -= 0.10;
  if (input.title.split(' ').length <= 1) confidence -= 0.10;

  return Math.max(0.4, Math.min(1.0, confidence));  // Clamp 0.4-1.0
}
```

### Match Rate Correlation
- CompanyQuality (complete data): 97.88% match rate
- ContactTier (complete data): 100% match rate
- TimingScore (minimal data): Unknown (no rule engine yet)

### Implementation
`server/agent-core/ContactTierRuleEngineV2.js:396-453`

---

## Pillar #6: Industry-Specific Optimization

### Core Principle
Technology, Finance, and Healthcare industries receive preferential scoring across tools.

### Industry Distribution (309 CompanyQuality decisions)
```
Technology:   267 (86.4%)  ← Dominant industry
Retail:       6   (1.9%)
Healthcare:   6   (1.9%)
Real Estate:  3   (1.0%)
Finance:      3   (1.0%)
Education:    3   (1.0%)
Manufacturing:3   (1.0%)
Other:        18  (5.8%)
```

### Industry Boost Scoring
```javascript
const industryBoost = {
  'Technology':    +5 points
  'Finance':       +5 points
  'Healthcare':    +3 points
  'Manufacturing': +0 points
  'Retail':        +0 points
  'Other':         +0 points
};
```

### Sector Bias
**Private sector dominance**:
- Private: 309 decisions (100%)
- Public/Government: 0 decisions (0%)
- Nonprofit: 0 decisions (0%)

**Insight**: SIVA tools are optimized exclusively for **private sector** companies in the **technology industry**.

### Product Recommendations (BankingProductMatch)
Technology companies receive specialized banking product recommendations:
- Startup financing products
- R&D tax incentive programs
- Venture debt facilities

### Implementation
`server/agent-core/company_quality_v2.2.json:80-95`

---

## Cross-Pillar Interactions

### Example 1: CompanyQuality Scoring
```
Base Score = 0

+ Pillar 1 (Size): Midsize company (50-200) = +30 points
+ Pillar 6 (Industry): Technology = +5 points
+ Free Zone License = +20 points
+ Private Sector = +10 points

Total Score = 65/100 → TIER_1 (high quality)
Confidence = 0.95 (complete data per Pillar 5)
```

### Example 2: ContactTier Classification
```
Base Score = 0

+ Pillar 2 (Seniority): Director = +25 points
+ Pillar 4 (Department): HR = +30 points
+ Pillar 1 (Size): Midsize (150 employees) = +30 points

Total Score = 85/100
Tier Classification: STRATEGIC (Director + HR per Pillar 4 boost)
Priority: 1
Confidence = 1.00 (explicit fields, no penalties per Pillar 5)
```

### Example 3: TimingScore Priority
```
Base Score = 0

+ Pillar 3 (Signal Age): 5 days old = +90 points (HOT)
+ Fiscal Context: Q4 = +10 points

Total Score = 100/100
Priority: HOT
Urgency: Immediate contact required
```

---

## Usage Guidelines

### When to Apply Each Pillar

**Pillar 1 (Size)**:
- Use in ALL tools as first-order filter
- Apply before other scoring criteria
- Use to set base expectations

**Pillar 2 (Seniority)**:
- Apply to ContactTier decisions
- Use keyword matching for inference
- Apply -0.15 penalty if inferred

**Pillar 3 (Signal Age)**:
- Apply to TimingScore decisions
- Calculate decay based on days since signal
- Add fiscal context modifier if applicable

**Pillar 4 (Department)**:
- Apply to ContactTier decisions
- Combine with Pillar 2 for strategic tier boosting
- HR/Finance/Admin departments get priority

**Pillar 5 (Confidence)**:
- Apply to ALL tools at end of scoring
- Count input fields to determine data quality tier
- Apply penalties for inferred/missing data

**Pillar 6 (Industry)**:
- Apply to CompanyQuality and BankingProductMatch
- Add industry boost to final score
- Recognize technology bias in current data

---

## Validation & Testing

### Golden Test Cases

**Test Case 1**: Midsize Technology Company + HR Director
```javascript
assert(companyQuality({size: 150, industry: 'Technology'}) === 'TIER_1');
assert(contactTier({title: 'HR Director', size: 150}) === 'STRATEGIC');
// Pillars: 1 (size), 2 (seniority), 4 (department), 6 (industry)
```

**Test Case 2**: Large Company + VP Engineering
```javascript
assert(companyQuality({size: 500, industry: 'Technology'}) === 'TIER_1');
assert(contactTier({title: 'VP Engineering', size: 500}) === 'PRIMARY');
// Pillars: 1 (size), 2 (seniority)
```

**Test Case 3**: Fresh Signal (5 days old)
```javascript
assert(timingScore({signal_age_days: 5}) === 'HOT');
// Pillar: 3 (signal age)
```

### Regression Testing
Run cognitive pillar extraction monthly to detect drift:
```bash
node scripts/analysis/extractCognitivePillars.js
diff scripts/analysis/cognitivePillars.json scripts/analysis/cognitivePillars_baseline.json
```

---

## Maintenance & Evolution

### Pillar Versioning
Each pillar should be versioned independently:
- Pillar 1 v1.0: Initial size bucketing (5 buckets)
- Pillar 1 v1.1: Adjusted midsize range from 50-200 to 50-250
- Pillar 2 v1.0: Initial keyword hierarchy
- Pillar 2 v1.1: Added "Co-Founder" to C-Level keywords

### Monitoring for Drift
Track these metrics weekly:
1. **Size distribution shift**: % of decisions per size bucket
2. **Title keyword coverage**: % of titles successfully mapped to seniority
3. **Industry concentration**: % of decisions in top 3 industries
4. **Confidence distribution**: Avg confidence per tool

### When to Update Pillars
Update a cognitive pillar when:
- Match rate drops below 85%
- >100 decisions don't fit current rules
- New business requirements emerge (e.g., prioritize Finance industry)
- User feedback indicates misclassifications

---

## Next Steps

### Remaining Work
1. ✅ Extract cognitive pillars (COMPLETE)
2. ✅ Document 6 pillars with evidence (COMPLETE)
3. ⏳ Build rule engines for TimingScore and BankingProductMatch
4. ⏳ Create 50+ golden dataset examples
5. ⏳ Implement automated regression testing

### Phase 2 Transition
Use these cognitive pillars as foundation for:
- Architecture diagrams (showing pillar → module → tool flow)
- Interface contracts (enforcing pillar constraints)
- Multi-tool workflows (combining pillars across tools)

---

**Document Version**: 1.0
**Last Updated**: November 15, 2025
**Next Review**: December 15, 2025 (Checkpoint 2)
