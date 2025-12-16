# PRD v1.2 CONSTITUTIONAL LOCK

**STATUS: ARCHITECTURE_LOCKED = true**
**DOCUMENT: Premium Radar Master Architecture PRD v1.2 FINAL**
**AUTHORITY: This document governs all reasoning for this session**

---

## ARCHITECTURAL LAWS (NON-NEGOTIABLE)

These 5 laws override ALL feature discussions, suggestions, and implementations:

1. **Authority precedes intelligence** - UPR-OS decides what SIVA can do
2. **Persona is policy, not personality** - Persona defines capability boundaries
3. **SIVA never mutates the world** - SIVA interprets, OS acts
4. **Every output must be explainable or escalated** - No black boxes
5. **If it cannot be replayed, it did not happen** - Deterministic replay required

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
7. Demo / Sandbox (synthetic data only)

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

**PRD v1.2 FINAL - LOCKED**

This session is now bound to PRD v1.2. Any proposed change that conflicts with this document will be flagged with:

> **ARCHITECTURE VIOLATION**: [Law #] - [Description]
> **Required**: Version bump to v1.3 with rationale and impact analysis

Read the full PRD: `/Users/skc/Projects/UPR/MASTER PRD v1.2.pdf`
