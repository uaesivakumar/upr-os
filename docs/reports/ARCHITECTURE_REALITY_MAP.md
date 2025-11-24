# Architecture Reality Map - UPR Codebase

**Generated:** 2025-11-22
**Purpose:** Stop assumptions. Build AI-first UX on real services/tools, not on PDF dreams.

---

## 1. BACKEND MODULE MAP

### A. ROUTES (34 Route Files, 200+ Endpoints)

| Route | Mount Path | Status | Description |
|-------|------------|--------|-------------|
| **admin.js** | `/api/admin` | USED | Queue stats, error analytics, retry operations |
| **auth.js** | `/api/auth` | USED | JWT login/logout/verify (rate limited) |
| **companies.js** | `/api/companies` | USED | CRUD, autocomplete, resolve, preview, Q-Score |
| **chat.js** | `/api/chat` | USED | AI chat with SSE streaming (Sprint 53) |
| **agent-core.js** | `/api/agent-core` | PARTIAL | 12 SIVA tools API + decisions analytics |
| **agent-hub.js** | `/api/agent-hub` | PARTIAL | MCP server, workflows, tool execution |
| **agents/activity.js** | `/api/agents/activity` | USED | SSE streaming for SIVA activity (Sprint 50) |
| **enrichment/unified.js** | `/api/enrichment` | USED | Start jobs, status polling, leads retrieval |
| **enrich/index.js** | `/api/enrich` | USED | Preview, generate, contacts, refine, save |
| **hr-leads.js** | `/api/hr-leads` | USED | Lead CRUD, filters, similar leads |
| **templates.js** | `/api/templates` | USED | Template CRUD with versioning |
| **templateDraft.js** | `/api/templates/draft` | PARTIAL | AI template generation |
| **email.js** | `/api/email` | USED | Email verification, pattern management |
| **outreach.js** | `/api/outreach` | PARTIAL | Generate personalized outreach |
| **hiring-signals.js** | `/api/hiring-signals` | USED | Hot/Review/Background signals, stats |
| **hiring-enrich.js** | `/api/hiring-enrich` | USED | Signal-based lead enrichment |
| **radar.js** | `/api/radar` | PARTIAL | RADAR discovery runs (scheduled) |
| **discovery.js** | `/api/discovery` | PARTIAL | Unified signal pipeline |
| **orchestration.js** | `/api/orchestration` | PARTIAL | Multi-source signal orchestration |
| **intelligence.js** | `/api/intelligence` | UNUSED | Company intelligence reports |
| **knowledge-graph.js** | `/api/knowledge-graph` | UNUSED | Neo4j ecosystem/similar companies |
| **linkedin.js** | `/api/linkedin` | PARTIAL | LinkedIn signal detection |
| **news.js** | `/api/news` | PARTIAL | News items with ingestion |
| **stats.js** | `/api/stats` | USED | Dashboard summary |
| **metrics.js** | `/api/metrics` | UNUSED | Enrichment KPIs, ML model metrics |
| **telemetry.js** | `/api/telemetry` | PARTIAL | User interaction tracking |
| **monitoring.js** | `/api/monitoring` | UNUSED | Rule performance, A/B tests |
| **experiments.js** | `/api/experiments` | UNUSED | LinUCB/Thompson A/B testing |
| **campaign-types.js** | `/api/campaign-types` | UNUSED | Campaign type management |
| **style-memory.js** | `/api/style-memory` | UNUSED | User writing style learning |
| **webhooks.js** | `/api/webhooks` | PARTIAL | Webhook delivery management |
| **sourcing.js** | `/api/sourcing` | UNUSED | Manual sourcing job queueing |
| **tools.js** | `/api/tools` | UNUSED | PDF extraction, URL fetch |
| **diag.js** | `/api/diag` | USED | System diagnostics |
| **ai-welcome.js** | `/api/ai-welcome` | UNUSED | AI welcome dashboard |
| **feedback.js** | `/api/feedback` | UNUSED | Feedback collection |
| **feedback-analysis.js** | `/api/feedback-analysis` | UNUSED | Feedback analysis |

---

### B. SERVICES (102 Service Files)

#### Core Active Services

| Service | Status | Purpose |
|---------|--------|---------|
| **chatNLUService.js** | USED | Real LLM-powered NLU with Claude |
| **radar.js** | PARTIAL | Discovery run management |
| **multiSourceOrchestrator.js** | PARTIAL | Multi-source signal discovery |
| **agentPersistence.js** | USED | SIVA tool execution logging |
| **leadScoreCalculator.js** | USED | Q-Score × Engagement × Fit |
| **neo4jService.js** | UNUSED | Knowledge graph operations |
| **companyPreview.js** | USED | SerpAPI + LLM company preview |
| **promptBuilder.js** | USED | AI email prompt generation |
| **enrichmentProviders.js** | USED | Apollo enrichment chain |
| **campaignIntelligence.js** | PARTIAL | Campaign matching |
| **deduplicationService.js** | USED | Signal deduplication |

#### Lifecycle Services (8 files) - UNUSED

| Service | Purpose |
|---------|---------|
| lifecycleStateEngine.js | Opportunity state transitions |
| lifecycleAutoTransition.js | Automated transitions |
| lifecycleAutomatedActions.js | Trigger actions on events |
| lifecycleTransitionTriggers.js | Define triggers |
| lifecycleJourneyTracking.js | Track opportunity journey |
| lifecycleReportGenerator.js | Generate reports |
| lifecycleVisualization.js | Visual representations |
| lifecycleDashboard.js | Dashboard analytics |

#### Outreach Services (5 files) - PARTIAL

| Service | Status |
|---------|--------|
| outreachGeneratorService.js | PARTIAL |
| outreachPersonalizationService.js | UNUSED |
| outreachPerformanceService.js | UNUSED |
| outreachOptimizationEngine.js | UNUSED |
| outreachAnalyticsService.js | UNUSED |

#### Analytics Services - MOSTLY UNUSED

| Service | Status |
|---------|--------|
| reasoningQualityService.js | UNUSED |
| datasetAnalyticsService.js | UNUSED |
| reflectionFeedbackService.js | UNUSED |
| reflectionAnalyticsService.js | UNUSED |

#### Agent Services - PARTIAL

| Service | Status |
|---------|--------|
| agentRegistryService.js | PARTIAL |
| agentCoordinator.js | UNUSED |
| agentMonitoringService.js | UNUSED |
| collaborativeDecisionService.js | UNUSED |

---

### C. SIVA TOOLS (15 Tools Total)

#### Registered & Active (4 tools)

| Tool | Primitive | Status | Used By |
|------|-----------|--------|---------|
| **CompanyQualityTool** | EVALUATE_COMPANY_QUALITY | ACTIVE | All workflows, MCP, Chat |
| **ContactTierTool** | SELECT_CONTACT_TIER | ACTIVE | 4 workflows, MCP, Chat |
| **TimingScoreTool** | CALCULATE_TIMING_SCORE | ACTIVE | 4 workflows, MCP, Chat |
| **BankingProductMatchTool** | MATCH_BANKING_PRODUCTS | ACTIVE | 4 workflows, MCP, Chat |

#### Implemented but NOT Registered (11 tools)

| Tool | Status | Potential |
|------|--------|-----------|
| CompositeScoreTool | UNUSED | Aggregate scoring |
| OutreachMessageGeneratorTool | UNUSED | Email generation |
| OpeningContextTool | UNUSED | Conversation openers |
| OutreachChannelTool | UNUSED | Channel selection |
| FollowUpStrategyTool | UNUSED | Follow-up planning |
| ObjectionHandlerTool | UNUSED | Objection responses |
| RelationshipTrackerTool | UNUSED | Relationship health |
| EdgeCasesTool | UNUSED | Edge case handling |
| HiringSignalExtractionTool | UNUSED | Signal extraction |
| SignalDeduplicationTool | UNUSED | Deduplication |
| SourceReliabilityTool | UNUSED | Source scoring |

#### External Tools (Not in Registry)

| Tool | Status | Purpose |
|------|--------|---------|
| SerpTool | ACTIVE | Google search, news |
| CrawlerTool | ACTIVE | Web content extraction |

---

### D. WORKFLOWS (6 Defined)

| Workflow | Status | Steps |
|----------|--------|-------|
| full_lead_scoring | ACTIVE | Company → Contact → Timing → Products |
| company_evaluation | ACTIVE | Company only |
| outreach_optimization | ACTIVE | Timing + Products (parallel) |
| conditional_lead_scoring | PARTIAL | Quality-gated tool execution |
| batch_company_evaluation | PARTIAL | Bulk processing |
| fallback_lead_scoring | PARTIAL | Graceful degradation |

---

### E. WORKERS & QUEUES

| Worker | Queue | Status | Deployment |
|--------|-------|--------|------------|
| enrichmentWorker.js | enrichment-queue | ACTIVE | Cloud Run |
| hiringSignalsWorker.js | hiring-signals-queue | ACTIVE | Cloud Run |
| webhookWorker.js | webhooks | ACTIVE | Embedded |
| sourcingWorker.js | sourcing_jobs (polling) | UNUSED | Not deployed |
| learningWorker.js | outreach_generations (cron) | UNUSED | Not deployed |
| broadcastWorker.js | broadcast_tasks (polling) | EXPERIMENTAL | Not deployed |

---

## 2. FRONTEND-TO-BACKEND WIRING (ACTUALLY USED)

### Actively Wired Endpoints

| Frontend Component | Backend Endpoint | Status |
|-------------------|------------------|--------|
| **Login.jsx** | POST /api/auth/login | ACTIVE |
| **Login.jsx** | GET /api/auth/verify | ACTIVE |
| **EnrichmentWorkflow.tsx** | GET /api/companies/preview | ACTIVE |
| **EnrichmentWorkflow.tsx** | POST /api/enrich/generate | ACTIVE |
| **EnrichmentWorkflow.tsx** | GET /api/enrichment/status | ACTIVE |
| **EnrichmentWorkflow.tsx** | GET /api/enrichment/leads | ACTIVE |
| **EnrichmentWorkflow.tsx** | POST /api/enrich/refine | ACTIVE |
| **EnrichmentWorkflow.tsx** | POST /api/enrich/save | ACTIVE |
| **EnrichmentWorkflow.tsx** | POST /api/email/verify | ACTIVE |
| **Chat.tsx** | POST /api/chat | ACTIVE |
| **Chat.tsx** | POST /api/chat/stream | ACTIVE |
| **Chat.tsx** | GET /api/chat/sessions | ACTIVE |

### React Query Hooks (Defined but Partially Used)

| Hook Module | Endpoints | Usage Status |
|-------------|-----------|--------------|
| useEnrichmentQueries | 6 endpoints | PARTIAL |
| useLeadsQueries | 8 endpoints | PARTIAL |
| useOutreachQueries | 8 endpoints | MINIMAL |
| useTemplateQueries | 7 endpoints | MINIMAL |

### NOT Connected to Frontend

- `/api/intelligence/*` - Company intelligence
- `/api/knowledge-graph/*` - Neo4j ecosystem
- `/api/metrics/*` - ML model metrics
- `/api/experiments/*` - A/B testing
- `/api/monitoring/*` - Rule performance
- `/api/style-memory/*` - Writing style
- `/api/campaign-types/*` - Campaign types
- `/api/feedback/*` - Feedback system
- `/api/ai-welcome/*` - AI dashboard
- All 11 unregistered SIVA tools

---

## 3. STATUS LEGEND

| Status | Meaning |
|--------|---------|
| **USED** | Actively called by frontend or scheduled jobs |
| **PARTIAL** | Backend exists, limited or no frontend wiring |
| **UNUSED** | Implemented but never called |
| **DEPRECATED** | Old code, should be removed |
| **EXPERIMENTAL** | Work in progress |

---

## 4. KEY FINDINGS

### Things That EXIST But Are UNUSED

1. **11 SIVA Tools** - Implemented with schemas, never registered
2. **Knowledge Graph** - Neo4j service ready, not wired
3. **Intelligence Reports** - Endpoint exists, no UI
4. **Style Memory** - Learning service ready, not used
5. **A/B Testing Framework** - LinUCB/Thompson, no UI
6. **Lifecycle Engine** - 8 services, completely unused
7. **Outreach Analytics** - Rich metrics, no dashboard
8. **3 Background Workers** - Implemented, not deployed

### Things PLANNED But Already EXIST

Before re-sprinting these, they already exist:

- ✅ Company Q-Score (leadScoreCalculator.js)
- ✅ Signal deduplication (deduplicationService.js)
- ✅ Multi-source orchestration (multiSourceOrchestrator.js)
- ✅ Intent recognition (chatNLUService.js)
- ✅ Agent-to-agent communication (AgentCommunicationProtocol.js)
- ✅ MCP server for Claude (MCPServer.js)
- ✅ Webhook retry logic (webhookWorker.js)

### Opportunities for AI-First UX

| Unused Capability | AI UX Opportunity |
|-------------------|-------------------|
| 11 SIVA Tools | Chat can execute them all |
| Knowledge Graph | "Show similar companies" |
| Intelligence Reports | "Research this company" |
| Style Memory | "Write like me" |
| A/B Testing | Auto-optimize outreach |
| Lifecycle Engine | "What stage is this lead?" |
| Outreach Analytics | "How am I performing?" |

---

## 5. INFRASTRUCTURE SUMMARY

| Component | Count | Active |
|-----------|-------|--------|
| Route Files | 34 | 18 |
| Service Files | 102 | ~30 |
| SIVA Tools | 15 | 4 |
| Workflows | 6 | 3 |
| Workers | 6 | 3 |
| DB Migrations | 57+ | All |
| Frontend Hooks | 15+ | ~8 |

---

## 6. DETAILED ROUTE ENDPOINTS

### Authentication (`/api/auth`)

```
POST   /api/auth/login     - Authenticate with username/password
POST   /api/auth/logout    - Clear JWT cookie
GET    /api/auth/verify    - Verify current session
GET    /api/auth/me        - Get current user info
```

### Companies (`/api/companies`)

```
POST   /                   - Create new company
GET    /                   - List companies with filters
GET    /autocomplete       - Company name autocomplete
GET    /resolve            - Resolve by domain/name
GET    /preview            - Enriched company preview with Q-Score
POST   /preview/refine     - Refine with specific domain
GET    /cache/stats        - Cache analytics
GET    /:id                - Get single company
PATCH  /:id                - Update company
GET    /:id/news           - Company news
POST   /:id/recompute-qscore - Recompute Q-Score
GET    /signal/:signalId   - Load from hiring signal
```

### Chat (`/api/chat`)

```
POST   /                   - Send message (rate limited 30/min)
POST   /stream             - SSE streaming endpoint
GET    /sessions           - List user sessions
GET    /sessions/:id       - Get session with messages
DELETE /sessions/:id       - Delete session
GET    /health             - Health check
```

### SIVA Agent Core (`/api/agent-core`)

```
POST   /v1/tools/evaluate_company_quality
POST   /v1/tools/select_contact_tier
POST   /v1/tools/calculate_timing_score
POST   /v1/tools/check_edge_cases
POST   /v1/tools/match_banking_products
POST   /v1/tools/select_outreach_channel
POST   /v1/tools/generate_opening_context
POST   /v1/tools/generate_composite_score
POST   /v1/tools/generate_outreach_message
POST   /v1/tools/determine_followup_strategy
POST   /v1/tools/handle_objection
POST   /v1/tools/track_relationship_health
GET    /v1/decisions       - List all decisions
GET    /v1/decisions/:id   - Get single decision
GET    /v1/decisions/company/:companyId - Company history
POST   /v1/decisions/:id/override - Log human override
GET    /v1/analytics/tool-performance
GET    /v1/analytics/override-analytics
GET    /v1/analytics/low-confidence
GET    /v1/health
```

### Agent Hub (`/api/agent-hub`)

```
POST   /v1/auth/token      - Generate JWT token
POST   /v1/execute-tool    - Execute single tool
POST   /v1/execute-workflow - Execute workflow
POST   /v1/mcp             - MCP over HTTP (JSON-RPC 2.0)
POST   /v1/agent-call      - Agent-to-agent communication
GET    /v1/tools           - List available tools
GET    /v1/workflows       - List available workflows
GET    /v1/health          - Health check
```

### Enrichment (`/api/enrichment` + `/api/enrich`)

```
# Unified Enrichment
POST   /api/enrichment/start   - Queue enrichment job
GET    /api/enrichment/status  - Get job status
GET    /api/enrichment/leads   - Get leads by job

# Original Enrichment
POST   /api/enrich/preview     - Company preview
POST   /api/enrich/generate    - Generate enrichment
POST   /api/enrich/person      - AI lead enrichment
POST   /api/enrich/bulk        - Bulk enrichment
POST   /api/enrich/contacts    - Contact enrichment with SIVA
POST   /api/enrich/refine      - Refine search
POST   /api/enrich/save        - Save leads
```

### Hiring Signals (`/api/hiring-signals` + `/api/hiring-enrich`)

```
GET    /api/hiring-signals/hot        - Hot leads by company
GET    /api/hiring-signals/review     - Review queue
GET    /api/hiring-signals/background - Background signals
GET    /api/hiring-signals/all        - All signals with filters
GET    /api/hiring-signals/signal/:id - Single signal
GET    /api/hiring-signals/company/:id - Company signals
GET    /api/hiring-signals/stats      - Statistics

GET    /api/hiring-enrich/status      - Service status
POST   /api/hiring-enrich/from-signal - Trigger enrichment
GET    /api/hiring-enrich/job/:id     - Job status
GET    /api/hiring-enrich/leads/:id   - Job leads
```

---

## 7. DATABASE TABLES (Key Tables)

### Core Tables
- `tenants` - Multi-tenant support
- `users` - User accounts
- `targeted_companies` - Company records
- `hr_leads` - Lead records
- `enrichment_jobs` - Enrichment job tracking

### SIVA Tables
- `agent_decisions` - Tool execution log
- `agent_overrides` - Human overrides

### Chat Tables (Sprint 53)
- `chat_sessions` - Chat sessions
- `chat_messages` - Message history
- `chat_rate_limits` - Rate tracking

### Signal Tables
- `hiring_signals` - Detected signals
- `radar_runs` - Discovery runs
- `radar_results` - Discovery results

### Email Tables
- `email_patterns` - Learned patterns
- `pattern_failures` - Failed patterns

---

## 8. EXTERNAL INTEGRATIONS

| Service | Purpose | Status |
|---------|---------|--------|
| **OpenAI** | LLM generation, embeddings | ACTIVE |
| **Anthropic Claude** | Chat NLU, MCP | ACTIVE |
| **Apollo** | Company/person data | ACTIVE |
| **SerpAPI** | Google search | ACTIVE |
| **RapidAPI** | LinkedIn data | ACTIVE |
| **Neo4j** | Knowledge graph | CONFIGURED |
| **Redis** | Queue management | ACTIVE |
| **Sentry** | Error tracking | ACTIVE |

---

## 9. RECOMMENDATIONS

### Immediate Wins (Wire existing to UI)

1. **Register 11 unused SIVA tools** → Chat can use them
2. **Wire Knowledge Graph** → "Similar companies" feature
3. **Wire Intelligence Reports** → Company research panel
4. **Activate A/B Testing** → Auto-optimize emails

### Technical Debt

1. **Deploy 3 unused workers** (sourcing, learning, broadcast)
2. **Remove deprecated lifecycle services** if not needed
3. **Consolidate enrichment routes** (/enrichment vs /enrich)

### AI-First Opportunities

1. **Chat as universal interface** to all SIVA tools
2. **Style Memory** for personalized outreach
3. **Lifecycle Engine** for lead stage intelligence
4. **Outreach Analytics** via conversational queries

---

*This report maps what actually exists in the UPR codebase as of 2025-11-22. Use this to avoid re-implementing existing features and to identify quick wins for AI-first UX.*
