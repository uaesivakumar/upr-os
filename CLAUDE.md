# UPR OS - Intelligence Engine

## CRITICAL: THIS IS THE OS REPOSITORY

**UPR OS is the Intelligence Engine. It does NOT know about tenants, users, or billing.**

```
┌─────────────────────────────────────────────────────────────────┐
│  🧠 UPR OS (THIS REPO)                                          │
│  Intelligence Engine - NO tenant awareness                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✅ BELONGS HERE:               ❌ DOES NOT BELONG HERE:        │
│  • LLM Routing                  • Tenant management              │
│  • API Providers                • User authentication            │
│  • Vertical Packs               • Billing & Plans                │
│  • Journey Engine               • UI Components                  │
│  • Scoring Algorithms           • Workspace management           │
│  • Signal Processing            • Admin panels                   │
│  • Enrichment Logic             • Mobile/PWA                     │
│  • Autonomous Agents            • Marketplace                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Sprint Allocation

OS Sprints (implement here):
- S50-S53: Super-Admin Config Foundation
- S55-S56: Config-Driven Kernel
- S58-S61: Journey Engine
- S64-S74: Object Intelligence, Autonomous, ML

SaaS Sprints (implement in premiumradar-saas):
- S48-S49: Identity & Security
- S54, S57: Admin Panel, Billing
- S62-S63: Journey Builder UI
- S76-S77: Mobile, Marketplace

## Notion Integration

Uses shared workspace with premiumradar-saas:
```bash
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
```

Database IDs (same as SaaS):
- Sprints: 5c32e26d-641a-4711-a9fb-619703943fb9
- Features: 26ae5afe-4b5f-4d97-b402-5c459f188944

## Golden Rules

1. **NO tenantId references** - OS receives context via API params
2. **NO user/billing logic** - That's SaaS responsibility
3. **API-first design** - All intelligence exposed via clean APIs
4. **Commit prefix** - Use `feat(os/sXX):` format
