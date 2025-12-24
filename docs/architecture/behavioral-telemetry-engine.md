# Behavioral Telemetry Engine (BTE) — v1 (FINAL)

## Purpose

The Behavioral Telemetry Engine (BTE) is a **read-only, derivative intelligence engine**
that interprets how users and enterprises behave over time.

BTE exists to answer:
> "How do humans actually execute (or fail to execute) sales decisions?"

It supports:
- Super Admin intelligence
- Enterprise Admin coaching
- NBA reasoning
- SIVA portability across platforms

BTE has **no authority** and **no execution capability**.

---

## Canonical Event Schema (REQUIRED)

All inputs consumed by BTE must conform to this schema:

```json
{
  "event_id": "uuid",
  "event_type": "string",
  "entity_type": "user | workspace | enterprise",
  "entity_id": "uuid",
  "workspace_id": "uuid",
  "sub_vertical_id": "uuid",
  "actor_user_id": "uuid",
  "timestamp": "ISO-8601",
  "metadata": { "key": "value" }
}
```

This schema is:
- Immutable
- Replayable
- Deterministic (S259 compliant)

---

## Input Sources

BTE may read ONLY from:

### 1. Business Events (Immutable)
- discovery_completed
- company_shortlisted
- outreach_sent
- response_received
- conversion_won / conversion_lost

### 2. User Actions
- discovery_triggered
- outreach_drafted
- followup_scheduled
- nba_accepted / nba_ignored

### 3. Workspace State (Read-only)
- current_sales_stage
- pending_actions
- last_recommendation_id
- last_action_taken_at

### 4. Time
- timestamps only

🚫 **Explicitly forbidden:**
- Conversation/chat history
- UI clickstream
- Manual tags
- External analytics
- Free-form notes

---

## Runtime Gate Exemption (S260)

BTE reads are explicitly exempt from the S260 runtime gate.

**Rationale:**
- BTE does not invoke SIVA
- BTE does not execute intelligence
- BTE does not mutate state

No envelope is required for BTE queries.

---

## Derived Outputs (Versioned Signals)

### Temporal Signals
- Decision latency
- Idle decay
- Momentum (trend direction)
- Execution consistency

### Execution Signals
- NBA adoption rate
- Follow-through rate
- Drop-off point
- Hesitation index

### Counterfactual Signals
- Missed opportunity count
- Delayed opportunity estimate
- Execution gap (expected vs actual)

All outputs are:
- Versioned
- Replayable
- Deterministic
- Non-mutating

---

## Retention Policy

| Data Type | Retention |
|-----------|-----------|
| Business Events | Permanent |
| Workspace State | Permanent |
| Derived BTE Signals | 18 months |
| Aggregated Metrics | Permanent |

Derived signals may be recomputed from raw events if purged.

---

## Threshold Configuration (NO SELF-LEARNING)

BTE does NOT self-learn.

All thresholds are:
- Config-driven
- Versioned
- Editable ONLY by Super Admin
- Audited on change

No autonomous tuning is permitted.

---

## Hard Boundaries (Non-Negotiable)

BTE MUST NOT:
- Trigger discovery or outreach
- Modify NBA decisions
- Change personas or policies
- Write back to workspace state
- Learn autonomously in production

BTE is observational infrastructure, not control logic.
