# PremiumRadar-SAAS Context Loader

Load project context at the start of a new session. Use this command when starting fresh.

## EXECUTE THESE STEPS IN ORDER:

### Step 1: Load Master Context
Read the master context file immediately:
```bash
# This file contains ALL critical information
cat docs/UPR_SAAS_CONTEXT.md
```

**MANDATORY:** You MUST read this file completely before any other action.

### Step 2: Identify Project Structure
```
~/Projects/UPR/
├── upr-os/              # Core Intelligence Layer (backend)
├── upr-os-worker/       # Async Processing Worker
├── premiumradar-saas/   # SaaS Frontend (THIS REPO)
└── upr-infra/           # Infrastructure configs
```

### Step 3: Notion Database Reference
Load from `.notion-db-ids.json`:
```bash
cat .notion-db-ids.json
```

| Database | ID |
|----------|-----|
| Sprints | `5c32e26d-641a-4711-a9fb-619703943fb9` |
| Features | `26ae5afe-4b5f-4d97-b402-5c459f188944` |
| Knowledge | `f1552250-cafc-4f5f-90b0-edc8419e578b` |

### Step 4: Environment URLs
| Environment | URL | Service |
|-------------|-----|---------|
| Staging | https://upr.sivakumar.ai | premiumradar-saas-staging |
| Production | https://premiumradar.com | premiumradar-saas-production |
| OS Service | (internal) | upr-os-service |
| Worker | (internal) | upr-os-worker |

### Step 5: Check Git Status
```bash
git status
git log --oneline -5
```

### Step 6: Quick Health Check
```bash
curl -s https://upr.sivakumar.ai/api/health | jq . 2>/dev/null || echo "Health check skipped"
```

### Step 7: Report to User
After loading context, provide:
1. **Repo status** - Current branch, uncommitted changes
2. **Last 5 commits** - Brief summary
3. **Environment health** - Staging URL status
4. **Ready message** - "Context loaded. What would you like to work on?"

## Key Files to Remember

| File | Purpose |
|------|---------|
| `docs/UPR_SAAS_CONTEXT.md` | Master context (MUST READ) |
| `lib/os-client.ts` | OS API client (ONLY way to call OS) |
| `.notion-db-ids.json` | Notion database IDs |
| `scripts/notion/*.js` | Notion sync scripts |
| `.github/workflows/deploy.yml` | CI/CD pipeline |

## Golden Rules

1. **ALWAYS** load context before any action
2. **NEVER** auto-create sprints/features without explicit request
3. **NEVER** deploy to production without approval
4. **ALWAYS** use `lib/os-client.ts` for OS calls
5. **ALWAYS** run `npm run build` after major changes

## Usage

```
/context
```

This command is for loading context at the start of a NEW session.
For resuming an interrupted session, use `/resume` instead.
