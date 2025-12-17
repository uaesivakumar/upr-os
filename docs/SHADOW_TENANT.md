# Production Shadow Tenant Architecture

**Status**: APPROVED
**Decision Date**: December 17, 2025

---

## Overview

PremiumRadar does NOT use "demo mode" or "sandbox mode". Instead, we use a **Production Shadow Tenant** approach where internal users experience the product exactly as production customers would.

---

## Core Principle

> "No `if demo` logic anywhere. I must be able to experience the product exactly as production, or the setup is invalid."

---

## What Shadow Tenant Means

| Aspect | Traditional Demo | Production Shadow Tenant |
|--------|------------------|--------------------------|
| Frontend | Simplified/mocked | **Same as production** |
| AI Flows | Stubbed responses | **Same SIVA behavior** |
| Intelligence | Mock data | **Real intelligence** |
| Personas | Special "demo" persona | **Real personas (1-7)** |
| Data | Fake/synthetic | **Real or scrubbed data** |
| Escalations | Disabled | **Fully functional** |
| Logging | Minimal | **Full audit trail** |

---

## Constraints Applied at Tenant Level (Not Persona Level)

Shadow Tenant constraints are enforced through tenant configuration, NOT through persona-level `if demo` checks:

### 1. Data Boundary
- Shadow tenant uses scrubbed/anonymized production data OR real synthetic companies
- NOT hardcoded `synthetic_only: true` in persona config
- Data isolation enforced via `tenant_id` in all queries

### 2. Discovery Blast Radius
- Shadow tenant may have limited discovery pool
- NOT a persona-level restriction
- Configured via tenant settings in database

### 3. External API Spend Caps
- Shadow tenant has lower API spend limits
- Enforced via tenant-level cost tracking
- Same cost_budget structure, different tenant limits

### 4. Tenant Labeling
- Shadow tenant marked as `is_internal: true` in tenant table
- Used for billing exclusion and analytics filtering
- NOT visible to SIVA or persona logic

---

## Personas in Shadow Tenant

Shadow Tenant uses the **same 7 canonical personas** as production:

| ID | Persona | Shadow Tenant Behavior |
|----|---------|------------------------|
| 1 | Customer-Facing | Same restrictions |
| 2 | Sales-Rep | Full capabilities |
| 3 | Supervisor | Same escalation flows |
| 4 | Admin | Same admin access |
| 5 | Compliance | Same audit access |
| 6 | Integration | Same API access |
| 7 | Internal | **Same as Sales-Rep** |

**Note**: Persona 7 (Internal) is functionally identical to Persona 2 (Sales-Rep). There is no special "demo" behavior.

---

## What Was Removed

The following "demo mode" logic has been explicitly removed from the codebase:

### Before (WRONG)
```javascript
// os/envelope/types.js
'7': {
  synthetic_only: true,  // REMOVED
  forbidden_outputs: ['real_data'],  // REMOVED
}

// os/escalation/middleware.js
if (persona_id === '7') {
  if (!input.use_synthetic_data) {
    return { allowed: false };  // REMOVED
  }
}

// os/envelope/factory.js
if (persona_id === '7') {
  return ['synthetic'];  // REMOVED
}
```

### After (CORRECT)
```javascript
// os/envelope/types.js
'7': {
  // Same as SALES_REP, tenant-level constraints apply
  allowed_intents: [...same as persona 2...],
  forbidden_outputs: ['rates_approvals_ungated'],  // Same as persona 2
}

// os/escalation/middleware.js
// No special check for persona 7

// os/envelope/factory.js
// Persona 7 gets same sources as all other personas
```

---

## Implementation Checklist

### Tenant Configuration (Database)

```sql
-- Shadow tenant in tenants table
INSERT INTO tenants (
  id,
  name,
  is_internal,
  discovery_limit,
  api_spend_cap_usd,
  data_source
) VALUES (
  'shadow-tenant-001',
  'PremiumRadar Internal',
  true,
  100,  -- Limited discovery pool
  50.00,  -- Lower spend cap
  'production_scrubbed'  -- Uses scrubbed data
);
```

### What Tenant-Level Constraints Look Like

```javascript
// Correct: Tenant-level constraint
const tenant = await getTenant(tenant_id);
if (tenant.api_spend_cap_usd && currentSpend >= tenant.api_spend_cap_usd) {
  throw new Error('Tenant API spend cap exceeded');
}

// Wrong: Persona-level demo check
if (persona_id === '7') {
  throw new Error('Demo mode cannot do this');
}
```

---

## Testing Shadow Tenant

To test as Shadow Tenant:

1. Create user with `tenant_id: 'shadow-tenant-001'`
2. Assign any standard persona (1-7)
3. Use product normally - all flows work identically
4. Tenant constraints automatically applied

---

## FAQ

### Why not just use persona 7 for demo?
Because "demo" implies reduced/mocked functionality. Shadow Tenant means full functionality with tenant-level constraints only.

### How do I test without hitting real APIs?
Use tenant-level API mocking, not persona-level. Configure tenant's external_apis as mock endpoints.

### What about synthetic data for demos?
Shadow Tenant can use scrubbed production data or real synthetic companies. The data boundary is enforced at tenant level, not persona level.

### Can I still use persona 7?
Yes. Persona 7 (Internal) works identically to Persona 2 (Sales-Rep). Use it for internal employees who need full capabilities.

---

## References

- PRD v1.2 §3.2: Canonical Personas
- PRD v1.2 §2: Sealed Context Envelope
- STABILIZATION_TRACKER.md: Exit Criteria

---

*Last Updated: December 17, 2025*
