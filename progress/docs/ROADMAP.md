# UPR Product Roadmap (12-18 Months)

**Last Updated:** October 17, 2025
**Planning Horizon:** October 2025 - March 2027
**Status:** Living Document

---

## Table of Contents
- [Overview](#overview)
- [Execution Principles](#execution-principles)
- [Phase 0: Foundation (Week 0)](#phase-0-foundation-week-0)
- [Phase 1: Discovery (Weeks 1-2)](#phase-1-discovery-weeks-1-2)
- [Phase 2: Enrichment (Weeks 3-4)](#phase-2-enrichment-weeks-3-4)
- [Phase 3: Signals (Weeks 5-6)](#phase-3-signals-weeks-5-6)
- [Phase 4: Outreach (Weeks 7-8)](#phase-4-outreach-weeks-7-8)
- [Phase 5: Follow-Ups (Weeks 9-10)](#phase-5-follow-ups-weeks-9-10)
- [Phase 6: Dashboard (Weeks 11-12)](#phase-6-dashboard-weeks-11-12)
- [Phase 7: Learning (Weeks 13-14)](#phase-7-learning-weeks-13-14)
- [Phase 8: Scale (Weeks 15-16)](#phase-8-scale-weeks-15-16)
- [Quarterly Milestones (Q1-Q6)](#quarterly-milestones-q1-q6)
- [Dependencies & Risks](#dependencies--risks)

---

## Overview

**Mission:** Build a defensible data moat for B2B sales intelligence in 12-18 months.

**Strategy:** Ship fast, learn from real users, compound data advantages.

**Target:** 70%+ reuse rate (internal KB vs external APIs) by Month 18.

---

## Execution Principles

1. **Ship Early, Ship Often**
   - 2-week sprints, always shippable
   - Real customer feedback over perfect architecture
   - MVP → iterate, not waterfall

2. **Data First**
   - Every feature must feed the knowledge graph
   - Measure reuse rate weekly
   - Optimize for data accumulation velocity

3. **Customer-Driven**
   - Onboard 1-2 customers per phase
   - Direct feedback shapes next phase
   - No feature without customer ask

4. **Sustainable Pace**
   - 3-5 day phases, not 3-month marathons
   - Technical debt tracked explicitly
   - 20% time for refactoring/cleanup

---

## Phase 0: Foundation (Week 0)

**Status:** ✅ COMPLETED (October 17, 2025)

**Goal:** Production-ready infrastructure + RAG core + 6 APIs wired

### Deliverables:
- [x] Database schema (pgvector + RAG tables)
- [x] API integrations (Apollo, SerpAPI, NeverBounce, Reddit, etc.)
- [x] RAG service (query, embed, retrieve)
- [x] Entity resolution logic (company/person deduplication)
- [x] Knowledge graph schema (nodes + edges)
- [x] Deployment on Google Cloud Run
- [x] Monitoring/logging (Google Cloud Logging)

### Success Metrics:
- 100% API health checks passing ✅
- RAG query latency <500ms ✅
- Entity resolution accuracy >95% ✅

### Dependencies:
- None (greenfield project)

### Estimated Timeline:
- **Planned:** 3-5 days
- **Actual:** 5 days (completed October 17, 2025)

---

## Phase 1: RADAR - Discovery (Weeks 1-2)

**Target:** October 18-31, 2025
**Goal:** Automated nightly company discovery from 3+ sources using RADAR

### Deliverables:

#### 1.1 RADAR Agent (Week 1)
- [ ] `RADARAgent` class with pluggable sources
- [ ] Apollo company search integration
- [ ] SerpAPI scraping for UAE companies
- [ ] Reddit/Twitter monitoring for company mentions
- [ ] Deduplication logic (match by domain + name)
- [ ] Batch insert to `companies` table

#### 1.2 Nightly RADAR Jobs (Week 2)
- [ ] Cron job for nightly RADAR discovery runs
- [ ] Source prioritization (Apollo → SerpAPI → Social)
- [ ] Error handling + retry logic
- [ ] Slack notifications for new discoveries
- [ ] Weekly summary report (# new companies, sources)

#### 1.3 RAG Integration
- [ ] Embed company profiles → vector store
- [ ] Query: "Find companies like [example]"
- [ ] Similarity search (top 10 matches)

### Success Metrics:
- **KPI:** 500+ UAE companies in database (Week 2)
- **Reuse Rate:** 15% (mostly exact match cache hits)
- **Latency:** RADAR job completes in <10 minutes
- **Quality:** 90%+ valid companies (not spam/duplicates)

### Dependencies:
- Phase 0 complete ✅
- Apollo API key active
- SerpAPI quota sufficient (1000 searches/month)

### Customer Impact:
- Sales teams can query: "Show me fintech companies in Dubai with 50-200 employees"
- Answer in <2 seconds vs. 10 minutes of manual LinkedIn searching

### Estimated Timeline: 2 weeks

---

## Phase 2: Enrichment (Weeks 3-4)

**Target:** November 1-14, 2025
**Goal:** Automated contact enrichment + real-time data refresh

### Deliverables:

#### 2.1 Enrichment Agent (Week 3)
- [ ] `EnrichmentAgent` class
- [ ] Apollo contact enrichment (email, phone, LinkedIn)
- [ ] NeverBounce email verification
- [ ] Hunter.io email finder (fallback)
- [ ] Person entity resolution (dedupe across sources)
- [ ] Insert to `people` + `company_people` edges

#### 2.2 Freshness Logic (Week 4)
- [ ] Staleness detection (if `last_updated` >30 days, re-enrich)
- [ ] Incremental updates (only changed fields)
- [ ] Provenance tracking (store which API provided each field)
- [ ] Confidence scores (multi-source validation)
- [ ] Conflict resolution UI (if emails don't match)

#### 2.3 RAG Integration
- [ ] Embed person profiles → vector store
- [ ] Query: "Find contacts at [company] who are decision-makers"
- [ ] Ranked by recency + confidence

### Success Metrics:
- **KPI:** 2,000+ contacts enriched (Week 4)
- **Reuse Rate:** 25% (cached enrichment + embeddings)
- **Freshness SLA:** <30 day median age
- **Provenance:** 80%+ records with 2+ sources

### Dependencies:
- Phase 1 complete (need companies to enrich)
- Apollo/NeverBounce API quota (5000 enrichments/month)

### Customer Impact:
- Query: "Get me emails for CFOs at Series A fintech companies"
- Answer: Verified emails for 20 contacts in <5 seconds

### Estimated Timeline: 2 weeks

---

## Phase 3: Signals (Weeks 5-6)

**Target:** November 15-28, 2025
**Goal:** Detect high-intent signals (funding, hiring, news)

### Deliverables:

#### 3.1 Signal Detection (Week 5)
- [ ] `SignalAgent` class
- [ ] Funding signals (Crunchbase, news scraping)
- [ ] Hiring signals (LinkedIn job posts, Greenhouse APIs)
- [ ] News signals (Google News API, RSS feeds)
- [ ] Leadership changes (LinkedIn tracking)
- [ ] Office expansions (Google Maps updates)
- [ ] Insert to `signals` table with `signal_type` + `score`

#### 3.2 Ranking Algorithm (Week 6)
- [ ] Composite score: recency + signal type + company fit
- [ ] Weight tuning (funding = 10, hiring = 5, news = 2)
- [ ] Time decay (signals lose value over time)
- [ ] Query: "Show me hottest leads this week"
- [ ] Dashboard widget for top 20 signals

#### 3.3 RAG Integration
- [ ] Embed signal text → vector store
- [ ] Query: "Companies hiring for sales roles in Dubai"
- [ ] Cross-reference signals with enriched contacts

### Success Metrics:
- **KPI:** 100+ signals detected per week
- **Reuse Rate:** 35% (signal cache + historical patterns)
- **Precision:** 70%+ signals lead to valid outreach
- **Latency:** Signal detection job runs in <15 minutes

### Dependencies:
- Phase 2 complete (need companies + contacts)
- Crunchbase API access (or workaround with scraping)

### Customer Impact:
- Query: "Which companies should I reach out to today?"
- Answer: Top 20 ranked by composite signal score with reasoning

### Estimated Timeline: 2 weeks

---

## Phase 4: Outreach (Weeks 7-8)

**Target:** November 29 - December 12, 2025
**Goal:** AI-generated personalized outreach messages

### Deliverables:

#### 4.1 Outreach Templates (Week 7)
- [ ] `OutreachAgent` class
- [ ] GPT-4 integration for message generation
- [ ] Template library (cold email, LinkedIn InMail, warm intro)
- [ ] Personalization variables (company, signal, shared connection)
- [ ] A/B testing framework (track which templates work)
- [ ] Preview UI (show generated message before sending)

#### 4.2 Outreach Tracking (Week 8)
- [ ] `outreach_campaigns` table
- [ ] Track: sent, opened, replied, meeting_booked
- [ ] CRM integration (log activities to HubSpot/Salesforce)
- [ ] Reply detection (webhook from email provider)
- [ ] Sentiment analysis on replies (positive/negative/neutral)

#### 4.3 RAG Integration
- [ ] Query: "Generate email for [company] mentioning [signal]"
- [ ] Use RAG to pull relevant context (past outreach, industry news)
- [ ] Avoid repetitive messaging (check history)

### Success Metrics:
- **KPI:** 500+ outreach messages generated (Week 8)
- **Reuse Rate:** 40% (reuse templates, cached contexts)
- **Open Rate:** 40%+ (industry average is 20-25%)
- **Reply Rate:** 10%+ (industry average is 2-5%)

### Dependencies:
- Phase 3 complete (need signals for personalization)
- GPT-4 API access + budget ($0.01/message)
- Email sending infrastructure (SendGrid/Mailgun)

### Customer Impact:
- Query: "Draft outreach for top 10 companies this week"
- Answer: 10 personalized emails with signal-based hooks

### Estimated Timeline: 2 weeks

---

## Phase 5: Follow-Ups (Weeks 9-10)

**Target:** December 13-26, 2025
**Goal:** Automated follow-up sequences + reply intelligence

### Deliverables:

#### 5.1 Follow-Up Logic (Week 9)
- [ ] Multi-touch sequences (Day 0, Day 3, Day 7, Day 14)
- [ ] Conditional logic (if opened but no reply → send follow-up)
- [ ] Escalation (if no reply after 3 touches, mark as "cold")
- [ ] Unsubscribe handling (respect opt-outs)
- [ ] Throttling (max 50 emails/day per sender)

#### 5.2 Reply Intelligence (Week 10)
- [ ] GPT-4 reply classification (positive, neutral, objection, unsubscribe)
- [ ] Suggested responses (draft reply based on sentiment)
- [ ] Meeting booking detection (if reply mentions "call" or "meeting")
- [ ] Auto-tag outcomes (meeting_booked, not_interested, wrong_timing)
- [ ] Feed outcomes to knowledge graph

#### 5.3 RAG Integration
- [ ] Query: "What's the status of outreach to [company]?"
- [ ] Return full thread history + sentiment + next action

### Success Metrics:
- **KPI:** 3x meeting rate (10% reply → 30% with follow-ups)
- **Reuse Rate:** 45% (reuse follow-up logic + cached threads)
- **Automation:** 80%+ follow-ups sent automatically
- **Precision:** 90%+ accurate sentiment classification

### Dependencies:
- Phase 4 complete (need initial outreach)
- Email reply webhook integration

### Customer Impact:
- Query: "Which leads should I follow up with today?"
- Answer: 15 companies with suggested next actions

### Estimated Timeline: 2 weeks

---

## Phase 6: Dashboard (Weeks 11-12)

**Target:** December 27, 2025 - January 9, 2026
**Goal:** Real-time dashboard for sales teams

### Deliverables:

#### 6.1 Frontend Build (Week 11)
- [ ] React dashboard (Vite + Tailwind CSS)
- [ ] Company search with filters (industry, size, location)
- [ ] Contact enrichment UI (show provenance badges)
- [ ] Signal feed (real-time updates)
- [ ] Outreach campaign tracker
- [ ] Analytics page (reuse rate, cost per lead)

#### 6.2 Admin Panel (Week 12)
- [ ] User management (add/remove team members)
- [ ] API quota monitoring
- [ ] Knowledge graph visualizer (D3.js)
- [ ] RAG query debugger (show sources used)
- [ ] Export functionality (CSV, JSON)

#### 6.3 Mobile Responsive
- [ ] Mobile-first design
- [ ] Push notifications for hot signals
- [ ] Quick actions (approve/reject AI drafts)

### Success Metrics:
- **KPI:** 10 active users daily (Week 12)
- **Reuse Rate:** 50% (dashboard queries hit internal KB)
- **Load Time:** <2 seconds for search results
- **Uptime:** 99.5%+ (Google Cloud Run SLA)

### Dependencies:
- Phases 1-5 APIs stable
- Frontend developer available (or allocate 2 weeks solo)

### Customer Impact:
- Sales teams can self-serve without API calls
- Dashboard becomes daily driver (replace LinkedIn + Apollo tabs)

### Estimated Timeline: 2 weeks

---

## Phase 7: Learning (Weeks 13-14)

**Target:** January 10-23, 2026
**Goal:** Outcome feedback loop + contextual bandits

### Deliverables:

#### 7.1 Outcome Tracking (Week 13)
- [ ] `outcomes` table (company, person, campaign, result, timestamp)
- [ ] Integration with calendar APIs (detect meetings booked)
- [ ] CRM sync (pull closed deals from HubSpot/Salesforce)
- [ ] Manual tagging UI (mark leads as "won" or "lost")
- [ ] Cohort analysis (which signals → best outcomes)

#### 7.2 Contextual Bandits (Week 14)
- [ ] Multi-armed bandit algorithm (Thompson sampling)
- [ ] Feature vectors: [company_size, industry, signal_type, message_template]
- [ ] Reward: 1 if meeting_booked, 0 if no reply
- [ ] Continuous learning (update priors after every campaign)
- [ ] A/B test dashboard (show winning vs. losing variants)

#### 7.3 RAG Integration
- [ ] Query: "What outreach strategy works best for fintech companies?"
- [ ] Answer: Ranked list with confidence intervals

### Success Metrics:
- **KPI:** 15% improvement in meeting rate (Week 14 vs. Week 8)
- **Reuse Rate:** 55% (historical outcome patterns reused)
- **Prediction Accuracy:** 70%+ (predict meeting likelihood)
- **Automation:** Model suggests best signal + template combination

### Dependencies:
- Phase 4-5 complete (need outcome data)
- 1000+ outreach attempts (minimum data for bandits)

### Customer Impact:
- Query: "Optimize my outreach for Q1"
- Answer: "Use template B for Series A companies, template A for bootstrapped"

### Estimated Timeline: 2 weeks

---

## Phase 8: Scale (Weeks 15-16)

**Target:** January 24 - February 6, 2026
**Goal:** 10x capacity + cost optimization

### Deliverables:

#### 8.1 Performance Optimization (Week 15)
- [ ] Database indexing (pgvector HNSW tuning)
- [ ] Query caching (Redis layer)
- [ ] Batch processing (queue enrichment jobs)
- [ ] Rate limiting (throttle API calls to save quota)
- [ ] Load testing (simulate 1000 concurrent users)

#### 8.2 Cost Optimization (Week 16)
- [ ] API call auditing (which endpoints cost most)
- [ ] Reuse rate optimization (target 70%+)
- [ ] Cheaper fallback APIs (when primary is expensive)
- [ ] Tiered pricing (free tier = limited APIs, pro = full access)
- [ ] ROI calculator (show cost savings vs. manual research)

#### 8.3 Multi-Tenancy
- [ ] Workspace isolation (each customer has own namespace)
- [ ] SSO integration (Google/Microsoft OAuth)
- [ ] Usage-based billing (Stripe integration)
- [ ] White-label option (custom branding)

### Success Metrics:
- **KPI:** 100 concurrent users without degradation
- **Reuse Rate:** 60%+ (sustained)
- **Cost per Lead:** $0.50 (down from $2.00 in Phase 0)
- **Gross Margin:** 60%+

### Dependencies:
- All previous phases stable
- Customer base >10 to justify multi-tenancy

### Customer Impact:
- Onboard 50+ customers without infrastructure rewrites
- Transparent pricing (show cost savings in dashboard)

### Estimated Timeline: 2 weeks

---

## Quarterly Milestones (Q1-Q6)

### Q1: Product-Market Fit (Months 1-3)
**Timeline:** October 2025 - December 2025

**Goal:** Prove 3x meeting rate improvement with 10 customers

**Key Deliverables:**
- Phases 0-5 complete (Foundation → Follow-Ups)
- 10 paying customers ($333/month each)
- 50,000+ queries in knowledge base
- First customer case study

**Success Metrics:**
- MRR: $3,300
- Reuse Rate: 35%
- Meeting Rate: 30% (vs. 10% baseline)
- Churn: <20%

**Risks:**
- Slow customer acquisition
- Integration complexity with CRMs
- Data quality issues (spam, duplicates)

---

### Q2: Growth & Refinement (Months 4-6)
**Timeline:** January 2026 - March 2026

**Goal:** Scale to 50 customers, optimize unit economics

**Key Deliverables:**
- Phases 6-8 complete (Dashboard → Scale)
- 50 paying customers ($333-833/month tiered pricing)
- 500,000+ queries in knowledge base
- Automated onboarding flow
- Mobile app (iOS/Android)

**Success Metrics:**
- MRR: $25,000
- Reuse Rate: 50%
- Cost per Lead: $0.50
- Gross Margin: 60%
- CAC Payback: 6 months

**Risks:**
- Infrastructure scaling challenges
- API quota limits
- Competitive response

---

### Q3: Market Dominance (Months 7-9)
**Timeline:** April 2026 - June 2026

**Goal:** Become default UAE B2B intelligence layer

**Key Deliverables:**
- 150+ customers
- 2M+ queries in knowledge base
- Public API (let other tools integrate)
- Zapier/Make.com integrations
- Marketplace (3rd-party signal plugins)

**Success Metrics:**
- MRR: $75,000
- Reuse Rate: 60%
- NPS: 50+
- Logo retention: 90%+
- Inbound leads: 50/month

**Risks:**
- Market saturation (UAE is small)
- Need to expand to Saudi/Qatar
- Pricing pressure from competitors

---

### Q4: Geographic Expansion (Months 10-12)
**Timeline:** July 2026 - September 2026

**Goal:** Launch in Saudi Arabia + Qatar

**Key Deliverables:**
- Saudi/Qatar company discovery agents
- Arabic language support (RTL UI)
- Local payment methods (Mada, etc.)
- Regional partnerships (distribute through local agencies)
- 300+ customers across GCC

**Success Metrics:**
- MRR: $150,000
- Reuse Rate: 65%
- 40% revenue from non-UAE markets
- 5M+ queries in knowledge base

**Risks:**
- Regulatory challenges (data residency)
- Cultural/language nuances
- Go-to-market complexity

---

### Q5: Platform Maturity (Months 13-15)
**Timeline:** October 2026 - December 2026

**Goal:** Open platform, developer ecosystem

**Key Deliverables:**
- Public API with 100+ integrations
- Developer docs + SDKs (Python, JavaScript)
- Webhooks (real-time signal notifications)
- Custom signal plugins (let customers build own)
- Enterprise tier (dedicated instances, SLAs)

**Success Metrics:**
- MRR: $250,000
- Reuse Rate: 70%+
- 10M+ queries in knowledge base
- 50+ API-only customers
- Gross Margin: 75%

**Risks:**
- Platform complexity (support burden)
- API abuse (rate limiting, security)
- Enterprise sales cycle (6-12 months)

---

### Q6: Funding & Scale (Months 16-18)
**Timeline:** January 2027 - March 2027

**Goal:** Series A raise ($5-10M), 10x scale

**Key Deliverables:**
- 1000+ customers
- $500K+ MRR
- Series A pitch deck + roadshow
- Hire 10-person team (eng, sales, support)
- International expansion (India, Singapore)

**Success Metrics:**
- ARR: $6M+
- Reuse Rate: 70%+
- 50M+ queries in knowledge base
- Valuation: $30-50M (5-8x ARR)

**Risks:**
- Fundraising climate (investor appetite)
- Team scaling (hiring quality talent)
- Operational complexity (multi-region, multi-product)

---

## Dependencies & Risks

### Critical Path Dependencies:

```
Phase 0 (Foundation)
    ↓
Phase 1 (Discovery) ────→ Need companies to enrich
    ↓
Phase 2 (Enrichment) ───→ Need contacts for signals
    ↓
Phase 3 (Signals) ──────→ Need signals for outreach
    ↓
Phase 4 (Outreach) ─────→ Need outreach for follow-ups
    ↓
Phase 5 (Follow-Ups) ───→ Need outcomes for learning
    ↓
Phase 7 (Learning) ─────→ Need data for optimization
    ↓
Phase 8 (Scale)
```

### External Dependencies:

| Dependency | Risk | Mitigation |
|------------|------|------------|
| Apollo API | Rate limits, pricing changes | Cache aggressively, build fallbacks |
| SerpAPI | Quota exhaustion | Batch queries, prioritize high-value |
| NeverBounce | Accuracy degradation | Multi-source validation |
| GPT-4 API | Cost, latency | Fine-tune smaller model, cache templates |
| Google Cloud | Downtime, cost overruns | Multi-region, set budget alerts |

### Technical Risks:

1. **RAG Accuracy Degrades at Scale**
   - **Mitigation:** Continuous evaluation, A/B test retrieval strategies

2. **Entity Resolution Fails on Edge Cases**
   - **Mitigation:** Human-in-the-loop for conflicts, improve fuzzy matching

3. **Knowledge Graph Gets Too Dense**
   - **Mitigation:** Prune low-value edges, implement relevance scoring

4. **Cost per Query Doesn't Decrease**
   - **Mitigation:** Aggressive caching, negotiate API pricing, build proprietary sources

---

## Success Criteria

### Phase 0-2 (Months 1-3):
- ✅ Infrastructure deployed
- ✅ 10 customers onboarded
- ✅ 50K+ queries in knowledge base
- ✅ Reuse rate: 35%+
- ✅ First case study published

### Phase 3-5 (Months 4-6):
- ✅ 50 customers
- ✅ 500K+ queries
- ✅ Reuse rate: 50%+
- ✅ Cost per lead: $0.50
- ✅ 3x meeting rate proven

### Phase 6-8 (Months 7-12):
- ✅ 150+ customers
- ✅ 2M+ queries
- ✅ Reuse rate: 60%+
- ✅ Geographic expansion (Saudi, Qatar)
- ✅ MRR: $150K+

### Beyond (Months 13-18):
- ✅ 1000+ customers
- ✅ 50M+ queries
- ✅ Reuse rate: 70%+
- ✅ Series A raised ($5-10M)
- ✅ $500K+ MRR

---

## Next Actions

**This Week (October 18-24, 2025):**
1. ✅ Complete Phase 0 review (already done)
2. [ ] Kick off Phase 1: Build `RADARAgent` class
3. [ ] Set up nightly cron jobs for RADAR company discovery
4. [ ] Onboard first 2 pilot customers (manual onboarding)

**This Month (October 2025):**
- [ ] Complete Phase 1 (RADAR Discovery)
- [ ] Start Phase 2 (Enrichment)
- [ ] First customer demo (show 500+ UAE companies discovered by RADAR)

**This Quarter (Q1 2025-2026):**
- [ ] Complete Phases 1-5
- [ ] 10 paying customers
- [ ] First case study published
- [ ] Reuse rate: 35%+

---

*This is a living document. Update after every sprint (2 weeks) based on learnings.*

**Last Review:** October 17, 2025
**Next Review:** October 31, 2025 (end of Phase 1)
