**UPR Agentic Core -- Phase 9 : Explainability & Transparency Layer**

**Owner:** Sivakumar (SIVA-Agentic-Core)  **Version:** 1.0  **Date:**
2025-11-06\
**Purpose:** Transform every opaque AI decision into an auditable,
human-readable explanation.\
The layer answers *"Why did the Agent decide this?"* and *"Can I trust
it?"*

**1 Explainability Schema (Universal Format)**

interface ExplanationSchema {

decision: { type: string; result: any; timestamp: string; version:
string };

reasoning: {

summary: string;

breakdown: ReasoningStep\[\];

confidence: number;

alternative_outcomes: AlternativeOutcome\[\];

};

evidence: {

data_sources: DataSource\[\];

facts_used: Fact\[\];

rules_applied: Rule\[\];

};

context: { user_id?: string; session_id?: string; related_decisions:
string\[\] };

audit: {

can_explain: boolean;

human_overrideable: boolean;

teach_from_this: boolean;

};

}

All Agent Core outputs must return this structure.

**2 Explanation Generation Algorithm**

1️⃣ Collect inputs → facts, rules, weights\
2️⃣ Run calculation → produce decision (result + score)\
3️⃣ Log each step into reasoning.breakdown\[\]\
4️⃣ Attach data sources and rules used\
5️⃣ Compute confidence metrics\
6️⃣ Store JSON in decision_explanations table\
7️⃣ Serve summary first → load details on demand (lazy mode)

**Performance:** lazy loading + 1-hour cache.

**3 UI Schema ("Why This Score" Drawer)**

  **Section**       **Purpose**
  ----------------- --------------------------------
  Summary Header    Company + Score + grade pill
  Base Quality      progress bars + factor details
  Signal Strength   boost multipliers
  Reachability      contact/email confidence
  Edge Cases        trigger flags
  Confidence        overall % + factor list
  Alternatives      what-if scenarios
  Evidence          source list + confidence icons
  Override          manual adjust form

**4 Core React Components**

-   ScoreBreakdown.jsx -- renders step-wise logic

-   ConfidenceIndicator.jsx -- color-coded confidence

-   AlternativeOutcomes.jsx -- what-if panels

-   EvidenceSources.jsx -- data provenance list

-   OverrideScore.jsx -- manual override + reason

Each component reads from the ExplanationSchema payload.

**5 LLM Explainability (Audit Trail)**

Every LLM call logs:

{

\"model\":\"gpt-4o\",

\"prompt_template_id\":\"outreach_hiring_signal_v1.0\",

\"variables\":{\"company_name\":\"Amazon UAE\"},

\"constraints\":\[\"reference specific signal\",\"avoid buzzwords\"\],

\"validation\":{\"passed_doctrine_check\":true}

}

Then adds:

\"explanation\":{

\"why_this_opening\":\[

\"Referenced 47 engineering roles per doctrine\",

\"Used \'observed\' tone for professionalism\"

\],

\"alternatives_considered\":\[

{\"option\":\"Congrats on the expansion!\",\"rejected_reason\":\"Too
casual\"}

\]

}

This lets you see *why a sentence exists* and *what was rejected.*

**6 Comparative Explainability**

**UI Pattern:** side-by-side comparison drawer\
→ Highlights factor-level differences between two companies\
(e.g. Amazon UAE 87 vs TechCorp 65).\
Shows + and -- points for each dimension (UAE presence, signals,
reachability).

**7 Human Override System**

-   Pre-set reasons (enterprise exception, gov, misclassification,
    signal error)

-   Manual score input + optional notes

-   Saved to agent_overrides with timestamp + user_id

-   Audit enforces reason mandatory for override

**8 Learning from Overrides (Pattern Detection)**

Weekly batch:

SELECT override_reason, COUNT(\*), AVG(ai_score-human_score)

FROM agent_overrides

WHERE created_at\>NOW()-INTERVAL\'30 days\'

GROUP BY override_reason;

→ Generates insights like:

"15 enterprise exceptions → add to ENTERPRISE_BRANDS list."

System proposes rule updates with confidence + impact estimate;\
Human approves before deployment. Backtested for precision gain ≥ 5 %.

**9 Database Schema (Minified)**

CREATE TABLE decision_explanations(

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

decision_id UUID, decision_type TEXT,

explanation JSONB, generated_at TIMESTAMPTZ DEFAULT NOW(),

cache_until TIMESTAMPTZ

);

CREATE TABLE agent_overrides(

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

decision_id UUID, company_id UUID,

ai_score INT, human_score INT,

override_reason TEXT, notes TEXT,

created_at TIMESTAMPTZ DEFAULT NOW()

);

CREATE TABLE override_insights(

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

insight_type TEXT, pattern_detected TEXT,

proposed_change JSONB, confidence NUMERIC(3,2),

impact_estimate TEXT, status TEXT DEFAULT \'pending\'

);

**10 API Endpoints**

  **Method**   **Endpoint**                                  **Purpose**
  ------------ --------------------------------------------- ------------------------
  GET          /api/agent-core/explanations/:decisionId      Fetch full explanation
  POST         /api/agent-core/override-score                Save manual override
  GET          /api/agent-core/compare/:company1/:company2   Comparative view
  GET          /api/agent-core/override-insights             List learned patterns

**11 Design Guidelines**

-   Green (≥ 80 %) = High confidence

-   Yellow (60--79 %) = Medium

-   Red (\< 60 %) = Low

-   Icons: ✅ strong ⚡ moderate ⚠️ weak

-   Drawer layout for consistency with Hiring Signals

Accessibility: ARIA labels + keyboard focus + high-contrast mode.

**Critical Decisions (Confirmed)**

  **Area**        **Choice**
  --------------- -----------------------------------------------
  Depth           ✅ Medium (breakdown + confidence)
  Performance     ✅ Lazy loading (summary → details)
  Learning Mode   ✅ Semi-automated (human approve rule updates)
  UI Placement    ✅ Drawer (consistent UX)

**Timeline (4 Weeks)**

1️⃣ Schema + DB migrations\
2️⃣ Component development (UI + lazy API)\
3️⃣ Integration into Discovery/Enrichment drawers\
4️⃣ Override learning + insight pipeline

**✅ Phase 9 Deliverables Recap**

-   Universal Explanation Schema (JSON + DB)

-   Lazy-load explainability engine

-   Drawer UI with breakdown, confidence & evidence

-   LLM prompt audit trail

-   Human override + learning pipeline

-   Comparative explanations for A/B analysis

-   Full trust and debug capability for every decision
