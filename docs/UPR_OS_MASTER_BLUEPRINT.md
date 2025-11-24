# UPR OS Master Blueprint

**Version:** 1.0.0
**Generated:** 2025-11-22
**Classification:** Internal Architecture Document
**Purpose:** The complete operating system specification for UPR 2030

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Chat OS Architecture](#2-chat-os-architecture)
3. [SIVA Tools System](#3-siva-tools-system)
4. [Workflow Engine](#4-workflow-engine)
5. [Stream Orchestration](#5-stream-orchestration)
6. [Trust Framework](#6-trust-framework)
7. [UX Surfaces](#7-ux-surfaces)
8. [Security Model](#8-security-model)
9. [Anti-Cloning Design](#9-anti-cloning-design)
10. [System Boundaries](#10-system-boundaries)
11. [Future-Proof AI Patterns](#11-future-proof-ai-patterns)
12. [Data Flows](#12-data-flows)

---

## 1. Executive Summary

### What is UPR OS?

UPR OS is an **AI-native operating system** for lead intelligence and outreach automation. Unlike traditional CRM/sales tools that bolt AI onto existing interfaces, UPR OS is designed from the ground up with AI as the primary interaction layer.

### Core Philosophy

> **"Features navigate to users, not users to features."**

Traditional Software:
```
User → Navigate → Find Feature → Form → Submit → Wait → Result
```

UPR OS:
```
User Intent → AI Understands → AI Executes → User Approves/Refines
```

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              UPR OS ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         CHAT OS (Master Interface)                      │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │ │
│  │  │   Chat UI   │  │  Cmd+K      │  │   Copilot   │  │   Alerts    │   │ │
│  │  │  (Primary)  │  │ (Command)   │  │  (Inline)   │  │ (Proactive) │   │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                           NLU + INTENT ENGINE                           │ │
│  │         Claude 3.5 Sonnet  •  9 Intent Types  •  Entity Extraction     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                    ┌───────────────┼───────────────┐                        │
│                    ▼               ▼               ▼                        │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│  │     SIVA TOOLS       │ │   WORKFLOW ENGINE    │ │   STREAM MANAGER     │ │
│  │  15 Tools, 6 Flows   │ │  Triggers, Actions   │ │   SSE, Real-time     │ │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ │
│                    │               │               │                        │
│                    └───────────────┼───────────────┘                        │
│                                    ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                            DATA LAYER                                   │ │
│  │    PostgreSQL  •  Redis  •  Neo4j  •  Vector Store (Planned)           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Metrics

| Metric | Current State | Target State |
|--------|---------------|--------------|
| SIVA Tools Registered | 4 | 15 |
| Autonomous Actions | 0 | 10+ per session |
| Manual Steps to Qualify Lead | 7 | 1 |
| Time to Create Outreach | 20 min | 30 sec |
| User Trust in AI Decisions | N/A | 85%+ |

---

## 2. Chat OS Architecture

### 2.1 Overview

Chat OS is the **master interface** for all UPR interactions. It replaces traditional navigation with conversational AI.

### 2.2 Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CHAT OS COMPONENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐     ┌─────────────────────────────────────┐│
│  │     CHAT INTERFACE          │     │        NLU SERVICE                  ││
│  │  ┌───────────────────────┐  │     │  ┌─────────────────────────────────┐││
│  │  │ Message Input         │  │────▶│  │ Intent Classification          │││
│  │  │ Streaming Response    │  │     │  │ • query_leads                  │││
│  │  │ Suggested Prompts     │  │     │  │ • score_lead                   │││
│  │  │ Context Awareness     │  │     │  │ • match_products               │││
│  │  │ Session History       │  │     │  │ • contact_tier                 │││
│  │  └───────────────────────┘  │     │  │ • timing_score                 │││
│  └─────────────────────────────┘     │  │ • generate_outreach            │││
│                                       │  │ • analytics                    │││
│  ┌─────────────────────────────┐     │  │ • help                         │││
│  │     COMMAND PALETTE         │     │  │ • general                      │││
│  │  ┌───────────────────────┐  │     │  └─────────────────────────────────┘││
│  │  │ Cmd+K Activation      │  │     │                                      ││
│  │  │ Recent Commands       │  │     │  ┌─────────────────────────────────┐││
│  │  │ Quick Actions         │  │────▶│  │ Entity Extraction              │││
│  │  │ Search Everything     │  │     │  │ • company_name                 │││
│  │  └───────────────────────┘  │     │  │ • lead_id                      │││
│  └─────────────────────────────┘     │  │ • filter_criteria              │││
│                                       │  │ • date_range                   │││
│  ┌─────────────────────────────┐     │  │ • action_type                  │││
│  │     INLINE COPILOT          │     │  └─────────────────────────────────┘││
│  │  ┌───────────────────────┐  │     └─────────────────────────────────────┘│
│  │  │ Page Context Aware    │  │                                             │
│  │  │ Proactive Suggestions │  │     ┌─────────────────────────────────────┐│
│  │  │ Smart Form Fill       │  │     │        TOOL ROUTER                  ││
│  │  │ Explain AI Decisions  │  │────▶│  ┌─────────────────────────────────┐││
│  │  └───────────────────────┘  │     │  │ Intent → Tool Mapping           │││
│  └─────────────────────────────┘     │  │ Workflow Selection              │││
│                                       │  │ Parallel vs Sequential          │││
│  ┌─────────────────────────────┐     │  │ Error Handling                  │││
│  │     PROACTIVE ALERTS        │     │  └─────────────────────────────────┘││
│  │  ┌───────────────────────┐  │     └─────────────────────────────────────┘│
│  │  │ Signal Detection      │  │                                             │
│  │  │ Timing Optimization   │  │                                             │
│  │  │ Risk Alerts           │  │                                             │
│  │  │ Follow-up Reminders   │  │                                             │
│  │  └───────────────────────┘  │                                             │
│  └─────────────────────────────┘                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 API Endpoints

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|------------|
| `/api/chat` | POST | Send message (non-streaming) | 30/min |
| `/api/chat/stream` | POST | Send message (SSE streaming) | 30/min |
| `/api/chat/stream` | GET | Connect to session updates | 30/min |
| `/api/chat/sessions` | GET | List user sessions | - |
| `/api/chat/sessions/:id` | GET | Get session with messages | - |
| `/api/chat/sessions/:id` | DELETE | Delete session | - |

### 2.4 Intent Classification

```typescript
interface IntentClassification {
  intent:
    | 'query_leads'        // "Find leads in Dubai"
    | 'score_lead'         // "Score TechCorp"
    | 'match_products'     // "What products fit TechCorp?"
    | 'contact_tier'       // "Who should I contact at TechCorp?"
    | 'timing_score'       // "When should I reach out?"
    | 'generate_outreach'  // "Draft an email to the CEO"
    | 'analytics'          // "Show my conversion rate"
    | 'help'               // "How do I..."
    | 'general';           // Everything else
  confidence: number;      // 0.0 - 1.0
  entities: Entity[];      // Extracted parameters
}
```

### 2.5 Context Awareness

Chat OS automatically receives context from the current page:

```typescript
interface ChatContext {
  page_context: {
    current_page: string;        // "leads", "companies", "enrichment"
    selected_items: string[];    // IDs of selected items
    active_filters: object;      // Current filter state
  };
  data_context: {
    company_name?: string;       // If viewing a company
    lead_id?: string;            // If viewing a lead
    enrichment_job_id?: string;  // If in enrichment workflow
  };
  user_context: {
    user_id: string;
    workspace_id: string;
    preferences: object;
  };
}
```

### 2.6 Streaming Protocol

```
Client                                Server
  │                                      │
  │─── POST /api/chat/stream ──────────▶│
  │    { message, session_id, context } │
  │                                      │
  │◀── SSE: session ────────────────────│
  │    { type: "session", session_id }  │
  │                                      │
  │◀── SSE: intent ─────────────────────│
  │    { type: "intent", intent, conf } │
  │                                      │
  │◀── SSE: tools_start ────────────────│
  │    { type: "tools_start", tools }   │
  │                                      │
  │◀── SSE: tool_result ────────────────│ (per tool)
  │    { type: "tool_result", output }  │
  │                                      │
  │◀── SSE: text ───────────────────────│ (streaming)
  │    { type: "text", content }        │
  │                                      │
  │◀── SSE: done ───────────────────────│
  │    { type: "done", metadata }       │
  │                                      │
```

---

## 3. SIVA Tools System

### 3.1 Overview

SIVA (Smart Intelligence for Value Assessment) is UPR's AI reasoning engine. It consists of **15 specialized tools** organized into categories.

### 3.2 Tool Registry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SIVA TOOL REGISTRY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REGISTERED (Production)                    UNREGISTERED (Available)         │
│  ══════════════════════                    ════════════════════════          │
│                                                                              │
│  ┌─────────────────────────┐               ┌─────────────────────────┐      │
│  │ CompanyQualityTool      │               │ CompositeScoreTool      │      │
│  │ STRICT • 300ms P50      │               │ OpeningContextTool      │      │
│  │ Company quality 0-100   │               │ OutreachChannelTool     │      │
│  └─────────────────────────┘               │ EdgeCasesTool           │      │
│                                             │ SourceReliabilityTool   │      │
│  ┌─────────────────────────┐               │ SignalDeduplicationTool │      │
│  │ ContactTierTool         │               └─────────────────────────┘      │
│  │ STRICT • 200ms P50      │                                                 │
│  │ STRATEGIC/PRIMARY/etc   │               ┌─────────────────────────┐      │
│  └─────────────────────────┘               │ OutreachMessageGenTool  │      │
│                                             │ FollowUpStrategyTool    │      │
│  ┌─────────────────────────┐               │ ObjectionHandlerTool    │      │
│  │ TimingScoreTool         │               │ RelationshipTrackerTool │      │
│  │ STRICT • 120ms P50      │               │ HiringSignalExtractTool │      │
│  │ OPTIMAL/GOOD/FAIR/POOR  │               └─────────────────────────┘      │
│  └─────────────────────────┘                        ▲                        │
│                                                      │                        │
│  ┌─────────────────────────┐               ┌────────┴────────┐              │
│  │ BankingProductMatchTool │               │  DELEGATED      │              │
│  │ STRICT • 100ms P50      │               │  (LLM-assisted) │              │
│  │ Top 5 product recs      │               │  Needs Review   │              │
│  └─────────────────────────┘               └─────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Tool Types

| Type | Behavior | LLM Usage | Autonomy |
|------|----------|-----------|----------|
| **STRICT** | Deterministic, rule-based | None | Full autonomy |
| **DELEGATED** | Hybrid rules + LLM | For generation | Requires review |

### 3.4 Tool Specifications

#### CompanyQualityTool

```typescript
// Primitive: EVALUATE_COMPANY_QUALITY
// Type: STRICT
// SLA: ≤300ms P50, ≤900ms P95

interface Input {
  company_name: string;          // Required
  domain?: string;               // Company website
  industry?: string;             // Industry classification
  size?: number;                 // Employee count
  size_bucket?: 'startup' | 'sme' | 'mid-market' | 'enterprise';
  uae_signals?: {
    has_free_zone?: boolean;
    free_zone_name?: string;
    uae_presence_confirmed?: boolean;
  };
  salary_indicators?: {
    average_salary_aed?: number;
    salary_tier?: string;
  };
}

interface Output {
  quality_score: number;         // 0-100
  confidence: number;            // 0.0-1.0
  reasoning: string;             // Natural language (no formula exposure)
  metadata: {
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    keyFactors: string[];        // Evidence for the score
  };
  _meta: {
    latency_ms: number;
    rule_version: string;
  };
}
```

#### ContactTierTool

```typescript
// Primitive: SELECT_CONTACT_TIER
// Type: STRICT
// SLA: ≤200ms P50, ≤600ms P95

interface Input {
  title: string;                 // Job title
  company_size: number;          // Employee count
  department?: string;           // Department name
  seniority_level?: string;      // Seniority classification
}

interface Output {
  tier: 'STRATEGIC' | 'PRIMARY' | 'SECONDARY' | 'BACKUP';
  priority: 1 | 2 | 3 | 4;       // 1 = highest
  target_titles: string[];       // Ideal titles for this tier
  fallback_titles: string[];     // Alternatives
  confidence: number;
  metadata: {
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}
```

#### TimingScoreTool

```typescript
// Primitive: CALCULATE_TIMING_SCORE
// Type: STRICT
// SLA: ≤120ms P50, ≤300ms P95

interface Input {
  signal_type: 'HIRING' | 'EXPANSION' | 'FUNDING' | 'NEWS' | 'RELOCATION';
  signal_age: number;            // Days since signal detected
  current_date: string;          // ISO format
  fiscal_context?: {
    fiscal_year_end?: string;
    budget_cycle?: string;
  };
}

interface Output {
  timing_multiplier: number;     // 0.0-2.0
  category: 'OPTIMAL' | 'GOOD' | 'FAIR' | 'POOR';
  reasoning: string;
  next_optimal_window: {
    start_date: string;
    end_date: string;
    reason: string;
  };
  confidence: number;
  metadata: {
    keyFactors: string[];        // UAE calendar, Ramadan, fiscal periods
  };
}
```

#### BankingProductMatchTool

```typescript
// Primitive: MATCH_BANKING_PRODUCTS
// Type: STRICT
// SLA: ≤100ms P50, ≤250ms P95

interface Input {
  company_size: number;
  industry: string;
  signals?: string[];            // expansion, hiring, funding
  average_salary_aed?: number;
  segment?: string;              // Market segment override
  has_free_zone_license?: boolean;
}

interface Output {
  recommended_products: Array<{
    product_id: string;
    product_name: string;
    product_category: string;    // Salary Account, Credit Card, etc.
    fit_score: number;           // 0-100
    priority: 1 | 2 | 3 | 4 | 5;
    key_benefits: string[];
    target_audience: string;
  }>;                            // Top 5 products
  confidence: number;
  metadata: {
    segment_match: string;       // Inferred company segment
  };
}
```

### 3.5 Tool Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TOOL EXECUTION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐                                                           │
│  │   REQUEST    │                                                           │
│  │  tool_name   │                                                           │
│  │  input_data  │                                                           │
│  └──────┬───────┘                                                           │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         TOOL REGISTRY                                 │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐          │  │
│  │  │ Validate Input │─▶│ Check Circuit  │─▶│ Get Tool       │          │  │
│  │  │ (Zod Schema)   │  │ Breaker State  │  │ Instance       │          │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         TOOL EXECUTION                                │  │
│  │                                                                        │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │                     STRICT TOOL                                 │  │  │
│  │  │  • Deterministic rules                                          │  │  │
│  │  │  • No LLM calls                                                 │  │  │
│  │  │  • Fast execution (< 300ms)                                     │  │  │
│  │  │  • Full autonomy                                                │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                               OR                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    DELEGATED TOOL                               │  │  │
│  │  │  • Rules + LLM hybrid                                           │  │  │
│  │  │  • LLM for generation                                           │  │  │
│  │  │  • Slower (< 3000ms)                                            │  │  │
│  │  │  • Requires human review for generated content                  │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         POST-EXECUTION                                │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐          │  │
│  │  │ Log Decision   │─▶│ A/B Test Track │─▶│ Update Circuit │          │  │
│  │  │ (PostgreSQL)   │  │ (if enabled)   │  │ Breaker Stats  │          │  │
│  │  └────────────────┘  └────────────────┘  └────────────────┘          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────┐                                                           │
│  │   RESPONSE   │                                                           │
│  │  output_data │                                                           │
│  │  confidence  │                                                           │
│  │  latency_ms  │                                                           │
│  └──────────────┘                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.6 Decision Logging

All tool executions are logged to `agent_core.agent_decisions`:

```sql
CREATE TABLE agent_core.agent_decisions (
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name VARCHAR(100) NOT NULL,
  rule_name VARCHAR(100),
  rule_version VARCHAR(20),
  input_data JSONB NOT NULL,
  output_data JSONB NOT NULL,
  confidence_score DECIMAL(5,4),
  latency_ms INTEGER,
  ab_test_variant VARCHAR(50),
  shadow_mode_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id UUID REFERENCES tenants(id)
);

-- Index for company-based queries
CREATE INDEX idx_decisions_company ON agent_core.agent_decisions
  ((input_data->>'company_name'));

-- Index for tool performance analysis
CREATE INDEX idx_decisions_tool_time ON agent_core.agent_decisions
  (tool_name, created_at);
```

---

## 4. Workflow Engine

### 4.1 Overview

The Workflow Engine orchestrates multiple SIVA tools into coherent pipelines.

### 4.2 Workflow Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            WORKFLOW TYPES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SEQUENTIAL                         PARALLEL                                 │
│  ══════════                         ════════                                 │
│                                                                              │
│  ┌─────────┐                       ┌─────────┐    ┌─────────┐               │
│  │ Tool A  │                       │ Tool A  │    │ Tool B  │               │
│  └────┬────┘                       └────┬────┘    └────┬────┘               │
│       │                                 │              │                     │
│       ▼                                 └──────┬───────┘                     │
│  ┌─────────┐                                   │                             │
│  │ Tool B  │                                   ▼                             │
│  └────┬────┘                            ┌──────────┐                        │
│       │                                 │  Merge   │                        │
│       ▼                                 └──────────┘                        │
│  ┌─────────┐                                                                 │
│  │ Tool C  │                                                                 │
│  └─────────┘                                                                 │
│                                                                              │
│  CONDITIONAL                        FALLBACK                                 │
│  ═══════════                        ════════                                 │
│                                                                              │
│  ┌─────────┐                       ┌─────────┐                              │
│  │ Tool A  │                       │ Tool A  │────── failure ────┐          │
│  └────┬────┘                       └────┬────┘                   │          │
│       │                                 │ success                │          │
│  ┌────┴────┐                           ▼                        ▼          │
│  │   IF    │                       ┌─────────┐             ┌─────────┐     │
│  │ score>X │                       │ Tool B  │             │ Default │     │
│  └────┬────┘                       └─────────┘             │  Value  │     │
│   yes │ no                                                  └─────────┘     │
│   ┌───┴───┐                                                                  │
│   ▼       ▼                                                                  │
│ ┌───┐   ┌───┐                                                               │
│ │ B │   │ C │                                                               │
│ └───┘   └───┘                                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Pre-built Workflows

#### full_lead_scoring

```yaml
name: full_lead_scoring
description: Complete lead evaluation with all 4 core tools
execution: sequential
timeout: 5000ms

steps:
  - tool: CompanyQualityTool
    alias: company_result
    required: true

  - tool: ContactTierTool
    alias: contact_result
    required: true
    input_mapping:
      company_size: ${company_result.output.size}

  - tool: TimingScoreTool
    alias: timing_result
    required: false
    condition: ${company_result.output.quality_score > 50}

  - tool: BankingProductMatchTool
    alias: product_result
    required: false
    depends_on: company_result
    input_mapping:
      company_size: ${company_result.output.size}
      industry: ${company_result.output.industry}

output:
  quality_score: ${company_result.output.quality_score}
  contact_tier: ${contact_result.output.tier}
  timing_category: ${timing_result.output.category}
  recommended_products: ${product_result.output.recommended_products}
  overall_confidence: avg(
    ${company_result.output.confidence},
    ${contact_result.output.confidence}
  )
```

#### outreach_optimization

```yaml
name: outreach_optimization
description: Parallel timing and product matching
execution: parallel
timeout: 3000ms

steps:
  - tool: TimingScoreTool
    alias: timing_result

  - tool: BankingProductMatchTool
    alias: product_result

merge_strategy: combine_all
```

#### batch_company_evaluation

```yaml
name: batch_company_evaluation
description: Evaluate multiple companies in parallel
execution: batch_parallel
max_concurrency: 10
timeout: 30000ms

per_item:
  tool: CompanyQualityTool

aggregation:
  type: collect_all
  sort_by: quality_score
  order: desc
```

### 4.4 Workflow Builder (Sprint 58)

Users will be able to create custom workflows:

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;

  trigger: {
    type: 'manual' | 'schedule' | 'event' | 'webhook';
    config: TriggerConfig;
  };

  steps: Array<{
    id: string;
    tool: string;
    condition?: string;         // JavaScript expression
    input_mapping?: Record<string, string>;
    on_error: 'fail' | 'skip' | 'fallback';
    fallback_value?: any;
  }>;

  output_mapping: Record<string, string>;

  metadata: {
    created_by: string;
    created_at: string;
    version: number;
    is_shared: boolean;
  };
}
```

---

## 5. Stream Orchestration

### 5.1 Overview

UPR OS uses Server-Sent Events (SSE) for real-time communication.

### 5.2 Stream Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STREAM ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              FRONTEND                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        STREAM MANAGER                                   │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │ │
│  │  │ Chat Stream  │  │ Agent Stream │  │Enrich Stream │                 │ │
│  │  │ Connection   │  │ Connection   │  │ Connection   │                 │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │ │
│  │         │                 │                 │                          │ │
│  │         └─────────────────┼─────────────────┘                          │ │
│  │                           │                                             │ │
│  │  ┌────────────────────────┴────────────────────────┐                   │ │
│  │  │              Connection Pool                     │                   │ │
│  │  │  • Auto-reconnect with exponential backoff       │                   │ │
│  │  │  • Message deduplication                         │                   │ │
│  │  │  • Offline queue                                 │                   │ │
│  │  │  • Health monitoring                             │                   │ │
│  │  └──────────────────────────────────────────────────┘                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    │ EventSource / fetch + ReadableStream   │
│                                    ▼                                         │
│                              BACKEND                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         SSE ENDPOINTS                                   │ │
│  │                                                                          │ │
│  │  POST /api/chat/stream                                                  │ │
│  │  ├── Event: session        { session_id }                               │ │
│  │  ├── Event: intent         { intent, confidence, entities }             │ │
│  │  ├── Event: tools_start    { tools[] }                                  │ │
│  │  ├── Event: tool_result    { tool, output, latency, success }           │ │
│  │  ├── Event: tool_error     { tool, error }                              │ │
│  │  ├── Event: text           { content }  (streaming)                     │ │
│  │  ├── Event: done           { metadata }                                 │ │
│  │  └── Event: error          { error }                                    │ │
│  │                                                                          │ │
│  │  GET /api/chat/stream?session_id=X                                      │ │
│  │  └── Event: connected      { message, timestamp }                       │ │
│  │                                                                          │ │
│  │  GET /api/agents/activity/stream                                        │ │
│  │  ├── Event: connected      { message, timestamp }                       │ │
│  │  ├── Event: initial_data   { data[], timestamp }                        │ │
│  │  └── Event: agent_action   { data, timestamp }                          │ │
│  │                                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Event Schema

```typescript
// Unified event format for all streams
interface StreamEvent {
  id: string;              // Unique event ID for deduplication
  type: string;            // Event type
  source: 'chat' | 'agent' | 'enrichment' | 'workflow';
  timestamp: string;       // ISO date
  payload: unknown;        // Event-specific data
  correlationId?: string;  // For tracking related events
}

// Chat-specific events
interface ChatTextEvent {
  type: 'text';
  content: string;
}

interface ChatToolResultEvent {
  type: 'tool_result';
  tool: string;
  output: Record<string, any>;
  latency_ms: number;
  success: boolean;
}

// Agent activity events
interface AgentActionEvent {
  type: 'agent_action';
  data: {
    id: string;
    agentType: 'lead' | 'research' | 'validation' | 'outreach' | 'system';
    action: string;
    target: string;
    confidence: number;
    timestamp: string;
    reasoning?: string;
    outcome: 'success' | 'in_progress' | 'failure';
    metadata: {
      entityId: string;
      entityType: string;
      sources: string[];
      processingTime: number;
      cost?: number;
    };
  };
}
```

### 5.4 Reconnection Strategy

```typescript
class StreamManager {
  private connections: Map<string, EventSource> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();

  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_BASE_DELAY = 1000; // 1 second
  private readonly RECONNECT_MAX_DELAY = 30000; // 30 seconds

  connect(channel: string, url: string): void {
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      this.reconnectAttempts.set(channel, 0);
      this.emit('connected', channel);
    };

    eventSource.onerror = () => {
      const attempts = this.reconnectAttempts.get(channel) || 0;

      if (attempts < this.MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          this.RECONNECT_BASE_DELAY * Math.pow(2, attempts),
          this.RECONNECT_MAX_DELAY
        );

        setTimeout(() => {
          this.reconnectAttempts.set(channel, attempts + 1);
          this.connect(channel, url);
        }, delay);
      } else {
        this.emit('connection_failed', channel);
        this.fallbackToPolling(channel);
      }
    };

    this.connections.set(channel, eventSource);
  }

  private fallbackToPolling(channel: string): void {
    // Switch to REST polling if SSE fails repeatedly
  }
}
```

### 5.5 Backpressure Handling

```typescript
// Rate limiting configuration
const RATE_LIMITS = {
  chat: { maxRequests: 30, windowMs: 60000 },
  agents: { maxRequests: 100, windowMs: 60000 },
  enrichment: { maxRequests: 10, windowMs: 60000 },
};

// Server-side rate limiter
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retry_after_ms: 60000,
    });
  },
});

// Client-side rate limiter
class ClientRateLimiter {
  private requests: Map<string, number[]> = new Map();

  canMakeRequest(key: string): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMITS.chat.windowMs;
    const requests = this.requests.get(key) || [];
    const recentRequests = requests.filter(t => t > windowStart);

    return recentRequests.length < RATE_LIMITS.chat.maxRequests;
  }

  recordRequest(key: string): void {
    const requests = this.requests.get(key) || [];
    requests.push(Date.now());
    this.requests.set(key, requests);
  }
}
```

---

## 6. Trust Framework

### 6.1 Overview

The Trust Framework defines when AI can act autonomously vs. requiring human review.

### 6.2 Trust Levels

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TRUST FRAMEWORK                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FULL TRUST (Auto-Execute)                                                  │
│  ═════════════════════════                                                  │
│  Confidence: ≥90%                                                           │
│  Evidence: All sources verified                                             │
│  Action: Execute without confirmation                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Examples:                                                            │   │
│  │ • CompanyQualityTool with full data                                  │   │
│  │ • ContactTierTool with clear title match                             │   │
│  │ • TimingScoreTool with recent signal                                 │   │
│  │ • BankingProductMatchTool with known segment                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  HIGH TRUST (Show + Allow Override)                                         │
│  ═══════════════════════════════════                                        │
│  Confidence: 75-89%                                                         │
│  Evidence: Key sources verified                                             │
│  Action: Show result, allow one-click override                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Examples:                                                            │   │
│  │ • CompanyQualityTool with partial data                               │   │
│  │ • ContactTierTool with uncommon title                                │   │
│  │ • CompositeScoreTool aggregation                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  MEDIUM TRUST (Require Confirmation)                                        │
│  ═══════════════════════════════════                                        │
│  Confidence: 60-74%                                                         │
│  Evidence: Some gaps                                                        │
│  Action: Require explicit confirmation before action                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Examples:                                                            │   │
│  │ • HiringSignalExtractionTool with ambiguous source                   │   │
│  │ • FollowUpStrategyTool recommendations                               │   │
│  │ • RelationshipTrackerTool health assessments                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  LOW TRUST (Human Review Required)                                          │
│  ═════════════════════════════════                                          │
│  Confidence: <60%                                                           │
│  Evidence: Significant gaps                                                 │
│  Action: Present options, human must select                                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Examples:                                                            │   │
│  │ • OutreachMessageGeneratorTool output                                │   │
│  │ • ObjectionHandlerTool responses                                     │   │
│  │ • Any LLM-generated content                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Evidence Requirements by Tool

| Tool | Evidence Type | Citation Format |
|------|---------------|-----------------|
| CompanyQualityTool | keyFactors[], reasoning | "Strong UAE presence with DIFC license" |
| ContactTierTool | tier, priority | Outcome only (algorithm protected) |
| TimingScoreTool | reasoning, keyFactors | "Recent expansion signal (12 days)" |
| BankingProductMatchTool | fit_score per product | "Premium Salary: 92% fit" |
| CompositeScoreTool | component_scores | Breakdown by component |
| OutreachMessageGeneratorTool | spam_score, compliance | "Spam: 12/100, Compliance: PASS" |

### 6.4 Citation Display Format

```typescript
// Every AI output should include this metadata
interface AICitation {
  confidence: number;           // 0-100
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  sources: Array<{
    name: string;               // "Company website", "LinkedIn", "Gulf News"
    reliability: number;        // 0-100
    last_checked: string;       // ISO date
  }>;
  tools_used: string[];         // ["CompanyQualityTool", "TimingScoreTool"]
  latency_ms: number;           // Total execution time
  cost_usd: number;             // API costs (if applicable)
}

// Display format in UI
`
📊 Confidence: 87% (HIGH)
📚 Sources: Company website (95%), LinkedIn (70%), Gulf News (95%)
🔧 Tools: CompanyQualityTool, TimingScoreTool
⏱️ Latency: 234ms
💰 Cost: $0.002
`
```

### 6.5 Feedback Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FEEDBACK LOOP                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   AI Makes   │────▶│ User Reviews │────▶│   Feedback   │                │
│  │   Decision   │     │   Decision   │     │   Captured   │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│                             │                      │                        │
│                    ┌────────┴────────┐            │                        │
│                    │                 │            │                        │
│               ┌────▼────┐      ┌────▼────┐       │                        │
│               │ Approve │      │ Override │       │                        │
│               └────┬────┘      └────┬────┘       │                        │
│                    │                │             │                        │
│                    └────────┬───────┘             │                        │
│                             │                     │                        │
│                             ▼                     ▼                        │
│                    ┌──────────────────────────────────┐                    │
│                    │        LEARNING SYSTEM           │                    │
│                    │  • Track approval rates           │                    │
│                    │  • Identify patterns in overrides │                    │
│                    │  • Adjust confidence thresholds   │                    │
│                    │  • A/B test scoring variants      │                    │
│                    └──────────────────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. UX Surfaces

### 7.1 Surface Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              UX SURFACES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRIMARY SURFACES (AI-Native)                                               │
│  ════════════════════════════                                               │
│                                                                              │
│  1. Chat Interface                    2. Command Palette                    │
│  ┌─────────────────────────────┐     ┌─────────────────────────────┐       │
│  │ 💬 Floating bubble          │     │ ⌘ Cmd+K activation          │       │
│  │    Streaming responses      │     │   Quick actions             │       │
│  │    Context awareness        │     │   Search everything         │       │
│  │    Session history          │     │   Recent commands           │       │
│  │    Status: DELIVERED ✅     │     │   Status: Sprint 54         │       │
│  └─────────────────────────────┘     └─────────────────────────────┘       │
│                                                                              │
│  3. Inline Copilot                    4. Proactive Alerts                   │
│  ┌─────────────────────────────┐     ┌─────────────────────────────┐       │
│  │ 💡 Context-aware hints      │     │ 🔔 Toast notifications       │       │
│  │    Smart form fill          │     │    Sidebar badges           │       │
│  │    Page-specific            │     │    Actionable alerts        │       │
│  │    Learn from dismissals    │     │    Priority levels          │       │
│  │    Status: Sprint 54        │     │    Status: Sprint 54        │       │
│  └─────────────────────────────┘     └─────────────────────────────┘       │
│                                                                              │
│  SECONDARY SURFACES (Visual Tools)                                          │
│  ═════════════════════════════════                                          │
│                                                                              │
│  5. AI Explanation Panel              6. Smart Forms                        │
│  ┌─────────────────────────────┐     ┌─────────────────────────────┐       │
│  │ 🔍 Slide-out on "Why?"      │     │ 📝 Auto-fill from context    │       │
│  │    Confidence breakdown     │     │    Confidence per field     │       │
│  │    Evidence sources         │     │    Source citations         │       │
│  │    Feedback buttons         │     │    Manual override          │       │
│  │    Status: Sprint 55        │     │    Status: Sprint 54        │       │
│  └─────────────────────────────┘     └─────────────────────────────┘       │
│                                                                              │
│  7. SIVA Dashboard                    8. Knowledge Graph                    │
│  ┌─────────────────────────────┐     ┌─────────────────────────────┐       │
│  │ 🤖 Agent activity feed      │     │ 🕸️ Force-directed graph     │       │
│  │    Collaboration graph      │     │    Company relationships    │       │
│  │    Performance metrics      │     │    Similar companies        │       │
│  │    Live/historical view     │     │    Interactive exploration  │       │
│  │    Status: DELIVERED ✅     │     │    Status: Sprint 56        │       │
│  └─────────────────────────────┘     └─────────────────────────────┘       │
│                                                                              │
│  9. Workflow Builder                  10. Report Designer                   │
│  ┌─────────────────────────────┐     ┌─────────────────────────────┐       │
│  │ ⚡ Drag-and-drop canvas     │     │ 📊 Custom dashboards        │       │
│  │    Triggers & actions       │     │    Pivot tables             │       │
│  │    Scheduling               │     │    Scheduled delivery       │       │
│  │    Execution history        │     │    Sharing & embedding      │       │
│  │    Status: Sprint 58        │     │    Status: Sprint 60        │       │
│  └─────────────────────────────┘     └─────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Interaction Patterns

| Surface | Trigger | Response Time | Autonomy |
|---------|---------|---------------|----------|
| Chat | User message | Streaming | Per-tool |
| Command Palette | Cmd+K | Instant | Full |
| Inline Copilot | Page load | < 500ms | Suggestion only |
| Proactive Alerts | Event-driven | Real-time | Notification only |
| AI Explanation | Click "Why?" | < 200ms | Read-only |
| Smart Forms | Field focus | < 300ms | Suggestion only |
| SIVA Dashboard | Navigation | Streaming | Read-only |
| Knowledge Graph | Navigation | < 2s | Read-only |
| Workflow Builder | User action | Variable | User-controlled |
| Report Designer | User action | Variable | User-controlled |

---

## 8. Security Model

### 8.1 Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SECURITY MODEL                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  AUTHENTICATION                                                              │
│  ══════════════                                                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          JWT Token Flow                              │   │
│  │                                                                       │   │
│  │  User ──▶ POST /api/auth/login ──▶ JWT (httpOnly cookie)             │   │
│  │                                                                       │   │
│  │  JWT Claims:                                                          │   │
│  │  {                                                                    │   │
│  │    sub: "user_id",                                                    │   │
│  │    tenant_id: "tenant_id",                                            │   │
│  │    role: "admin" | "manager" | "user" | "viewer",                     │   │
│  │    permissions: ["read", "write", "delete", "admin"],                 │   │
│  │    exp: <timestamp>,                                                  │   │
│  │    iat: <timestamp>                                                   │   │
│  │  }                                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  AUTHORIZATION (RBAC)                                                       │
│  ═════════════════════                                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Role          │ Permissions                                          │   │
│  │───────────────┼──────────────────────────────────────────────────────│   │
│  │ admin         │ All permissions + user management + system config    │   │
│  │ manager       │ Read + Write + Delete + Approve + Team management    │   │
│  │ user          │ Read + Write + Delete (own data only)                │   │
│  │ viewer        │ Read only                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  DATA ISOLATION                                                              │
│  ══════════════                                                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Multi-tenant: All queries filtered by tenant_id                    │   │
│  │ • Row-level security: PostgreSQL RLS policies                        │   │
│  │ • API isolation: Tenant ID injected from JWT                         │   │
│  │ • No cross-tenant data access possible                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 API Security

```typescript
// Rate limiting per endpoint
const RATE_LIMITS = {
  '/api/auth/login': { max: 5, windowMs: 60000 },      // 5 per minute
  '/api/chat': { max: 30, windowMs: 60000 },           // 30 per minute
  '/api/chat/stream': { max: 30, windowMs: 60000 },    // 30 per minute
  '/api/enrichment/*': { max: 10, windowMs: 60000 },   // 10 per minute
  '/api/*': { max: 100, windowMs: 60000 },             // Default
};

// Input validation (all endpoints)
const validateInput = (schema: ZodSchema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: result.error.errors,
    });
  }
  req.body = result.data;
  next();
};

// SQL injection prevention
// All queries use parameterized statements via Knex.js
db('hr_leads')
  .where('tenant_id', req.user.tenant_id)
  .where('company_name', companyName)  // Parameterized, not interpolated
  .select('*');
```

### 8.3 Data Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA SECURITY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ENCRYPTION                                                                  │
│  ══════════                                                                  │
│                                                                              │
│  • In Transit: TLS 1.3 (HTTPS only)                                         │
│  • At Rest: AES-256 (database-level)                                        │
│  • Secrets: Google Cloud Secret Manager                                     │
│                                                                              │
│  PII HANDLING                                                                │
│  ═══════════                                                                 │
│                                                                              │
│  Sensitive fields:                                                           │
│  • email → stored, hashed for search                                        │
│  • phone → stored, masked in logs                                           │
│  • salary_aed → stored, not exposed in API                                  │
│                                                                              │
│  Agent Activity Sanitization:                                                │
│  ```javascript                                                               │
│  function sanitizeEvent(event) {                                             │
│    return {                                                                  │
│      ...event,                                                               │
│      reasoning: redactPII(event.reasoning),                                  │
│      target: event.target, // Company name only, not person names           │
│    };                                                                        │
│  }                                                                           │
│                                                                              │
│  function redactPII(text) {                                                  │
│    return text                                                               │
│      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]') │
│      .replace(/\+?[\d\s\-()]{10,}/g, '[PHONE]')                              │
│      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');                            │
│  }                                                                           │
│  ```                                                                         │
│                                                                              │
│  AUDIT LOGGING                                                               │
│  ═════════════                                                               │
│                                                                              │
│  All actions logged to audit_log table:                                      │
│  • User ID, Action, Resource, Timestamp                                      │
│  • IP address, User agent                                                    │
│  • Before/after state for updates                                            │
│  • 90-day retention                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Anti-Cloning Design

### 9.1 Competitive Moat Architecture

UPR OS is designed with multiple layers that make cloning difficult and ineffective.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ANTI-CLONING DESIGN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 1: PROPRIETARY ALGORITHMS                                            │
│  ════════════════════════════════                                            │
│                                                                              │
│  SIVA tools contain protected scoring logic:                                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ CompanyQualityTool                                                   │   │
│  │ • UAE-specific scoring model (free zones, Emirates ID, etc.)         │   │
│  │ • Proprietary weighting formula (NOT exposed in reasoning)           │   │
│  │ • Banking industry fit criteria (Emirates NBD specific)              │   │
│  │                                                                       │   │
│  │ Output: "Strong UAE presence" NOT "score = 0.3*uae + 0.25*size..."  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  LAYER 2: DOMAIN-SPECIFIC DATA                                              │
│  ══════════════════════════════                                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • emiratesnbd-products.json - Confidential product catalog           │   │
│  │ • UAE free zone mappings - Curated list                              │   │
│  │ • Banking industry templates - Compliance-approved                   │   │
│  │ • Historical signal patterns - Learned from production data          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  LAYER 3: TRAINED MODELS & FEEDBACK LOOPS                                   │
│  ═════════════════════════════════════════                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Approval/override patterns from real users                         │   │
│  │ • A/B test results (LinUCB/Thompson sampling)                        │   │
│  │ • Style memory per user (writing preferences)                        │   │
│  │ • Confidence threshold calibration from feedback                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  LAYER 4: INTEGRATED ARCHITECTURE                                           │
│  ═════════════════════════════════                                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Chat OS as universal interface (not bolted-on)                     │   │
│  │ • 15 tools designed to work together (workflow compositions)         │   │
│  │ • Stream orchestration (real-time transparency)                      │   │
│  │ • Trust framework (confidence-based autonomy)                        │   │
│  │                                                                       │   │
│  │ Copying one component without the others yields an inferior product  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  LAYER 5: VELOCITY & ITERATION SPEED                                        │
│  ═══════════════════════════════════                                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ • Sprint-based development (2-week cycles)                           │   │
│  │ • Feature-driven roadmap (10 sprints planned)                        │   │
│  │ • Continuous learning from production usage                          │   │
│  │ • Rapid response to market feedback                                  │   │
│  │                                                                       │   │
│  │ By the time a clone catches up, UPR OS is 5 sprints ahead            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Protected Components

| Component | Protection Method | Exposure Level |
|-----------|-------------------|----------------|
| Scoring formulas | Natural language output only | None |
| Product catalog | Internal JSON, not in API | None |
| Free zone mappings | Compiled into tool logic | None |
| A/B test variants | Server-side only | None |
| User feedback data | Never exported | None |
| Chat prompts | Server-side system prompts | None |
| Intent classification | Confidence scores only | Partial |
| Tool schemas | Public (for MCP clients) | Full |

### 9.3 API Response Sanitization

```typescript
// Never expose internal scoring details
function sanitizeToolOutput(tool: string, output: any): any {
  switch (tool) {
    case 'CompanyQualityTool':
      return {
        quality_score: output.quality_score,
        confidence: output.confidence,
        reasoning: output.reasoning,  // Natural language, no formula
        // NOT included: internal_weights, raw_factors, formula_version
      };

    case 'BankingProductMatchTool':
      return {
        recommended_products: output.recommended_products.map(p => ({
          product_name: p.product_name,
          fit_score: p.fit_score,
          key_benefits: p.key_benefits,
          // NOT included: product_id, internal_category, margin_tier
        })),
      };

    default:
      return output;
  }
}
```

---

## 10. System Boundaries

### 10.1 Component Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SYSTEM BOUNDARIES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         FRONTEND (React)                                │ │
│  │  Responsibility: UI rendering, state management, user interaction      │ │
│  │  Does NOT: Make direct DB calls, run business logic, call external APIs│ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                            REST API / SSE                                    │
│                                    │                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         BACKEND (Express.js)                            │ │
│  │  ┌────────────────────┐  ┌────────────────────┐  ┌─────────────────┐  │ │
│  │  │   API Routes       │  │   Services         │  │   SIVA Tools    │  │ │
│  │  │   • Validation     │  │   • Business logic │  │   • Scoring     │  │ │
│  │  │   • Auth/AuthZ     │  │   • Orchestration  │  │   • Generation  │  │ │
│  │  │   • Rate limiting  │  │   • Caching        │  │   • Analysis    │  │ │
│  │  └────────────────────┘  └────────────────────┘  └─────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│                    ▼               ▼               ▼                        │
│  ┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐│
│  │     PostgreSQL       │ │      Redis       │ │       Neo4j              ││
│  │  • Primary data      │ │  • Queue (BullMQ)│ │  • Knowledge graph       ││
│  │  • Audit logs        │ │  • Cache         │ │  • Company relationships ││
│  │  • Sessions          │ │  • Rate limits   │ │  • Similar entities      ││
│  └──────────────────────┘ └──────────────────┘ └──────────────────────────┘│
│                                                                              │
│                            EXTERNAL SERVICES                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │ │
│  │  │   Claude     │  │   OpenAI     │  │   Apollo     │  │  SerpAPI   │ │ │
│  │  │   (NLU)      │  │   (Backup)   │  │   (Enrich)   │  │  (Search)  │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Deployment Boundaries

```yaml
# Cloud Run Services
services:
  upr-api:
    type: Cloud Run
    scaling: 0-10 instances
    memory: 1Gi
    cpu: 1
    concurrency: 80

  upr-enrichment-worker:
    type: Cloud Run
    scaling: 0-5 instances
    memory: 512Mi
    cpu: 0.5

  upr-signals-worker:
    type: Cloud Run
    scaling: 0-3 instances
    memory: 512Mi
    cpu: 0.5

# Managed Services
databases:
  postgresql:
    type: Cloud SQL
    tier: db-f1-micro (dev) / db-n1-standard-1 (prod)

  redis:
    type: Cloud Memorystore
    tier: M1 (dev) / M2 (prod)

  neo4j:
    type: Self-managed on GCE
    tier: n1-standard-1
```

### 10.3 Interface Contracts

```typescript
// All API responses follow this structure
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    request_id: string;
    latency_ms: number;
    rate_limit_remaining: number;
  };
}

// All SSE events follow this structure
interface SSEEvent {
  id: string;
  type: string;
  data: unknown;
  timestamp: string;
}

// All tool inputs/outputs follow schema contracts
// Schemas defined in: server/siva-tools/schemas/
```

---

## 11. Future-Proof AI Patterns

### 11.1 LLM Abstraction Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LLM ABSTRACTION LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         LLM PROVIDER INTERFACE                          │ │
│  │                                                                          │ │
│  │  interface LLMProvider {                                                 │ │
│  │    chat(messages: Message[], options: LLMOptions): Promise<Response>;    │ │
│  │    stream(messages: Message[], options: LLMOptions): AsyncGenerator;     │ │
│  │    embed(text: string): Promise<number[]>;                               │ │
│  │  }                                                                       │ │
│  │                                                                          │ │
│  │  Current Implementations:                                                │ │
│  │  • ClaudeProvider (primary for NLU)                                      │ │
│  │  • OpenAIProvider (fallback, embeddings)                                 │ │
│  │  • [Future] GeminiProvider, LlamaProvider                                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  PROVIDER SELECTION                                                          │
│  ══════════════════                                                          │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  function getLLMProvider(task: string): LLMProvider {                    │ │
│  │    switch (task) {                                                       │ │
│  │      case 'nlu':                                                         │ │
│  │        return new ClaudeProvider('claude-3-5-sonnet');                   │ │
│  │      case 'generation':                                                  │ │
│  │        return new ClaudeProvider('claude-3-5-sonnet');                   │ │
│  │      case 'embedding':                                                   │ │
│  │        return new OpenAIProvider('text-embedding-3-small');              │ │
│  │      case 'fallback':                                                    │ │
│  │        return new OpenAIProvider('gpt-4o');                              │ │
│  │    }                                                                     │ │
│  │  }                                                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Tool Schema Evolution

```typescript
// Tools are versioned and backward-compatible
interface ToolSchema {
  name: string;
  version: string;           // semver: "1.0.0", "1.1.0", "2.0.0"
  primitive: string;         // Stable primitive name
  input: ZodSchema;          // Input validation
  output: ZodSchema;         // Output validation
  deprecated?: boolean;      // Soft deprecation
  successor?: string;        // New tool name if deprecated
}

// Migration strategy
const TOOL_VERSIONS = {
  'CompanyQualityTool': {
    '1.0.0': CompanyQualityToolV1,
    '1.1.0': CompanyQualityToolV1_1,  // Added uae_signals
    '2.0.0': CompanyQualityToolV2,    // Breaking change
  },
};

// Version negotiation
function getToolVersion(toolName: string, requestedVersion?: string) {
  const versions = TOOL_VERSIONS[toolName];
  if (requestedVersion && versions[requestedVersion]) {
    return versions[requestedVersion];
  }
  return versions[Object.keys(versions).pop()]; // Latest
}
```

### 11.3 Agent-to-Agent Communication

```typescript
// MCP (Model Context Protocol) for external AI clients
interface MCPRequest {
  jsonrpc: '2.0';
  id: string;
  method: 'tools/call';
  params: {
    name: string;       // Tool name
    arguments: object;  // Tool input
  };
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string;
  result: {
    content: Array<{
      type: 'text';
      text: string;
    }>;
  };
}

// Agent-to-agent calls (internal)
interface AgentCallRequest {
  source_agent: string;       // "outreach_agent"
  target_agent: string;       // "scoring_agent"
  action: string;             // "score_lead"
  payload: object;
  correlation_id: string;
  timeout_ms: number;
}
```

### 11.4 Pluggable Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PLUGGABLE ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ENRICHMENT PROVIDERS                                                        │
│  ════════════════════                                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  interface EnrichmentProvider {                                      │   │
│  │    name: string;                                                     │   │
│  │    enrich(companyName: string, domain?: string): Promise<Company>;   │   │
│  │    getContacts(company: Company): Promise<Contact[]>;                │   │
│  │    getSignals(company: Company): Promise<Signal[]>;                  │   │
│  │  }                                                                   │   │
│  │                                                                       │   │
│  │  Current: ApolloProvider                                             │   │
│  │  Future: ZoomInfoProvider, ClearbitProvider, LinkedInProvider        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  SEARCH PROVIDERS                                                            │
│  ════════════════                                                            │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  interface SearchProvider {                                          │   │
│  │    search(query: string, options: SearchOptions): Promise<Results>;  │   │
│  │    getNews(company: string): Promise<NewsItem[]>;                    │   │
│  │  }                                                                   │   │
│  │                                                                       │   │
│  │  Current: SerpAPIProvider                                            │   │
│  │  Future: GoogleSearchProvider, BingProvider                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  EMAIL PROVIDERS                                                             │
│  ═══════════════                                                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  interface EmailProvider {                                           │   │
│  │    send(email: Email): Promise<SendResult>;                          │   │
│  │    verify(address: string): Promise<VerifyResult>;                   │   │
│  │    trackOpens(messageId: string): Promise<TrackingData>;             │   │
│  │  }                                                                   │   │
│  │                                                                       │   │
│  │  Current: None (manual copy/paste)                                   │   │
│  │  Future: SendGridProvider, GmailProvider, OutlookProvider            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Data Flows

### 12.1 Lead Qualification Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LEAD QUALIFICATION DATA FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User: "Is TechCorp worth pursuing?"                                        │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 1. CHAT GATEWAY                                                       │  │
│  │    • Parse user message                                               │  │
│  │    • Extract context (current page, selected items)                   │  │
│  │    • Rate limit check                                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 2. NLU SERVICE (Claude)                                               │  │
│  │    • Intent: score_lead (confidence: 0.95)                            │  │
│  │    • Entity: company_name = "TechCorp"                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 3. TOOL ROUTER                                                        │  │
│  │    • Select workflow: full_lead_scoring                               │  │
│  │    • Tools: [Company, Contact, Timing, Products]                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 4. TOOL EXECUTION (Sequential)                                        │  │
│  │                                                                        │  │
│  │    CompanyQualityTool ─────────▶ quality_score: 78, confidence: 0.92  │  │
│  │         │                                                              │  │
│  │         ▼                                                              │  │
│  │    ContactTierTool ────────────▶ tier: STRATEGIC, priority: 1         │  │
│  │         │                                                              │  │
│  │         ▼                                                              │  │
│  │    TimingScoreTool ────────────▶ category: OPTIMAL, multiplier: 1.5   │  │
│  │         │                                                              │  │
│  │         ▼                                                              │  │
│  │    BankingProductMatchTool ───▶ products: [Premium Salary: 92% fit]   │  │
│  │                                                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 5. RESPONSE GENERATION (Claude)                                       │  │
│  │    • Synthesize tool outputs                                          │  │
│  │    • Format natural language response                                 │  │
│  │    • Include citations                                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 6. SSE STREAMING TO USER                                              │  │
│  │                                                                        │  │
│  │    ← session: { session_id: "abc123" }                                │  │
│  │    ← intent: { intent: "score_lead", confidence: 0.95 }               │  │
│  │    ← tools_start: { tools: ["CompanyQuality", "ContactTier", ...] }   │  │
│  │    ← tool_result: { tool: "CompanyQuality", output: {...} }           │  │
│  │    ← tool_result: { tool: "ContactTier", output: {...} }              │  │
│  │    ← tool_result: { tool: "TimingScore", output: {...} }              │  │
│  │    ← tool_result: { tool: "BankingProductMatch", output: {...} }      │  │
│  │    ← text: "I analyzed TechCorp using 4 SIVA tools..."                │  │
│  │    ← text: "📊 Company Quality: 78/100 (HIGH confidence)..."          │  │
│  │    ← text: "✅ VERDICT: High-quality lead..."                         │  │
│  │    ← done: { metadata: { latency_ms: 1234, tokens: 500 } }            │  │
│  │                                                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 7. PERSISTENCE                                                        │  │
│  │    • Log all decisions to agent_decisions                             │  │
│  │    • Save message to chat_messages                                    │  │
│  │    • Update session last_active                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Enrichment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENRICHMENT DATA FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User: Search "TechCorp" in Enrichment page                                 │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 1. COMPANY PREVIEW                                                    │  │
│  │    GET /api/companies/preview?q=TechCorp                              │  │
│  │    • SerpAPI search                                                   │  │
│  │    • LLM synthesis                                                    │  │
│  │    • Return: name, domain, industry, size, signals                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 2. LEAD GENERATION                                                    │  │
│  │    POST /api/enrich/generate                                          │  │
│  │    • Queue enrichment job (BullMQ)                                    │  │
│  │    • Return: job_id for polling                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼ (Async Worker)                                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 3. ENRICHMENT WORKER                                                  │  │
│  │    • Apollo API: Get company data                                     │  │
│  │    • Apollo API: Get contacts                                         │  │
│  │    • Email pattern inference                                          │  │
│  │    • SIVA scoring (ContactTierTool)                                   │  │
│  │    • Progress updates via Redis pub/sub                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼ (Polling)                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 4. STATUS POLLING                                                     │  │
│  │    GET /api/enrichment/status?job_id=X                                │  │
│  │    • Return: progress %, current step, found leads count              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 5. LEAD RETRIEVAL                                                     │  │
│  │    GET /api/enrichment/leads?job_id=X                                 │  │
│  │    • Return: Array of enriched leads with scores                      │  │
│  │    • UI displays with confidence indicators                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼ (User selects leads)                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 6. SAVE SELECTED                                                      │  │
│  │    POST /api/enrich/save                                              │  │
│  │    • Persist to hr_leads table                                        │  │
│  │    • Create company record if needed                                  │  │
│  │    • Return: saved lead IDs                                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.3 Signal Detection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SIGNAL DETECTION DATA FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Trigger: Scheduled RADAR run (daily 6am)                                   │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 1. RADAR ORCHESTRATOR                                                 │  │
│  │    • Query news sources (SerpAPI)                                     │  │
│  │    • Query job boards (RapidAPI)                                      │  │
│  │    • Query funding databases                                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 2. SIGNAL EXTRACTION (HiringSignalExtractionTool)                     │  │
│  │    • LLM extraction from news text                                    │  │
│  │    • Classify signal type: HIRING/EXPANSION/FUNDING                   │  │
│  │    • Extract company details                                          │  │
│  │    • UAE presence confidence                                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 3. DEDUPLICATION (SignalDeduplicationTool)                            │  │
│  │    • Fuzzy name matching                                              │  │
│  │    • Domain comparison                                                │  │
│  │    • Return: is_duplicate, existing_signal_id                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 4. SOURCE RELIABILITY (SourceReliabilityTool)                         │  │
│  │    • Score source: 0-100                                              │  │
│  │    • Tier: TIER_1/TIER_2/TIER_3/UNVERIFIED                            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 5. CATEGORIZATION                                                     │  │
│  │    • HOT: High confidence + recent + good source                      │  │
│  │    • REVIEW: Medium confidence or ambiguous                           │  │
│  │    • BACKGROUND: Low confidence or old signal                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 6. PERSISTENCE                                                        │  │
│  │    • Save to hiring_signals table                                     │  │
│  │    • Log to radar_results                                             │  │
│  │    • Trigger proactive alert if HOT                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼ (If HOT signal)                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 7. PROACTIVE ALERT                                                    │  │
│  │    • Send to user via SSE (if connected)                              │  │
│  │    • Queue notification for next login                                │  │
│  │    • Suggested action: "Enrich this company"                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Chat OS** | The master conversational interface for all UPR interactions |
| **SIVA** | Smart Intelligence for Value Assessment - the AI reasoning engine |
| **Tool** | A single-purpose AI capability (e.g., CompanyQualityTool) |
| **Workflow** | A composition of multiple tools executed together |
| **STRICT Tool** | Deterministic tool with no LLM, safe for full autonomy |
| **DELEGATED Tool** | Hybrid tool using LLM, requires human review |
| **Trust Level** | Confidence threshold determining autonomy level |
| **SSE** | Server-Sent Events - real-time streaming protocol |
| **MCP** | Model Context Protocol - standard for AI tool integration |
| **Q-Score** | Composite lead quality score (0-100) |
| **RADAR** | Signal discovery system for hiring/expansion/funding events |

---

## Appendix B: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-22 | Initial release - UPR 2030 architecture |

---

## Appendix C: Related Documents

| Document | Purpose |
|----------|---------|
| `/docs/reports/ARCHITECTURE_REALITY_MAP.md` | Backend module inventory |
| `/docs/reports/USER_JOURNEY_SURFACE_MAP.md` | UI page analysis |
| `/docs/reports/SIVA_CAPABILITY_INVENTORY.md` | Tool specifications |
| `/docs/reports/EVENT_STREAMING_AUDIT.md` | SSE endpoint catalog |
| `/docs/reports/NOTION_SPRINT_DEPENDENCY_GRAPH.md` | Sprint analysis |
| `/docs/reports/AI_FIRST_UX_OPPORTUNITY_REPORT.md` | UX transformation plan |
| `/docs/reports/REWRITTEN_SPRINTS_54_TO_63.md` | Sprint roadmap |

---

*This document is the canonical reference for UPR OS architecture. All implementation decisions should align with the patterns and boundaries defined here.*
