# Super Admin — User Management & AI Command Center (FINAL)

## Super Admin Identity Model

- Super Admin count: **N allowed**
- All Super Admins are equal in authority
- Every action is fully audited
- No silent changes permitted

Super Admins are authenticated via:
- Platform identity provider
- Hardware-backed MFA (required)

---

## Authority Scope

Super Admin is the ONLY role that can:
- Create / delete Enterprises
- Create Enterprise Admins
- Create Demo Enterprises
- Configure BTE thresholds
- Create / edit / deactivate Personas
- View cross-enterprise intelligence

---

## Enterprise Lifecycle

### Enterprise Creation
Fields:
- Name
- Type: REAL | DEMO
- Region
- Allowed sub-verticals
- Demo policy (if DEMO)

### Enterprise Termination

| Type | Behavior |
|------|----------|
| Soft Delete | Enterprise disabled, data retained |
| Hard Delete | Data purged after retention period |

Default:
- Soft delete immediately
- Hard purge after 90 days (configurable)

All deletions are audited.

---

## User Creation (All Types)

User schema:
- enterprise_id (immutable)
- workspace_id (immutable)
- sub_vertical_id (immutable)
- role: ENTERPRISE_ADMIN | USER
- mode: REAL | DEMO
- status: ACTIVE | SUSPENDED | EXPIRED

Hard rules:
- One user → one enterprise
- One user → one workspace
- One user → one sub-vertical

---

## Demo Enterprise & Demo User Policy

### Demo Expiry (Configurable)

Default demo expiry triggers:
- No meaningful action for **7 days**
- NBA ignored **3 consecutive times**
- Discovery without outreach beyond **5 days**
- Suspicious extraction patterns detected

Super Admin may override thresholds per demo.

---

## Cross-Enterprise Intelligence (Privacy-Safe)

Super Admin sees:
- Aggregated enterprise health
- Pattern-level insights
- No raw user-level PII by default

Individual user drill-down requires explicit intent and is logged.

---

## Persona Authority (Explicit)

Super Admin ONLY can:
- Create personas
- Edit persona logic
- Bind personas to sub-verticals
- Deprecate personas

Enterprise Admins may VIEW personas only.
Users never see persona internals.

---

## Super Admin AI Command Center

Super Admin sees:
- Enterprise health classification
- Demo misuse detection
- Churn / upsell indicators
- Product friction signals

Super Admin never sees:
- Raw logs
- Chat transcripts
- CRM tables
- Activity noise

System surfaces **decisions, not data**.
