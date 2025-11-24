**UPR Agentic Core -- Phase 3: Centralized Agentic Hub Design**

**Owner:** SIVA-Agentic-Core\
**Version:** 1.0\
**Date:** 2025-11-06\
**Purpose:** Specify the **MCP Host** that executes Siva's cognitive
rules as deterministic tools, validates I/O against schemas, manages
memory, and provides observability. No "wrapper" layer is needed beyond
the API and execution layers described here.

**1) MCP Host Architecture**

┌──────────────────────────────────────────────────────────────┐

│ SIVA-Agentic-Core (MCP Host) │

│ │

│ ┌────────────────────────────────────────────────────────┐ │

│ │ API Layer (Express) │ │

│ │ /api/agent-core/v1/tools/\* │ │

│ │ AuthN/AuthZ • Rate-limit • Input schema validation │ │

│ └────────────────────────────────────────────────────────┘ │

│ ↓ │

│ ┌────────────────────────────────────────────────────────┐ │

│ │ Persona Policy Engine │ │

│ │ Loads: siva-brain-spec-v1.md │ │

│ │ Enforces ALWAYS/NEVER rules • Confidence Gates │ │

│ │ Applies edge cases • Doctrine checks │ │

│ └────────────────────────────────────────────────────────┘ │

│ ↓ │

│ ┌────────────────────────────────────────────────────────┐ │

│ │ MCP Tool Executor │ │

│ │ Deterministic tools (STRICT) • LLM-assisted (ASSISTED) │ │

│ │ Context injection (request/session/historical) │ │

│ │ Explainability composer │ │

│ └────────────────────────────────────────────────────────┘ │

│ ↓ │

│ ┌────────────────────────────────────────────────────────┐ │

│ │ Memory Manager │ │

│ │ Short-term: request • Medium: Redis • Long: Postgres │ │

│ │ Dedupe, outcome history, eval packs │ │

│ └────────────────────────────────────────────────────────┘ │

│ ↓ │

│ ┌────────────────────────────────────────────────────────┐ │

│ │ Observability Layer │ │

│ │ OpenTelemetry traces • Decision audit logs • Dashboards│ │

│ │ Policy-violation & drift metrics │ │

│ └────────────────────────────────────────────────────────┘ │

└──────────────────────────────────────────────────────────────┘

**Single-brain behavior:** All UPR callers get identical decisions
because every call resolves through this Host using
siva-brain-spec-v1.md.

**2) API Surface (REST over HTTP)**

Base path: /api/agent-core/v1/tools/\*\
Auth: Internal Bearer or Cloud Run IAM header; tenant_id required.

-   POST /evaluate_company_quality

-   POST /select_contact_tier

-   POST /calculate_timing_score

-   POST /check_edge_cases

-   POST /verify_contact_quality

-   POST /compute_qscore

-   POST /check_duplicate_outreach

-   POST /check_outreach_doctrine

-   POST /generate_outreach_context

-   POST /score_explainability

-   POST /intent_classify_reply

-   POST /update_outcome_feedback

Diagnostics:

-   GET /health → { ok: true }

-   GET /\_\_diag → { ok, db_ok, redis_ok, models_ok, policy_version }

Versioning:

-   Future breaking changes add /v2/tools/\... endpoints in parallel for
    canaries.

**3) Persona Policy Engine**

-   **Inputs:** Parsed siva-brain-spec-v1.md (Phase 1), including
    Decision Primitives, Reasoning Chains, Persona Policies, Confidence
    Gates, Edge Cases, Temporal Rules.

-   **Responsibilities:**

    -   Enforce **ALWAYS/NEVER** rules before and after tool execution.

    -   Apply **Confidence Gates** (escalate to human if conditions
        met).

    -   Apply **Edge Cases & Temporal Rules** consistently.

    -   Block non-compliant outreach (e.g., rate mentions, pressure
        terms).

    -   Normalize outputs and attach policy_version.

If policy violation is detected, the API returns POLICY_VIOLATION with
precise violations and suggested fixes.

**4) Memory Manager**

-   **Short-term (request):** In-argument context only.\
    Example: company_data, caller_module, task_id.

-   **Medium-term (session):** Redis TTL 1--4h.\
    Example: prevent re-scoring within session; remember current
    filters.\
    Keys: session:{session_id}:recent_companies,
    session:{session_id}:filters.

-   **Long-term (historical):** Postgres + pgvector.\
    Tables (logical):

    -   company_facts (domain, UAE presence, size)

    -   signals (type, date, source, recency)

    -   contacts (title, email_confidence, last_seen)

    -   outreach (drafts, sends, outcomes, timestamps)

    -   agent_runs (trace_id, tool, persona_version, inputs hash,
        outputs)

    -   eval_cases / eval_results (nightly regression)

**Context Injection (uniform):**

{

\"request_context\": {\...},

\"session_context\": {\"recently_reviewed\": \[\...\], \"filters\":
{\...}},

\"historical_context\": {\"last_contact_at\": \"ISO\",
\"past_outcomes\": \[\...\]}

}

**5) Schema Validation**

**Why:** Contract safety, predictable UI integration, automatic docs.

-   **Input validation:** Zod (TypeScript) or Ajv (JSON Schema).

-   **Output validation:** Ajv with strict schemas per tool.

-   **Example (evaluate_company_quality):**

*Input schema (Zod-style):*

CompanyInput = z.object({

company_name: z.string().min(1),

domain: z.string().regex(/\^\[a-z0-9-\]+\\.\[a-z\]{2,}\$/),

industry: z.string().min(2),

uae_signals: z.object({

has_ae_domain: z.boolean(),

has_uae_address: z.boolean(),

linkedin_location: z.string().optional()

}),

size_bucket:
z.enum(\[\"startup\",\"scaleup\",\"midsize\",\"enterprise\"\]),

salary_indicators: z.object({

avg_salary: z.number().nonnegative().optional(),

job_posting_salaries: z.array(z.number().positive()).optional()

})

});

*Output schema (JSON):*

{

\"type\":\"object\",

\"required\":\[\"quality_score\",\"reasoning\",\"confidence\",\"policy_version\",\"timestamp\"\],

\"properties\":{

\"quality_score\":{\"type\":\"number\",\"minimum\":0,\"maximum\":100},

\"reasoning\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{

\"factor\":{\"type\":\"string\"},

\"points\":{\"type\":\"number\"},

\"explanation\":{\"type\":\"string\"}

}}, \"minItems\":1},

\"confidence\":{\"type\":\"number\",\"minimum\":0,\"maximum\":1},

\"policy_version\":{\"type\":\"string\"},

\"timestamp\":{\"type\":\"string\",\"format\":\"date-time\"}

},

\"additionalProperties\":false

}

**Sanity checks:** Score bounds, non-empty reasoning, non-null
confidence.\
**ASSISTED tools** must still conform to strict output schemas.

**6) Error Handling & Fallbacks**

**Unified error envelope:**

{ \"ok\": false, \"code\":
\"SCHEMA_VALIDATION_ERROR\|POLICY_VIOLATION\|TIMEOUT\|UPSTREAM_FAILURE\",

\"message\": \"\...\", \"violations\": \[\], \"trace_id\": \"\...\" }

Scenarios:

-   MCP Host down → clients retry 3× with backoff; then apply **fallback
    heuristics** (documented, conservative) and mark
    needs_human_review=true.

-   Nonsense outputs → schema rejection; return error to caller; no
    partial state persistence.

-   Low confidence (\<0.6) → return with needs_human_review=true and
    suggested next step.

-   Timeouts: STRICT tools ≤ 2s, ASSISTED ≤ 5s, overall ≤ 8s.

**Fallback heuristics example (Discovery):**

-   If Host unavailable: score = .ae ? 60 : 30, confidence 0.5,
    reasoning: "fallback heuristic," and flag for review.

**7) Observability**

**Metrics (OpenTelemetry + dashboards):**

-   **Performance:** per-tool latency p50/p95/p99; error rate;
    throughput.

-   **Quality:** confidence distribution; human override rate; policy
    violation rate; schema-repair rate (should be \~0).

-   **Business:** reply rate by score bucket; contact-selection
    accuracy; conversion lift for signals \<7 days;
    time-to-first-business.

-   **Drift:** score distribution shift; version adoption; tool call
    frequency.

**Log record (per tool call):**

{

\"timestamp\":\"2025-11-06T14:10:00Z\",

\"trace_id\":\"abc123\",

\"tool\":\"evaluate_company_quality\",

\"tool_version\":\"v1\",

\"persona_version\":\"siva-brain-spec-v1.0\",

\"tenant_id\":\"upr-default\",

\"caller_module\":\"discovery\",

\"input_hash\":\"\...\",

\"input_summary\":{\"company_name\":\"Amazon
UAE\",\"industry\":\"Technology\"},

\"output_summary\":{\"quality_score\":87,\"confidence\":0.92},

\"latency_ms\":342,

\"policy_flags\":{\"violations\":\[\]},

\"human_override\":false

}

Dashboards: Performance, Quality, Business, Drift, Policy Violations.

**8) Deployment**

**Recommended model: Hybrid**

-   **Internal fast path:** When UPR backend and Host share process,
    modules can call Host functions directly (lowest latency).

-   **External API path:** Also expose REST endpoints so future services
    (and the dashboard) can call the same tools.

-   **Background learning:** Use a queue (e.g., BullMQ) for nightly
    evals and outcome ingestion.

Topologies:

-   **Option A (same service):** simplest; shared failure domain.

-   **Option B (separate Cloud Run service):** isolation, horizontal
    scaling, +50--100ms per call.

-   **Option C (hybrid -- recommended):** direct calls in-process + REST
    for future decoupling.

Persona updates:

-   Use semantic versions of siva-brain-spec.

-   Shadow-run v1.1 vs v1.0 for a week; then canary → full cutover.

-   No consumer code changes needed for non-breaking updates.

**9) Security & Tenancy**

-   **AuthN:** Internal Bearer tokens or Cloud Run IAM identity headers;
    rotate with Secret Manager.

-   **AuthZ:** Tool allowlists by caller module; deny-by-default.

-   **Tenancy:** Mandatory tenant_id on every call; partition caches and
    logs.

-   **PII redaction:** Apply UAE policy before persisting logs (phone,
    IBAN, email).

-   **Rate limits:** Token bucket per tenant and per tool.

-   **Auditability:** Persist trace_id, persona_version, input_hash,
    caller_module, schema_id.

**10) Performance Targets (SLA/SLO)**

  **Tool**                    **P50**    **P95**     **Notes**
  --------------------------- ---------- ----------- -----------
  evaluate_company_quality    ≤ 300 ms   ≤ 900 ms    STRICT
  select_contact_tier         ≤ 200 ms   ≤ 600 ms    STRICT
  calculate_timing_score      ≤ 120 ms   ≤ 300 ms    STRICT
  check_edge_cases            ≤ 120 ms   ≤ 300 ms    STRICT
  verify_contact_quality      ≤ 250 ms   ≤ 700 ms    STRICT
  compute_qscore              ≤ 50 ms    ≤ 100 ms    STRICT
  check_duplicate_outreach    ≤ 80 ms    ≤ 150 ms    STRICT
  check_outreach_doctrine     ≤ 400 ms   ≤ 1200 ms   STRICT
  generate_outreach_context   ≤ 800 ms   ≤ 1800 ms   ASSISTED
  intent_classify_reply       ≤ 900 ms   ≤ 2000 ms   ASSISTED

**Service SLO:**

-   Availability ≥ 99.0%

-   Schema-pass rate ≥ 95%

-   Policy violations ≤ 1% of outputs (and trending down)

**11) Human Override Interface (ops loop)**

-   Any page showing a Host decision must support **Override** with
    required reason codes: wrong_industry, uae_presence_overestimated,
    missed_edge_case, gov_linked, other.

-   Overrides are stored in agent_runs_overrides with persona version.

-   Weekly review translates frequent overrides into updated Phase 1
    spec (edge rules, thresholds) → new persona version → shadow-run →
    canary.

**Phase 3 Deliverables Recap**

-   MCP Host architecture and API endpoints

-   Persona Policy Engine responsibilities

-   Memory architecture and context-injection design

-   Input/Output schema validation strategy

-   Error handling and fallback rules

-   Observability metrics and logging envelope

-   Deployment model (hybrid recommended) and persona update flow

-   Security/tenancy requirements

-   Performance targets and SLOs

-   Human override operational loop
