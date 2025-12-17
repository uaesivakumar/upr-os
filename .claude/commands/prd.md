# PRD v1.2 CONSTITUTIONAL LOCK

**STATUS: ARCHITECTURE_LOCKED = true**
**DOCUMENT: Premium Radar Master Architecture PRD v1.2 FINAL**
**AUTHORITY: This document governs all reasoning for this session**

---

## MANDATORY INVOCATION RULE

**No architecture discussion, design proposal, or implementation begins without /prd.**

If this command was not run at session start, run it now before proceeding.

---

## ARCHITECTURAL LAWS (NON-NEGOTIABLE)

These 5 laws override ALL feature discussions, suggestions, and implementations:

1. **Authority precedes intelligence** - UPR-OS decides what SIVA can do
2. **Persona is policy, not personality** - Persona defines capability boundaries
3. **SIVA never mutates the world** - SIVA interprets, OS acts
4. **Every output must be explainable or escalated** - No black boxes
5. **If it cannot be replayed, it did not happen** - Deterministic replay required

---

## VIOLATION COUNTER

When a proposal, suggestion, or implementation violates an architectural law:

```
ARCHITECTURE_VIOLATION_COUNT += 1
```

**Log format:**
```
[VIOLATION #N] Law X: <description>
  Proposed: <what was suggested>
  Conflict: <why it violates>
  Signal: <what this might indicate>
```

**Violations are SIGNAL, not failure.**

Repeated violations of the same law indicate:
- Missing abstraction in the architecture
- Missing section in PRD
- Candidate for v1.3 amendment

Track them. They reveal where the architecture is under pressure.

---

## ENFORCEMENT MODE ACTIVE

For this session, Claude Code will:

### ENFORCE
- Authority-first reasoning (OS before SIVA)
- Persona = policy (not UX, not personality)
- SIVA never discovers, enriches, or writes to DB
- OS/SIVA boundary: OS owns mechanical, expensive, async operations
- Sealed Context Envelope requirement for all SIVA calls
- Evidence provenance (DAG + TTL + confidence)

### REJECT OR FLAG
- Any suggestion that violates the 5 Architectural Laws
- Any shortcut that bypasses OS authority
- Any prompt-based persona logic
- SIVA-triggered discovery or enrichment
- Ungated WhatsApp responses
- Non-replayable intelligence outputs

### REQUIRE FOR ANY DEVIATION
- Explicit version bump proposal (v1.2 → v1.3)
- Written rationale explaining why the law must change
- Impact analysis on all affected systems

---

## WHAT /prd DOES NOT DO

| Forbidden | Why |
|-----------|-----|
| Auto-summarize PRD | Weakens authority - this is law, not documentation |
| Allow "temporary bypass" | No exceptions. If it hurts, that's a design smell |
| Become optional for speed | Deadlines don't override architecture |
| Weaken under pressure | Pain from /prd = signal to fix design, not tooling |

**If something hurts because of /prd, that's a design smell, not a tooling problem.**

---

## SYSTEM BOUNDARIES (LOCKED)

| Component | Role | Owns |
|-----------|------|------|
| **UPR-OS** | Authority | Discovery, Enrichment, Storage, Envelope, API keys, Cost control |
| **SIVA** | Interpreter | Reasoning, Scoring, Classification, Outreach drafts |
| **Persona** | Policy | Allowed intents, forbidden outputs, cost ceilings, escalation rules |
| **Evidence** | Truth | Source provenance, freshness TTL, confidence scores |

---

## EXPLICITLY FORBIDDEN

The following are architectural violations and must not be implemented:

1. Prompt-based persona logic
2. SIVA-triggered discovery
3. SIVA holding API keys
4. SIVA writing to databases
5. Ungated WhatsApp responses
6. Non-replayable intelligence outputs
7. Evidence without provenance
8. Persona resolved by SIVA (must be OS)

---

## CANONICAL PERSONAS (v1.2)

1. Customer-Facing (WhatsApp / Email) - Most restricted
2. Sales-Rep (SaaS UI) - Standard intelligence
3. Supervisor (Approves escalations)
4. Admin
5. Compliance / Audit
6. Integration / API
7. Internal (same as Sales-Rep, tenant-level constraints)

Additional personas require OS config + version bump.

---

## FINAL STATEMENT (LAW)

```
UPR-OS is Authority
Persona is Policy
Evidence is Truth
SIVA is Interpretation
Anything else is noise
```

---

## SESSION STATE

```
PRD_VERSION: 1.2 FINAL
ARCHITECTURE_LOCKED: true
VIOLATION_COUNT: 0
BYPASS_ALLOWED: false
```

**PRD v1.2 FINAL - LOCKED**

Any proposed change that conflicts with this document will:
1. Increment VIOLATION_COUNT
2. Log the violation with law reference
3. Flag with architecture violation notice
4. Require version bump to proceed

Read the full PRD: `/Users/skc/Projects/UPR/MASTER PRD v1.2.pdf`
