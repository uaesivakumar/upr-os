**UPR Agentic Core -- Phase 5 : Cognitive Extraction & Encoding**

**Owner:** SIVA-Agentic-Core  **Version:** 1.0  **Date:** 2025-11-06\
**Purpose:** Translate Siva's human decision patterns into
deterministic, machine-readable logic.\
**Outcome:** cognitive_extraction_logic.json + Rule Engine interpreter.

**1 Extraction Methodology**

  **Step**   **Activity**                                                           **Deliverable**
  ---------- ---------------------------------------------------------------------- --------------------------------------------
  1          Record 30 real decisions (contact / skip companies).                   Dataset with company metadata + reasoning.
  2          Recognize patterns (size sweet spot, industry bias, gov exceptions).   Rule list draft.
  3          Formalize as JSON rules (formulas + decision trees).                   cognitive_extraction_logic.json v1.0
  4          Test on historical examples.                                           Accuracy report & adjusted weights.
  5          Validate edge cases (10 exceptions).                                   Confirmed governance rules.

**2 Rules Format Specification**

**Format:** JSON Rules Engine (Versioned)\
**File:** /server/agent-core/persona/cognitive_extraction_logic.json

**Schema outline**

{

\"version\": \"v1.3\",

\"rules\": {

\"evaluate_company_quality\": {

\"type\": \"formula\",

\"formula\": \"base_quality \* industry_multiplier \* size_multiplier \*
timing_multiplier\",

\"variables\": {

\"base_quality\": { \"type\": \"lookup_table\", \"input\":
\"uae_employees\", \"table\": \[\...\] },

\"industry_multiplier\": { \"type\": \"mapping\", \"input\":
\"industry\", \"map\": {\...}, \"default\": 1.0 },

\"size_multiplier\": { \"type\": \"lookup_table\", \"input\":
\"uae_employees\", \"table\": \[\...\] },

\"timing_multiplier\": { \"type\": \"mapping\", \"input\":
\"signal_recency\", \"map\": {\...}, \"default\": 1.0 }

},

\"edge_cases\": \[

{ \"condition\": { \"company_name\": { \"in\":
\[\"Etihad\",\"Emirates\",\"ADNOC\"\] } }, \"action\": { \"multiply\":
0.1 } },

{ \"condition\": { \"entity_type\": \"government\" }, \"action\": {
\"multiply\": 0.05 } }

\]

},

\"select_contact_tier\": {

\"type\": \"decision_tree\",

\"branches\": \[

{ \"condition\": { \"uae_employees\": { \"lt\": 50 } }, \"output\":
\[\"Founder\",\"COO\"\] },

{ \"condition\": { \"uae_employees\": { \"between\": \[50,500\] } },
\"output\": \[\"HR Director\",\"HR Manager\"\] },

{ \"condition\": { \"uae_employees\": { \"gte\": 500 } }, \"output\":
\[\"Payroll Manager\",\"HR Ops Manager\"\] }

\],

\"fallback\": \[\"HR Manager\"\]

}

}

}

**Supported rule types:** formula, decision_tree, lookup, threshold\
**Condition operators:** eq, lt, gt, between, in, and, or\
**Variable types:** mapping, lookup_table, range_lookup, formula

**3 Rule Catalog (Initial 10--15 Rules)**

  **Rule**                   **Purpose**                               **Inputs**                             **Outputs**
  -------------------------- ----------------------------------------- -------------------------------------- -------------------
  evaluate_company_quality   Score company fit for Siva sales target   industry, uae_employees, entity_type   score 0--100
  select_contact_tier        Identify titles to contact                size, age in UAE                       target_titles\[\]
  calculate_timing_score     Apply recency/season adjustment           signal_recency, month                  timing_multiplier
  check_edge_cases           Down/Up-weight gov/free zone              license_type, company_name             adjustment_factor
  verify_contact_quality     Assess email/title trust                  title, domain                          confidence
  compute_qscore             Combine sub-scores                        base, signal, reach                    final q
  check_duplicate_outreach   Avoid repeat contacts                     domain                                 boolean
  check_outreach_doctrine    Ensure policy compliance                  draft text                             violations\[\]
  intent_classify_reply      Categorize reply intent                   text                                   enum
  update_outcome_feedback    Persist learning                          decision_id, outcome                   ok

Each rule has a purpose, logic, and explainability block stored in JSON.

**4 Rule Engine Implementation Spec**

**File:** /server/agent-core/rule-engine.js

Main methods:

-   execute(ruleName,input) → dispatches by type

-   executeFormula() → computes numeric formulas safely

-   executeDecisionTree() → walks branches until condition match

-   evaluateVariable() → resolve lookups/mappings

-   checkCondition() → evaluate predicates

-   safeEval() → mathjs parser, no eval()

-   explain() → generate human readable breakdown

All executions return:

{ \"result\": number, \"variables\": {\...}, \"breakdown\": \[\...\],
\"formula\": string, \"version\": \"v1.x\" }

**5 Testing Strategy**

  **Layer**        **Scope**                                                    **Tools**
  ---------------- ------------------------------------------------------------ --------------------------
  Unit             Each rule independently (evaluate_company_quality.test.js)   Jest
  Integration      End-to-end workflow (should_i\_contact_this_company)         Jest + Supertest
  Golden Dataset   ≈ 50 examples to ensure regression stability                 JSON fixture + test loop

**Example:**

test(\'applies enterprise exception\',()=\>{

const
r=engine.execute(\'evaluate_company_quality\',{company_name:\'Etihad\',\...});

expect(r.result).toBeLessThan(10);

});

**6 Rule Evolution Process**

1️⃣ Observe patterns → 2️⃣ Add edge case → 3️⃣ Backtest (last 90 days) →
4️⃣ A/B test (10 % traffic) → 5️⃣ Promote → 6️⃣ Commit version.

**File versioning:** cognitive_extraction_logic.v1.3.json → v1.4.json\
**Backtest metric:** precision ↑ / false positives ↓\
**Promotion criteria:** ≥ 5 % conversion lift vs previous.

**7 Explainability Format**

Every rule returns:

{

\"result\": 92,

\"breakdown\":\[

{\"step\":\"base_quality\",\"value\":80,\"reason\":\"120 UAE employees
(sweet spot)\"},

{\"step\":\"industry_multiplier\",\"value\":1.15,\"reason\":\"Technology
sector\"},

{\"step\":\"edge_cases\",\"value\":1.0,\"reason\":\"No exceptions\"}

\],

\"formula\":\"80 × 1.15 × 1.0 = 92\",

\"confidence\":0.92,

\"version\":\"v1.3\"

}

**UI Guideline:**\
✅ Show score + tick/alert icons\
✅ List 3 main reasons\
✅ Cap score at 100

**8 Versioning & Deployment**

  **Action**       **Command**
  ---------------- ------------------------------------------
  Validate rules   npm run validate-rules
  Deploy update    gcloud run deploy upr-server \--source=.
  Verify version   curl \.../api/agent-core/health
  Rollback         Switch to previous revision in Cloud Run

**9 Governance & Audit**

-   Editor: Sivakumar (sole approver v1)

-   Change log: Git commit messages must describe rule impact.

-   Audit trail: persona_versions table captures version, summary,
    timestamp.

-   Review cycle: quarterly rule health check.

**10 Maintenance Schedule**

  **Trigger**            **Action**
  ---------------------- --------------------------------------------------
  Quarterly              Run backtest on 90-day data → refine thresholds.
  New pattern emerges    Add new rule → v + 0.1 → redeploy.
  Model drift detected   Audit top 10 overrides → update edge cases.

**✅ Phase 5 Deliverables Recap**

1.  cognitive_extraction_logic.json (v1.0 rules)

2.  Rule Engine interpreter (rule-engine.js)

3.  Unit + golden dataset tests

4.  Explainability output format

5.  Evolution + versioning workflow

6.  Governance + maintenance policy

**Decisions Locked for v1**

  **Area**          **Choice**
  ----------------- --------------------------------------
  Rules Format      ✅ JSON Rules Engine
  Rule Complexity   ✅ Medium (formulas + decision trees)
  Storage           ✅ File system (Git-versioned)
  Testing Depth     ✅ Unit + Golden Dataset
  Timeline          4 weeks (Extraction → Integration)
