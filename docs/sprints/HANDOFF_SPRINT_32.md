# Sprint 32 Handoff - Start Here

## Project Overview

**UPR (Universal Persona Recognition)** - B2B lead intelligence system for ENBD bank
- **Tech Stack**: Node.js/Express, PostgreSQL (Cloud SQL), Google Cloud Run
- **Purpose**: Automated lead scoring, company enrichment, contact discovery, outreach generation
- **Current Phase**: Phase 6 complete, moving to Phase 7/8

## Completed Sprints

### Sprint 30: Phase 5 - Agent Hub REST API ✅
**Status**: Done | **Completion**: 2025-01-18 | **Tests**: 18/18 passing

**Deliverables**:
- Express REST API migration from WebSocket
- JWT authentication with AGENT_HUB_API_KEY
- 18 endpoints with input validation & standardized responses
- 9 features complete in Notion

**Key Files**:
- `server/routes/agentHub.js` - All REST endpoints
- `server/middleware/agentHubAuth.js` - Authentication
- `scripts/testing/smokeTestSprint30.js` - 18 tests

### Sprint 31: Phase 6 - Voice Template System ✅
**Status**: Done | **Completion**: 2025-01-18 | **Tests**: 15/15 passing | **Quality**: 93/100

**Deliverables**:
- 23 voice templates (Introduction, Value Prop, Pain Point, CTA, Follow-up)
- Variable substitution: `{var}`, `{?optional}`, `{var|default}`
- Tone adjustment (formal/professional/casual)
- Context-aware generation
- Multi-format: Email, LinkedIn, Follow-up
- 3 DB tables: voice_templates, generated_messages, template_performance
- 11 features complete in Notion

**Key Files**:
- `server/services/outreachGeneratorService.js` - Core generation engine (380 lines)
- `server/services/voiceTemplateService.js` - Template CRUD
- `server/routes/outreach.js` - API endpoints
- `db/migrations/2025_01_18_voice_templates.sql` - Database schema
- `db/seeds/voice_templates_seed.js` - 23 templates
- `scripts/testing/smokeTestSprint31.js` - 15 tests

**Critical Fixes**:
- Variable enrichment (lines 306-315) - Merges context into variables
- Division by zero in quality scoring
- Placeholder validation - No unsubstituted variables

## Next Sprint: Sprint 32

### Goal
**Phase 7: Quantitative Intelligence Layer** OR **Phase 8: Opportunity Lifecycle Engine**

Check Notion Module Features to see which Phase is assigned to Sprint 32.

### Typical Sprint Workflow

1. **Check Notion** for Sprint 32 features:
   - Open Module Features database
   - Filter by Sprint = 32
   - Review all features to implement

2. **Create Design Doc** (if needed):
   - `docs/SPRINT_32_[FEATURE]_DESIGN.md`
   - Architecture, data models, API design

3. **Implement Features**:
   - Follow existing patterns in `server/services/` and `server/routes/`
   - Add database migrations to `db/migrations/`
   - Seed data in `db/seeds/`

4. **Write Tests**:
   - Create `scripts/testing/smokeTestSprint32.js`
   - Aim for 100% test pass rate
   - Include edge cases and error handling

5. **Test Locally**:
   ```bash
   node scripts/testing/smokeTestSprint32.js
   ```

6. **Deploy to Cloud Run** (see below)

7. **Update Notion** (see below)

## Development Setup

### Environment Variables
```bash
# Database (Cloud SQL)
DATABASE_URL="postgresql://upr_app:SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=@34.121.0.240:5432/upr_production?sslmode=disable"

# Notion (in .env)
NOTION_TOKEN=secret_your_token_here
NOTION_API_KEY=$NOTION_TOKEN  # Auto-exported by scripts
```

### Database Connection
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
});
```

### Run Local Tests
```bash
# Test current sprint
node scripts/testing/smokeTestSprint31.js

# Load templates
node scripts/db/loadTemplates.js

# Test APIs
curl -X POST http://localhost:8080/api/outreach/v1/generate-outreach \
  -H "Content-Type: application/json" \
  -d '{"message_type":"email","company":{...},"contact":{...}}'
```

## Deployment to Google Cloud Run

### Quick Deploy
```bash
gcloud run deploy upr-web-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --quiet
```

**Service URL**: https://upr-web-service-191599223867.us-central1.run.app

### Monitor Deployment
```bash
# Watch logs
gcloud run services logs read upr-web-service --region=us-central1 --limit=50

# Check service status
gcloud run services describe upr-web-service --region=us-central1
```

### Verify Deployment
```bash
# Test API
curl https://upr-web-service-191599223867.us-central1.run.app/health

# Test specific endpoint
curl -X POST https://upr-web-service-191599223867.us-central1.run.app/api/outreach/v1/generate-outreach \
  -H "Content-Type: application/json" \
  -d '{...}'
```

## Update Notion - SINGLE COMMAND

### Update Both Databases
```bash
./scripts/notion/updateNotion.sh 32 31
```

This automatically:
- ✅ Updates Sprint 32 in Sprints database (all columns including Git data)
- ✅ Updates ALL Sprint 32 features in Module Features (bulk update)
- ✅ Marks all features as Done
- ✅ Fills: Status, Completed At, Done?, Git columns (Branch, Commit, Commits Count, etc.)

### What to Add First

Edit `scripts/notion/updateNotionComplete.js`:

```javascript
// Add Sprint 32 data
const SPRINT_DATA = {
  32: {
    status: 'Done',
    completedAt: '2025-01-XX',  // Update with actual date
    outcomes: 'Phase X: [Feature Name]. X/X tests passing. [Key deliverables]',
    sprintNotes: 'Test Results: X/X passing (100%). [Test details, fixes applied]',
    highlights: 'Key achievements and features',
    goal: 'Sprint 32 goal from Notion',
    businessValue: 'Business impact and value delivered',
    learnings: 'Technical learnings and insights'
  }
};

// Module Features auto-updated - no config needed
// All Sprint 32 features will be marked Done automatically
```

### Manual Notion Check (Optional)
```bash
# Inspect what's in Module Features
source .env && export NOTION_API_KEY=$NOTION_TOKEN
node scripts/notion/inspectModuleFeatures.js

# Check schemas
node scripts/notion/checkSchema.js
```

## Git Workflow

### Create Feature Branch (Optional)
```bash
git checkout -b sprint-32-[feature-name]
```

### Commit Work
```bash
git add .
git commit -m "feat(sprint-32): [description]

- Feature 1
- Feature 2
- Test results: X/X passing

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Merge to Main
```bash
git checkout main
git merge sprint-32-[feature-name]
git push origin main
```

### Tag Sprint (Optional but Recommended)
```bash
git tag sprint-32 -m "Sprint 32: [Phase Name]"
git push origin sprint-32
```

**Why Tag?** Improves Git data extraction for Notion updates (commit ranges, counts)

## Quality Checklist

Before marking sprint complete:

- [ ] All features implemented from Notion
- [ ] Smoke tests written and passing (aim for 100%)
- [ ] Database migrations applied (if any)
- [ ] API endpoints tested
- [ ] Deployed to Cloud Run successfully
- [ ] Service responding on production URL
- [ ] No unhandled errors in logs
- [ ] Code quality: No placeholders, proper error handling
- [ ] Notion updated with single command
- [ ] Git committed and tagged

## Common Issues & Solutions

### Issue: Database connection fails
**Solution**: Check Cloud SQL IP whitelist, use `ssl: false` in local config

### Issue: Tests failing with NaN or undefined
**Solution**: Check variable enrichment, ensure all required data provided

### Issue: Notion update fails
**Solution**:
```bash
source .env && export NOTION_API_KEY=$NOTION_TOKEN
node scripts/notion/checkSchema.js  # Verify schema
```

### Issue: Deployment stuck
**Solution**: Check `gcloud run services logs`, verify `package.json` scripts

### Issue: API returns 500
**Solution**: Check service logs, verify environment variables, test database connection

## Key Patterns to Follow

### Service Pattern
```javascript
// server/services/yourService.js
class YourService {
  constructor(pool) {
    this.pool = pool;
  }

  async yourMethod(params) {
    try {
      // Implementation
      return { success: true, data };
    } catch (error) {
      console.error('Error:', error);
      return { success: false, error: error.message };
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { YourService };
```

### Route Pattern
```javascript
// server/routes/yourRoute.js
const express = require('express');
const router = express.Router();

router.post('/endpoint', async (req, res) => {
  try {
    // Validate input
    const { param1, param2 } = req.body;
    if (!param1) {
      return res.status(400).json({ error: 'param1 required' });
    }

    // Call service
    const result = await service.method(param1, param2);

    // Return response
    res.json(result);
  } catch (error) {
    console.error('Route error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### Test Pattern
```javascript
// scripts/testing/smokeTestSprint32.js
let passed = 0;
let failed = 0;

function logTest(name, success, details = '') {
  const status = success ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}${details ? ' - ' + details : ''}`);
  success ? passed++ : failed++;
}

// Test 1
try {
  const result = await service.method();
  logTest('Test 1', result.success, result.data);
} catch (error) {
  logTest('Test 1', false, error.message);
}

// Summary
console.log(`\nPassed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
```

## Essential Files Reference

### Database
- `db/migrations/` - SQL migrations
- `db/seeds/` - Seed data
- `scripts/db/loadTemplates.js` - Load data script

### Services (Business Logic)
- `server/services/outreachGeneratorService.js` - Outreach generation
- `server/services/voiceTemplateService.js` - Template CRUD
- `server/services/contactTierService.js` - Contact tiering
- `server/services/agentCore.js` - Agent hub core

### Routes (API)
- `server/routes/outreach.js` - Outreach endpoints
- `server/routes/agentHub.js` - Agent hub REST API
- `server/routes/enrich/` - Enrichment endpoints

### Testing
- `scripts/testing/smokeTestSprint30.js` - Sprint 30 tests
- `scripts/testing/smokeTestSprint31.js` - Sprint 31 tests

### Notion
- `scripts/notion/updateNotion.sh` - Single command updater
- `scripts/notion/updateNotionComplete.js` - Main logic
- `scripts/notion/lib/schemaInspector.js` - Schema validation
- `scripts/notion/lib/gitDataExtractor.js` - Git metadata

### Documentation
- `docs/UPDATE_NOTION_SYSTEM.md` - Complete Notion docs
- `docs/SPRINT_31_COMPLETION_REPORT.md` - Sprint 31 report
- `docs/SPRINT_31_VOICE_TEMPLATE_DESIGN.md` - Design doc

## Quick Commands Reference

```bash
# Test locally
node scripts/testing/smokeTestSprint32.js

# Deploy to Cloud Run
gcloud run deploy upr-web-service --source . --region us-central1 --allow-unauthenticated --quiet

# Update Notion (both databases)
./scripts/notion/updateNotion.sh 32 31

# Check logs
gcloud run services logs read upr-web-service --region=us-central1 --limit=50

# Test production API
curl https://upr-web-service-191599223867.us-central1.run.app/health

# Git commit
git add . && git commit -m "feat(sprint-32): description" && git push

# Tag sprint
git tag sprint-32 -m "Sprint 32: Phase Name" && git push origin sprint-32
```

## Start Sprint 32

1. **Check Notion** - Review Sprint 32 features
2. **Read relevant docs** - Check previous sprint completion reports
3. **Create design doc** - If needed for complex features
4. **Implement features** - Follow patterns above
5. **Write tests** - Aim for 100% pass rate
6. **Deploy** - Single command to Cloud Run
7. **Update Notion** - Single command
8. **Commit & tag** - Git workflow

---

**Ready to start Sprint 32!** 🚀

All systems operational. Notion update streamlined. Deployment automated. Previous sprints 100% complete.
