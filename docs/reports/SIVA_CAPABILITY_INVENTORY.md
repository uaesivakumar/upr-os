# SIVA Capability Inventory

**Purpose:** Define what the AI can actually do autonomously
**Generated:** 2025-11-22
**Report Type:** Roadmap Rebuild - Report 3 of 6

---

## Executive Summary

This inventory catalogs all SIVA tools and workflows with their inputs, outputs, confidence signals, evidence/citation support, and side effects. The goal is to identify which capabilities are safe for autonomous execution in an AI-first UX.

### Tool Inventory Stats
| Category | Count | Status |
|----------|-------|--------|
| **Registered Tools** | 4 | Production (Agent Hub) |
| **Unregistered Tools** | 11 | Available (not exposed) |
| **Workflows** | 6 | Production (Agent Hub) |
| **Total Capabilities** | 21 | - |

### Autonomy Readiness Matrix
| Tool | Type | Confidence Signals | Evidence Support | Side Effects | Autonomy Ready |
|------|------|-------------------|------------------|--------------|----------------|
| CompanyQualityTool | STRICT | HIGH/MEDIUM/LOW | keyFactors, reasoning | DB write | YES |
| ContactTierTool | STRICT | HIGH/MEDIUM/LOW | None (outcome only) | DB write | YES |
| TimingScoreTool | STRICT | HIGH/MEDIUM/LOW | reasoning, keyFactors | DB write | YES |
| BankingProductMatchTool | STRICT | HIGH/MEDIUM/LOW | fit_score per product | DB write | YES |
| CompositeScoreTool | STRICT | HIGH/MEDIUM/LOW | reasoning | None | YES |
| OpeningContextTool | STRICT | confidence score | template_used | None | YES |
| OutreachChannelTool | STRICT | confidence score | - | None | YES |
| OutreachMessageGeneratorTool | DELEGATED | spam_score | LLM-generated | None | REVIEW REQUIRED |
| FollowUpStrategyTool | DELEGATED | engagement_score | engagement history | None | REVIEW REQUIRED |
| ObjectionHandlerTool | DELEGATED | conversion_probability | classification | None | REVIEW REQUIRED |
| RelationshipTrackerTool | DELEGATED | health_score, trend | RFM scoring | None | REVIEW REQUIRED |
| HiringSignalExtractionTool | DELEGATED | hiring_likelihood, uae_presence | LLM extraction | None | REVIEW REQUIRED |
| SourceReliabilityTool | STRICT | reliability_score | tier classification | None | YES |
| SignalDeduplicationTool | STRICT | duplicate_confidence | match_details | None | YES |
| EdgeCasesTool | STRICT | - | blocker reasons | None | YES |

---

## Part 1: Registered Tools (Production)

These 4 tools are registered in the Agent Hub's ToolRegistry and actively used in production.

---

### Tool 1: CompanyQualityTool

**Primitive:** `EVALUATE_COMPANY_QUALITY`
**Type:** STRICT (deterministic, no LLM)
**SLA:** ≤300ms P50, ≤900ms P95
**File:** `server/siva-tools/CompanyQualityToolStandalone.js`

#### Inputs
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| company_name | string | YES | Company name |
| domain | string | NO | Company website domain |
| industry | string | NO | Industry classification |
| size | number | NO | Employee count |
| size_bucket | enum | NO | startup/sme/mid-market/enterprise |
| uae_signals | object | NO | UAE presence indicators |
| salary_indicators | object | NO | Average salary data |

#### Outputs
| Field | Type | Description |
|-------|------|-------------|
| quality_score | number (0-100) | Overall company quality score |
| confidence | number (0-1) | Confidence in the score |
| reasoning | string | Natural language explanation (NO formula exposure) |
| metadata.confidenceLevel | enum | HIGH/MEDIUM/LOW |
| metadata.keyFactors | array | Factors that influenced the score |
| _meta.latency_ms | number | Execution time |

#### Confidence Signals
- **HIGH (≥0.9):** All key data points present, clear signals
- **MEDIUM (0.75-0.89):** Some data gaps, inference required
- **LOW (<0.75):** Significant data gaps, low reliability

#### Evidence/Citation Support
- `keyFactors[]` array with specific signals that drove the score
- `reasoning` in natural language (competitive algorithm protected)
- Example: "Strong UAE operational presence with confirmed free zone license..."

#### Side Effects
| Effect | Target | Description |
|--------|--------|-------------|
| DB Write | `agent_core.agent_decisions` | Logs decision_id, input, output, confidence, latency |

#### A/B Testing Support
- `ABTestingHelper` for version-based entity assignment
- Shadow mode: Rule engine runs in parallel for comparison
- Scoring adjustments from user feedback

#### Autonomy Assessment: **READY**
- Deterministic output
- Clear confidence signals
- Evidence for human verification
- No external API calls

---

### Tool 2: ContactTierTool

**Primitive:** `SELECT_CONTACT_TIER`
**Type:** STRICT (deterministic, no LLM)
**SLA:** ≤200ms P50, ≤600ms P95
**File:** `server/siva-tools/ContactTierToolStandalone.js`

#### Inputs
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | YES | Job title |
| company_size | number | YES | Employee count |
| department | string | NO | Department name |
| seniority_level | string | NO | Seniority classification |

#### Outputs
| Field | Type | Description |
|-------|------|-------------|
| tier | enum | STRATEGIC/PRIMARY/SECONDARY/BACKUP |
| priority | number (1-4) | Outreach priority (1=highest) |
| target_titles | array | Ideal target titles for this tier |
| fallback_titles | array | Alternative titles if primary unavailable |
| confidence | number (0-1) | Classification confidence |
| metadata.confidenceLevel | enum | HIGH/MEDIUM/LOW |

#### Confidence Signals
- **HIGH:** Clear title match, known pattern
- **MEDIUM:** Partial match, inference required
- **LOW:** Unknown title, fallback to generic

#### Evidence/Citation Support
- **NONE** - Outcome only, no reasoning exposed
- Competitive algorithm (title classification logic) protected

#### Side Effects
| Effect | Target | Description |
|--------|--------|-------------|
| DB Write | `agent_core.agent_decisions` | Logs decision_id, input, output, confidence, latency |

#### Autonomy Assessment: **READY**
- Fast, deterministic
- Clear tier output
- No LLM dependency
- Limited evidence (acceptable for tier classification)

---

### Tool 3: TimingScoreTool

**Primitive:** `CALCULATE_TIMING_SCORE`
**Type:** STRICT (deterministic, no LLM)
**SLA:** ≤120ms P50, ≤300ms P95
**File:** `server/siva-tools/TimingScoreToolStandalone.js`

#### Inputs
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| signal_type | enum | YES | HIRING/EXPANSION/FUNDING/NEWS/etc |
| signal_age | number | YES | Days since signal detected |
| current_date | string | YES | Date for calculation (ISO format) |
| fiscal_context | object | NO | UAE-specific fiscal context |

#### Outputs
| Field | Type | Description |
|-------|------|-------------|
| timing_multiplier | number (0.0-2.0) | Multiplier for outreach timing |
| category | enum | OPTIMAL/GOOD/FAIR/POOR |
| reasoning | string | Natural language explanation |
| next_optimal_window | object | Predicted next good timing window |
| confidence | number (0-1) | Score confidence |
| metadata.keyFactors | array | Factors influencing timing |

#### Confidence Signals
- **HIGH:** Recent signal, clear timing indicators
- **MEDIUM:** Signal aging, some uncertainty
- **LOW:** Old signal, timing unreliable

#### Evidence/Citation Support
- `reasoning` explains timing logic
- `keyFactors` includes: signal freshness, UAE calendar events, fiscal periods
- UAE-specific logic: Ramadan, Eid, National Day, Q1-Q4 business cycles

#### Side Effects
| Effect | Target | Description |
|--------|--------|-------------|
| DB Write | `agent_core.agent_decisions` | Logs decision with timing context |

#### Autonomy Assessment: **READY**
- Deterministic calendar-based logic
- Clear evidence for timing decisions
- UAE-specific context awareness

---

### Tool 4: BankingProductMatchTool

**Primitive:** `MATCH_BANKING_PRODUCTS`
**Type:** STRICT (deterministic, no LLM)
**SLA:** ≤100ms P50, ≤250ms P95
**File:** `server/siva-tools/BankingProductMatchToolStandalone.js`

#### Inputs
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| company_size | number | YES | Employee count |
| industry | string | YES | Industry classification |
| signals | array | NO | Detected signals (expansion, hiring, etc) |
| average_salary_aed | number | NO | Average employee salary |
| segment | string | NO | Market segment override |
| has_free_zone_license | boolean | NO | Free zone company indicator |

#### Outputs
| Field | Type | Description |
|-------|------|-------------|
| recommended_products | array(5) | Top 5 product recommendations |
| recommended_products[].product_id | string | Product identifier |
| recommended_products[].product_name | string | Product display name |
| recommended_products[].product_category | string | Category (Salary Account, Credit Card, etc) |
| recommended_products[].fit_score | number (0-100) | Product fit score |
| recommended_products[].priority | number (1-5) | Recommendation priority |
| recommended_products[].key_benefits | array | Product benefits |
| confidence | number (0-1) | Overall match confidence |
| metadata.segment_match | string | Inferred company segment |

#### Confidence Signals
- **HIGH (≥0.85):** Strong signal alignment, clear segment match
- **MEDIUM (0.65-0.84):** Some alignment gaps
- **LOW (<0.65):** Weak data, generic recommendations

#### Evidence/Citation Support
- `fit_score` per product (0-100)
- `key_benefits` array per product
- `target_audience` label per recommendation
- Product catalog source: `emiratesnbd-products.json`

#### Side Effects
| Effect | Target | Description |
|--------|--------|-------------|
| DB Write | `agent_core.agent_decisions` | Logs product recommendations with A/B test metadata |

#### Autonomy Assessment: **READY**
- Deterministic product matching
- Per-product fit scores for transparency
- No external API calls

---

## Part 2: Unregistered Tools (Available but Not Exposed)

These 11 tools exist but are not registered in the Agent Hub. They can be enabled for specific workflows.

---

### Tool 5: CompositeScoreTool

**Primitive:** `GENERATE_COMPOSITE_SCORE`
**Type:** STRICT (deterministic aggregation)
**SLA:** ≤100ms P50, ≤200ms P95
**File:** `server/siva-tools/CompositeScoreToolStandalone.js`

#### Purpose
Aggregates outputs from Tools 1-7 into final Q-Score and Lead Score tier.

#### Inputs
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| company_name | string | YES | Company identifier |
| company_quality_score | number | YES | From Tool 1 |
| contact_tier | enum | YES | From Tool 2 |
| timing_category | enum | YES | From Tool 3 |
| timing_score | number | NO | Numeric timing score |
| has_blockers | boolean | NO | From EdgeCasesTool |
| blocker_count | number | NO | Number of blockers |
| product_match_count | number | NO | From Tool 4 |
| top_product_fit_score | number | NO | Highest fit score |
| primary_channel | enum | NO | From OutreachChannelTool |
| channel_confidence | number | NO | Channel confidence |
| opening_context_confidence | number | NO | From OpeningContextTool |

#### Outputs
| Field | Type | Description |
|-------|------|-------------|
| q_score | number (0-100) | Weighted composite score |
| lead_tier | enum | HOT/WARM/COLD/DISQUALIFIED |
| reasoning | string | Natural language explanation |
| component_scores | object | Breakdown by component |
| confidence | number (0-1) | Overall confidence |

#### Confidence Signals
- Derived from component tool confidences
- Weighted aggregation formula (hidden)

#### Side Effects
- **NONE** - Pure computation

#### Autonomy Assessment: **READY**
- Aggregation only
- No external dependencies

---

### Tool 6: OpeningContextTool

**Primitive:** `GENERATE_OPENING_CONTEXT`
**Type:** STRICT (template-based, no LLM)
**SLA:** ≤100ms P50, ≤200ms P95
**File:** `server/siva-tools/OpeningContextToolStandalone.js`

#### Purpose
Generate opening 2-3 sentences that reference company signal in user's voice.

#### Inputs
| Field | Type | Required |
|-------|------|----------|
| company_name | string | YES |
| signal_type | enum | YES |
| signal_headline | string | NO |
| industry | string | NO |
| city | string | NO |
| additional_context | string | NO |

#### Outputs
| Field | Type | Description |
|-------|------|-------------|
| opening_context | string | Generated opening paragraph |
| template_used | string | Template identifier (hidden logic) |
| value_proposition | string | Core value prop used |
| confidence | number | Generation confidence |

#### Templates Available
- `expansion` - For expansion signals
- `hiring` - For hiring signals
- `funding` - For funding signals
- `news` - For general news
- `generic` - Fallback template

#### Side Effects
- **NONE** - Template rendering only

#### Autonomy Assessment: **READY**
- Template-based (no LLM)
- Fast and deterministic
- No user data modification

---

### Tool 7: OutreachChannelTool

**Primitive:** `SELECT_OUTREACH_CHANNEL`
**Type:** STRICT (deterministic)
**File:** `server/siva-tools/OutreachChannelToolStandalone.js`

#### Purpose
Recommend optimal outreach channel (Email/LinkedIn/Phone) based on contact and company context.

#### Autonomy Assessment: **READY**
- Rule-based channel selection
- No external calls

---

### Tool 8: EdgeCasesTool

**Primitive:** `DETECT_EDGE_CASES`
**Type:** STRICT (deterministic)
**File:** `server/siva-tools/EdgeCasesToolStandalone.js`

#### Purpose
Detect blockers that should prevent outreach (competitors, government entities, etc).

#### Outputs
- `has_blockers`: boolean
- `blockers[]`: array of blocker reasons
- `risk_level`: HIGH/MEDIUM/LOW

#### Autonomy Assessment: **READY**
- Critical safety tool
- Should always run before outreach

---

### Tool 9: OutreachMessageGeneratorTool

**Primitive:** `GENERATE_OUTREACH_MESSAGE`
**Type:** DELEGATED (LLM-assisted)
**SLA:** ≤3000ms P50, ≤5000ms P95
**File:** `server/siva-tools/OutreachMessageGeneratorToolStandalone.js`

#### Purpose
Generate complete outreach email messages using GPT-4 with Siva's voice.

#### Inputs
| Field | Type | Required |
|-------|------|----------|
| company_context | object | YES |
| opening_context | string | NO |
| recommended_products | array | NO |
| contact_info | object | YES |
| message_type | enum | YES |
| tone_preference | enum | NO |

#### Outputs
| Field | Type | Description |
|-------|------|-------------|
| subject_line | string | Email subject (max 60 chars) |
| greeting | string | Personalized greeting |
| opening_paragraph | string | Signal-referencing opener |
| value_proposition | string | Benefits explanation |
| call_to_action | string | Low-friction CTA |
| signature | string | Siva's signature |
| spam_score | number (0-100) | Estimated spam likelihood |
| compliance_check | object | NEVER rules validation |

#### Confidence Signals
- `spam_score` for quality assessment
- `compliance_check` for policy validation

#### Side Effects
- **NONE** - Generation only (no sending)

#### Autonomy Assessment: **REVIEW REQUIRED**
- LLM output variability
- Needs human review before sending
- Recommend: Generate + Human Approve workflow

---

### Tool 10: FollowUpStrategyTool

**Primitive:** `DETERMINE_FOLLOWUP_STRATEGY`
**Type:** DELEGATED (Hybrid: Rules + LLM)
**SLA:** ≤500ms P50 (rules), ≤3000ms P95 (with LLM)
**File:** `server/siva-tools/FollowUpStrategyToolStandalone.js`

#### Purpose
Determine when/how to follow up based on engagement signals.

#### Outputs
- `action`: FOLLOW_UP/WAIT/ESCALATE/ARCHIVE
- `days_until_next`: number
- `suggested_channel`: EMAIL/LINKEDIN/PHONE
- `follow_up_message`: LLM-generated (optional)
- `engagement_score`: 0-100

#### Autonomy Assessment: **REVIEW REQUIRED**
- Deterministic action selection: OK
- LLM message generation: Needs human review

---

### Tool 11: ObjectionHandlerTool

**Primitive:** `HANDLE_OBJECTION`
**Type:** DELEGATED (Pattern match + LLM)
**SLA:** ≤1000ms P50 (classification), ≤3000ms P95 (with LLM)
**File:** `server/siva-tools/ObjectionHandlerToolStandalone.js`

#### Objection Types (6)
- TIMING - "Not the right time"
- EXISTING_BANK - "We have a bank already"
- NO_NEED - "We don't need this"
- DECISION_MAKER - "I'm not the decision maker"
- BUDGET - "Too expensive"
- GENERIC - Other objections

#### Outputs
- `objection_type`: Classification
- `conversion_probability`: 0-1
- `response_strategy`: 4-part structure
- `next_step_recommendation`: Action to take

#### Autonomy Assessment: **REVIEW REQUIRED**
- Classification: OK for autonomous
- Response generation: Needs human review

---

### Tool 12: RelationshipTrackerTool

**Primitive:** `TRACK_RELATIONSHIP_HEALTH`
**Type:** DELEGATED (RFM scoring + LLM)
**SLA:** ≤500ms P50 (scoring), ≤3000ms P95 (with LLM)
**File:** `server/siva-tools/RelationshipTrackerToolStandalone.js`

#### Outputs
- `health_indicator`: STRONG/NEUTRAL/WEAKENING/LOST
- `health_score`: 0-100 (RFM-based)
- `trend`: IMPROVING/STABLE/DECLINING
- `recommended_action`: NURTURE/CHECK_IN/RE_ENGAGE/ESCALATE/ARCHIVE
- `nurture_content`: LLM-suggested content (optional)

#### Autonomy Assessment: **REVIEW REQUIRED**
- Health scoring: OK
- Nurture content: Needs human review

---

### Tool 13: HiringSignalExtractionTool

**Primitive:** `EXTRACT_HIRING_SIGNALS`
**Type:** DELEGATED (GPT-4 extraction)
**SLA:** ≤3000ms P50, ≤5000ms P95
**File:** `server/siva-tools/HiringSignalExtractionToolStandalone.js`

#### Purpose
Extract structured hiring signals from news articles/web content.

#### Outputs per Signal
- `company_name`, `company_domain`
- `industry`, `location`
- `signal_type`: HIRING/EXPANSION/FUNDING/ACQUISITION/PARTNERSHIP/RELOCATION
- `trigger_description`: What they're doing
- `uae_presence_confidence`: CONFIRMED/PROBABLE/AMBIGUOUS
- `hiring_likelihood`: 1-5 score

#### Autonomy Assessment: **REVIEW REQUIRED**
- LLM extraction may hallucinate
- Recommend: Extract + Human Verification workflow

---

### Tool 14: SourceReliabilityTool

**Primitive:** `EVALUATE_SOURCE_RELIABILITY`
**Type:** STRICT (deterministic lookup)
**SLA:** ≤50ms P50, ≤100ms P95
**File:** `server/siva-tools/SourceReliabilityToolStandalone.js`

#### Purpose
Score news sources for reliability (0-100).

#### Source Tiers
| Tier | Score Range | Examples |
|------|-------------|----------|
| TIER_1 | 90-100 | bloomberg.com, reuters.com, gulfnews.com |
| TIER_2 | 70-89 | tradearabia.com, magnitt.com |
| TIER_3 | 60-69 | bayt.com, linkedin.com |
| UNVERIFIED | <60 | Unknown sources (default: 40) |

#### Autonomy Assessment: **READY**
- Lookup-based
- Sub-100ms latency

---

### Tool 15: SignalDeduplicationTool

**Primitive:** `CHECK_SIGNAL_DUPLICATION`
**Type:** STRICT (fuzzy matching + DB lookup)
**SLA:** ≤200ms P50, ≤500ms P95
**File:** `server/siva-tools/SignalDeduplicationToolStandalone.js`

#### Purpose
Detect duplicate hiring signals using fuzzy matching + domain comparison.

#### Outputs
- `is_duplicate`: boolean
- `duplicate_confidence`: 0-1
- `existing_signal_id`: UUID if duplicate found
- `match_details`: Name similarity, domain match info

#### Autonomy Assessment: **READY**
- Deterministic matching
- Fails open (doesn't block on errors)

---

## Part 3: Workflows

Workflows orchestrate multiple tools in sequence or parallel.

---

### Workflow 1: company_evaluation

**Purpose:** Quick company quality check (single tool)
**Execution:** Sequential
**Timeout:** 2000ms
**File:** `server/agent-hub/workflows/company-evaluation.js`

**Steps:**
1. `CompanyQualityTool` - Evaluate company quality

**Autonomy Assessment: READY**

---

### Workflow 2: full_lead_scoring

**Purpose:** Complete lead scoring combining all 4 registered tools
**Execution:** Sequential
**Timeout:** 5000ms
**File:** `server/agent-hub/workflows/full-lead-scoring.js`

**Steps:**
1. `CompanyQualityTool` - Evaluate company
2. `ContactTierTool` - Select contact tier
3. `TimingScoreTool` - Calculate timing (optional)
4. `BankingProductMatchTool` - Match products (optional, depends on step 1)

**Autonomy Assessment: READY**

---

### Workflow 3: outreach_optimization

**Purpose:** Optimize timing and product recommendations
**Execution:** Parallel
**Timeout:** 3000ms
**File:** `server/agent-hub/workflows/outreach-optimization.js`

**Steps (parallel):**
1. `TimingScoreTool` - Calculate timing
2. `BankingProductMatchTool` - Match products

**Autonomy Assessment: READY**

---

### Workflow 4: conditional_lead_scoring

**Purpose:** Score lead with conditional tool execution
**File:** `server/agent-hub/workflows/conditional-lead-scoring.js`

**Autonomy Assessment: READY**

---

### Workflow 5: batch_company_evaluation

**Purpose:** Bulk company evaluation
**File:** `server/agent-hub/workflows/batch-company-evaluation.js`

**Autonomy Assessment: READY**

---

### Workflow 6: fallback_workflow

**Purpose:** Graceful degradation when primary tools fail
**File:** `server/agent-hub/workflows/fallback-workflow.js`

**Autonomy Assessment: READY**

---

## Part 4: Autonomy Recommendations

### Safe for Autonomous Execution (GREEN)

| Tool/Workflow | Reason |
|---------------|--------|
| CompanyQualityTool | Deterministic, clear evidence |
| ContactTierTool | Deterministic, fast |
| TimingScoreTool | Deterministic, UAE-aware |
| BankingProductMatchTool | Deterministic, per-product scores |
| CompositeScoreTool | Aggregation only |
| OpeningContextTool | Template-based |
| OutreachChannelTool | Rule-based |
| EdgeCasesTool | Safety blocker |
| SourceReliabilityTool | Lookup-based |
| SignalDeduplicationTool | Fuzzy match (fails open) |
| All 6 Workflows | Composed of safe tools |

### Require Human Review (YELLOW)

| Tool | Why | Recommended Pattern |
|------|-----|---------------------|
| OutreachMessageGeneratorTool | LLM output variability | Generate + Human Approve |
| FollowUpStrategyTool | LLM message generation | Action OK, Message needs review |
| ObjectionHandlerTool | LLM response generation | Classification OK, Response needs review |
| RelationshipTrackerTool | LLM nurture content | Scoring OK, Content needs review |
| HiringSignalExtractionTool | LLM may hallucinate | Extract + Human Verify |

---

## Part 5: Database Side Effects

All registered tools log to `agent_core.agent_decisions`:

```sql
CREATE TABLE agent_core.agent_decisions (
  decision_id UUID PRIMARY KEY,
  tool_name VARCHAR(100) NOT NULL,
  rule_name VARCHAR(100),
  rule_version VARCHAR(20),
  input_data JSONB,
  output_data JSONB,
  confidence_score DECIMAL(5,4),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### What Gets Logged
- Every tool execution
- Input parameters (for debugging)
- Output with confidence scores
- A/B test assignment (if applicable)
- Shadow mode comparison results
- Scoring adjustment metadata

### Privacy Considerations
- No PII in decision logs (company names only, no contacts)
- Tenant-isolated data
- 90-day retention recommended

---

## Part 6: AI-First UX Integration Points

Based on this inventory, here are the recommended integration patterns for AI-first UX:

### Pattern 1: Autonomous Actions (No Confirmation)
**Use for:** STRICT tools with high confidence
```
User: "Score this company"
→ CompanyQualityTool executes
→ Show result with confidence + keyFactors
→ User can drill into evidence
```

### Pattern 2: Suggested Actions (Confirm Before Execute)
**Use for:** DELEGATED tools with LLM output
```
User: "Draft an outreach email"
→ OutreachMessageGeneratorTool executes
→ Show draft with spam_score + compliance_check
→ User edits/approves → Send
```

### Pattern 3: Batch with Progress (Multiple Autonomous)
**Use for:** Workflows on multiple leads
```
User: "Score all leads in this list"
→ full_lead_scoring workflow × N
→ Show progress bar
→ Present summary with outliers highlighted
```

### Pattern 4: Conditional Autonomy
**Use for:** Actions that depend on confidence
```
if tool.confidence >= 0.85:
    execute_autonomously()
else:
    present_for_human_review()
```

---

## Conclusion

**15 tools** and **6 workflows** are inventoried. Of these:

- **10 tools** are safe for fully autonomous execution
- **5 tools** require human-in-the-loop for LLM-generated content
- **All 6 workflows** compose safe tools and are autonomy-ready

The key differentiator is **tool type**:
- **STRICT tools**: Deterministic, autonomy-ready
- **DELEGATED tools**: LLM-assisted, need review for generated content (classification outputs are OK)

For AI-first UX, prioritize exposing STRICT tools as autonomous actions and DELEGATED tools with a "Generate → Review → Approve" pattern.
