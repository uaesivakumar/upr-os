# UPR Data Moat Metrics

**Last Updated:** October 17, 2025
**Status:** Living Document
**Update Frequency:** Monthly (first Friday of each month)

---

## Table of Contents
- [Overview](#overview)
- [The 7 Core Metrics](#the-7-core-metrics)
- [Monthly Scorecard Template](#monthly-scorecard-template)
- [Metric Definitions & SQL Queries](#metric-definitions--sql-queries)
- [Metric History](#metric-history)
- [Targets & Thresholds](#targets--thresholds)
- [Dashboard Queries](#dashboard-queries)

---

## Overview

### What is a "Data Moat"?

A data moat is a competitive advantage built on **proprietary data that compounds over time**.

For UPR, this means:
- Every query → more data in our knowledge base
- More data → better answers (accuracy, speed, cost)
- Better answers → more customers
- More customers → more queries (flywheel)

### Why These 7 Metrics?

These metrics measure our progress from "API Consumer" (100% external data) to "Data Rich Company" (70%+ internal data).

**The Thesis:** When 70%+ of queries are answered from internal data, we have a **defensible moat** that competitors can't replicate without months/years of data accumulation.

---

## The 7 Core Metrics

| # | Metric | Definition | Target (Month 18) | Why It Matters |
|---|--------|------------|-------------------|----------------|
| **1** | **Reuse Rate** | % queries answered from internal KB vs. external APIs | **70%+** | Primary moat metric: shows data compounding |
| **2** | **Freshness SLA** | Median age of data returned | **<21 days** | Prevents stale data (trust metric) |
| **3** | **Provenance Coverage** | % answers with 2+ sources | **90%+** | Multi-source validation (quality metric) |
| **4** | **Resolution Time** | Median time: conflict detected → resolved | **<12 hours** | Measures data quality pipeline efficiency |
| **5** | **Edge Density** | Avg # of relationships per company | **25+ edges** | Knowledge graph richness (depth of data) |
| **6** | **Outcome Lift** | Meeting rate vs. baseline | **4x** | Business impact (proves value) |
| **7** | **Cost per Lead** | Fully-loaded cost (API + infra + people) / # leads | **$0.20** | Unit economics (sustainability) |

---

## Monthly Scorecard Template

Copy this template for each monthly snapshot:

```markdown
# UPR Moat Metrics - [Month Year]

**Reporting Period:** [Start Date] - [End Date]
**Queries This Month:** [Total]
**New Customers:** [Count]
**Churn:** [%]

---

## The 7 Core Metrics

| Metric | Current | Last Month | Target | Status |
|--------|---------|------------|--------|--------|
| **1. Reuse Rate** | X% | Y% | 70% | 🟢 / 🟡 / 🔴 |
| **2. Freshness SLA** | X days | Y days | <21 days | 🟢 / 🟡 / 🔴 |
| **3. Provenance Coverage** | X% | Y% | 90% | 🟢 / 🟡 / 🔴 |
| **4. Resolution Time** | X hours | Y hours | <12 hours | 🟢 / 🟡 / 🔴 |
| **5. Edge Density** | X edges | Y edges | 25+ | 🟢 / 🟡 / 🔴 |
| **6. Outcome Lift** | Xx | Yx | 4x | 🟢 / 🟡 / 🔴 |
| **7. Cost per Lead** | $X | $Y | $0.20 | 🟢 / 🟡 / 🔴 |

---

## Insights

### What's Working
- [Key win 1]
- [Key win 2]

### What's Not Working
- [Challenge 1]
- [Challenge 2]

### Action Items
- [ ] [Action 1]
- [ ] [Action 2]

---

## Data Breakdown

### Reuse Rate by Source
- Internal KB: X%
- Cache hits: Y%
- External APIs: Z%

### Freshness Distribution
- <7 days: X%
- 7-21 days: Y%
- 21-30 days: Z%
- >30 days: W%

### Provenance Sources
- Single source: X%
- 2 sources: Y%
- 3+ sources: Z%

---

**Next Review:** [Date]
```

---

## Metric Definitions & SQL Queries

### Metric 1: Reuse Rate

**Definition:** Percentage of queries answered from internal knowledge base (RAG + cache) vs. external APIs.

**Formula:**
```
Reuse Rate = (Queries from Internal KB / Total Queries) × 100
```

**What Counts as "Internal KB":**
- RAG retrieval (pgvector similarity search)
- Exact cache hits (query hash match)
- Derived data (computed from existing data)

**What Counts as "External API":**
- Apollo, SerpAPI, NeverBounce, etc.
- Any call that costs money

**Target Trajectory:**

| Month | Target | Rationale |
|-------|--------|-----------|
| 1 | 10% | Cache hits only (exact matches) |
| 3 | 20% | RAG starts matching similar queries |
| 6 | 35% | 10K+ queries accumulated, patterns emerge |
| 9 | 50% | Proprietary signals, temporal patterns |
| 12 | 65% | Knowledge graph edges add context |
| 18 | 70%+ | Defensible moat achieved |

**SQL Query:**
```sql
-- Reuse Rate for Last 30 Days
WITH query_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE source = 'internal_kb') AS internal_queries,
    COUNT(*) FILTER (WHERE source = 'external_api') AS external_queries,
    COUNT(*) AS total_queries
  FROM rag_queries
  WHERE created_at >= NOW() - INTERVAL '30 days'
)
SELECT
  ROUND(100.0 * internal_queries / NULLIF(total_queries, 0), 2) AS reuse_rate_pct,
  internal_queries,
  external_queries,
  total_queries
FROM query_stats;
```

**How to Improve:**
- Run discovery/enrichment agents nightly (more data)
- Improve RAG retrieval (tune similarity threshold)
- Add semantic edges to knowledge graph
- Implement proactive enrichment (fetch data before it's requested)

---

### Metric 2: Freshness SLA

**Definition:** Median age of data returned in query responses.

**Formula:**
```
Freshness SLA = MEDIAN(NOW() - last_updated) for all data points returned
```

**Why It Matters:**
- Stale data → wrong decisions (e.g., person changed jobs 6 months ago)
- Freshness builds trust (customers know data is current)
- Balance: too fresh = expensive (constant API calls), too stale = useless

**Target Trajectory:**

| Month | Target | Rationale |
|-------|--------|-----------|
| 1-3 | <30 days | Initial data collection, acceptable lag |
| 6 | <25 days | Nightly jobs + proactive refresh |
| 12 | <21 days | Optimized refresh logic (focus on high-value entities) |
| 18 | <21 days | Sustained (diminishing returns below this) |

**SQL Query:**
```sql
-- Median Freshness for Last 30 Days
WITH freshness_data AS (
  SELECT
    EXTRACT(EPOCH FROM (NOW() - c.last_updated)) / 86400 AS age_days
  FROM companies c
  JOIN rag_documents rd ON rd.metadata->>'company_id' = c.id::text
  JOIN rag_queries rq ON rq.id = rd.query_id
  WHERE rq.created_at >= NOW() - INTERVAL '30 days'

  UNION ALL

  SELECT
    EXTRACT(EPOCH FROM (NOW() - p.last_updated)) / 86400 AS age_days
  FROM people p
  JOIN rag_documents rd ON rd.metadata->>'person_id' = p.id::text
  JOIN rag_queries rq ON rq.id = rd.query_id
  WHERE rq.created_at >= NOW() - INTERVAL '30 days'
)
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days) AS median_freshness_days,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY age_days) AS p90_freshness_days,
  MIN(age_days) AS min_age_days,
  MAX(age_days) AS max_age_days
FROM freshness_data;
```

**How to Improve:**
- Prioritize high-value entities (frequently queried companies/people)
- Incremental updates (only refresh changed fields)
- Trigger-based refresh (e.g., if signal detected, refresh company)
- Set staleness thresholds by entity type (VIPs: 7 days, others: 30 days)

---

### Metric 3: Provenance Coverage

**Definition:** Percentage of data points validated by 2+ independent sources.

**Formula:**
```
Provenance Coverage = (Records with 2+ Sources / Total Records) × 100
```

**Why It Matters:**
- Multi-source validation → higher confidence
- Single-source data may be wrong (API bugs, stale data)
- Provenance enables conflict detection ("Apollo says X, SerpAPI says Y")

**Target Trajectory:**

| Month | Target | Rationale |
|-------|--------|-----------|
| 1-3 | 50% | Early data, single-source dominates |
| 6 | 70% | Enrichment agent cross-references sources |
| 12 | 80% | Most entities have been enriched multiple times |
| 18 | 90%+ | Mature dataset, rare to have single-source data |

**SQL Query:**
```sql
-- Provenance Coverage (Companies)
WITH company_provenance AS (
  SELECT
    c.id,
    COUNT(DISTINCT cm.source) AS source_count
  FROM companies c
  LEFT JOIN company_metadata cm ON cm.company_id = c.id
  GROUP BY c.id
)
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE source_count >= 2) / COUNT(*), 2) AS provenance_coverage_pct,
  COUNT(*) FILTER (WHERE source_count = 1) AS single_source,
  COUNT(*) FILTER (WHERE source_count = 2) AS two_sources,
  COUNT(*) FILTER (WHERE source_count >= 3) AS three_plus_sources,
  COUNT(*) AS total_companies
FROM company_provenance;
```

**How to Improve:**
- Run enrichment from multiple APIs (Apollo + SerpAPI + Hunter)
- Cross-reference on every update (if Apollo updates, check SerpAPI too)
- Prioritize high-value entities for multi-source validation
- Build conflict resolution UI (manual review when sources disagree)

---

### Metric 4: Resolution Time

**Definition:** Median time from conflict detection to human resolution.

**Formula:**
```
Resolution Time = MEDIAN(resolved_at - detected_at) for conflicts
```

**Why It Matters:**
- Conflicts block data quality (if unresolved, we can't trust the data)
- Fast resolution → less data in "pending" state
- Measures data quality pipeline efficiency

**Types of Conflicts:**
- Email mismatch (Apollo: john@acme.com, Hunter: john@acme.ae)
- Company size discrepancy (Apollo: 150, LinkedIn: 200)
- Location conflict (Dubai vs. Abu Dhabi)

**Target Trajectory:**

| Month | Target | Rationale |
|-------|--------|-----------|
| 1-3 | <48 hours | Manual resolution, small team |
| 6 | <24 hours | Conflict resolution UI built |
| 12 | <12 hours | Automated rules (e.g., trust newer source) |
| 18 | <6 hours | Most conflicts auto-resolved, rare manual review |

**SQL Query:**
```sql
-- Resolution Time for Last 30 Days
WITH conflict_resolution AS (
  SELECT
    EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 3600 AS resolution_hours
  FROM data_conflicts
  WHERE resolved_at IS NOT NULL
    AND detected_at >= NOW() - INTERVAL '30 days'
)
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY resolution_hours) AS median_resolution_hours,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY resolution_hours) AS p90_resolution_hours,
  MIN(resolution_hours) AS min_resolution_hours,
  MAX(resolution_hours) AS max_resolution_hours,
  COUNT(*) AS conflicts_resolved
FROM conflict_resolution;
```

**How to Improve:**
- Build conflict resolution UI (prioritize by impact)
- Automated rules (e.g., "always trust NeverBounce for email validity")
- Confidence scoring (if one source is 95% confident, auto-accept)
- Slack notifications (alert team when conflict detected)

---

### Metric 5: Edge Density

**Definition:** Average number of relationships (edges) per company in knowledge graph.

**Formula:**
```
Edge Density = Total Edges / Total Companies
```

**Why It Matters:**
- More edges = richer context (can answer complex queries)
- Example: "Find companies similar to Acme, hiring for sales, in same location"
- Edges enable graph traversals (find indirect connections)

**Edge Types:**
- `works_at` (person → company)
- `similar_to` (company → company, based on embeddings)
- `located_in` (company → location)
- `replied_to` (person → outreach_campaign)
- `funded_by` (company → investor)
- `competes_with` (company → company)

**Target Trajectory:**

| Month | Target | Rationale |
|-------|--------|-----------|
| 1-3 | 5 edges | Basic relationships (works_at, located_in) |
| 6 | 15 edges | Similarity edges, outcome edges |
| 12 | 25 edges | Temporal edges (hiring trends), competitive edges |
| 18 | 30+ edges | Mature graph, rich context for every company |

**SQL Query:**
```sql
-- Edge Density
WITH edge_counts AS (
  SELECT
    COALESCE(ce.source_id, ce.target_id) AS company_id,
    COUNT(*) AS edge_count
  FROM company_edges ce
  GROUP BY COALESCE(ce.source_id, ce.target_id)
)
SELECT
  ROUND(AVG(edge_count), 2) AS avg_edges_per_company,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY edge_count) AS median_edges,
  MIN(edge_count) AS min_edges,
  MAX(edge_count) AS max_edges,
  COUNT(*) AS companies_with_edges,
  (SELECT COUNT(*) FROM companies) AS total_companies
FROM edge_counts;
```

**How to Improve:**
- Generate similarity edges (compare embeddings, add edge if similarity >0.8)
- Track outcomes (add `replied_to`, `meeting_booked` edges)
- Scrape competitive data (add `competes_with` edges)
- Temporal edges (add `hiring_trend` if job posts increase)

---

### Metric 6: Outcome Lift

**Definition:** Meeting rate with UPR signals vs. baseline (random outreach).

**Formula:**
```
Outcome Lift = (Meeting Rate with UPR / Meeting Rate Baseline)
```

**Why It Matters:**
- Proves business value (this is what customers pay for)
- Validates our signal detection + ranking algorithms
- Measures quality of our data moat (better data → better outcomes)

**How to Measure:**
- **Baseline:** Random outreach to any company (no signals)
- **UPR:** Outreach to top 20 companies ranked by signal score

**Target Trajectory:**

| Month | Target | Rationale |
|-------|--------|-----------|
| 1-3 | 2x | Basic signals (funding, hiring) |
| 6 | 3x | Multi-signal ranking (funding + hiring + news) |
| 12 | 3.5x | Contextual bandits learning (optimize templates) |
| 18 | 4x+ | Proprietary signals (patterns no one else has) |

**Baseline Assumptions:**
- Cold email reply rate: 5%
- Reply → meeting rate: 30%
- Overall meeting rate (baseline): ~1.5%

**UPR Target:**
- Reply rate: 15% (3x better targeting)
- Reply → meeting rate: 40% (better messaging)
- Overall meeting rate: ~6% (4x baseline)

**SQL Query:**
```sql
-- Outcome Lift for Last 30 Days
WITH outcomes AS (
  SELECT
    oc.campaign_id,
    oc.result,
    oc.signal_score,
    CASE WHEN oc.signal_score > 0 THEN 'upr' ELSE 'baseline' END AS group_type
  FROM outreach_campaigns oc
  WHERE oc.sent_at >= NOW() - INTERVAL '30 days'
)
SELECT
  group_type,
  COUNT(*) AS total_outreach,
  COUNT(*) FILTER (WHERE result = 'meeting_booked') AS meetings_booked,
  ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'meeting_booked') / COUNT(*), 2) AS meeting_rate_pct
FROM outcomes
GROUP BY group_type;

-- Calculate lift:
-- Lift = (UPR meeting rate / Baseline meeting rate)
```

**How to Improve:**
- Better signal detection (more signal types, better scoring)
- Contextual bandits (learn which signals → meetings)
- Personalized messaging (GPT-4 with RAG context)
- Timing optimization (reach out right after signal detected)

---

### Metric 7: Cost per Lead

**Definition:** Fully-loaded cost per qualified lead (API + infra + people) / # leads generated.

**Formula:**
```
Cost per Lead = (API Costs + Infrastructure + Salaries/Hours) / # Leads
```

**Why It Matters:**
- Unit economics (must be <$1 to be sustainable)
- Measures efficiency of data moat (reuse rate → lower cost)
- Proves defensibility (competitors at $2/lead can't compete with our $0.20)

**Cost Breakdown:**
- **API Costs:** Apollo, SerpAPI, OpenAI, etc.
- **Infrastructure:** Google Cloud Run, Cloud SQL
- **People:** Engineering hours (amortized)

**Target Trajectory:**

| Month | Target | Rationale |
|-------|--------|-----------|
| 1-3 | $2.00 | 10% reuse rate, mostly external APIs |
| 6 | $1.00 | 35% reuse rate, batch optimizations |
| 12 | $0.50 | 65% reuse rate, cheaper fallback APIs |
| 18 | $0.20 | 70%+ reuse rate, mostly internal data |

**SQL Query:**
```sql
-- Cost per Lead for Last 30 Days
WITH costs AS (
  SELECT
    SUM(cost_usd) AS total_api_cost
  FROM api_usage
  WHERE timestamp >= NOW() - INTERVAL '30 days'
),
leads AS (
  SELECT COUNT(*) AS total_leads
  FROM outreach_campaigns
  WHERE sent_at >= NOW() - INTERVAL '30 days'
    AND result IN ('replied', 'meeting_booked', 'positive')
),
infra_cost AS (
  SELECT 50 AS monthly_infra_cost -- $50/month for Cloud Run + Cloud SQL
)
SELECT
  ROUND((costs.total_api_cost + (infra_cost.monthly_infra_cost / 30.0 * 30)) / NULLIF(leads.total_leads, 0), 2) AS cost_per_lead_usd,
  costs.total_api_cost,
  infra_cost.monthly_infra_cost / 30.0 * 30 AS infra_cost_30_days,
  leads.total_leads
FROM costs, leads, infra_cost;
```

**How to Improve:**
- Increase reuse rate (see Metric 1)
- Batch API calls (reduce per-query cost)
- Negotiate API pricing (volume discounts)
- Use cheaper fallback APIs (Hunter instead of Apollo for long-tail)

---

## Metric History

Track historical snapshots here. Update monthly.

### October 2025 (Baseline)

**Reporting Period:** October 1-17, 2025
**Queries This Month:** 12 (test queries only)
**New Customers:** 0
**Churn:** 0%

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **1. Reuse Rate** | 10% (cache hits) | 10% | 🟢 On track |
| **2. Freshness SLA** | N/A (no data yet) | <30 days | ⏸️ Pending |
| **3. Provenance Coverage** | N/A | 50% | ⏸️ Pending |
| **4. Resolution Time** | N/A | <48 hours | ⏸️ Pending |
| **5. Edge Density** | 0 edges | 5 edges | 🔴 Below target |
| **6. Outcome Lift** | N/A | 2x | ⏸️ Pending |
| **7. Cost per Lead** | N/A | $2.00 | ⏸️ Pending |

**Insights:**
- Phase 0 complete, infrastructure ready
- No real data yet (awaiting Phase 1-2)
- All systems operational

**Action Items:**
- [ ] Complete Phase 1 (Discovery) to populate companies
- [ ] Start tracking metrics after 100+ queries

---

### November 2025 (Month 1)

**Reporting Period:** November 1-30, 2025
**Queries This Month:** [TBD]
**New Customers:** [TBD]
**Churn:** [TBD]

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **1. Reuse Rate** | [TBD] | 10% | [TBD] |
| **2. Freshness SLA** | [TBD] | <30 days | [TBD] |
| **3. Provenance Coverage** | [TBD] | 50% | [TBD] |
| **4. Resolution Time** | [TBD] | <48 hours | [TBD] |
| **5. Edge Density** | [TBD] | 5 edges | [TBD] |
| **6. Outcome Lift** | [TBD] | 2x | [TBD] |
| **7. Cost per Lead** | [TBD] | $2.00 | [TBD] |

---

## Targets & Thresholds

### Color-Coded Status

| Status | Meaning | Criteria |
|--------|---------|----------|
| 🟢 **Green** | On track or exceeding | ≥90% of target |
| 🟡 **Yellow** | Needs attention | 70-89% of target |
| 🔴 **Red** | Critical, action required | <70% of target |
| ⏸️ **Paused** | Not yet applicable | Insufficient data |

### Monthly Targets (First 18 Months)

| Month | Reuse Rate | Freshness | Provenance | Resolution | Edge Density | Outcome Lift | Cost/Lead |
|-------|------------|-----------|------------|------------|--------------|--------------|-----------|
| 1 | 10% | <30d | 50% | <48h | 5 | 2x | $2.00 |
| 2 | 12% | <30d | 55% | <48h | 7 | 2x | $1.80 |
| 3 | 20% | <30d | 60% | <48h | 10 | 2x | $1.50 |
| 4 | 23% | <28d | 62% | <36h | 11 | 2.2x | $1.40 |
| 5 | 27% | <26d | 65% | <30h | 12 | 2.5x | $1.30 |
| 6 | 35% | <25d | 70% | <24h | 15 | 3x | $1.00 |
| 9 | 50% | <23d | 75% | <20h | 20 | 3.3x | $0.70 |
| 12 | 65% | <21d | 80% | <12h | 25 | 3.5x | $0.50 |
| 18 | 70%+ | <21d | 90%+ | <12h | 30+ | 4x | $0.20 |

---

## Dashboard Queries

### Real-Time Moat Health Dashboard

Run these queries to populate a live dashboard:

```sql
-- 1. Reuse Rate (Last 7 Days)
SELECT
  DATE(created_at) AS date,
  ROUND(100.0 * COUNT(*) FILTER (WHERE source = 'internal_kb') / COUNT(*), 2) AS reuse_rate_pct
FROM rag_queries
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date;

-- 2. Cost Trend (Last 30 Days)
SELECT
  DATE(timestamp) AS date,
  SUM(cost_usd) AS daily_cost_usd
FROM api_usage
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY date;

-- 3. Edge Growth (Last 30 Days)
SELECT
  DATE(created_at) AS date,
  COUNT(*) AS new_edges
FROM graph_edges
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;

-- 4. Top Reused Companies (Last 7 Days)
SELECT
  c.name,
  COUNT(*) AS query_count,
  MAX(rq.created_at) AS last_queried
FROM companies c
JOIN rag_documents rd ON rd.metadata->>'company_id' = c.id::text
JOIN rag_queries rq ON rq.id = rd.query_id
WHERE rq.created_at >= NOW() - INTERVAL '7 days'
  AND rq.source = 'internal_kb'
GROUP BY c.name
ORDER BY query_count DESC
LIMIT 20;

-- 5. Moat Health Score (Composite)
WITH metrics AS (
  SELECT
    (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE source = 'internal_kb') / NULLIF(COUNT(*), 0), 2)
     FROM rag_queries WHERE created_at >= NOW() - INTERVAL '30 days') AS reuse_rate,
    (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE source_count >= 2) / NULLIF(COUNT(*), 0), 2)
     FROM (SELECT COUNT(DISTINCT cm.source) AS source_count FROM company_metadata cm GROUP BY cm.company_id) sub) AS provenance,
    (SELECT ROUND(AVG(edge_count), 2)
     FROM (SELECT COUNT(*) AS edge_count FROM graph_edges GROUP BY source_id) sub) AS edge_density
)
SELECT
  ROUND((reuse_rate / 70.0 + provenance / 90.0 + LEAST(edge_density / 30.0, 1.0)) / 3.0 * 100, 2) AS moat_health_score
FROM metrics;
-- Moat Health Score: 0-100 (100 = all targets met)
```

---

## Notes

**Update Process:**
1. First Friday of each month, run all SQL queries
2. Copy monthly scorecard template
3. Fill in metrics, compare to targets
4. Write insights (what's working, what's not)
5. Define action items
6. Commit to repo, share with team

**Stakeholder Communication:**
- Monthly email: share scorecard + insights
- Quarterly review: deep dive on trends
- Board updates: focus on Moat Health Score (composite)

**Automation:**
- Build dashboard (Retool, Grafana, or custom React)
- Auto-run queries daily, visualize trends
- Alert if any metric drops below threshold (yellow/red)

---

*This is a living document. Update monthly to track progress toward data moat.*

**Last Updated:** October 17, 2025
**Next Update:** November 1, 2025
