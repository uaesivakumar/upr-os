**UPR Agentic Core -- Phase 2: Cognitive Framework Architecture**

**Owner:** SIVA-Agentic-Core\
**Version:** 1.0\
**Date:** 2025-11-06\
**Purpose:** Define how Siva's cognitive logic is exposed as **MCP
tools/functions**, how modules call them, what memory is injected, and
how we manage versions, reliability, and security.\
**Non-negotiable:** Tools are deterministic and implement rules from
siva-brain-spec-v1.md (Phase 1). No generative autonomy.

**1) MCP Tool Registry**

All tools accept a context envelope and return **typed JSON**. Tools
marked **STRICT** must not call an LLM; **ASSISTED** tools may use an
LLM only for formatting within schema bounds.

**1. evaluate_company_quality (STRICT)**

**Description:** Score company fit using Siva's formula & factors.\
**Params:**

-   company_name (string)

-   domain (string)

-   industry (string)

-   uae_signals (object: has_ae_domain, has_uae_address,
    linkedin_location)

-   size_bucket (enum: startup\|scaleup\|midsize\|enterprise)

-   salary_indicators (object: avg_salary number, job_posting_salaries
    number\[\])\
    **Returns:**

-   quality_score (0--100)

-   reasoning (array of { factor, points, explanation })

-   confidence (0.0--1.0)\
    **Internal logic:** base_quality (salary × UAE presence × size_fit)
    → industry multipliers → edge cases (govt downweight, free zone
    uplift) → explainability.

**2. select_contact_tier (STRICT)**

**Description:** Map company profile to target job titles.\
**Params:** company_size (int), company_maturity_years (int),
hiring_velocity_monthly (int)\
**Returns:** target_titles\[\], fallback_titles\[\], reasoning (string)\
**Logic:** Decision tree per Phase 1 (founder/COO for tiny new firms; HR
leadership mid-size; payroll/benefits for large; add TA/HR Ops if hiring
velocity high).

**3. calculate_timing_score (STRICT)**

**Description:** Compute timing multiplier from calendar & signal
recency.\
**Params:** current_month (string), days_since_signal (int), is_ramadan
(bool)\
**Returns:** timing_multiplier (0.0--2.0), notes\
**Logic:** Q1 uplift, Ramadan dampening, hot-signal window \<7 days.

**4. check_edge_cases (STRICT)**

**Description:** Apply exception rules (enterprise, gov, free zone,
fresh expansion).\
**Params:** company_name (string), sector (string), license_type
(string), signals\[\]\
**Returns:** adjustment_factor (0.0--1.5), matched_rules\[\]\
**Logic:** As per Phase 1 edge cases.

**5. verify_contact_quality (STRICT)**

**Description:** Score a contact candidate.\
**Params:** email (string), title (string), linkedin_url (string),
last_seen_days (int), is_duplicate_90d (bool)\
**Returns:** contact_confidence (0--100), flags\[\]\
**Logic:** Domain pattern match, title whitelist, activity freshness,
dedupe.

**6. compute_qscore (STRICT)**

**Description:** Compute final Q using Siva formula.\
**Params:** base_quality (0--1), signal_strength (0--1), reachability
(0--1)\
**Returns:** qscore (0--100)\
**Logic:** Q = base_quality × signal_strength × reachability × 100.

**7. check_duplicate_outreach (STRICT)**

**Description:** Prevent re-contact inside embargo window.\
**Params:** company_domain (string), last_contact_at (ISO)\
**Returns:** is_duplicate (bool), embargo_days_remaining (int)

**8. check_outreach_doctrine (STRICT)**

**Description:** Validate a proposed outreach draft against Siva's
rules.\
**Params:** draft_subject (string), draft_body (string), company_context
(object)\
**Returns:** is_compliant (bool), violations\[\], suggested_fixes\[\]\
**Logic:** Flags: pricing/rates, pressure terms, generic openings,
missing signal reference, govt/enterprise block.

**9. generate_outreach_context (ASSISTED)**

**Description:** Produce the **context paragraph** using fixed template
& placeholders.\
**Params:** company_name, signal_headline, city, sector\
**Returns:** context_paragraph (string; max 2 sentences)\
**Logic:** Deterministic template fill; optional LLM for grammar only
(no new facts).

**10. score_explainability (STRICT)**

**Description:** Convert factor scores to human-readable breakdown.\
**Params:** inputs (object), scores (object)\
**Returns:** breakdown\[\], insight (string \<= 140 chars)

**11. intent_classify_reply (ASSISTED, schema-locked)**

**Description:** Classify reply intent for lifecycle transitions.\
**Params:** reply_text (string)\
**Returns:** intent (enum:
INTERESTED\|TIMING\|REFERRAL\|NOT_RELEVANT\|NEGOTIATING\|SPAM_COMPLAINT\|STALLING),
rationale\
**Guardrails:** Few-shot with banned outputs; deterministic mapping to
enums.

**12. update_outcome_feedback (STRICT)**

**Description:** Persist outreach outcome for learning.\
**Params:** company_id, outcome (enum), timestamp, notes\
**Returns:** ok (bool)

**2) Data Flow Patterns (Module → MCP → Module)**

**A) Discovery wants a score**

\[Discovery\] ── company_data ──► /agent-core/evaluate_company_quality

◄─ score + reasoning ──

Decision: if score≥70 → enqueue enrichment; else archive

**B) Enrichment selects contacts**

\[Enrichment\] ── profile ──► /agent-core/select_contact_tier

\[Enrichment\] ── candidates ──► /agent-core/verify_contact_quality

◄─ best_contact + confidence ──

Decision: if conf≥70 → outreach-ready else flag for Siva

**C) Outreach composes + validates message**

\[Outreach\] ── context vars ─► /agent-core/generate_outreach_context

\[Outreach\] ── draft ─► /agent-core/check_outreach_doctrine

◄─ is_compliant + fixes ─

Decision: send or revise; log duplicate check beforehand

**D) Replies update lifecycle**

\[Inbox/Parser\] ─► /agent-core/intent_classify_reply

◄─ intent enum ─

Lifecycle Engine transitions state; /update_outcome_feedback persists

**3) Memory Architecture**

**Short-term (request context)**

-   **Lifetime:** single tool call.

-   **Storage:** function args only.

-   **Example:** current company_data object injected into evaluation.

**Medium-term (session context)**

-   **Lifetime:** 1--4 hours (Redis w/ TTL).

-   **Use:** prevent re-scoring same company; batch reasoning
    continuity.

-   **Keys:** session_id, recent_company_ids\[\], last_filters.

**Long-term (historical)**

-   **Lifetime:** permanent (Postgres + pgvector).

-   **Tables:** company_facts, signals, contacts, outreach, agent_runs.

-   **Use:** dedupe outreach, learn from outcomes, trend analysis.

**MCP Context Injection (uniform)**

Every tool receives:

{

\"request_context\": { \"company\": {\...}, \"caller\": \"ModuleName\"
},

\"session_context\": { \"recently_reviewed\": \[\"\...\"\], \"filters\":
{\...} },

\"historical_context\": { \"last_contact_at\": \"ISO\",
\"past_outcomes\": \[\...\] }

}

**4) Communication Protocol**

**HTTP REST (recommended for real-time)**

-   **Pros:** simple, language-agnostic, observable.

-   **Usage:** scoring, contact selection, doctrine check, intent
    classify.

-   **Shape:**

POST /api/agent-core/v1/tools/evaluate_company_quality

Authorization: Bearer \<internal\>

{ \"params\": {\...}, \"context\": {\...}, \"tenant_id\":
\"upr-default\" }

**5) Versioning Strategy**

**Persona & Tools**

-   **Persona:** persona\@sk-2025-11 uses **semver** (1.0, 1.1
    non-breaking, 2.0 breaking).

-   **Tools:** URI versioning:\
    /v1/tools/evaluate_company_quality →
    /v2/tools/evaluate_company_quality.

**Rollout**

1.  Keep old and new endpoints in parallel.

2.  Shadow-run comparisons for a week.

3.  Canary 10% traffic.

4.  Migrate module callers gradually.

5.  Deprecate v1 after confirmation.

**Schema Contracts**

-   Each tool returns schema-validated JSON.

-   Breaking changes require **new schema id** and endpoint.

**6) Error Handling & Fallbacks**

-   **Validation error (STRICT tool):** return { ok:false,
    code:\"SCHEMA_VALIDATION_ERROR\", details, trace_id }; caller shows
    "needs review."

-   **Rule conflict:** { ok:false, code:\"POLICY_VIOLATION\",
    violations\[\] }; UI prompts human decision per Phase 1 Confidence
    Gates.

-   **Downstream failure:** tools fail **closed** (no partial outputs);
    log + alert; recommend retry/backoff.

-   **Timeouts:** STRICT tools ≤ 2s; ASSISTED ≤ 5s; overall cap per
    request ≤ 8s.

-   **Duplicate protection:** always check check_duplicate_outreach
    before send.

**7) Performance SLAs (targets)**

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

**Service SLO:** 99% success; ≥ 95% schema-pass without repair.

**8) Security & Tenancy**

-   **Auth:** Internal Bearer or Cloud Run IAM; rotate via Secret
    Manager.

-   **Tenancy:** every call includes tenant_id; all logs & memory keyed
    by tenant.

-   **Rate limiting:** token bucket per service & tenant.

-   **PII redaction:** apply policy\@uae-2025-11 before persisting logs
    (mask UAE phone, IBAN, emails).

-   **Audit:** store trace_id, tool_id, tool_version, persona_version,
    input_hash, caller_module.

-   **Allowlist:** each tool declares allowed callers (e.g., only
    Outreach may call doctrine check).

**✅ Phase 2 Deliverables Recap**

1.  **MCP Tool Registry** (this file §1)

2.  **Data Flow Patterns** (this file §2)

3.  **Memory Architecture** (§3)

4.  **Communication Protocol** with **Hybrid recommendation** (§4)

5.  **Versioning Strategy** (§5)

6.  **Error Handling** (§6)

7.  **Performance SLAs** (§7)

8.  **Security & Tenancy** (§8)
