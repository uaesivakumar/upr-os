# UPR Technical Architecture

**Document Version**: 1.0
**Last Updated**: 2025-11-19
**Status**: Production
**Maintainer**: Development Team

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Database Schema](#database-schema)
4. [API Architecture](#api-architecture)
5. [SIVA Framework](#siva-framework)
6. [Multi-Agent System](#multi-agent-system)
7. [Security Architecture](#security-architecture)
8. [Infrastructure](#infrastructure)
9. [Integration Points](#integration-points)
10. [Data Flow Diagrams](#data-flow-diagrams)
11. [Scalability and Performance](#scalability-and-performance)
12. [Technology Stack](#technology-stack)

---

## System Overview

### Executive Summary

UPR (Unified Persona & Relationship) is a sophisticated B2B lead intelligence and outreach automation platform that combines AI-driven lead scoring, multi-agent collaboration, and personalized outreach generation. The system orchestrates data from multiple sources (Apollo, Hunter, LinkedIn) through a multi-agent framework called SIVA to deliver high-quality, actionable sales leads.

### High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        Dashboard[React Dashboard]
        API_Client[API Clients]
    end

    subgraph "API Gateway Layer"
        Express[Express.js Server]
        Auth[JWT Authentication]
        RateLimit[Rate Limiting]
    end

    subgraph "Application Layer"
        SIVA[SIVA Tools - 12 Primitives]
        Agents[Multi-Agent System]
        Services[Business Services - 45+ Services]
        Routes[API Routes - 25+ Endpoints]
    end

    subgraph "Intelligence Layer"
        Enrichment[Lead Enrichment]
        Scoring[Lead Scoring Engine]
        Lifecycle[Lifecycle State Machine]
        Outreach[Outreach Generation]
    end

    subgraph "Data Layer"
        CloudSQL[(Cloud SQL PostgreSQL)]
        Redis[(Redis Cache)]
        Neo4j[(Neo4j Knowledge Graph)]
    end

    subgraph "External Services"
        Apollo[Apollo API]
        Hunter[Hunter API]
        OpenAI[OpenAI API]
        Anthropic[Anthropic API]
        Notion[Notion API]
    end

    Dashboard --> Express
    API_Client --> Express
    Express --> Auth
    Express --> RateLimit
    Auth --> Routes
    RateLimit --> Routes
    Routes --> Services
    Services --> SIVA
    Services --> Agents
    Services --> Enrichment
    Services --> Scoring
    Services --> Lifecycle
    Services --> Outreach
    SIVA --> CloudSQL
    Agents --> CloudSQL
    Services --> Redis
    Enrichment --> Apollo
    Enrichment --> Hunter
    Outreach --> OpenAI
    Outreach --> Anthropic
    Services --> Notion
```

### Core Capabilities

1. **Lead Intelligence**: Multi-source lead enrichment with quality scoring
2. **AI-Driven Scoring**: Composite scoring engine (0-10,000 scale) combining quality, engagement, and fit
3. **Multi-Agent Collaboration**: Discovery, Validation, and Critic agents working in consensus
4. **Lifecycle Management**: 7-state lifecycle engine tracking opportunities from discovery to close
5. **Personalized Outreach**: AI-generated, context-aware outreach messaging
6. **Analytics & Reporting**: Comprehensive dashboards and reporting on lead performance

---

## Component Architecture

### Application Structure

```
/Users/skc/DataScience/upr/
├── server.js                    # Main application entry point
├── instrument.js                # Sentry monitoring initialization
├── server/
│   ├── routes/                  # 25+ API route handlers
│   ├── services/                # 45+ business logic services
│   ├── middleware/              # Authentication, rate limiting, validation
│   ├── siva-tools/              # 12 SIVA decision primitives
│   ├── lib/                     # Shared libraries and utilities
│   └── workers/                 # Background job workers
├── dashboard/                   # React frontend application
├── db/migrations/               # 48 database migration files
├── utils/                       # Database connection, helpers
└── docs/                        # Documentation and design specs
```

### Layer Architecture

```mermaid
graph TD
    subgraph "Presentation Layer"
        UI[React Dashboard]
    end

    subgraph "API Layer"
        REST[REST API Endpoints]
        WS[WebSocket Support]
    end

    subgraph "Business Logic Layer"
        SVC[Service Layer - 45+ Services]
        SIVA_LAYER[SIVA Tools Layer]
        AGENT_LAYER[Multi-Agent Layer]
    end

    subgraph "Data Access Layer"
        ORM[Direct SQL Queries]
        CACHE[Redis Caching]
        KG[Neo4j Graph Queries]
    end

    subgraph "Persistence Layer"
        DB[(PostgreSQL)]
        R[(Redis)]
        N[(Neo4j)]
    end

    UI --> REST
    REST --> SVC
    SVC --> SIVA_LAYER
    SVC --> AGENT_LAYER
    SIVA_LAYER --> ORM
    AGENT_LAYER --> ORM
    ORM --> DB
    SVC --> CACHE
    CACHE --> R
    SVC --> KG
    KG --> N
```

---

## Database Schema

### Infrastructure Details

- **Platform**: Google Cloud SQL for PostgreSQL
- **Instance**: 34.121.0.240:5432
- **Database**: upr_production
- **Connection**: VPC with Unix socket support
- **Pooling**: 20 max connections, 2 min connections

### Core Tables

#### 1. Lead & Company Management

**companies** - Company master data
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  industry TEXT,
  employee_count INTEGER,
  revenue NUMERIC,
  location JSONB,
  apollo_id TEXT,
  quality_score NUMERIC(5,2),
  enriched_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**hr_leads** - Lead tracking and management
```sql
CREATE TABLE hr_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  contact_name TEXT,
  contact_title TEXT,
  contact_email TEXT,
  contact_tier TEXT CHECK (contact_tier IN ('T1', 'T2', 'T3', 'T4')),
  lead_score INTEGER CHECK (lead_score BETWEEN 0 AND 10000),
  lifecycle_state TEXT,
  enrichment_status TEXT,
  favorite BOOLEAN DEFAULT false,
  irrelevant BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. SIVA Agent Core (Sprint 20)

**agent_decisions** - All SIVA tool executions
```sql
CREATE TABLE agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  contact_id UUID,
  signal_id UUID,
  tool_name TEXT NOT NULL,
  tool_layer TEXT CHECK (tool_layer IN ('foundation', 'strict', 'delegated')),
  primitive_name TEXT,
  input_params JSONB NOT NULL,
  output_result JSONB NOT NULL,
  reasoning JSONB,
  score NUMERIC(5,2),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  quality_tier TEXT,
  execution_time_ms INTEGER NOT NULL,
  policy_version TEXT NOT NULL DEFAULT 'v2.0',
  session_id TEXT,
  module_caller TEXT,
  tenant_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**agent_overrides** - Human corrections to AI decisions
```sql
CREATE TABLE agent_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES agent_decisions(id) ON DELETE CASCADE,
  ai_result JSONB NOT NULL,
  human_result JSONB NOT NULL,
  ai_score NUMERIC(5,2),
  human_score NUMERIC(5,2),
  override_reason TEXT,
  notes TEXT,
  score_delta NUMERIC(5,2),
  overridden_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. Lifecycle Management (Sprint 33-34)

**opportunity_lifecycle** - State machine tracking
```sql
CREATE TABLE opportunity_lifecycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  state VARCHAR(50) NOT NULL CHECK (state IN (
    'DISCOVERED', 'QUALIFIED', 'OUTREACH', 'ENGAGED',
    'NEGOTIATING', 'DORMANT', 'CLOSED'
  )),
  sub_state VARCHAR(50) CHECK (sub_state IN ('WON', 'LOST', 'DISQUALIFIED', NULL)),
  entered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMP,
  duration_seconds INTEGER,
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('auto', 'manual', 'event')),
  trigger_reason TEXT,
  triggered_by UUID,
  previous_state VARCHAR(50),
  next_state VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. Lead Scoring Engine (Sprint 35)

**lead_scores** - Composite lead scoring
```sql
CREATE TABLE lead_scores (
  opportunity_id UUID PRIMARY KEY,
  q_score INTEGER CHECK (q_score BETWEEN 0 AND 100),
  engagement_score INTEGER CHECK (engagement_score BETWEEN 0 AND 100),
  fit_score INTEGER CHECK (fit_score BETWEEN 0 AND 100),
  lead_score INTEGER CHECK (lead_score BETWEEN 0 AND 10000),
  grade VARCHAR(2) CHECK (grade IN ('A+', 'A', 'B+', 'B', 'C', 'D')),
  segment VARCHAR(20),
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMP,
  decay_applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**score_history** - Score change tracking
```sql
CREATE TABLE score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL,
  previous_score INTEGER,
  new_score INTEGER,
  score_delta INTEGER,
  change_reason TEXT,
  factors_changed JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 5. Multi-Agent System (Sprint 37)

**agents** - Agent registry
```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type VARCHAR(50) NOT NULL CHECK (agent_type IN ('Discovery', 'Validation', 'Critic', 'Coordinator', 'Custom')),
  agent_id VARCHAR(100) UNIQUE NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'BUSY', 'ERROR', 'OFFLINE')),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP,
  performance_metrics JSONB
);
```

**agent_tasks** - Task assignment and tracking
```sql
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(100) UNIQUE NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  assigned_to UUID REFERENCES agents(id),
  status VARCHAR(20) DEFAULT 'PENDING',
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  input JSONB NOT NULL,
  output JSONB,
  error JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**agent_reflections** - Agent learning and reflection
```sql
CREATE TABLE agent_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id VARCHAR(100) UNIQUE NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  decision_id VARCHAR(100),
  decision JSONB NOT NULL,
  outcome JSONB,
  reflection TEXT,
  learnings JSONB DEFAULT '[]'::jsonb,
  shared_with JSONB DEFAULT '[]'::jsonb,
  impact_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 6. Outreach & Templates (Sprint 31)

**voice_templates** - Voice and tone templates
```sql
CREATE TABLE voice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  voice_profile JSONB NOT NULL,
  example_text TEXT,
  tone_tags TEXT[],
  use_cases TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**outreach_telemetry** - Outreach performance tracking
```sql
CREATE TABLE outreach_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  template_id UUID,
  channel TEXT,
  generated_message TEXT,
  personalization_factors JSONB,
  sentiment_score NUMERIC(3,2),
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  replied_at TIMESTAMP,
  conversion_outcome TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 7. Email Intelligence (Sprint 15-16)

**email_patterns** - Email pattern library
```sql
CREATE TABLE email_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  pattern TEXT NOT NULL,
  confidence NUMERIC(3,2),
  sample_size INTEGER,
  last_verified TIMESTAMP,
  embedding vector(384),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**pattern_failures** - Failed pattern learning
```sql
CREATE TABLE pattern_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  attempted_pattern TEXT,
  first_name TEXT,
  last_name TEXT,
  failure_reason TEXT,
  embedding vector(384),
  learned_from BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Database Views

**opportunity_current_state** - Current lifecycle state per opportunity
```sql
CREATE VIEW opportunity_current_state AS
SELECT
  ol.opportunity_id,
  ol.state,
  ol.sub_state,
  ol.entered_at,
  EXTRACT(EPOCH FROM (NOW() - ol.entered_at))::INTEGER as seconds_in_state,
  ol.trigger_type,
  ol.trigger_reason,
  ol.previous_state,
  ol.metadata
FROM opportunity_lifecycle ol
WHERE ol.exited_at IS NULL;
```

**lifecycle_analytics** - Aggregated lifecycle metrics
```sql
CREATE VIEW lifecycle_analytics AS
SELECT
  state,
  COUNT(*) as opportunity_count,
  AVG(duration_seconds) as avg_duration_seconds,
  MIN(duration_seconds) as min_duration_seconds,
  MAX(duration_seconds) as max_duration_seconds,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds) as median_duration_seconds
FROM opportunity_lifecycle
WHERE exited_at IS NOT NULL
GROUP BY state;
```

### Entity Relationships

```mermaid
erDiagram
    COMPANIES ||--o{ HR_LEADS : "has"
    COMPANIES ||--o{ AGENT_DECISIONS : "evaluated_by"
    HR_LEADS ||--o{ OPPORTUNITY_LIFECYCLE : "tracked_in"
    HR_LEADS ||--o{ LEAD_SCORES : "scored_as"
    HR_LEADS ||--o{ OUTREACH_TELEMETRY : "receives"

    AGENT_DECISIONS ||--o{ AGENT_OVERRIDES : "corrected_by"
    AGENTS ||--o{ AGENT_TASKS : "performs"
    AGENTS ||--o{ AGENT_REFLECTIONS : "reflects"

    VOICE_TEMPLATES ||--o{ OUTREACH_TELEMETRY : "used_in"

    COMPANIES {
        uuid id PK
        text name
        text domain UK
        text industry
        int employee_count
        numeric quality_score
        jsonb metadata
    }

    HR_LEADS {
        uuid id PK
        uuid company_id FK
        text contact_name
        text contact_tier
        int lead_score
        text lifecycle_state
        boolean favorite
    }

    AGENT_DECISIONS {
        uuid id PK
        uuid company_id FK
        text tool_name
        jsonb input_params
        jsonb output_result
        numeric score
        numeric confidence
    }

    OPPORTUNITY_LIFECYCLE {
        uuid id PK
        uuid opportunity_id FK
        text state
        text sub_state
        timestamp entered_at
        timestamp exited_at
    }

    LEAD_SCORES {
        uuid opportunity_id PK
        int q_score
        int engagement_score
        int fit_score
        int lead_score
        text grade
    }
```

---

## API Architecture

### Server Configuration

**Entry Point**: `/Users/skc/DataScience/upr/server.js`

**Framework**: Express.js v4.21.2
**Port**: 8080 (Cloud Run) or from PORT env variable
**Trust Proxy**: Enabled for Cloud Run X-Forwarded headers
**Request Limits**: 10MB JSON/URL-encoded bodies

### Middleware Stack

```javascript
// server.js middleware ordering
1. Health Check (/health) - BEFORE all middleware
2. Trust Proxy configuration
3. CORS (all origins in production)
4. Cookie Parser
5. JSON Body Parser (10MB limit)
6. General Rate Limiter (100 req/15min)
7. Request Logging
8. Route-specific Rate Limiters
9. Authentication (JWT)
10. Route Handlers
11. Error Handlers
12. Sentry Error Tracking
13. SPA Catch-all (serves React dashboard)
```

### Authentication & Authorization

**Implementation**: `/Users/skc/DataScience/upr/server/routes/auth.js`

**Authentication Method**: JWT (JSON Web Tokens)
- Token generation via `/api/auth/login`
- Token validation via `readBearer()` utility
- Session management in-memory (no persistent sessions)
- Admin credentials from environment variables (ADMIN_USERNAME, ADMIN_PASSWORD)

**Middleware Files**:
- `/Users/skc/DataScience/upr/server/middleware/requireSession.js` - Session validation
- `/Users/skc/DataScience/upr/server/middleware/authAny.js` - Flexible auth
- `/Users/skc/DataScience/upr/server/middleware/agentHubAuth.js` - Agent-specific auth

**Endpoints**:
```
POST /api/auth/login
  Request: { username, password }
  Response: { ok: true, token: "..." }
  Rate Limit: 5 attempts/15min

POST /api/auth/logout
  Request: Bearer token in Authorization header
  Response: { ok: true }
```

### Rate Limiting

**Implementation**: `/Users/skc/DataScience/upr/server/middleware/rateLimiter.js`

**Limiters**:
```javascript
generalLimiter: 100 requests/15 minutes (all API routes)
authLimiter: 5 requests/15 minutes (login attempts)
enrichmentLimiter: 20 requests/15 minutes (enrichment endpoints)
radarLimiter: 5 requests/hour (RADAR discovery)
```

**Strategy**: In-memory store (express-rate-limit)

### API Routes

#### Core Routes (CommonJS)

1. **Admin Routes** - `/api/admin`
   - File: `/Users/skc/DataScience/upr/routes/admin.js`
   - System administration, user management

2. **Agent Core Routes** - `/api/agent-core`
   - File: `/Users/skc/DataScience/upr/routes/agent-core.js`
   - SIVA Tools API (12 primitives)
   - Endpoints: `/v1/tools/evaluate_company_quality`, `/v1/tools/evaluate_contact_tier`, etc.

3. **Companies Routes** - `/api/companies`
   - File: `/Users/skc/DataScience/upr/routes/companies.js`
   - Company CRUD, resolution, autocomplete

4. **Enrichment Routes** - `/api/enrichment`
   - File: `/Users/skc/DataScience/upr/routes/enrichment/unified.js`
   - Unified enrichment pipeline: `/start`, `/status`, `/leads`

5. **HR Leads Routes** - `/api/hr-leads`
   - File: `/Users/skc/DataScience/upr/routes/hrLeads.js`
   - Lead management, favorites, irrelevant marking

6. **Outreach Routes** - `/api/outreach`
   - File: `/Users/skc/DataScience/upr/routes/outreach.js`
   - Outreach generation, templates, telemetry

7. **Monitoring Routes** - `/api/monitoring`
   - File: `/Users/skc/DataScience/upr/routes/monitoring.js`
   - System health, rule performance monitoring (Sprint 28)

8. **Agent Hub Routes** - `/api/agent-hub`
   - File: `/Users/skc/DataScience/upr/routes/agent-hub.js`
   - Centralized agentic hub REST API (Sprint 29)

#### ES Module Routes (Async Loaded)

9. **Auth Routes** - `/api/auth` (ES Module)
   - File: `/Users/skc/DataScience/upr/server/routes/auth.js`
   - Login, logout (JWT-based)

10. **Orchestration Routes** - `/api/orchestration`
    - File: `/Users/skc/DataScience/upr/routes/orchestration.js`
    - Multi-source orchestration (Sprint 19 Task 1)

11. **Discovery Routes** - `/api/discovery`
    - File: `/Users/skc/DataScience/upr/routes/discovery.js`
    - Unified signal pipeline (Sprint 19 Task 5)

12. **RADAR Routes** - `/api/radar`
    - File: `/Users/skc/DataScience/upr/routes/radar.js`
    - RADAR discovery module

13. **LinkedIn Routes** - `/api/linkedin`
    - File: `/Users/skc/DataScience/upr/routes/linkedin.js`
    - LinkedIn signal source (Sprint 18 Task 5)

14. **Webhooks Routes** - `/api/webhooks`
    - File: `/Users/skc/DataScience/upr/routes/webhooks.js`
    - Webhook delivery management (Sprint 18 Task 6)

15. **Intelligence Routes** - `/api/intelligence`
    - File: `/Users/skc/DataScience/upr/routes/intelligence.js`
    - Intelligence reports and analytics

16. **Knowledge Graph Routes** - `/api/knowledge-graph`
    - File: `/Users/skc/DataScience/upr/routes/knowledgeGraph.js`
    - Neo4j graph queries

17. **Experiments Routes** - `/api/experiments`
    - File: `/Users/skc/DataScience/upr/routes/experiments.js`
    - A/B testing experiments

18. **Lifecycle Transition Routes** - `/api/lifecycle/transition`
    - File: `/Users/skc/DataScience/upr/server/routes/lifecycleTransition.js`
    - Lifecycle state transitions

19. **Lead Prioritization Routes** - `/api/lead-prioritization`
    - File: `/Users/skc/DataScience/upr/server/routes/leadPrioritization.js`
    - Lead scoring and priority ranking

20. **Prompt Analytics Routes** - `/api/prompt-analytics`
    - File: `/Users/skc/DataScience/upr/server/routes/promptAnalytics.js`
    - Prompt performance tracking

21. **Prompt Library Routes** - `/api/prompt-library`
    - File: `/Users/skc/DataScience/upr/server/routes/promptLibrary.js`
    - Prompt template management

### Health Check Endpoints

```
GET /health
  Response: { status: "ok", timestamp: "...", uptime: 123, port: 8080 }
  Use: Cloud Run startup probe

GET /ready
  Response: { status: "ready", database: "connected" }
  Use: Cloud Run readiness probe (validates DB connection)

GET /health/embeddings
  Response: { status: "ok", checks: {...}, metrics: {...} }
  Use: Embedding system health (vector dimensions, performance)
```

### Error Handling

**Global Error Handler**:
```javascript
app.use((err, req, res, next) => {
  Sentry.captureException(err);
  console.error('Express error handler:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});
```

**Sentry Integration**:
- Initialization: `/Users/skc/DataScience/upr/instrument.js`
- All errors captured and sent to Sentry
- Test endpoint: `GET /debug-sentry`

---

## SIVA Framework

### Overview

SIVA (Structured Intelligence for Value Assessment) is a collection of 12 AI-powered decision primitives that evaluate leads, contacts, companies, and generate outreach. Each tool is standalone, versioned, and produces structured outputs with natural language reasoning.

### SIVA Tools (Decision Primitives)

Located in: `/Users/skc/DataScience/upr/server/siva-tools/`

#### Layer 1: Foundation Tools (STRICT - No LLM)

1. **CompanyQualityTool** (`CompanyQualityToolStandalone.js`)
   - **Primitive**: `EVALUATE_COMPANY_QUALITY`
   - **Purpose**: Score company fit using competitive algorithm
   - **Input**: Company data (name, domain, industry, size, location)
   - **Output**: Quality score (0-100), tier (HOT/WARM/COLD), keyFactors reasoning
   - **SLA**: ≤300ms P50, ≤900ms P95
   - **Version**: v2.0
   - **Features**:
     - Enterprise detection (10,000+ employees)
     - High-value industry matching (FinTech, Tech, Healthcare)
     - Natural language reasoning
     - A/B testing support (Sprint 27)
     - Rule engine integration (shadow mode, Sprint 22)

2. **ContactTierTool** (`ContactTierToolStandalone.js`)
   - **Primitive**: `EVALUATE_CONTACT_TIER`
   - **Purpose**: Classify contact by decision-making authority
   - **Input**: Contact title, seniority signals
   - **Output**: Tier (T1/T2/T3/T4), influence score, reasoning
   - **Tiers**:
     - T1: C-Suite, VP level (decision makers)
     - T2: Directors, Senior Managers (influencers)
     - T3: Managers (gatekeepers)
     - T4: Individual contributors (end users)

3. **TimingScoreTool** (`TimingScoreToolStandalone.js`)
   - **Primitive**: `EVALUATE_TIMING_SCORE`
   - **Purpose**: Assess opportunity timing based on signals
   - **Input**: Hiring signals, company events, growth indicators
   - **Output**: Timing score (0-100), urgency level, timing factors

#### Layer 2: Intelligence Tools (DELEGATED - LLM-Powered)

4. **EdgeCasesTool** (`EdgeCasesToolStandalone.js`)
   - **Primitive**: `HANDLE_EDGE_CASES`
   - **Purpose**: Identify and handle unusual scenarios
   - **Input**: Lead data, context
   - **Output**: Edge case classification, handling recommendation

5. **OutreachChannelTool** (`OutreachChannelToolStandalone.js`)
   - **Primitive**: `SELECT_OUTREACH_CHANNEL`
   - **Purpose**: Choose optimal outreach channel
   - **Input**: Contact data, preferences, historical performance
   - **Output**: Channel recommendation (Email, LinkedIn, Phone), reasoning

6. **OpeningContextTool** (`OpeningContextToolStandalone.js`)
   - **Primitive**: `GENERATE_OPENING_CONTEXT`
   - **Purpose**: Create personalized opening for outreach
   - **Input**: Company research, contact role, timing signals
   - **Output**: Opening paragraph, personalization hooks

7. **CompositeScoreTool** (`CompositeScoreToolStandalone.js`)
   - **Primitive**: `CALCULATE_COMPOSITE_SCORE`
   - **Purpose**: Aggregate multiple scores into final lead score
   - **Input**: Q-Score, engagement, fit, timing scores
   - **Output**: Composite score (0-10,000), grade (A+ to D)

8. **OutreachMessageGenerator** (`OutreachMessageGeneratorToolStandalone.js`)
   - **Primitive**: `GENERATE_OUTREACH_MESSAGE`
   - **Purpose**: Create personalized outreach message
   - **Input**: Lead data, voice template, channel
   - **Output**: Generated message, personalization factors

#### Layer 3: Specialized Tools

9. **FollowUpStrategyTool** (`FollowUpStrategyToolStandalone.js`)
   - **Primitive**: `GENERATE_FOLLOWUP_STRATEGY`
   - **Purpose**: Plan multi-touch follow-up sequence
   - **Input**: Initial outreach, response status, engagement
   - **Output**: Follow-up timing, messaging, channel strategy

10. **ObjectionHandlerTool** (`ObjectionHandlerToolStandalone.js`)
    - **Primitive**: `HANDLE_OBJECTION`
    - **Purpose**: Generate objection response
    - **Input**: Objection text, lead context
    - **Output**: Recommended response, talking points

11. **RelationshipTrackerTool** (`RelationshipTrackerToolStandalone.js`)
    - **Primitive**: `TRACK_RELATIONSHIP`
    - **Purpose**: Monitor relationship progression
    - **Input**: Interaction history, sentiment
    - **Output**: Relationship score, stage, next steps

12. **HiringSignalExtractionTool** (`HiringSignalExtractionToolStandalone.js`)
    - **Primitive**: `EXTRACT_HIRING_SIGNALS`
    - **Purpose**: Extract hiring intent from job postings, news
    - **Input**: Job descriptions, company news
    - **Output**: Hiring signals, department growth, tech stack

### SIVA Tool Common Structure

All SIVA tools follow this pattern:

```javascript
class SIVAToolStandalone {
  constructor() {
    this.agentName = 'ToolName';
    this.POLICY_VERSION = 'v2.0';
    this.abTesting = new ABTestingHelper('ToolName');
    this.validateInput = ajv.compile(inputSchema);
    this.validateOutput = ajv.compile(outputSchema);
  }

  async execute(input) {
    // 1. Validate input
    // 2. Execute inline logic (primary)
    // 3. A/B test version selection
    // 4. Execute rule engine (shadow mode)
    // 5. Log decision to agent_decisions table
    // 6. Return output with reasoning
  }
}
```

### Decision Persistence

**Table**: `agent_decisions`
**Location**: `/Users/skc/DataScience/upr/db/migrations/2025_11_14_agent_core_persistence.sql`

Every SIVA tool execution is logged:
- Tool name, primitive, input/output
- Score, confidence, quality tier
- Execution time (performance tracking)
- Policy version, session ID
- Natural language reasoning

**Use Cases**:
- Audit trail for all AI decisions
- Performance monitoring
- Continuous learning from human overrides
- A/B test result analysis

### A/B Testing Support (Sprint 27)

**Implementation**: `/Users/skc/DataScience/upr/server/agent-core/ab-testing.js`

- Tools can have multiple rule versions (v1.0, v2.0, etc.)
- Traffic splitting by entity ID (company, contact)
- Comparison logging between versions
- Performance metrics per version

---

## Multi-Agent System

### Overview

Implemented in Sprint 37 and enhanced in Sprint 38, the multi-agent system enables Discovery, Validation, and Critic agents to collaborate on complex decisions through consensus mechanisms and reflection loops.

### Agent Types

**Base Agent**: All agents inherit from a common base class with:
- Unique agent ID and type
- Capability list (what the agent can do)
- Status (IDLE, BUSY, ERROR, OFFLINE)
- Performance metrics (success rate, response time)
- Reflection log (learning from decisions)

**Agent Types**:

1. **DiscoveryAgent**
   - **Purpose**: Find patterns, insights, opportunities
   - **Capabilities**:
     - Analyze lead data for patterns
     - Identify anomalies in engagement
     - Discover hidden opportunities
     - Suggest new scoring factors
     - Detect emerging trends
   - **Use Cases**: "Why are Dubai tech companies converting better?"

2. **ValidationAgent**
   - **Purpose**: Validate decisions, data quality, processes
   - **Capabilities**:
     - Validate data quality
     - Check business rules compliance
     - Verify lead scoring accuracy
     - Validate agent decisions
     - Ensure data consistency
   - **Use Cases**: "Is this lead score calculation correct?"

3. **CriticAgent**
   - **Purpose**: Challenge assumptions, identify risks
   - **Capabilities**:
     - Challenge assumptions
     - Identify risks and blind spots
     - Suggest alternatives
     - Evaluate decision quality
     - Provide constructive feedback
   - **Use Cases**: "What could go wrong with this lead assignment?"

### Agent Services

#### 1. AgentRegistryService

**File**: `/Users/skc/DataScience/upr/server/services/agentRegistryService.js`

**Methods**:
```javascript
registerAgent(agentId, agentType, capabilities, config)
  → Registers agent in agents table, returns agent record

unregisterAgent(agentId)
  → Sets agent status to OFFLINE

discoverAgents(requiredCapabilities, availability)
  → Finds agents matching capabilities and availability

getAgentStatus(agentId)
  → Returns current agent status and metrics

updateAgentMetrics(agentId, metrics)
  → Updates agent performance metrics
```

#### 2. AgentCoordinationService

**File**: `/Users/skc/DataScience/upr/server/services/agentCoordinationService.js`

**Methods**:
```javascript
createWorkflow(workflowType, definition)
  → Creates multi-agent workflow

executeWorkflow(workflowId, input)
  → Executes workflow with agent orchestration

distributeTask(task, agents)
  → Assigns tasks to available agents

aggregateResults(results, method)
  → Combines results from multiple agents

buildConsensus(opinions, strategy)
  → Builds consensus from conflicting agent opinions
```

#### 3. ReflectionService

**File**: `/Users/skc/DataScience/upr/server/services/reflectionService.js`

**Methods**:
```javascript
recordDecision(agentId, decision, context)
  → Logs agent decision

recordOutcome(decisionId, outcome)
  → Records actual outcome vs. prediction

triggerReflection(decisionId)
  → Initiates reflection process

extractLearnings(reflection)
  → Extracts insights from reflection

shareInsights(insights, targetAgents)
  → Shares learnings across agents
```

#### 4. AgentMonitoringService

**File**: `/Users/skc/DataScience/upr/server/services/agentMonitoringService.js`

**Methods**:
```javascript
trackAgentHealth(agentId)
  → Monitors agent availability

collectMetrics(agentId, metrics)
  → Gathers performance metrics

calculateCollaborationScore(agents)
  → Scores agent collaboration quality

detectAnomalies(metrics)
  → Identifies performance issues

getDashboard(options)
  → Returns monitoring dashboard data
```

### Multi-Agent Workflows

**Workflow Types**:

1. **Sequential Workflow**
   ```
   Agent A → Agent B → Agent C → Final Result
   ```
   Use case: Step-by-step lead qualification

2. **Parallel Workflow**
   ```
           ┌─> Discovery Agent ─┐
   Task ───├─> Validation Agent ─┤──> Aggregate
           └─> Critic Agent ─────┘
   ```
   Use case: Multi-perspective lead evaluation

3. **Review Workflow**
   ```
   Discovery (Propose) → Validation (Validate) → Critic (Critique) → Consensus
   ```
   Use case: High-stakes decisions requiring peer review

4. **Reflection Loop**
   ```
   Decision → Outcome → Reflection → Learning → Knowledge Update
   ```
   Use case: Continuous improvement from experience

### Agent Database Schema

**Tables**:
- `agents` - Agent registry with capabilities
- `agent_tasks` - Task assignment and tracking
- `agent_communications` - Inter-agent messaging
- `agent_reflections` - Learning and improvement
- `agent_workflows` - Multi-agent workflow definitions
- `agent_consensus` - Consensus building records

---

## Security Architecture

### Authentication

**Method**: JWT (JSON Web Tokens)

**Implementation**:
```javascript
// Login flow
POST /api/auth/login
  → Validates username/password
  → Generates JWT token
  → Stores session in-memory
  → Returns token to client

// Protected routes
Request with Authorization: Bearer <token>
  → readBearer() extracts token
  → Validates against active sessions
  → Proceeds if valid, 401 if invalid
```

**Admin Credentials**:
- Stored in environment variables (ADMIN_USERNAME, ADMIN_PASSWORD)
- NOT hardcoded (fixed in Sprint 39 security audit)
- Loaded from GCP Secret Manager in production

### Authorization

**Middleware**:
- `requireSession.js` - Enforces authentication
- `authAny.js` - Flexible auth for different user types
- `agentHubAuth.js` - Agent-specific authorization

**RBAC**: Not yet implemented (single admin role currently)

### API Security

1. **Rate Limiting** (Sprint 17)
   - General API: 100 requests/15 minutes
   - Auth endpoints: 5 attempts/15 minutes
   - Enrichment: 20 requests/15 minutes
   - RADAR: 5 requests/hour
   - Implementation: express-rate-limit with in-memory store

2. **Input Validation**
   - JSON Schema validation (AJV) on SIVA tool inputs
   - Request body size limits (10MB)
   - SQL injection prevention via parameterized queries

3. **CORS Configuration**
   - Enabled for all origins (production use)
   - Configurable via environment

4. **HTTPS Enforcement**
   - Cloud Run enforces HTTPS
   - HTTP automatically redirects to HTTPS

5. **Error Handling**
   - No sensitive information in error messages
   - Sentry logging for debugging (sanitized)

### Secrets Management

**GCP Secret Manager Integration**:
- Database passwords
- API keys (Apollo, OpenAI, Anthropic, etc.)
- JWT signing secrets
- Admin credentials

**Local Development**: `.env` file (gitignored)

### Data Security

1. **Database Encryption**
   - Cloud SQL encryption at rest (automatic)
   - SSL/TLS connections (configurable)
   - VPC private IP for database access

2. **PII Handling**
   - Contact emails, names stored encrypted
   - No credit card or payment data stored
   - GDPR/CCPA compliance ready

3. **Audit Logging**
   - All agent decisions logged with timestamps
   - User actions tracked in lifecycle transitions
   - Access logs via Cloud Logging

### Security Monitoring

**Sentry Integration**:
- Real-time error tracking
- Performance monitoring
- Exception capture and alerting
- Test endpoint: `/debug-sentry`

**GCP Monitoring**:
- Cloud Logging for access logs
- Cloud Monitoring for metrics
- Uptime checks for availability

---

## Infrastructure

### Cloud Platform

**Provider**: Google Cloud Platform (GCP)
**Project ID**: applied-algebra-474804-e6
**Region**: us-central1

### Components

#### 1. Cloud Run (Application)

**Service Name**: upr-web-service
**Configuration**:
- Container: Node.js 24.x
- Memory: 2GB (configurable)
- CPU: 2 vCPU (configurable)
- Min Instances: 1
- Max Instances: 10
- Concurrency: 80
- Port: 8080
- Timeout: 300 seconds

**Environment Variables**:
```bash
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://...  # Cloud SQL connection string
ADMIN_USERNAME=***  # From Secret Manager
ADMIN_PASSWORD=***  # From Secret Manager
OPENAI_API_KEY=***
ANTHROPIC_API_KEY=***
APOLLO_API_KEY=***
# ... additional secrets
```

**Health Checks**:
- Startup probe: `GET /health`
- Readiness probe: `GET /ready`
- Liveness probe: `GET /health`

**Networking**:
- VPC Connector for Cloud SQL private IP
- Public ingress (HTTPS only)
- Cloud Load Balancer (automatic)

#### 2. Cloud SQL (Database)

**Instance**: upr-production
**IP Address**: 34.121.0.240
**Port**: 5432
**Database**: upr_production

**Configuration**:
- PostgreSQL 15.x
- Machine Type: db-custom-2-7680 (2 vCPU, 7.5GB RAM)
- Storage: 100GB SSD (auto-resize enabled)
- Backups: Automated daily at 3:00 AM UTC
- High Availability: Single zone (for cost optimization)
- Point-in-time recovery: Enabled (7-day retention)

**Connection Methods**:
1. VPC (Private IP) - Used by Cloud Run
2. Public IP - For external tools (with authorized networks)
3. Cloud SQL Proxy - For local development

**Security**:
- SSL/TLS connections required
- Private IP preferred
- Automated backups encrypted
- Secrets in GCP Secret Manager

#### 3. Redis (Caching)

**Provider**: Redis Cloud or GCP Memorystore
**Configuration**:
- Version: Redis 7.x
- Memory: 1GB
- Persistence: RDB snapshots
- Eviction policy: allkeys-lru

**Use Cases**:
- API response caching
- Session storage
- Rate limiting state
- Email pattern cache (NeverBounce results)

#### 4. Neo4j (Knowledge Graph)

**Deployment**: Neo4j Aura or self-hosted
**Purpose**: Entity relationships, knowledge graph queries

**Schema**:
- Companies, Contacts, Opportunities as nodes
- Relationships: WORKS_AT, REPORTS_TO, ENGAGED_WITH
- Temporal data for relationship evolution

#### 5. Cloud Storage (Optional)

**Buckets**:
- `upr-backups`: Database backups, exports
- `upr-assets`: Static assets, documents
- `upr-logs`: Long-term log storage

### Deployment Architecture

```mermaid
graph TB
    subgraph "Internet"
        Users[Users/API Clients]
    end

    subgraph "GCP Project: applied-algebra-474804-e6"
        subgraph "Cloud Run"
            CR[upr-web-service<br/>Port 8080<br/>Min 1, Max 10 instances]
        end

        subgraph "VPC Network"
            VPCC[VPC Connector]
        end

        subgraph "Cloud SQL"
            DB[(PostgreSQL 15<br/>34.121.0.240:5432<br/>upr_production)]
        end

        subgraph "Secret Manager"
            SM[Secrets<br/>API Keys, Credentials]
        end

        subgraph "Cloud Monitoring"
            MON[Metrics & Logs]
        end

        subgraph "External Services"
            Redis[(Redis Cache)]
            Neo4j[(Neo4j Graph)]
        end
    end

    Users -->|HTTPS| CR
    CR -->|VPC Private IP| VPCC
    VPCC --> DB
    CR -->|Read Secrets| SM
    CR -->|Metrics/Logs| MON
    CR --> Redis
    CR --> Neo4j
```

### CI/CD Pipeline

**Source Control**: Git (GitHub)
**Deployment Script**: `/Users/skc/DataScience/upr/scripts/deploy.sh`

**Deployment Steps**:
1. Build Docker image
2. Push to Google Container Registry
3. Deploy to Cloud Run
4. Run smoke tests
5. Update Notion deployment status

**Deployment Command**:
```bash
npm run deploy
```

### Monitoring & Observability

**Application Monitoring** (Sentry):
- Error tracking
- Performance monitoring
- Release tracking
- User feedback

**Infrastructure Monitoring** (GCP):
- Cloud Monitoring dashboards
- Uptime checks
- Log-based metrics
- Alerting policies

**Custom Metrics**:
- Lead enrichment rate
- Agent decision latency
- API response times
- Database query performance

### Backup & Disaster Recovery

**Database Backups**:
- Automated daily backups (3:00 AM UTC)
- 7-day retention
- Point-in-time recovery enabled
- Manual backup script: `/Users/skc/DataScience/upr/scripts/backup-db.sh`

**Recovery Procedures**:
- RTO (Recovery Time Objective): < 15 minutes
- RPO (Recovery Point Objective): < 5 minutes
- Automated failover for Cloud SQL
- Cloud Run auto-restart on failure

**Backup Script**:
```bash
npm run backup
```

### Cost Monitoring

**Script**: `/Users/skc/DataScience/upr/scripts/check-gcp-costs.sh`

**Command**:
```bash
npm run costs
```

---

## Integration Points

### External APIs

#### 1. Apollo API (Lead Enrichment)

**Purpose**: Enrich company and contact data
**Base URL**: https://api.apollo.io/v1/
**Authentication**: API Key (X-Api-Key header)

**Endpoints Used**:
```
POST /organizations/enrich
  → Enriches company data by domain

POST /people/match
  → Finds contacts by company and role

GET /people/search
  → Searches people database
```

**Rate Limits**:
- Free tier: 50 requests/hour
- Paid tier: Custom limits
- Handled via rate limiter and quota tracking

**Implementation**:
- `/Users/skc/DataScience/upr/server/lib/apollo.js` (assumed)
- Integrated in enrichment pipeline

#### 2. Hunter API (Email Finding)

**Purpose**: Find and verify email addresses
**Base URL**: https://api.hunter.io/v2/
**Authentication**: API Key (query parameter)

**Endpoints Used**:
```
GET /email-finder
  → Finds email for person at company

GET /email-verifier
  → Verifies email deliverability
```

**Rate Limits**: 50-10,000 requests/month (plan-based)

#### 3. NeverBounce API (Email Verification)

**Purpose**: Validate email deliverability
**Base URL**: https://api.neverbounce.com/v4/
**Authentication**: API Key

**Endpoints Used**:
```
POST /single/check
  → Verify single email

POST /jobs/create
  → Bulk email verification
```

**Caching**: Results cached in Redis and `nb_cache` table

**Implementation**: `/Users/skc/DataScience/upr/server/lib/emailIntelligence/nb.js`

#### 4. OpenAI API (GPT Models)

**Purpose**: Outreach generation, content analysis
**Base URL**: https://api.openai.com/v1/
**Authentication**: Bearer token

**Models Used**:
- GPT-4 Turbo for complex reasoning
- GPT-3.5 Turbo for simple tasks

**Endpoints Used**:
```
POST /chat/completions
  → Generate outreach messages, analyze content

POST /embeddings
  → Generate text embeddings (384-dim)
```

**Cost Tracking**: Token usage logged in `outreach_telemetry`

#### 5. Anthropic API (Claude Models)

**Purpose**: Alternative to OpenAI, advanced reasoning
**Base URL**: https://api.anthropic.com/v1/
**Authentication**: X-API-Key header

**Models Used**:
- Claude 3.5 Sonnet for outreach generation
- Claude 3 Opus for complex analysis

**SDK**: `@anthropic-ai/sdk` v0.32.1

#### 6. Notion API (Project Management)

**Purpose**: Sprint tracking, task management
**Base URL**: https://api.notion.com/v1/
**Authentication**: Bearer token

**Use Cases**:
- Sync sprint progress
- Update task status
- Generate reports

**Scripts**:
- `/Users/skc/DataScience/upr/scripts/notion/syncAll.js`
- `/Users/skc/DataScience/upr/scripts/notion/completeSprint40.js`

**Endpoints Used**:
```
POST /databases/{database_id}/query
  → Query sprint databases

PATCH /pages/{page_id}
  → Update task status
```

### Internal Integrations

#### 1. SIVA Tools ↔ Agent Core

**Flow**:
```
SIVA Tool Decision
  → Logged to agent_decisions table
  → Triggers agent workflow if confidence < threshold
  → Agent reviews decision
  → Consensus built
  → Final decision logged
```

#### 2. Lifecycle Engine ↔ Scoring Engine

**Flow**:
```
Lifecycle State Change
  → Triggers score recalculation
  → Engagement score updated
  → Lead score recomputed
  → Priority ranking adjusted
  → Alerts generated if score drops
```

#### 3. Enrichment Pipeline ↔ Lead Management

**Flow**:
```
Lead Uploaded
  → Enrichment job created
  → Apollo enrichment
  → Company quality evaluation (SIVA)
  → Contact tier assessment (SIVA)
  → Lead score calculation
  → Lifecycle state set to DISCOVERED
  → Lead available in dashboard
```

### Integration Patterns

1. **API Gateway Pattern**: Express.js routes act as gateway to services
2. **Service Layer Pattern**: Business logic isolated in services
3. **Event-Driven Pattern**: Lifecycle transitions trigger events
4. **Caching Pattern**: Redis caches API responses, reduces external calls
5. **Circuit Breaker Pattern**: Failed API calls don't crash system
6. **Retry Pattern**: Exponential backoff for transient failures

---

## Data Flow Diagrams

### 1. Lead Enrichment Flow

```mermaid
sequenceDiagram
    participant User
    participant API
    participant Enrichment
    participant Apollo
    participant SIVA
    participant DB
    participant Lifecycle

    User->>API: POST /api/enrichment/start
    API->>Enrichment: Create enrichment job
    Enrichment->>DB: Insert job record
    Enrichment->>Apollo: Enrich company data
    Apollo-->>Enrichment: Company details
    Enrichment->>SIVA: Evaluate company quality
    SIVA-->>Enrichment: Quality score + tier
    Enrichment->>Apollo: Find contacts
    Apollo-->>Enrichment: Contact list
    Enrichment->>SIVA: Evaluate contact tiers
    SIVA-->>Enrichment: Tier classifications
    Enrichment->>DB: Store enriched lead
    Enrichment->>Lifecycle: Set state to DISCOVERED
    Lifecycle->>DB: Create lifecycle record
    Enrichment-->>API: Enrichment complete
    API-->>User: Success response
```

### 2. Lead Scoring Flow

```mermaid
sequenceDiagram
    participant Trigger
    participant ScoreCalc
    participant QScore
    participant Engagement
    participant Fit
    participant DB
    participant Alerts

    Trigger->>ScoreCalc: Calculate lead score
    ScoreCalc->>QScore: Get quality score (0-100)
    QScore->>DB: Query company quality
    DB-->>QScore: Quality data
    QScore-->>ScoreCalc: Q-Score: 85

    ScoreCalc->>Engagement: Get engagement score (0-100)
    Engagement->>DB: Query activity history
    DB-->>Engagement: Activity data
    Engagement-->>ScoreCalc: Engagement: 72

    ScoreCalc->>Fit: Get fit score (0-100)
    Fit->>DB: Query company fit factors
    DB-->>Fit: Fit data
    Fit-->>ScoreCalc: Fit: 90

    ScoreCalc->>ScoreCalc: Lead Score = 85 * 72 * 90 / 10000
    ScoreCalc->>ScoreCalc: Lead Score = 5508 (Grade: B+)

    ScoreCalc->>DB: Store lead_scores
    ScoreCalc->>DB: Store score_history

    alt Score Changed Significantly
        ScoreCalc->>Alerts: Generate score change alert
        Alerts->>User: Notify score change
    end

    ScoreCalc-->>Trigger: Score calculated
```

### 3. Multi-Agent Consensus Flow

```mermaid
sequenceDiagram
    participant Coordinator
    participant Discovery
    participant Validation
    participant Critic
    participant DB

    Coordinator->>Coordinator: Create workflow
    Coordinator->>DB: Store workflow definition

    par Parallel Agent Execution
        Coordinator->>Discovery: Analyze lead patterns
        Discovery->>DB: Query historical data
        DB-->>Discovery: Pattern data
        Discovery->>Discovery: Identify: "High conversion in Dubai tech"
        Discovery-->>Coordinator: Opinion: QUALIFY

        Coordinator->>Validation: Validate data quality
        Validation->>DB: Check data completeness
        DB-->>Validation: Data quality metrics
        Validation->>Validation: Data quality: 92% complete
        Validation-->>Coordinator: Opinion: QUALIFY

        Coordinator->>Critic: Identify risks
        Critic->>DB: Query similar leads
        DB-->>Critic: Historical outcomes
        Critic->>Critic: Risk: "Small company, uncertain budget"
        Critic-->>Coordinator: Opinion: PROCEED_WITH_CAUTION
    end

    Coordinator->>Coordinator: Aggregate opinions
    Coordinator->>Coordinator: Build consensus (2/3 QUALIFY)
    Coordinator->>DB: Store consensus result

    Coordinator->>Discovery: Record reflection
    Coordinator->>Validation: Record reflection
    Coordinator->>Critic: Record reflection

    Discovery->>DB: Store reflection + learnings
    Validation->>DB: Store reflection + learnings
    Critic->>DB: Store reflection + learnings

    Coordinator-->>User: Consensus: QUALIFY (confidence: 0.85)
```

### 4. Outreach Generation Flow

```mermaid
sequenceDiagram
    participant User
    participant API
    participant Outreach
    participant SIVA
    participant OpenAI
    participant VoiceTemplate
    participant DB

    User->>API: POST /api/outreach/generate
    API->>Outreach: Generate outreach request

    Outreach->>DB: Get lead data
    DB-->>Outreach: Lead + company + contact

    Outreach->>SIVA: Get opening context
    SIVA->>OpenAI: Analyze company + contact
    OpenAI-->>SIVA: Context + hooks
    SIVA-->>Outreach: Opening context

    Outreach->>VoiceTemplate: Get voice template
    DB-->>Outreach: Voice profile

    Outreach->>SIVA: Generate outreach message
    SIVA->>OpenAI: Generate with context + voice
    OpenAI-->>SIVA: Generated message
    SIVA-->>Outreach: Personalized message

    Outreach->>DB: Store outreach_telemetry
    Outreach->>DB: Update lead status

    Outreach-->>API: Message + metadata
    API-->>User: Generated outreach
```

### 5. Lifecycle State Transition Flow

```mermaid
stateDiagram-v2
    [*] --> DISCOVERED

    DISCOVERED --> QUALIFIED: Quality check passed
    DISCOVERED --> CLOSED: Disqualified early

    QUALIFIED --> OUTREACH: Contacts identified
    QUALIFIED --> CLOSED: Failed qualification

    OUTREACH --> ENGAGED: Response received
    OUTREACH --> DORMANT: No response after 30d
    OUTREACH --> CLOSED: Opted out

    ENGAGED --> NEGOTIATING: Meeting scheduled
    ENGAGED --> DORMANT: Lost interest
    ENGAGED --> CLOSED: Not interested

    NEGOTIATING --> ENGAGED: More info needed
    NEGOTIATING --> CLOSED: Won/Lost
    NEGOTIATING --> DORMANT: Stalled

    DORMANT --> OUTREACH: Re-engagement triggered
    DORMANT --> QUALIFIED: New opportunity
    DORMANT --> CLOSED: Permanently closed

    CLOSED --> QUALIFIED: Re-opened (manual)
    CLOSED --> [*]
```

---

## Scalability and Performance

### Performance Targets

**API Response Times**:
- P50: < 200ms
- P95: < 500ms
- P99: < 1000ms

**Database Queries**:
- P50: < 50ms
- P95: < 200ms
- P99: < 500ms

**SIVA Tools**:
- CompanyQualityTool: P50 < 300ms, P95 < 900ms
- ContactTierTool: P50 < 200ms, P95 < 500ms
- AI-powered tools: P50 < 2000ms, P95 < 5000ms

**Throughput**:
- 100+ requests/second sustained
- 1000 concurrent users supported

### Scaling Strategies

#### 1. Horizontal Scaling (Cloud Run)

**Current**: Min 1, Max 10 instances
**Auto-scaling Triggers**:
- CPU utilization > 70%
- Request concurrency > 80
- Request latency > 1000ms

**Scale-up**: Automatic within 30 seconds
**Scale-down**: Gradual (5-minute cooldown)

#### 2. Database Scaling

**Read Replicas**: Not yet implemented (future optimization)
**Connection Pooling**: 20 max connections per instance
**Query Optimization**:
- Indexes on all foreign keys
- Composite indexes for common queries
- Partial indexes for filtered queries

**Performance Indexes**:
```sql
-- Lead lookup by company
CREATE INDEX idx_hr_leads_company_id ON hr_leads(company_id);

-- Current lifecycle state
CREATE INDEX idx_lifecycle_current_state
ON opportunity_lifecycle(opportunity_id, entered_at DESC)
WHERE exited_at IS NULL;

-- Agent decision lookup
CREATE INDEX idx_agent_decisions_tool ON agent_decisions(tool_name);
CREATE INDEX idx_agent_decisions_created ON agent_decisions(created_at DESC);

-- Score lookup and sorting
CREATE INDEX idx_lead_scores_score ON lead_scores(lead_score DESC);
CREATE INDEX idx_lead_scores_grade ON lead_scores(grade);
```

#### 3. Caching Strategy

**Redis Caching**:
- API responses (5-minute TTL)
- Email patterns (24-hour TTL)
- NeverBounce results (permanent, invalidate on failure)
- Company data (1-hour TTL)

**In-Memory Caching**:
- Rate limiting state
- Session storage (JWT validation)
- SIVA tool schemas (AJV compiled validators)

**Cache Invalidation**:
- Time-based expiration
- Event-based invalidation (on data update)
- Manual cache clear API

#### 4. Async Processing

**Background Workers**:
- Webhook delivery worker (`/Users/skc/DataScience/upr/server/workers/webhookWorker.js`)
- Enrichment job worker (BullMQ queues)
- Score decay calculation (cron job)

**Message Queue**: BullMQ with Redis backend
**Retry Strategy**: Exponential backoff (3 retries max)

#### 5. Database Partitioning (Future)

**Candidates for Partitioning**:
- `agent_decisions` by created_at (monthly partitions)
- `opportunity_lifecycle` by entered_at (quarterly partitions)
- `outreach_telemetry` by created_at (monthly partitions)

### Performance Monitoring

**Metrics Collected**:
1. API endpoint latency (per route)
2. Database query time (slow query log)
3. SIVA tool execution time (logged in agent_decisions)
4. Agent workflow duration (agent_tasks.duration_ms)
5. External API latency (Apollo, OpenAI, etc.)

**Monitoring Tools**:
- Sentry Performance Monitoring
- GCP Cloud Monitoring
- Custom metrics via Prometheus client (`prom-client` v15.1.3)

**Alerting Thresholds**:
- P95 latency > 1000ms
- Error rate > 1%
- Database connections > 80% pool
- CPU utilization > 80%

### Optimization Techniques

1. **Query Optimization**:
   - SELECT only needed columns
   - Use LIMIT for paginated results
   - Avoid N+1 queries (use JOINs or batch fetching)
   - Prepared statements for parameterized queries

2. **Payload Optimization**:
   - GZIP compression on API responses
   - Pagination for large datasets (100 items/page default)
   - Lazy loading for dashboard components

3. **Database Connection Pooling**:
   - Reuse connections (max 20 per instance)
   - Automatic connection retry with exponential backoff
   - Connection health checks (keepAlive)

4. **Code Optimization**:
   - Async/await for I/O operations
   - Parallel API calls with Promise.all()
   - Early returns to avoid unnecessary processing
   - Efficient data structures (Maps over Objects for lookups)

---

## Technology Stack

### Backend

**Runtime**:
- Node.js v24.4.1
- Runtime: V8 JavaScript engine

**Framework**:
- Express.js v4.21.2 (web server)
- CommonJS + ES Modules hybrid

**Database**:
- PostgreSQL 15.x (Cloud SQL)
- pg (node-postgres) v8.16.3 client
- Connection pooling (max 20 connections)

**Caching**:
- Redis v7.x
- ioredis v5.8.1 client

**Graph Database**:
- Neo4j v5.x
- neo4j-driver v5.28.0

**Background Jobs**:
- BullMQ v5.61.0 (Redis-backed queue)
- node-cron v4.2.1 (scheduled jobs)

### AI & Machine Learning

**OpenAI**:
- openai v6.2.0 SDK
- Models: GPT-4 Turbo, GPT-3.5 Turbo
- Use: Outreach generation, content analysis

**Anthropic**:
- @anthropic-ai/sdk v0.32.1
- Models: Claude 3.5 Sonnet, Claude 3 Opus
- Use: Advanced reasoning, agent decisions

**Embeddings**:
- OpenAI text-embedding-3-small (384 dimensions)
- Use: Email pattern matching, semantic search

**Vector Storage**:
- PostgreSQL with pgvector extension
- Tables: email_patterns, pattern_failures, kb_chunks

### Frontend

**Framework**:
- React v18.3.1
- React Router DOM v7.8.2

**Build Tool**:
- Vite v5.4.8
- @vitejs/plugin-react v4.3.1

**UI Libraries**:
- Framer Motion v12.23.22 (animations)
- Lucide React v0.545.0 (icons)

**State Management**: Built-in React state (no Redux)

### Security & Monitoring

**Authentication**:
- jsonwebtoken v9.0.2 (JWT)
- bcryptjs v3.0.2 (password hashing)

**Security**:
- express-rate-limit v8.2.1 (rate limiting)
- cors v2.8.5 (CORS handling)
- helmet (implicit via Cloud Run headers)

**Monitoring**:
- @sentry/node v10.23.0 (backend)
- @sentry/react v10.23.0 (frontend)
- winston v3.18.3 (logging)
- prom-client v15.1.3 (Prometheus metrics)

### Data Processing

**Validation**:
- ajv v8.17.1 (JSON Schema validation)
- ajv-formats v3.0.1 (format validation)

**Parsing**:
- cheerio v1.1.2 (HTML parsing)
- csv-parse v6.1.0 (CSV parsing)
- pdf-parse v2.3.12 (PDF parsing)

**Data Manipulation**:
- mathjs v15.1.0 (calculations)
- jsonpath v1.1.1 (JSON querying)

### HTTP & Networking

**HTTP Client**:
- axios v1.13.2

**File Upload**:
- multer v2.0.2

**Utilities**:
- cookie-parser v1.4.7
- string-similarity v4.0.4 (fuzzy matching)
- node-cache v5.1.2 (in-memory caching)

### Development Tools

**Testing**:
- jest v30.2.0
- @types/jest v30.0.0

**Environment**:
- dotenv v16.6.1

**Process Management**:
- pm2 v6.0.13
- pm2-runtime (production)

### Infrastructure & Deployment

**Cloud Platform**: Google Cloud Platform (GCP)
- Cloud Run (containerized app hosting)
- Cloud SQL (PostgreSQL managed database)
- Secret Manager (secrets storage)
- Cloud Monitoring & Logging

**Container**: Docker (implicit via Cloud Run)

**Deployment**: Google Cloud Build

### External Integrations

**APIs**:
- Apollo API (lead enrichment)
- Hunter API (email finding)
- NeverBounce API (email verification)
- Notion API (@notionhq/client)

**Model Context Protocol**:
- @modelcontextprotocol/sdk v1.22.0

---

## Appendix

### File Structure Reference

```
/Users/skc/DataScience/upr/
│
├── server.js                          # Main entry point
├── instrument.js                      # Sentry initialization
├── package.json                       # Dependencies
├── ecosystem.config.cjs               # PM2 configuration
│
├── server/
│   ├── routes/                        # API route handlers
│   │   ├── auth.js                    # Authentication (ES Module)
│   │   ├── agent-core.js              # SIVA Tools API
│   │   ├── companies.js               # Company management
│   │   ├── leads.js                   # Lead management
│   │   ├── outreach.js                # Outreach generation
│   │   ├── lifecycleTransition.js     # Lifecycle transitions
│   │   ├── leadPrioritization.js      # Lead scoring/priority
│   │   └── ... (25+ routes)
│   │
│   ├── services/                      # Business logic services
│   │   ├── agentRegistryService.js    # Agent registration
│   │   ├── agentCoordinationService.js# Multi-agent orchestration
│   │   ├── reflectionService.js       # Agent reflection
│   │   ├── lifecycleStateEngine.js    # State machine
│   │   ├── leadScoreCalculator.js     # Lead scoring
│   │   ├── fitScoringService.js       # Fit scoring
│   │   ├── voiceTemplateService.js    # Voice templates
│   │   └── ... (45+ services)
│   │
│   ├── siva-tools/                    # 12 SIVA decision primitives
│   │   ├── CompanyQualityToolStandalone.js
│   │   ├── ContactTierToolStandalone.js
│   │   ├── TimingScoreToolStandalone.js
│   │   ├── OutreachMessageGeneratorToolStandalone.js
│   │   └── ... (12 tools)
│   │
│   ├── middleware/                    # Express middleware
│   │   ├── rateLimiter.js             # Rate limiting
│   │   ├── requireSession.js          # Auth middleware
│   │   ├── authAny.js                 # Flexible auth
│   │   └── agentHubAuth.js            # Agent auth
│   │
│   ├── lib/                           # Shared libraries
│   │   ├── emailIntelligence/         # Email pattern matching
│   │   │   ├── rag.js                 # RAG for email patterns
│   │   │   ├── nb.js                  # NeverBounce integration
│   │   │   ├── orchestrator.js        # Email intelligence orchestrator
│   │   │   └── ... (24 files)
│   │   └── ... (other lib modules)
│   │
│   ├── workers/                       # Background workers
│   │   └── webhookWorker.js           # Webhook delivery
│   │
│   └── agent-core/                    # Agent system core
│       ├── ab-testing.js              # A/B testing helper
│       ├── rule-engine.js             # Rule engine
│       ├── scoring-adjustments.js     # Scoring feedback
│       └── cognitive_extraction_logic_*.json
│
├── dashboard/                         # React frontend
│   ├── src/
│   └── dist/                          # Built static files
│
├── db/migrations/                     # Database migrations
│   ├── 2025_11_14_agent_core_persistence.sql
│   ├── 2025_11_18_opportunity_lifecycle.sql
│   ├── 2025_11_18_lead_scoring_engine.sql
│   ├── 2025_11_19_multi_agent_system.sql
│   └── ... (48 migration files)
│
├── utils/
│   └── db.js                          # Database connection pool
│
├── docs/                              # Documentation
│   ├── TECHNICAL_ARCHITECTURE.md      # This document
│   ├── SPRINT_*_DESIGN.md             # Sprint design docs (31-40)
│   └── ... (other docs)
│
└── scripts/                           # Deployment & utility scripts
    ├── deploy.sh                      # Cloud Run deployment
    ├── backup-db.sh                   # Database backup
    ├── health-check.sh                # Health monitoring
    ├── check-gcp-costs.sh             # Cost monitoring
    ├── testing/                       # Test scripts
    │   ├── smokeTestSprint39.js
    │   ├── securityAudit.js
    │   ├── dataQualityValidator.js
    │   └── e2eSystemIntegration.js
    └── notion/                        # Notion sync scripts
        ├── syncAll.js
        └── completeSprint40.js
```

### Key Concepts Glossary

**SIVA**: Structured Intelligence for Value Assessment - Framework of 12 AI decision primitives

**Q-Score**: Quality Score (0-100) - Company quality evaluation score

**Contact Tier**: T1-T4 classification of contacts by decision-making authority
- T1: C-Suite, VPs (decision makers)
- T2: Directors, Senior Managers (influencers)
- T3: Managers (gatekeepers)
- T4: Individual contributors (end users)

**Lead Score**: Composite score (0-10,000) = Q-Score × Engagement × Fit

**Lead Grade**: A+ (8000-10000), A (6000-7999), B+ (4000-5999), B (2000-3999), C (1000-1999), D (0-999)

**Lifecycle States**: DISCOVERED → QUALIFIED → OUTREACH → ENGAGED → NEGOTIATING → DORMANT → CLOSED

**Multi-Agent System**: Discovery, Validation, and Critic agents collaborating via consensus

**Reflection**: Agent learning process where agents analyze decisions and outcomes to improve

**Consensus**: Agreement mechanism when multiple agents provide different opinions

### Database Connection String Format

**Production** (Cloud Run via VPC):
```
postgresql://user:pass@/database?host=/cloudsql/project:region:instance
```

**Local Development**:
```
postgresql://user:pass@34.121.0.240:5432/upr_production?sslmode=require
```

**Connection Pooling** (`/Users/skc/DataScience/upr/utils/db.js`):
```javascript
{
  max: 20,                          // Max connections
  min: 2,                           // Min connections
  idleTimeoutMillis: 30000,         // 30s idle timeout
  connectionTimeoutMillis: 30000,   // 30s connection timeout
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
}
```

### Environment Variables

**Required**:
```bash
DATABASE_URL=postgresql://...
ADMIN_USERNAME=***
ADMIN_PASSWORD=***
OPENAI_API_KEY=***
ANTHROPIC_API_KEY=***
APOLLO_API_KEY=***
```

**Optional**:
```bash
NODE_ENV=production
PORT=8080
ENTERPRISE_SIZE_THRESHOLD=10000
REDIS_URL=redis://...
NEO4J_URL=bolt://...
SENTRY_DSN=https://...
```

### API Testing

**Health Checks**:
```bash
# Basic health
curl https://upr-web-service.run.app/health

# Database readiness
curl https://upr-web-service.run.app/ready

# Embedding system
curl https://upr-web-service.run.app/health/embeddings
```

**Authentication**:
```bash
# Login
curl -X POST https://upr-web-service.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"***"}'

# Use token
curl https://upr-web-service.run.app/api/leads \
  -H "Authorization: Bearer <token>"
```

### Common Queries

**Get current lifecycle state for all opportunities**:
```sql
SELECT * FROM opportunity_current_state;
```

**Get lead scores for high-priority leads**:
```sql
SELECT
  hl.id,
  hl.contact_name,
  c.name as company_name,
  ls.lead_score,
  ls.grade,
  ls.q_score,
  ls.engagement_score,
  ls.fit_score
FROM hr_leads hl
JOIN companies c ON hl.company_id = c.id
LEFT JOIN lead_scores ls ON hl.id = ls.opportunity_id
WHERE ls.grade IN ('A+', 'A')
ORDER BY ls.lead_score DESC;
```

**Get agent performance metrics**:
```sql
SELECT
  agent_id,
  agent_type,
  status,
  performance_metrics->>'tasks_completed' as tasks,
  performance_metrics->>'success_rate' as success_rate,
  performance_metrics->>'avg_response_time_ms' as avg_latency_ms
FROM agents
WHERE status != 'OFFLINE'
ORDER BY (performance_metrics->>'success_rate')::DECIMAL DESC;
```

**Get recent agent decisions**:
```sql
SELECT
  tool_name,
  COUNT(*) as executions,
  AVG(execution_time_ms) as avg_latency_ms,
  AVG(confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE confidence < 0.60) as low_confidence_count
FROM agent_decisions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tool_name
ORDER BY executions DESC;
```

---

## Conclusion

This technical architecture document provides a comprehensive view of the UPR system's design, implementation, and operational characteristics. The system is built on a modern cloud-native stack with AI-driven intelligence, multi-agent collaboration, and robust lead management capabilities.

For questions or clarifications, refer to:
- Sprint design documents in `/Users/skc/DataScience/upr/docs/SPRINT_*_DESIGN.md`
- Source code in `/Users/skc/DataScience/upr/server/`
- Database migrations in `/Users/skc/DataScience/upr/db/migrations/`

**Document Maintained By**: Development Team
**Last Review**: Sprint 39 (Production Readiness)
**Next Review**: Sprint 41 or as needed
