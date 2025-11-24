**UPR Agentic Core -- Phase 4 : Infrastructure & Topology**

**Owner:** SIVA-Agentic-Core\
**Version:** 1.0  **Date:** 2025-11-06\
**Purpose:** Define the physical and logical deployment of the AI Agent
Core, including topology, data flows, dependencies, Cloud Run
configuration, monitoring, rollback, and recovery.

**1 Deployment Topology**

**Chosen Model → Hybrid (Library + Optional API)**\
Fast in-process calls today, future-ready REST interface.

┌─────────────────────────────────────────┐

│ Cloud Run Service: upr-server │

│ │

│ ┌─────────────── Internal Modules ───────────────┐

│ │ Discovery → direct→ AgentCore.evaluate() │

│ │ Enrichment → direct→ AgentCore.select() │

│ │ Outreach → direct→ AgentCore.checkDoctrine()│

│ └───────────────────────────────────────────────┘

│ │

│ ┌────────── AI Agent Core (Library) ──────────┐

│ │ evaluateCompany(), selectContact(), ... │

│ │ Also exposes: /api/agent-core/\* (HTTP) │

│ └─────────────────────────────────────────────┘

└─────────────────────────────────────────┘

│

↓ (future HTTP)

┌───────────────┐

│ Integrations │ (CRM \| Slack)

└───────────────┘

**Rationale** ✅ fast now ✅ scalable later ✅ single codebase ✅ low cost.

**2 Data Flow Maps**

**A Request Flow**

User → Dashboard → UPR Backend → AgentCore.evaluate() → DB → Dashboard

1️⃣ User clicks "Score this company."\
2️⃣ Dashboard calls POST /api/companies/{id}/score.\
3️⃣ Express route calls AgentCore.evaluateCompany().\
4️⃣ Agent Core loads persona, queries Postgres, uses cache.\
5️⃣ Returns {score, reasoning, confidence}.\
6️⃣ Backend saves decision; UI shows explanation.

**B Memory Flow**

In-Memory → Redis (session) → PostgreSQL (history)

  **Layer**           **Use**                                  **Latency**   **Examples**
  ------------------- ---------------------------------------- ------------- ----------------------------------
  In-Memory           Loaded persona, active request context   0 ms          personaObj, decisionFunctions
  Redis (TTL 1-4 h)   Session context                          1--5 ms       session:{user}:context
  PostgreSQL          Permanent history                        10--50 ms     agent_decisions, agent_overrides

**C Service Dependencies**

  **Service**             **Purpose**                                         **Fallback**
  ----------------------- --------------------------------------------------- ---------------------------
  PostgreSQL (Render)     Store decisions, overrides, persona versions        In-memory cache read-only
  Redis (optional)        Session context, recent scores                      Skip cache if down
  File System             ./server/agent-core/persona/siva-brain-spec-v1.md   Fatal if missing
  OpenAI API (optional)   LLM formatting only                                 Use deterministic output

**3 Cloud Run Configuration**

**Service: upr-server**

memory: 2Gi

cpu: 2

timeout: 300s

concurrency: 80

minInstances: 1

maxInstances: 10

**Environment Variables**

\# Persona

PERSONA_SPEC_PATH=/app/server/agent-core/persona/siva-brain-spec-v1.md

PERSONA_VERSION=v1.2

PERSONA_RELOAD_ON_CHANGE=true

\# Memory

AGENT_CORE_CACHE_TTL=3600

AGENT_CORE_ENABLE_CACHING=true

\# Observability

AGENT_CORE_LOG_LEVEL=info

AGENT_CORE_TRACE_DECISIONS=true

\# Performance

AGENT_CORE_MAX_LATENCY_MS=500

AGENT_CORE_MIN_CONFIDENCE=0.6

AGENT_CORE_ENABLE_FALLBACK=true

**4 Database Schema Changes**

CREATE TABLE agent_decisions (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

company_id UUID REFERENCES entities_company(id),

tool_name TEXT NOT NULL,

input_params JSONB NOT NULL,

output_result JSONB NOT NULL,

reasoning JSONB,

confidence NUMERIC(3,2),

policy_version TEXT NOT NULL,

latency_ms INTEGER,

created_at TIMESTAMPTZ DEFAULT NOW(),

session_id TEXT,

module_caller TEXT

);

CREATE TABLE agent_overrides (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

decision_id UUID REFERENCES agent_decisions(id),

ai_score INT,

human_score INT,

override_reason TEXT,

notes TEXT,

created_at TIMESTAMPTZ DEFAULT NOW(),

user_id UUID

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

Retention: keep 2 years → archive to cold storage.

**5 Tenancy Strategy**

-   **v1:** Single-tenant (Siva).

-   **v2:** Multi-tenant ready (1 persona per tenant).

const tenantPersonas = {

tenant_siva: \'siva-brain-spec-v1.md\',

tenant_adcb: \'adcb-brain-spec-v1.md\'

};

**6 Security**

  **Layer**       **Protection**
  --------------- -------------------------------------------
  Persona spec    File never served via API
  Auth            Internal Bearer or Cloud Run OIDC
  Rate Limit      100 req/min per IP
  Validation      Zod/Ajv schemas + HTML sanitization
  PII Redaction   Mask UAE phones, IBANs, emails before log

**7 Deployment Pipeline**

**Local → Cloud Run Flow**

\# Edit persona spec

vim server/agent-core/persona/siva-brain-spec-v1.md

npm run test:agent-core \-- \--company=\"Amazon UAE\"

\# Bump version

git commit -m \"feat(agent-core): v1.3 -- add Free Zone bonus\"

git push

gcloud run deploy upr-server \--source=.

curl https://upr-server.run.app/api/agent-core/health

**8 Rollback Strategy**

**Quick Rollback (instant)**

gcloud run services update-traffic upr-server
\--to-revisions=\<previous\>=100

**Code Rollback (5 min)**

git revert HEAD

git push

gcloud run deploy upr-server \--source=.

**Verification**

curl .../health \# { persona_version: \"v1.2\" }

**9 Monitoring & Alerts**

  **Metric**           **Target**             **Alert Condition**
  -------------------- ---------------------- -----------------------------
  Availability         ≥ 99.9 %               Error rate \> 5 % for 5 min
  Latency (p95)        ≤ 500 ms               \> 1000 ms for 5 min
  Confidence avg       ≥ 0.75                 \< 0.6 for 15 min
  Override rate        ≤ 10 %                 \> 20 % → persona drift
  Score distribution   60 % in 70--90 range   \> 80 % \>90 = too lenient

Google Cloud Monitoring alert YAML example included in repo
(monitoring/alerts.yaml).

**10 Disaster Recovery**

  **Asset**           **Backup Mechanism**
  ------------------- ------------------------------------------
  Persona spec        Git + Cloud Storage weekly snapshot
  PostgreSQL          Render daily snapshots (7-day retention)
  Redis               Ephemeral → rebuild from PostgreSQL
  Cloud Run Service   Revisions kept automatically

**11 Cost Estimate (v1 MVP)**

  **Component**                  **Est USD/mo**
  ------------------------------ ----------------
  Cloud Run (upr-server 2 Gi)    ≈ \$25
  Render PostgreSQL starter      ≈ \$7
  Redis (optional)               \$0--10
  Monitoring (GCP free tier)     \$0
  **Total ≈ \$35--50 / month**   

**12 Critical Decisions**

  **Area**           **Choice**
  ------------------ ------------------------------------------
  Deployment Model   ✅ Hybrid (Library + API)
  Redis Strategy     ✅ Skip for v1 (use in-memory + Postgres)
  Persona Storage    ✅ File-based (Git-versioned)
  Monitoring         ✅ Google Cloud Monitoring

**✅ Phase 4 Deliverables Recap**

1.  Hybrid topology diagram

2.  Data flow maps (request/memory/services)

3.  Cloud Run config & env vars

4.  Database schema extensions

5.  Tenancy plan (v1 single / v2 multi)

6.  Security controls

7.  Deployment & rollback flows

8.  Monitoring and alerts

9.  Disaster recovery plan

10. Cost projection
