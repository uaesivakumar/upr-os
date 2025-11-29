# PremiumRadar Sprint Execution

Start executing sprints with architecture enforcement and Notion integration.

**Usage:**
- `/start` - Start current sprint (fetches from Notion)
- `/start S48` - Start specific sprint
- `/start S48-S52` - Start sprint range (stream)

---

## CRITICAL: ARCHITECTURE BOUNDARY

```
┌─────────────────────────────────────────────────────────────────┐
│              TWO ENGINES - NEVER MIX THEM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎨 PremiumRadar SaaS          │  🧠 UPR OS                     │
│  (Multi-tenant Experience)     │  (Intelligence Engine)         │
│                                │                                 │
│  • Auth & Identity             │  • LLM Routing                  │
│  • Billing & Plans             │  • API Providers                │
│  • Tenant Admin UI             │  • Vertical Packs               │
│  • Workspace UI                │  • Journey Engine               │
│  • Journey Builder UI          │  • Autonomous Engine            │
│  • Widgets & Dashboards        │  • Evidence System              │
│  • Mobile/PWA                  │  • Object Intelligence          │
│  • Marketplace                 │  • Predictive Models            │
│                                │  • Real-time Signals            │
│  Knows tenants: YES            │  Knows tenants: NO              │
│  Path: packages/saas/          │  Path: packages/upr-os/         │
│                                │                                 │
└─────────────────────────────────────────────────────────────────┘
```

### SPRINT → SERVICE ALLOCATION (MEMORIZE THIS)

| Sprint | Service | Sprint | Service |
|--------|---------|--------|---------|
| S48 | **SaaS** | S63 | **SaaS** |
| S49 | **SaaS** | S64 | OS |
| S50 | OS | S65 | OS |
| S51 | OS | S66 | OS |
| S52 | OS | S67 | OS |
| S53 | OS | S68 | OS |
| S54 | **SaaS** | S69 | OS |
| S55 | OS | S70 | OS |
| S56 | OS | S71 | OS |
| S57 | **SaaS** | S72 | OS |
| S58 | OS | S73 | OS |
| S59 | OS | S74 | OS |
| S60 | OS | S75 | **Shared** |
| S61 | OS | S76 | **SaaS** |
| S62 | **SaaS** | S77 | **SaaS** |

---

## REPOSITORY PATHS (AUTO-SWITCH)

```
SAAS_REPO=~/Projects/UPR/premiumradar-saas
OS_REPO=~/Projects/UPR/upr-os
```

**TC MUST automatically switch to the correct repository based on sprint service allocation. DO NOT ASK - just switch.**

---

## EXECUTE THESE STEPS IN ORDER:

### Step 0: AUTO-SWITCH REPOSITORY (MANDATORY FIRST)
```bash
# Determine service from sprint number
node scripts/sprint-service.js S50  # Returns: OS or SaaS

# If OS sprint and currently in SaaS repo:
cd ~/Projects/UPR/upr-os && echo "Switched to UPR OS repository"

# If SaaS sprint and currently in OS repo:
cd ~/Projects/UPR/premiumradar-saas && echo "Switched to PremiumRadar SaaS repository"
```

**NEVER ASK which repo to use - automatically switch based on sprint allocation!**

### Step 1: Read Architecture (MANDATORY)
```bash
cat ARCHITECTURE.md
cat .claude/SPRINT_TRACKER.md
```
**TC MUST read these files BEFORE any action.**

### Step 2: Check Sprint Service Allocation (MANDATORY)
```bash
node scripts/sprint-service.js S48
```

This outputs:
- Which service (SaaS / OS / Shared)
- Which directory to work in
- Branch naming convention
- Commit convention
- Focus areas

**Auto-switch to correct repo if in wrong one!**

### Step 3: Read Master Context
```bash
cat docs/UPR_SAAS_CONTEXT.md
```

### Step 4: Parse Sprint Input
Extract sprint number(s) from command:
- Single: `/start S48` → Sprint 48
- Range: `/start S48-S52` → Sprints 48, 49, 50, 51, 52
- Current: `/start` → Fetch latest incomplete sprint

### Step 5: Fetch Sprint Details from Notion
```bash
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
```

```javascript
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';
const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

// Fetch sprint(s) and features
```

### Step 6: Display Sprint Plan WITH SERVICE INFO

```
════════════════════════════════════════════════════════════════════
SPRINT EXECUTION PLAN
════════════════════════════════════════════════════════════════════

Sprint: S48 - Identity Intelligence & Vertical Lockdown
Service: 🎨 PremiumRadar SaaS
Path: packages/saas/src/lib/auth/identity
Branch: feat/s48-saas-identity-intelligence
Commit: feat(saas/s48): ...

────────────────────────────────────────────────────────────────────
⚠️  ARCHITECTURE RULES FOR THIS SPRINT:
────────────────────────────────────────────────────────────────────

✅ DO:
  • Work in packages/saas/ directory
  • Handle multi-tenant concerns
  • Call UPR OS via uprClient API
  • Know about tenant IDs, user IDs

❌ DON'T:
  • Put intelligence logic here
  • Implement LLM calls directly
  • Add scoring/ranking logic
  • Process signals directly

────────────────────────────────────────────────────────────────────

Features (10):
  [ ] Email Domain → Company Extraction
  [ ] Enrichment-based Industry Detection
  [ ] Vertical Suggestion at Onboarding
  [ ] Vertical Lock After Confirmation
  [ ] Super-Admin Vertical Override
  [ ] Consulting-Mode Vertical
  [ ] MFA for Vertical Overrides
  [ ] Session Validation (Vertical-bound)
  [ ] Corporate Email MX Verification
  [ ] Industry Confidence Score

════════════════════════════════════════════════════════════════════
```

### Step 7: Create Branch with Service Prefix
```bash
# For SaaS sprints:
git checkout -b feat/s48-saas-identity-intelligence

# For OS sprints:
git checkout -b feat/s50-os-api-provider-management

# For Shared sprints:
git checkout -b feat/s75-shared-integrations-hub
```

### Step 8: Implementation Rules by Service

#### IF SERVICE = SaaS:
```typescript
// ✅ CORRECT: SaaS handles auth, billing, UI
// packages/saas/src/lib/auth/identity/vertical-lock.ts

export async function lockUserToVertical(userId: string, vertical: string) {
  // SaaS handles the user record
  await supabase.from('users').update({ vertical, vertical_locked: true })
    .eq('id', userId);
}

// ✅ CORRECT: SaaS calls OS for intelligence
import { uprClient } from '@/lib/upr-client';

export async function detectIndustry(email: string) {
  // SaaS extracts domain, calls OS for enrichment
  const domain = email.split('@')[1];
  const industry = await uprClient.enrichment.detectIndustry(domain);
  return industry;
}
```

#### IF SERVICE = OS:
```typescript
// ✅ CORRECT: OS handles intelligence, NO tenant awareness
// packages/upr-os/src/intelligence/providers/fallback.ts

export async function enrichWithFallback(
  domain: string,
  context: VerticalContext  // Passed from SaaS, NOT stored
) {
  // Try providers in priority order
  for (const provider of getProviders(context)) {
    const result = await provider.enrich(domain);
    if (result) return result;
  }
  return null;
}

// ❌ WRONG: OS should NEVER do this
export async function enrichForTenant(tenantId: string) {
  // NEVER! OS doesn't know about tenants
}
```

#### IF SERVICE = Shared:
```typescript
// UI component in SaaS
// packages/saas/src/components/integrations/SalesforceConnect.tsx

// Backend logic in OS
// packages/upr-os/src/integrations/salesforce/sync.ts
```

### Step 9: Commit Convention
```bash
# SaaS commits
git commit -m "feat(saas/s48): Add email domain verification"

# OS commits
git commit -m "feat(os/s50): Implement provider fallback engine"

# Shared commits
git commit -m "feat(shared/s75): Add Salesforce sync"
```

### Step 10: Before Completing Feature
Ask yourself:
1. **Is this code in the right service?**
2. **Does OS code reference tenant IDs?** (Should be NO)
3. **Does SaaS code contain intelligence logic?** (Should be NO)
4. **Is SaaS calling OS via API client?** (Should be YES)

### Step 11: Sprint Completion
1. Run `npm run build` to verify no errors
2. Update sprint status to "Done" in Notion
3. Create git tag: `sprint-s48-complete`
4. Update `.claude/SPRINT_TRACKER.md` with completion

---

## ARCHITECTURE VIOLATIONS - STOP IMMEDIATELY IF YOU SEE:

### Red Flags in SaaS Code:
```typescript
// ❌ STOP! Intelligence logic in SaaS
import OpenAI from 'openai';
const response = await openai.chat.completions.create(...);

// ❌ STOP! Scoring logic in SaaS
const score = calculateQTLEScore(company);

// ❌ STOP! Provider calls in SaaS
const data = await apollo.enrich(domain);
```

### Red Flags in OS Code:
```typescript
// ❌ STOP! Tenant awareness in OS
const tenant = await getTenant(tenantId);

// ❌ STOP! User records in OS
const user = await supabase.from('users').select();

// ❌ STOP! Billing logic in OS
if (user.plan === 'pro') { ... }
```

---

## Quick Reference

### Sprint Lookup
```bash
node scripts/sprint-service.js S48
```

### Notion Database IDs
- Sprints: `5c32e26d-641a-4711-a9fb-619703943fb9`
- Features: `26ae5afe-4b5f-4d97-b402-5c459f188944`

### Key Files
- `ARCHITECTURE.md` - Full architecture documentation
- `.claude/SPRINT_TRACKER.md` - Sprint-to-service allocation
- `scripts/sprint-service.js` - Sprint lookup tool

### Directory Structure (Target)
```
premiumradar/
├── packages/
│   ├── upr-os/          # Intelligence Engine (OS sprints)
│   │   ├── src/
│   │   │   ├── intelligence/
│   │   │   ├── journey-engine/
│   │   │   ├── autonomous/
│   │   │   └── api/
│   │   └── package.json
│   │
│   └── saas/            # Multi-tenant SaaS (SaaS sprints)
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── lib/
│       │   │   ├── auth/
│       │   │   ├── billing/
│       │   │   └── upr-client/   # API client to call OS
│       │   └── stores/
│       └── package.json
│
└── turbo.json
```

---

## GOLDEN RULES

1. **Check service FIRST** - Run `node scripts/sprint-service.js SXX`
2. **Never mix engines** - Intelligence in OS, Multi-tenant in SaaS
3. **OS is tenant-agnostic** - Receives context via API params
4. **SaaS calls OS via API** - Use `uprClient`
5. **Commit with service prefix** - `feat(os/sXX):` or `feat(saas/sXX):`
6. **Update tracker** - Keep `.claude/SPRINT_TRACKER.md` current

---

## INSTRUCTION TEMPLATE FOR FOUNDER

To start a sprint, tell TC:

```
/start S48

Additional context:
- Focus on [specific aspect]
- Priority: [high/medium/low]
- Dependencies: [any blockers]
```

Or for a range:

```
/start S48-S52

This is Phase 0-1: Security + Config Foundation
Execute in order, respect architecture boundaries.
```
