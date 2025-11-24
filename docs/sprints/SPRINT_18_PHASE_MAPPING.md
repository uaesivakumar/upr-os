# Sprint 18: Phase-to-Task Mapping

**Sprint Goal:** RADAR Automation + Production Reliability
**Duration:** 2 weeks (29 hours total)
**Status:** Active
**Started:** 2025-11-09

---

## Phase Breakdown

### Phase 3: RADAR Automation (11 hours)

#### Task 4: Automated RADAR Scheduling
- **ETA:** 4 hours
- **Priority:** P1 (High)
- **Type:** Feature
- **Dependencies:** None
- **Status:** Not Started
- **Description:** Cloud Scheduler for daily RADAR runs at 9 AM Dubai time
- **Implementation:**
  - Create Cloud Scheduler job (cron: `0 9 * * *`)
  - Budget cap: $5 per run (safety limit)
  - Email digest of discoveries sent to user
  - Error notifications via Sentry
  - Run history tracking in database
- **Business Value:** Continuous automated lead discovery, 10+ signals/day, reduced manual effort

#### Task 5: LinkedIn Signal Source
- **ETA:** 7 hours
- **Priority:** P2 (Medium)
- **Type:** Feature
- **Dependencies:** Task 4 (for automated scheduling)
- **Status:** Not Started
- **Description:** Add LinkedIn company updates as RADAR signal source
- **Signal Types:**
  1. Company announcements (funding, acquisitions, expansions)
  2. Leadership changes (new C-level hires)
  3. Executive hires (VP+ level)
  4. Office openings (geographical expansion)
  5. Product launches (new offerings)
- **API:** RapidAPI LinkedIn Company Profile API (~$30-50/month)
- **Business Value:** More comprehensive signal coverage, higher quality leads, professional network data

---

### Phase 4: Webhook Reliability (3 hours)

#### Task 6: Webhook Retry Logic
- **ETA:** 3 hours
- **Priority:** P1 (High)
- **Type:** Infrastructure
- **Dependencies:** None
- **Status:** Not Started
- **Description:** Exponential backoff for failed webhook deliveries
- **Implementation:**
  - Use Bull MQ for retry queue
  - Exponential backoff strategy:
    - Attempt 1: Immediate
    - Attempt 2: 1 minute delay
    - Attempt 3: 5 minutes delay
    - Attempt 4: 15 minutes delay
    - Attempt 5: 1 hour delay
  - Dead letter queue for permanently failed webhooks
  - Admin dashboard shows retry stats
- **Business Value:** Resilient webhook delivery, zero data loss, automatic recovery from transient failures

---

### Phase 5: Signal Intelligence (5 hours)

#### Task 7: Signal Confidence Scoring
- **ETA:** 5 hours
- **Priority:** P1 (High)
- **Type:** Feature
- **Dependencies:** None
- **Status:** Not Started
- **Description:** Add confidence scores to RADAR signals based on source quality
- **Confidence Factors:**
  1. Source credibility (40%):
     - LinkedIn: 0.9
     - Job boards: 0.8
     - News articles: 0.7
     - Social media: 0.5
     - Unknown: 0.3
  2. Signal freshness (30%):
     - < 24 hours: 1.0
     - 1-7 days: 0.8
     - 7-30 days: 0.5
     - > 30 days: decay curve
  3. Data completeness (30%):
     - All fields present: 1.0
     - Partial data: proportional
- **Output:** Score 0-100, displayed as High/Medium/Low in UI
- **Business Value:** Intelligent signal prioritization, improved lead quality, data-driven sales decisions

---

### Phase 6: Production Monitoring (10 hours)

#### Task 8: Error Recovery Dashboard
- **ETA:** 6 hours
- **Priority:** P2 (Medium)
- **Type:** Feature
- **Dependencies:** Task 6 (webhook retry logic)
- **Status:** Not Started
- **Description:** Admin UI for viewing and retrying failed operations
- **Features:**
  1. Failed Operations List:
     - Enrichment failures
     - Webhook delivery failures
     - RADAR scan errors
     - Filter by type, date, error message
  2. Manual Retry:
     - Single retry button per operation
     - Bulk retry (select multiple)
     - Retry all failed operations
  3. Error Analytics:
     - Error rate over time (chart)
     - Top error types (pie chart)
     - Success/failure distribution
     - Cost impact (failed operations that cost money)
- **UI Route:** `/admin/errors`
- **Business Value:** Proactive issue detection, rapid recovery, reduced downtime, cost visibility

#### Task 9: Production Monitoring
- **ETA:** 4 hours
- **Priority:** P1 (High)
- **Type:** Infrastructure
- **Dependencies:** None
- **Status:** Not Started
- **Description:** Comprehensive monitoring and alerting setup
- **Components:**
  1. Cloud Monitoring Dashboards:
     - Request rate, error rate, latency (p50, p95, p99)
     - Cloud Run instance count, CPU, memory
     - Database connections, query latency
     - RADAR scan success rate
  2. Sentry Alerts:
     - Error rate > 5% (1 hour window)
     - New error type detected
     - Performance regression (p95 > 3s)
  3. Cost Tracking:
     - Daily cost summary email
     - Budget alert at $100/month threshold
     - Per-service cost breakdown
     - External API cost tracking (LinkedIn, Hunter.io)
  4. SLO Tracking:
     - Availability: 99.5% uptime
     - Performance: p95 < 2.5s, p99 < 3s
     - Error rate: < 1%
     - RADAR: 10+ signals/day
- **Business Value:** Proactive issue detection, SLO compliance, cost control, performance visibility

---

## Notion Organization

### How to View in Notion:

1. **SPRINTS Database:**
   - Sprint 17: Marked as "Complete" with full details
   - Sprint 18: Marked as "Active" with all task info
   - Columns filled: Started At, Goal, Business Value, Phases Updated

2. **MODULE FEATURES Database:**
   - Phase 12: Lead Scoring Engine - **Complete** ✅
   - Phase 3: RADAR Automation - **In Progress** (Tasks 4-5)
   - Phase 4: Webhook Reliability - **Not Started** (Task 6)
   - Phase 5: Signal Intelligence - **Not Started** (Task 7)
   - Phase 6: Production Monitoring - **Not Started** (Tasks 8-9)

3. **Clear Task Ownership:**
   Each phase entry in MODULE FEATURES includes:
   - Sprint number (18)
   - Task number and name
   - ETA hours
   - Dependencies
   - Business value
   - Detailed implementation notes

---

## Sprint 18 Success Criteria

### Must Complete (100% Required)
- [ ] RADAR automated (daily runs successful)
- [ ] Webhook retry logic operational
- [ ] Signal confidence scoring active
- [ ] Production monitoring dashboards live

### Should Complete (80% Target)
- [ ] LinkedIn signal source integrated
- [ ] Error recovery dashboard functional
- [ ] SLO alerts configured

### Nice to Have (50% Stretch)
- [ ] Additional signal sources (Twitter)
- [ ] Advanced signal analytics
- [ ] Mobile-responsive error dashboard

---

## Budget & Cost Management

**Estimated Sprint 18 Costs:**
- LinkedIn API: $30-50/month (RapidAPI)
- Redis (Bull MQ): Free tier sufficient
- Cloud Monitoring: Included in GCP free tier
- **Total Additional:** ~$50-70/month

**Current Monthly Budget:** $120
**Available for Sprint 18:** ~$50-70 (remainder after GCP costs)

---

## Next Steps

1. **Start with Task 4** (RADAR Scheduling) - quick win, 4 hours
2. **Then Task 6** (Webhook Retry) - foundational for reliability
3. **Then Task 7** (Confidence Scoring) - enhances RADAR output
4. **Then Task 9** (Monitoring) - critical for production stability
5. **Then Task 5** (LinkedIn) - most complex, needs focus time
6. **Finally Task 8** (Error Dashboard) - nice-to-have, defer if needed

---

**Last Updated:** 2025-11-10
**Document:** SPRINT_18_PHASE_MAPPING.md
**Purpose:** Clear phase-to-task mapping for Notion organization
