# Sprint 19: RADAR Phase 3 - Multi-Source Orchestration

**Sprint Duration:** 2 weeks (Nov 12-26, 2025)
**Priority:** P1 - Enhanced Discovery Engine
**Goal:** Orchestrate multiple signal sources with intelligent prioritization and deduplication

---

## 🎯 Sprint Goal

Build a unified signal discovery pipeline that intelligently orchestrates multiple sources (News, LinkedIn, Job Boards, Social Media), eliminates duplicates, and prioritizes high-quality signals.

**Success Criteria:**
- Multi-source orchestration working
- Cross-source deduplication operational
- Source prioritization algorithm implemented
- Unified signal pipeline delivering 30+ unique signals/day
- Discovery Engine module: 0.9% → 15%+ complete

---

## 📋 Planned Tasks

### Task 1: Multi-Source Orchestrator (8h, P1)
**Goal:** Central orchestration service for all signal sources

**Deliverables:**
- `server/services/multiSourceOrchestrator.js`
- Source configuration (News, LinkedIn, Job Boards, Twitter/X)
- Parallel source execution
- Error handling and retry per source
- Source health monitoring

**Key Features:**
- Orchestrate 4+ signal sources concurrently
- Per-source timeout and retry logic
- Circuit breaker pattern for failing sources
- Source performance metrics

**Database:**
- `source_runs` table - Track each source execution
- `source_health` table - Monitor source reliability

---

### Task 2: Cross-Source Deduplication (6h, P1)
**Goal:** Eliminate duplicate signals across different sources

**Deliverables:**
- Deduplication algorithm
- Fuzzy matching for similar signals
- Duplicate detection using:
  - Company + Trigger Type
  - URL similarity
  - Description similarity (embeddings)
- Merge duplicate signals (keep highest confidence)

**Algorithm:**
```
1. Extract key fields (company, domain, trigger_type, description)
2. Create composite key: company_domain_trigger_hash
3. Calculate similarity scores:
   - Exact match: 1.0
   - Fuzzy company match: 0.8+
   - Description similarity (embeddings): 0.7+
4. If similarity > 0.7: Mark as duplicate, merge metadata
5. Keep signal with highest confidence score
```

**Database:**
- Add `duplicate_of` column to hiring_signals
- Add `dedupe_hash` column for quick lookups

---

### Task 3: Source Prioritization Engine (5h, P1)
**Goal:** Intelligently prioritize sources based on performance

**Deliverables:**
- Source scoring algorithm
- Dynamic source weights
- Priority queue execution
- Adaptive source selection

**Prioritization Factors:**
- Source reliability (uptime, error rate)
- Signal quality (avg confidence score)
- Freshness (time since last successful run)
- Cost per signal
- Historical success rate

**Algorithm:**
```
Source Priority Score =
  (Reliability × 0.3) +
  (Signal Quality × 0.4) +
  (Freshness × 0.2) +
  (Cost Efficiency × 0.1)

High priority sources run first and more frequently
```

---

### Task 4: Signal Quality Scoring (5h, P2)
**Goal:** Enhanced quality scoring across sources

**Deliverables:**
- Cross-source quality comparison
- Source-specific quality adjustments
- Quality decay over time
- Quality boost for multi-source validation

**Quality Factors:**
- Base confidence score (existing)
- Source reliability modifier
- Multi-source validation bonus (+0.1 if found in 2+ sources)
- Freshness decay (-0.05 per week)
- Engagement metrics (LinkedIn reactions, news shares)

---

### Task 5: Unified Signal Pipeline (6h, P1)
**Goal:** Single endpoint for all signal discovery

**Deliverables:**
- `POST /api/radar/discover` - Unified discovery endpoint
- Pipeline configuration
- Source selection logic
- Results aggregation
- Performance monitoring

**Pipeline Flow:**
```
1. Receive discovery request (optional: source preferences)
2. Select sources based on priority scores
3. Execute sources in parallel (up to 4 concurrent)
4. Collect results from all sources
5. Apply deduplication
6. Calculate quality scores
7. Save to database
8. Return aggregated results
```

**Response:**
```json
{
  "success": true,
  "discovery_id": "uuid",
  "sources_executed": ["news", "linkedin", "job_boards"],
  "signals_discovered": 45,
  "signals_unique": 32,
  "duplicates_removed": 13,
  "execution_time_ms": 8500,
  "signals": [...]
}
```

---

### Task 6: Source Configuration Dashboard (4h, P2)
**Goal:** Admin UI for managing signal sources

**Deliverables:**
- Source configuration page
- Enable/disable sources
- View source health metrics
- Adjust source priorities
- Test individual sources

**Dashboard Features:**
- Source status (active, inactive, failing)
- Health metrics (uptime, error rate, signals/day)
- Performance charts (response time, success rate)
- Manual source execution (testing)
- Source configuration (API keys, limits)

**Location:** `/admin/sources`

---

## 🏗️ Architecture

### Multi-Source Orchestration

```
┌─────────────────────────────────────────────────────────────┐
│            Multi-Source Orchestration Layer                  │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
         ┌──────▼────────┐         ┌────────▼───────┐
         │ Orchestrator  │         │ Prioritization │
         │   Service     │◄────────│    Engine      │
         └──────┬────────┘         └────────────────┘
                │
    ┌───────────┼────────────┐
    │           │            │
┌───▼────┐ ┌───▼────┐ ┌────▼───┐ ┌────▼────┐
│  News  │ │LinkedIn│ │  Jobs  │ │Twitter/X│
│ Source │ │ Source │ │ Source │ │ Source  │
└───┬────┘ └───┬────┘ └────┬───┘ └────┬────┘
    │          │            │          │
    └──────────┴────────────┴──────────┘
                      │
              ┌───────▼────────┐
              │ Deduplication  │
              │    Engine      │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  Quality       │
              │  Scoring       │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  PostgreSQL    │
              │  hiring_signals│
              └────────────────┘
```

---

## 📊 Expected Outcomes

### Discovery Improvements
- **Signal Volume:** 10-15/day → 30-50/day (3-5x increase)
- **Unique Signals:** 70%+ (after deduplication)
- **High Quality Signals:** 40%+ with confidence > 0.7
- **Source Diversity:** 4+ active sources

### Performance Targets
- **Discovery Latency:** < 10 seconds (parallel execution)
- **Deduplication Accuracy:** > 90%
- **Source Uptime:** > 95% per source
- **Cost per Signal:** < $0.15

### Module Progress
- **Discovery Engine:** 0.9% → 15%+ complete
- **Overall Project:** 34% → 40%+

---

## 🔧 Technical Stack

**New Services:**
- Multi-Source Orchestrator
- Deduplication Engine
- Source Prioritization Engine
- Quality Scoring Service

**New Database Tables:**
- `source_runs` - Execution tracking
- `source_health` - Health monitoring
- `signal_duplicates` - Duplicate relationships

**New Columns:**
- `hiring_signals.duplicate_of` - Link to canonical signal
- `hiring_signals.dedupe_hash` - Deduplication key
- `hiring_signals.source_count` - Number of sources found in
- `hiring_signals.quality_score` - Enhanced quality metric

**APIs:**
- POST /api/radar/discover - Unified discovery
- GET /api/radar/sources - Source configuration
- POST /api/radar/sources/:id/test - Test individual source
- GET /api/radar/sources/:id/health - Source health metrics

---

## 🎯 Success Metrics

**Discovery Quality:**
- [ ] 30+ unique signals/day discovered
- [ ] 70%+ deduplication accuracy
- [ ] 40%+ high-quality signals (confidence > 0.7)
- [ ] < 10s average discovery time

**Source Performance:**
- [ ] 4+ sources operational
- [ ] 95%+ source uptime
- [ ] < 2% error rate per source
- [ ] Intelligent source prioritization working

**Code Quality:**
- [ ] 2,000+ lines of orchestration code
- [ ] Comprehensive error handling
- [ ] Source health monitoring
- [ ] Admin dashboard functional

**Documentation:**
- [ ] Multi-source architecture documented
- [ ] Deduplication algorithm explained
- [ ] Source configuration guide
- [ ] Task completion reports (6 tasks)

---

## 📝 Integration Points

### Builds On (Sprint 18):
- Cloud Scheduler (Task 4) - Scheduled discovery
- LinkedIn Signal Source (Task 5) - One of the sources
- Signal Confidence Scoring (Task 7) - Quality baseline
- Error Recovery Dashboard (Task 8) - Source error monitoring

### Enables (Future Sprints):
- RADAR Phase 4: Real-time Signal Streaming
- Advanced Analytics: Cross-source insights
- Machine Learning: Signal quality prediction
- Automated Outreach: High-quality signal triggers

---

## ⚠️ Risks & Mitigations

**Risk 1: Source API Rate Limits**
- Mitigation: Implement rate limiting per source, priority queuing
- Fallback: Manual CSV import, cached data

**Risk 2: Deduplication Accuracy**
- Mitigation: Use multiple matching strategies (exact, fuzzy, embedding)
- Fallback: Manual deduplication review in admin dashboard

**Risk 3: Source Failures**
- Mitigation: Circuit breaker pattern, independent source execution
- Fallback: Continue with available sources, retry failed sources

**Risk 4: Performance Degradation**
- Mitigation: Parallel execution, caching, database indexing
- Fallback: Sequential execution with longer timeout

---

## 📅 Timeline

**Week 1 (Nov 12-18):**
- Day 1-2: Task 1 (Multi-Source Orchestrator)
- Day 3: Task 2 (Deduplication)
- Day 4-5: Task 3 (Prioritization)

**Week 2 (Nov 19-26):**
- Day 1-2: Task 4 (Quality Scoring)
- Day 3: Task 5 (Unified Pipeline)
- Day 4-5: Task 6 (Dashboard) + Documentation + Testing

---

## 🚀 Ready to Start!

**Next Steps:**
1. Review and approve sprint plan
2. Start with Task 1: Multi-Source Orchestrator
3. Create task tracking in Notion
4. Update SPRINT_19_HANDOFF.md as we progress

---

**Sprint 19 Status:** Ready to Begin
**Priority:** RADAR Phase 3 - Multi-Source Orchestration
**Estimated Hours:** 34 hours over 2 weeks
**Expected Completion:** November 26, 2025
