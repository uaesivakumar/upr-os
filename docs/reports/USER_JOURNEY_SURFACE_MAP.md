# User Journey + Surface Map

**Generated:** 2025-11-22
**Purpose:** AI-first UX is about surfaces, not pages. This report maps where users still do manual steps.

---

## 1. ALL UI PAGES & ROUTES

### Route Map

| Path | Component | Section | Status |
|------|-----------|---------|--------|
| `/login` | Login | Auth | ACTIVE |
| `/` | DashboardHome | Dashboard | ACTIVE |
| `/leads/all` | HRLeads | Leads | ACTIVE |
| `/leads/add` | ManualLeadsPage | Leads | ACTIVE |
| `/leads/pipeline` | LeadsPipelinePage | Leads | ACTIVE |
| `/companies` | CompaniesPage | Companies | ACTIVE |
| `/enrichment` | EnrichmentPage | Intelligence | ACTIVE |
| `/my-style` | MyStylePage | Intelligence | MINIMAL |
| `/metrics` | MetricsDashboard | Intelligence | MINIMAL |
| `/analytics` | AnalyticsPage | Intelligence | ACTIVE |
| `/templates` | TemplateStudioPage | Outreach | ACTIVE |
| `/templates/create` | TemplateCreatorPage | Outreach | ACTIVE |
| `/templates/:id` | TemplateEditorPage | Outreach | ACTIVE |
| `/broadcast` | BroadcastPage | Outreach | ACTIVE |
| `/outreach` | OutreachQueuePage | Outreach | ACTIVE |
| `/outreach/:leadId` | OutreachComposerPage | Outreach | ACTIVE |
| `/messages` | MessagesPage | Outreach | MINIMAL |
| `/radar` | RadarPage | Discovery | ACTIVE |
| `/hiring-signals` | HiringSignalsPage | Discovery | ACTIVE |
| `/siva` | SIVAPage | Agents | ACTIVE |
| `/admin` | AdminIndexPage | Admin | ACTIVE |
| `/admin/patterns` | AdminEmailPatternsPage | Admin | ACTIVE |
| `/design-system` | DesignSystemDemo | Dev | DEV ONLY |

### Unrouted Pages (Exist but not wired)

| Component | Purpose | Status |
|-----------|---------|--------|
| KnowledgeGraphPage | Company relationships | NOT ROUTED |
| LearningDashboard | AI learning insights | NOT ROUTED |
| SourceConfigPage | Multi-source orchestration | NOT ROUTED |
| BulkEnrichPage | CSV bulk enrichment | NOT ROUTED |

---

## 2. DATA CONSUMPTION BY PAGE

### Dashboard (`/`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Stats | `GET /api/stats` | Overview metrics |

**Data Displayed:**
- Total companies, leads, outreach count
- New leads (7 days)
- Recent leads list
- Top companies by Q-Score
- LLM usage metadata

---

### Leads (`/leads/all`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Leads list | `GET /api/hr-leads?{filters}` | Paginated leads |
| Lead detail | `GET /api/hr-leads/{id}` | Single lead |

**Data Displayed:**
- Name, email, company, designation
- LinkedIn URL, location
- Lead status, score, confidence
- Email validation status
- Source attribution

**Filters Available:**
- Text search
- Status filter
- Score range
- Location filter

---

### Companies (`/companies`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Companies list | `GET /api/companies?{filters}` | Filtered list |
| Company leads | `GET /api/hr-leads?companyName={name}` | Associated leads |

**Data Displayed:**
- Name, website, LinkedIn URL
- Locations array
- Type (ALE/NON_ALE/Good Coded)
- Status (New → Converted)
- Q-Score

**Filters Available:**
- Text search
- Type filter
- Status filter
- Location filter

---

### Enrichment (`/enrichment`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Company preview | `GET /api/companies/preview?q={query}` | Search companies |
| Signal load | `GET /api/companies/signal/{signalId}` | Load from signal |
| Generate leads | `POST /api/enrich/generate` | Start enrichment |
| Job status | `GET /api/enrichment/status?job_id={id}` | Poll progress |
| Enriched leads | `GET /api/enrichment/leads?job_id={id}` | Get results |
| Refine search | `POST /api/enrich/refine` | LinkedIn refinement |
| Save leads | `POST /api/enrich/save` | Persist selections |
| Verify email | `POST /api/email/verify` | Single verification |

**Data Displayed:**
- Company info (name, domain, industry, size)
- Quality score breakdown
- UAE presence indicators
- Lead list with confidence scores
- Email validation status per lead
- Role bucket classification

---

### Hiring Signals (`/hiring-signals`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Stats | `GET /api/hiring-signals/stats` | Signal counts |
| Hot signals | `GET /api/hiring-signals/hot` | Priority signals |
| Review queue | `GET /api/hiring-signals/review` | Needs review |
| Background | `GET /api/hiring-signals/background` | Low priority |
| Enrich trigger | `POST /api/hiring-enrich/from-signal` | Start enrichment |

**Data Displayed:**
- Signal type, confidence score
- Company details
- Detection date
- Action status
- Grouped by company

---

### Analytics (`/analytics`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Mock data | (In-component) | Demo metrics |

**Data Displayed:**
- Time series charts
- Cohort analysis
- KPI cards
- Export options

**Note:** Currently uses mock data, not connected to real analytics endpoints.

---

### SIVA Agents (`/siva`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Mock events | (In-component) | Demo agent activity |
| SSE stream | `GET /api/agents/activity/stream` | Real-time (available) |

**Data Displayed:**
- Agent event feed
- Confidence indicators
- Reasoning explanations
- Performance metrics
- Collaboration graph

**Note:** Has SSE endpoint available but currently uses mock data generator.

---

### Templates (`/templates`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Templates list | `GET /api/templates` | All templates |
| Template detail | `GET /api/templates/{id}` | Single template |
| Versions | `GET /api/templates/{id}/versions` | Version history |

**Data Displayed:**
- Template name, status
- Email blocks (subject, opening, greeting, value, CTA, signature)
- Declared variables
- Version history

---

### Broadcast (`/broadcast`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Templates | `GET /api/templates` | Template selection |
| Leads count | `GET /api/hr-leads?{filters}` | Audience filtering |

**Data Displayed:**
- Template selector with preview
- Audience filters (status, score)
- Lead count (real-time)
- Campaign name input

---

### Outreach Composer (`/outreach/:leadId`)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Research | `POST /api/outreach/research` | AI research |
| Compose | `POST /api/outreach/compose` | AI email draft |
| Send | `POST /api/outreach/send` | Final send |
| Style memory | `POST /api/style-memory/update` | Learn edits |

**Data Displayed:**
- Lead context
- AI-generated email (subject + body)
- Edit tracking
- Send status

---

### Chat (Floating Component)

| Data Source | Endpoint | Purpose |
|-------------|----------|---------|
| Send message | `POST /api/chat` | Non-streaming |
| Stream message | `POST /api/chat/stream` | SSE streaming |
| Sessions | `GET /api/chat/sessions` | History |

**Data Displayed:**
- Message history
- Streaming responses
- Context awareness (current page)
- Suggested prompts

---

## 3. USER ACTIONS & DECISIONS BY PAGE

### Dashboard (`/`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| View stats | Read-only | ❌ Already automated |
| Click recent lead | Navigate | ✅ "Show me this lead" |
| Click top company | Navigate | ✅ "Tell me about this company" |

**Manual Steps:** None - Dashboard is read-only

---

### Leads (`/leads/all`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Search leads | Filter | ✅ "Find leads in Dubai" |
| Filter by status | Filter | ✅ "Show contacted leads" |
| Edit lead inline | Update | ✅ "Update this lead's status" |
| Bulk select | Multi-select | ✅ "Select all HR leads" |
| Bulk delete | Delete | ⚠️ Requires confirmation |
| Bulk status update | Update | ✅ "Mark these as contacted" |
| Rescore lead | Action | ✅ "Rescore this lead" |

**Manual Steps:**
1. Double-click to edit cell → AI could edit via chat
2. Manual status selection → AI could suggest next status
3. Bulk operations require manual selection → AI could select by criteria

---

### Companies (`/companies`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Search companies | Filter | ✅ "Find tech companies" |
| Filter by type | Filter | ✅ "Show ALE companies" |
| View company detail | Read | ✅ "Tell me about Acme Corp" |
| Click website/LinkedIn | External | ❌ External links |

**Manual Steps:**
1. No inline editing → AI could update company
2. No company creation → AI could create from chat
3. Manual filter selection → AI could filter by description

---

### Enrichment (`/enrichment`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Search company | Query | ✅ "Enrich leads for TechCorp" |
| Refine with LinkedIn | Clarify | ✅ "Use this LinkedIn URL" |
| Select leads | Multi-select | ✅ "Select all HR contacts" |
| Verify email | Verify | ✅ "Verify this email" |
| Save selected | Save | ✅ "Save these leads" |

**Manual Steps:**
1. Type company name → AI could suggest companies
2. Manual lead selection → AI could auto-select by criteria
3. Individual email verification → AI could batch verify
4. Manual save click → AI could auto-save qualified leads

---

### Hiring Signals (`/hiring-signals`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Switch tabs | Filter | ✅ "Show hot signals" |
| Sort signals | Sort | ✅ "Sort by confidence" |
| Mark for review | Status | ✅ "Review this signal" |
| Enrich from signal | Trigger | ✅ "Enrich leads from this signal" |
| Add to outreach | Action | ✅ "Add to outreach queue" |

**Manual Steps:**
1. Tab switching → AI could filter by description
2. Manual signal review → AI could auto-triage
3. One-by-one enrichment → AI could batch enrich

---

### Templates (`/templates`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| View templates | List | ✅ "Show my templates" |
| Create template | Create | ✅ "Create a cold outreach template" |
| Edit template | Update | ✅ "Update the subject line" |
| Preview email | Preview | ✅ "Preview with sample data" |

**Manual Steps:**
1. Manual template creation → AI generates from brief
2. Block-by-block editing → AI could edit specific blocks
3. Variable declaration → AI auto-detects variables

---

### Template Creator (`/templates/create`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Enter brief | Input | ✅ Already AI-driven |
| Generate with AI | Generate | ✅ Core feature |
| Edit blocks | Edit | ✅ "Make CTA more urgent" |
| Save template | Save | ✅ "Save as new template" |

**Manual Steps:**
1. Brief writing → AI could interview for requirements
2. Block editing → AI could refine based on feedback
3. Variable naming → AI auto-suggests

---

### Broadcast (`/broadcast`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Select template | Choose | ✅ "Use my best performing template" |
| Filter audience | Filter | ✅ "Target new leads with score > 80" |
| Launch broadcast | Execute | ✅ "Send to all matching leads" |
| Generate pack | Export | ✅ "Create manual send pack" |

**Manual Steps:**
1. Template selection from dropdown → AI could recommend
2. Manual filter adjustment → AI could optimize audience
3. Launch confirmation → AI could schedule optimal time

---

### Outreach Queue (`/outreach`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Copy subject | Copy | ❌ Necessary manual step |
| Copy body | Copy | ❌ Necessary manual step |
| Open mailto | External | ❌ External action |
| Mark as sent | Status | ✅ "Mark as sent" |
| Mark as replied | Status | ✅ "Got a reply" |

**Manual Steps:**
1. Copy-paste to email client → Integration opportunity
2. Manual status tracking → Could detect from email
3. One-by-one processing → Could batch process

---

### Outreach Composer (`/outreach/:leadId`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Wait for research | Auto | ✅ Already automated |
| Wait for compose | Auto | ✅ Already automated |
| Edit subject | Edit | ✅ "Make it more personal" |
| Edit body | Edit | ✅ "Add a case study mention" |
| Approve & send | Execute | ✅ "Send this email" |

**Manual Steps:**
1. Email editing → AI learns from edits (style memory)
2. Manual approval → Could auto-send high-confidence
3. One lead at a time → Could batch compose

---

### SIVA Agents (`/siva`)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Filter by agent type | Filter | ✅ "Show lead agent actions" |
| Filter by time | Filter | ✅ "Last 24 hours" |
| Filter by confidence | Filter | ✅ "Low confidence decisions" |
| Toggle live mode | Toggle | ✅ "Go live" |
| Switch view | View | ✅ "Show collaboration graph" |

**Manual Steps:**
1. Manual filtering → AI could highlight anomalies
2. No intervention actions → Could allow overrides from UI

---

### Chat (Floating)

| Action | Type | AI Opportunity |
|--------|------|----------------|
| Send message | Chat | ✅ Core feature |
| Select suggestion | Quick action | ✅ Context-aware |
| View history | List | ✅ "Show previous chats" |

**Manual Steps:**
1. Typing queries → Voice input opportunity
2. Context switching → Already context-aware

---

## 4. GAPS WHERE USERS DO MANUAL STEPS

### High-Impact Manual Gaps

| Gap | Current State | AI Solution | Priority |
|-----|---------------|-------------|----------|
| **Lead qualification** | Manual score review | AI auto-qualifies | HIGH |
| **Email verification** | One-by-one clicks | Batch auto-verify | HIGH |
| **Template selection** | Browse & choose | AI recommends best | HIGH |
| **Audience filtering** | Manual filter UI | Natural language | HIGH |
| **Signal triage** | Tab switching | AI auto-categorizes | HIGH |
| **Outreach timing** | Manual send | AI optimal timing | HIGH |

### Medium-Impact Manual Gaps

| Gap | Current State | AI Solution | Priority |
|-----|---------------|-------------|----------|
| **Company research** | Search + review | Chat: "Research TechCorp" | MEDIUM |
| **Lead data updates** | Inline editing | Chat: "Update status" | MEDIUM |
| **Bulk operations** | Manual multi-select | Chat: "Select all X" | MEDIUM |
| **Report generation** | Navigate to analytics | Chat: "Show my metrics" | MEDIUM |
| **Signal enrichment** | Click per signal | Chat: "Enrich all hot signals" | MEDIUM |

### Low-Impact Manual Gaps

| Gap | Current State | AI Solution | Priority |
|-----|---------------|-------------|----------|
| **Navigation** | Click sidebar | Chat: "Go to templates" | LOW |
| **Filter reset** | Click clear | Chat: "Clear filters" | LOW |
| **View switching** | Click tabs | Chat: "Show pipeline view" | LOW |

---

## 5. SURFACE OPPORTUNITIES FOR AI-FIRST UX

### Surfaces That Should Be AI-Driven

| Surface | Current | Should Be |
|---------|---------|-----------|
| **Enrichment start** | Type company name | "Enrich TechCorp" or auto from signal |
| **Lead selection** | Manual checkboxes | "Select HR leads with score > 80" |
| **Template creation** | Fill form + brief | "Create template for cold outreach" |
| **Broadcast launch** | Multi-step wizard | "Send template X to qualified leads" |
| **Signal review** | Manual tab switching | AI shows "needs attention" |
| **Outreach send** | Copy/paste to email | Direct send or Gmail integration |

### Surfaces That Should Surface AI Insights

| Surface | Missing Insight |
|---------|-----------------|
| **Lead detail** | "Best next action for this lead" |
| **Company detail** | "Similar companies you've contacted" |
| **Template list** | "Your best performing template" |
| **Analytics** | "Anomaly: Response rate dropped 20%" |
| **SIVA feed** | "Agent disagreed with your override 3 times" |

### Surfaces That Should Allow AI Intervention

| Surface | Current | AI Intervention |
|---------|---------|-----------------|
| **Low-confidence decisions** | View only | "Override this decision" |
| **Email composition** | Edit text | "Regenerate with feedback" |
| **Lead scoring** | View score | "Rescore with new context" |
| **Signal categorization** | Fixed category | "Recategorize this signal" |

---

## 6. RECOMMENDED CHAT COMMANDS

Based on gaps analysis, these chat commands would eliminate most manual steps:

### Lead Management
```
"Find leads in Dubai with score > 80"
"Show me all HR contacts at TechCorp"
"Update this lead's status to Contacted"
"Select all uncontacted leads"
"Delete leads with invalid emails"
```

### Enrichment
```
"Enrich TechCorp"
"Enrich from this LinkedIn: [URL]"
"Verify all patterned emails"
"Save all verified leads"
"Auto-enrich all hot signals"
```

### Outreach
```
"Create a cold outreach template"
"Use my best template for new leads"
"Send to all qualified leads"
"What's my response rate this week?"
"Schedule broadcast for tomorrow 9am"
```

### Discovery
```
"Show hot signals"
"Triage today's signals"
"Research [company name]"
"What companies are hiring in tech?"
```

### Analytics
```
"Show my conversion funnel"
"Compare this week to last week"
"Export leads report"
"Why did response rate drop?"
```

---

## 7. SUMMARY

### Current State

| Metric | Count |
|--------|-------|
| Total routed pages | 22 |
| Pages with full API wiring | 14 |
| Pages with mock data | 2 (Analytics, SIVA) |
| Unrouted pages | 4 |
| Manual action types | 50+ |
| Actions automatable via AI | 35+ |

### Key Insights

1. **Enrichment workflow** has the most manual steps → Highest AI opportunity
2. **Outreach queue** is entirely manual copy-paste → Integration opportunity
3. **Analytics/SIVA** use mock data → Need real backend wiring
4. **Signal triage** is manual tab-switching → AI should auto-categorize
5. **Template selection** is browsing → AI should recommend

### AI-First Transformation Priority

1. **Chat as universal interface** - Already built (Sprint 53)
2. **Wire SIVA tools to chat** - 11 tools available
3. **Add batch operations** - "Enrich all", "Verify all"
4. **Add recommendations** - "Best template", "Optimal time"
5. **Add anomaly detection** - "Response rate dropped"
6. **Add email integration** - Direct send vs copy-paste

---

*This report identifies where AI-first UX should replace manual workflows. The 2030 UX vision should eliminate every gap listed above.*
