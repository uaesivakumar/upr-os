# Sprint 20: SIVA Phase 4 - Infrastructure & Integration

**Sprint Duration:** 2 weeks (Nov 14-28, 2025)
**Priority:** P1 - AI Agent Core Integration
**Goal:** Wire 12 SIVA tools into production pipeline with REST API, database persistence, and monitoring

---

## 🎯 Sprint Goal

Integrate the complete SIVA cognitive framework (12 tools) into UPR's production Discovery and Enrichment pipelines, creating the central AI Agent Core with REST API, database persistence, and full observability.

**Success Criteria:**
- REST API layer for all 12 SIVA tools operational
- Database persistence (agent_decisions, agent_overrides tables)
- Integration with Discovery Engine (Phase 3)
- Integration with Enrichment Engine (Phase 12)
- OpenTelemetry monitoring deployed
- AI Agent Core module: 0.4% → 50%+ complete

---

## 📊 Current State Analysis

### What We Have (Complete):
1. ✅ **All 12 SIVA Tools** - 100% operational (Foundation + STRICT + DELEGATED layers)
2. ✅ **Phase 3 RADAR** - Multi-source orchestration complete (Sprint 19)
3. ✅ **Phase 12 Lead Scoring** - Q-Score calculation working (Sprint 17)
4. ✅ **Enrichment Engine** - 100% complete (Sprint 17)
5. ✅ **Discovery Engine** - 15% complete with orchestration (Sprint 19)

### What's Missing (Phase 4):
1. ⏳ **REST API Layer** - No HTTP endpoints for SIVA tools
2. ⏳ **Database Persistence** - agent_decisions, agent_overrides, persona_versions tables
3. ⏳ **MCP Host Integration** - Tools not wired to Claude Desktop/production
4. ⏳ **OpenTelemetry Monitoring** - No per-tool latency/error tracking
5. ⏳ **Module Integration** - Discovery/Enrichment not using SIVA tools yet
6. ⏳ **Persona Policy Engine** - No pre/post execution validation

---

## 📋 Sprint 20 Tasks

### Task 1: REST API Layer for SIVA Tools (8h, P1)
**Goal:** Create HTTP endpoints for all 12 SIVA tools

**Deliverables:**
- `routes/agent-core.js` - REST API router
- 12 POST endpoints (one per tool)
- Request/response validation middleware
- Error handling with Sentry
- Rate limiting (100 req/min per tool)
- Health check endpoint
- API documentation

**API Endpoints:**
```
POST /api/agent-core/v1/tools/evaluate_company_quality
POST /api/agent-core/v1/tools/select_contact_tier
POST /api/agent-core/v1/tools/calculate_timing_score
POST /api/agent-core/v1/tools/check_edge_cases
POST /api/agent-core/v1/tools/match_banking_products
POST /api/agent-core/v1/tools/select_outreach_channel
POST /api/agent-core/v1/tools/generate_opening_context
POST /api/agent-core/v1/tools/generate_composite_score
POST /api/agent-core/v1/tools/generate_outreach_message
POST /api/agent-core/v1/tools/determine_followup_strategy
POST /api/agent-core/v1/tools/handle_objection
POST /api/agent-core/v1/tools/track_relationship_health

GET /api/agent-core/v1/health
GET /api/agent-core/v1/__diag (internal diagnostics)
```

**Architecture:**
```
┌──────────────┐
│ HTTP Request │
└──────┬───────┘
       │
┌──────▼────────────┐
│ Request Validator │ (Ajv schemas)
└──────┬────────────┘
       │
┌──────▼──────────┐
│  SIVA Tool      │ (standalone execution)
└──────┬──────────┘
       │
┌──────▼──────────┐
│ Response Logger │ (database + Sentry)
└──────┬──────────┘
       │
┌──────▼───────┐
│ HTTP Response│
└──────────────┘
```

---

### Task 2: Database Persistence Layer (6h, P1)
**Goal:** Persist all SIVA tool decisions for analysis and override

**Deliverables:**
- Database migration: `2025_11_14_agent_core_persistence.sql`
- 3 tables: agent_decisions, agent_overrides, persona_versions
- Persistence service: `server/services/agentPersistence.js`
- Auto-logging after each tool execution
- Query APIs for decision history

**Database Schema:**
```sql
CREATE TABLE agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  contact_id UUID,
  tool_name TEXT NOT NULL,
  input_params JSONB NOT NULL,
  output_result JSONB NOT NULL,
  reasoning JSONB,
  confidence NUMERIC(3,2),
  execution_time_ms INTEGER,
  policy_version TEXT NOT NULL DEFAULT 'v1.0',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT,
  module_caller TEXT,
  tenant_id UUID
);

CREATE TABLE agent_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES agent_decisions(id),
  ai_result JSONB NOT NULL,
  human_result JSONB NOT NULL,
  override_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID,
  tenant_id UUID
);

CREATE TABLE persona_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT UNIQUE NOT NULL,
  spec_content TEXT NOT NULL,
  changes_summary TEXT,
  deployed_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_by TEXT
);

CREATE INDEX idx_agent_decisions_company ON agent_decisions(company_id);
CREATE INDEX idx_agent_decisions_tool ON agent_decisions(tool_name);
CREATE INDEX idx_agent_decisions_created ON agent_decisions(created_at DESC);
CREATE INDEX idx_agent_decisions_tenant ON agent_decisions(tenant_id);
CREATE INDEX idx_agent_overrides_decision ON agent_overrides(decision_id);
```

**New API Endpoints:**
```
GET /api/agent-core/v1/decisions - List all decisions (paginated)
GET /api/agent-core/v1/decisions/:id - Get single decision
GET /api/agent-core/v1/decisions/company/:companyId - Decisions for company
POST /api/agent-core/v1/decisions/:id/override - Human override
GET /api/agent-core/v1/analytics/tool-performance - Per-tool metrics
```

---

### Task 3: Discovery Engine Integration (5h, P1)
**Goal:** Wire SIVA tools into signal discovery pipeline

**Integration Points:**
1. **After Signal Discovery** → CompanyQualityTool
   - Filter: Only process signals with confidence > 0.6
   - Action: Score company quality (0-100)
   - Outcome: If score ≥ 70 → enqueue for enrichment

2. **Edge Case Detection** → EdgeCasesTool
   - Check: Enterprise brands, government entities, sanctioned companies
   - Action: Flag blockers before enrichment
   - Outcome: Block enrichment if critical edge case found

3. **Timing Optimization** → TimingScoreTool
   - Input: Signal type, discovery date, company location
   - Action: Calculate timing score (OPTIMAL/GOOD/FAIR/POOR)
   - Outcome: Prioritize OPTIMAL timing signals

**Deliverables:**
- Updated `server/services/multiSourceOrchestrator.js`
- SIVA tool integration in discovery flow
- Automatic company quality scoring
- Edge case blocker detection
- Timing-based signal prioritization
- Database: Link hiring_signals ↔ agent_decisions

**Expected Impact:**
- 30% reduction in low-quality signals processed
- Edge case detection prevents wasted enrichment costs
- Timing optimization improves conversion rates

---

### Task 4: Enrichment Engine Integration (5h, P1)
**Goal:** Wire SIVA tools into contact selection and outreach prep

**Integration Points:**
1. **Contact Selection** → ContactTierTool
   - Input: Contact seniority, department, company size
   - Action: Classify tier (STRATEGIC/GROWTH/TRANSACTIONAL)
   - Outcome: Only enrich STRATEGIC + GROWTH tiers

2. **Banking Product Matching** → BankingProductMatchTool
   - Input: Company industry, signal type, business segment
   - Action: Match to Emirates NBD products (38 products)
   - Outcome: Personalized product recommendations

3. **Composite Q-Score** → CompositeScoreTool
   - Input: Outputs from Tools 1-7
   - Action: Generate unified Q-Score (0-100)
   - Outcome: Lead tier (HOT/WARM/COLD/DISQUALIFIED)

**Deliverables:**
- Updated enrichment pipeline
- Contact tier filtering
- Product matching for each signal
- Q-Score calculation after enrichment
- Lead tier classification
- Database: Link companies ↔ agent_decisions

**Expected Impact:**
- 50% reduction in low-tier contact enrichment
- Personalized product matching increases conversion
- Unified Q-Score replaces manual lead scoring

---

### Task 5: OpenTelemetry Monitoring (6h, P2)
**Goal:** Full observability for SIVA tool performance

**Deliverables:**
- OpenTelemetry integration: `server/services/telemetry.js`
- Per-tool latency tracking (p50/p95/p99)
- Error rate monitoring
- Confidence score distribution
- Tool usage analytics
- Cloud Monitoring dashboards
- Sentry integration (already exists, enhance)

**Metrics Tracked:**
```javascript
// Per-tool metrics
{
  tool_name: "CompanyQualityTool",
  invocations_total: 1234,
  latency_p50_ms: 0.8,
  latency_p95_ms: 1.2,
  latency_p99_ms: 2.1,
  error_rate: 0.001,
  avg_confidence: 0.87,
  confidence_distribution: {
    high: 856,    // 0.80-1.00
    medium: 312,  // 0.60-0.79
    low: 66       // 0.00-0.59
  }
}
```

**Cloud Monitoring Dashboards:**
1. **SIVA Tools Overview** - All 12 tools at a glance
2. **Tool Performance** - Per-tool latency, error rate
3. **Decision Analytics** - Confidence distribution, override rate
4. **Integration Health** - Discovery/Enrichment pipeline metrics

**Sentry Enhancements:**
- Add `tool_layer` tag (Foundation/STRICT/DELEGATED)
- Add `integration_point` tag (discovery/enrichment)
- Add `confidence_level` tag (HIGH/MEDIUM/LOW)

---

### Task 6: Persona Policy Engine (4h, P2)
**Goal:** Central orchestration with ALWAYS/NEVER rule enforcement

**Deliverables:**
- Policy engine: `server/services/personaPolicy.js`
- Pre-execution validation (input compliance)
- Post-execution validation (output compliance)
- Confidence gate checks (escalate if < threshold)
- Policy violation reporting
- Edge case application

**Policy Rules (from SIVA spec):**

**ALWAYS Rules:**
- ALWAYS verify contact tier before outreach
- ALWAYS check edge cases before enrichment
- ALWAYS calculate composite score before lead handoff
- ALWAYS log decisions to database

**NEVER Rules:**
- NEVER contact enterprise brands (Emirates, Etisalat, etc.)
- NEVER contact government entities
- NEVER proceed if confidence < 0.60
- NEVER skip compliance checks

**Confidence Gates:**
```javascript
if (confidence < 0.60) {
  action = "ESCALATE_TO_HUMAN"
  reason = "Low confidence - requires manual review"
}
if (confidence >= 0.80) {
  action = "PROCEED_AUTOMATICALLY"
}
if (0.60 <= confidence < 0.80) {
  action = "PROCEED_WITH_MONITORING"
}
```

**New API Endpoints:**
```
POST /api/agent-core/v1/policy/validate - Validate decision against policy
GET /api/agent-core/v1/policy/violations - List policy violations
GET /api/agent-core/v1/policy/rules - Get current policy rules
```

---

## 🏗️ Architecture

### Phase 4 Integration Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    UPR Production System                      │
└──────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
      ┌───────▼───────┐   ┌──▼──────┐   ┌───▼─────────┐
      │   Discovery   │   │Enrichment│  │   Outreach  │
      │    Engine     │   │  Engine  │   │   Engine    │
      └───────┬───────┘   └──┬───────┘   └───┬─────────┘
              │              │               │
              └──────────────┼───────────────┘
                             │
                ┌────────────▼────────────┐
                │   REST API Layer        │
                │  /api/agent-core/v1/*   │
                └────────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
      ┌───────▼─────┐  ┌────▼────┐  ┌──────▼──────┐
      │  Persona    │  │  SIVA   │  │ Persistence │
      │   Policy    │  │  Tools  │  │   Layer     │
      │   Engine    │  │ (1-12)  │  │ (Database)  │
      └─────────────┘  └─────────┘  └─────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
            ┌───────▼──────┐  ┌──────▼────────┐
            │ OpenTelemetry│  │    Sentry     │
            │  Monitoring  │  │ Error Tracking│
            └──────────────┘  └───────────────┘
```

---

## 📊 Expected Outcomes

### Module Progress
- **AI Agent Core:** 0.4% → 50%+ (125x improvement)
- **Discovery Engine:** 15% → 30%+ (2x improvement)
- **Enrichment Engine:** 100% → 100% (enhanced with SIVA)
- **Overall Project:** 40% → 50%+ (10% increase)

### Performance Targets
- **API Latency:** p95 < 200ms (Foundation tools), p95 < 3s (DELEGATED tools)
- **Decision Persistence:** 100% of tool executions logged
- **Error Rate:** < 1% per tool
- **Monitoring Coverage:** 100% of tools instrumented

### Business Impact
- **Lead Quality:** 30% improvement via CompanyQualityTool + EdgeCasesTool
- **Enrichment Efficiency:** 50% cost reduction via ContactTierTool filtering
- **Conversion Rate:** 15-20% improvement via TimingScoreTool optimization
- **Personalization:** 100% of leads get product matching

---

## 🔧 Technical Stack

### New Services
- REST API Layer (Express router)
- Agent Persistence Service (PostgreSQL)
- Persona Policy Engine (Rule validator)
- Telemetry Service (OpenTelemetry)

### New Database Tables
- `agent_decisions` - Decision history
- `agent_overrides` - Human corrections
- `persona_versions` - Policy versioning

### New Dependencies
```json
{
  "@opentelemetry/api": "^1.4.1",
  "@opentelemetry/sdk-node": "^0.41.0",
  "@opentelemetry/auto-instrumentations-node": "^0.37.0",
  "@google-cloud/opentelemetry-cloud-monitoring-exporter": "^0.17.0",
  "express-rate-limit": "^6.7.0"
}
```

### APIs Created
- 12 SIVA tool endpoints (POST)
- 6 decision management endpoints (GET/POST)
- 3 policy management endpoints (GET/POST)
- 2 diagnostics endpoints (GET)

**Total:** 23 new API endpoints

---

## 🎯 Success Metrics

### Code Quality
- [ ] 2,500+ lines of integration code
- [ ] 23 API endpoints operational
- [ ] 100% request/response validation
- [ ] Comprehensive error handling

### Integration Quality
- [ ] Discovery Engine uses 3 SIVA tools (Tools 1, 3, 4)
- [ ] Enrichment Engine uses 4 SIVA tools (Tools 2, 5, 7, 8)
- [ ] 100% of decisions persisted to database
- [ ] OpenTelemetry dashboards live

### Performance
- [ ] p95 latency < 200ms (Foundation tools)
- [ ] p95 latency < 3s (DELEGATED tools)
- [ ] Error rate < 1%
- [ ] 100% uptime on agent-core endpoints

### Documentation
- [ ] API documentation complete
- [ ] Integration guide for each module
- [ ] Monitoring dashboard guide
- [ ] Policy configuration guide

---

## 📝 Integration with 12 SIVA Phases

This sprint directly addresses **Phase 4: Infrastructure & Topology** from the SIVA architecture:

| Phase | Focus | Sprint 20 Coverage |
|-------|-------|-------------------|
| Phase 1 | Persona Extraction | ✅ Complete (12 tools built) |
| Phase 2 | Cognitive Framework | ✅ Complete (Tools operational) |
| Phase 3 | RADAR Orchestration | ✅ Complete (Sprint 19) |
| **Phase 4** | **Infrastructure & Integration** | **🎯 Sprint 20 Target** |
| Phase 5 | Cognitive Extraction | ⏳ Future (Sprint 21+) |
| Phase 6 | Prompt Engineering | ⏳ Future (Sprint 22+) |
| Phase 7 | Quantitative Intelligence | ⏳ Future (Sprint 23+) |
| Phase 8 | Opportunity Lifecycle | ⏳ Future (Sprint 24+) |
| Phase 9 | Explainability Layer | ⏳ Future (Sprint 25+) |
| Phase 10 | Feedback Analytics | ⏳ Future (Sprint 26+) |
| Phase 11 | Multi-Agent Collaboration | ⏳ Future (Sprint 27+) |
| Phase 12 | Lead Scoring Engine | ✅ Complete (Sprint 17) |

**Phase 4 Deliverables (This Sprint):**
- ✅ REST API Layer
- ✅ Database Persistence
- ✅ OpenTelemetry Monitoring
- ✅ Module Integration (Discovery + Enrichment)
- ✅ Persona Policy Engine

After Sprint 20, we'll have 4/12 phases complete (33%) with full infrastructure in place for the remaining 8 phases.

---

## ⚠️ Risks & Mitigations

**Risk 1: Integration Complexity**
- Risk: Wiring SIVA tools into 3 different modules
- Mitigation: Start with Discovery (simplest), then Enrichment, defer Outreach to Sprint 21
- Fallback: Shadow-run mode (log decisions but don't act)

**Risk 2: Database Performance**
- Risk: agent_decisions table grows quickly (1000s/day)
- Mitigation: Partitioning by month, indexes on all foreign keys
- Fallback: Archive decisions > 90 days to cold storage

**Risk 3: OpenTelemetry Overhead**
- Risk: Monitoring adds latency
- Mitigation: Async instrumentation, sampling for high-volume tools
- Fallback: Disable for Foundation tools (already <1ms)

**Risk 4: Policy Engine Complexity**
- Risk: Over-engineering pre/post validation
- Mitigation: Start with basic ALWAYS/NEVER rules, iterate
- Fallback: Defer to Sprint 21 if blocki

ng

---

## 📅 Timeline

**Week 1 (Nov 14-20):**
- Day 1-2: Task 1 (REST API Layer)
- Day 3: Task 2 (Database Persistence)
- Day 4-5: Task 3 (Discovery Integration)

**Week 2 (Nov 21-28):**
- Day 1-2: Task 4 (Enrichment Integration)
- Day 3: Task 5 (OpenTelemetry Monitoring)
- Day 4-5: Task 6 (Persona Policy Engine) + Testing + Documentation

---

## 🚀 Ready to Start!

**Next Steps:**
1. Review and approve Sprint 20 plan
2. Start with Task 1: REST API Layer
3. Create task tracking in Notion
4. Update SPRINT_20_HANDOFF.md as we progress

---

**Sprint 20 Status:** Ready to Begin
**Priority:** SIVA Phase 4 - Infrastructure & Integration
**Estimated Hours:** 34 hours over 2 weeks
**Expected Completion:** November 28, 2025
