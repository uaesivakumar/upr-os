# Discovery V2 Intent
## Payroll-Pattern Quality Scoring

**Status:** INTENT ONLY — Not Implementation
**Prerequisite:** Shadow validation data (2-4 weeks)

---

## V1 Limitation (Current State)

Current quality scoring is industry-biased:
- Tech/Fintech/Healthcare → High quality (40+)
- All other industries → Low quality (25)

**Founder guidance:** "Industry is not EB quality. Payroll pattern is."

---

## V2 Thesis

Quality scoring should be based on **payroll patterns**, not industry.

### Signals That Indicate EB Quality

| Signal | What It Tells Us | Data Source |
|--------|------------------|-------------|
| **WPS Patterns** | Active payroll, employee count trends | MOL/WPS data |
| **Workforce Type** | White-collar vs blue-collar mix | Visa classifications |
| **Visa Clustering** | Multiple visa types = diverse workforce | Immigration data |
| **Salary Bands** | Premium vs basic salary distribution | WPS/industry benchmarks |
| **Payroll Frequency** | Monthly consistency | WPS transaction patterns |
| **Headcount Stability** | Growing, stable, or declining | Historical WPS |

### Why These Matter for EB

| Pattern | EB Relevance |
|---------|--------------|
| High white-collar ratio | Premium EB products (credit cards, loans) |
| Stable payroll history | Reliable WPS processing, low churn |
| Growing headcount | Expansion = new account potential |
| Diverse visa types | Complex workforce = more banking needs |
| Premium salary bands | Higher deposit volumes, cross-sell potential |

---

## What's Missing Today

### Data Not Available in Scenarios

1. **WPS data** — Not accessible in current signal sources
2. **Visa classifications** — Not enriched from company profiles
3. **Salary distribution** — Only job posting salaries (unreliable)
4. **Payroll history** — No longitudinal data

### Data Available But Not Used

1. **License type** — Partially used for Free Zone detection
2. **Entity age** — Available but not weighted
3. **Location signals** — Used for UAE presence, not payroll patterns

---

## Shadow Validation Questions

During shadow mode, observe:

1. **Do ACT companies share payroll patterns?**
   - Industry is diverse, but do they have similar workforce characteristics?

2. **Do IGNORE companies have predictable payroll gaps?**
   - Too small? Too transient? Too manual (blue-collar heavy)?

3. **What distinguishes WAIT from ACT?**
   - Is it timing, or is it workforce maturity?

4. **What BLOCK patterns emerge?**
   - Government payroll? Sanctioned entities? Competitor clients?

---

## V2 Implementation (Future)

**Only after shadow validation confirms:**
- ACT/WAIT separation is consistent
- Payroll patterns explain quality better than industry

### Potential Changes

| Component | V1 (Current) | V2 (Proposed) |
|-----------|--------------|---------------|
| Quality input | Industry, size, domain | WPS signals, visa types, salary bands |
| Quality threshold | 35 (hardcoded) | Dynamic per workforce type |
| Industry bonus | +15 for tech/healthcare | Removed (no industry bias) |
| Payroll bonus | None | +15 for stable WPS, +10 for growing headcount |

### Required Integrations

1. **WPS Data Feed** — MOL integration or third-party provider
2. **Visa Classification API** — Employee type breakdown
3. **Salary Band Enrichment** — Industry benchmarks by role

---

## Next Steps

| Step | When | Owner |
|------|------|-------|
| Complete shadow validation | Weeks 1-4 | TC (automated) |
| Analyze shadow data for patterns | Week 4 | Founder |
| Qualitative RM comparison | Week 4-5 | Founder + RM |
| Document V2 requirements | Week 5-6 | Founder |
| V2 implementation (if validated) | Week 6+ | TC |

---

## Constraints

- **NO implementation until shadow validation complete**
- **NO threshold changes until founder approval**
- **NO industry rules (explicitly forbidden)**
- **NO CRS weight tuning**
- **NO scenario regeneration**

---

*This document captures intent only. Implementation requires founder approval after shadow validation.*

*DISCOVERY_V1_FROZEN remains the baseline ruler.*
