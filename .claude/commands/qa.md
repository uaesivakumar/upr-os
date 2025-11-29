# PremiumRadar-SAAS QA & Sprint Certification

Enterprise-grade Quality Assurance and Sprint Certification.

**Usage:**
- `/qa` - QA current sprint
- `/qa S26` - QA specific sprint
- `/qa S26-S30` - QA sprint range

**NOTE:** This command does NOT deploy. Use `/deploy` for deployments.

---

## QA PHASES

### Phase 1: Code Quality Gate
```bash
# 1.1 TypeScript Compilation
echo "=== TypeScript Check ==="
npx tsc --noEmit
TS_STATUS=$?

# 1.2 Build Verification
echo "=== Build Check ==="
npm run build
BUILD_STATUS=$?

# 1.3 Linting
echo "=== Lint Check ==="
npm run lint 2>/dev/null || echo "No lint script"
LINT_STATUS=$?

# 1.4 Tests
echo "=== Test Suite ==="
npm test
TEST_STATUS=$?
```

### Phase 2: Service Health Gate
```bash
# 2.1 Staging Service
echo "=== Service Health ==="
STAGING_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://upr.sivakumar.ai/api/health)
echo "Staging: $STAGING_HEALTH"

# 2.2 OS Service
OS_STATUS=$(gcloud run services describe upr-os-service --region=us-central1 --format="value(status.conditions[0].status)" 2>/dev/null)
echo "OS Service: $OS_STATUS"

# 2.3 Worker Service
WORKER_STATUS=$(gcloud run services describe upr-os-worker --region=us-central1 --format="value(status.conditions[0].status)" 2>/dev/null)
echo "Worker: $WORKER_STATUS"
```

### Phase 3: Security Gate
```bash
# 3.1 Dependency Vulnerabilities
echo "=== Security Audit ==="
npm audit --audit-level=high 2>/dev/null || echo "Audit check complete"

# 3.2 Secrets Check (no hardcoded secrets)
echo "=== Secrets Scan ==="
grep -r "NOTION_TOKEN\|API_KEY\|SECRET" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules | grep -v "process.env" | grep -v ".example" || echo "No exposed secrets"

# 3.3 OWASP Top 10 Markers
echo "=== OWASP Check ==="
# Check for unsafe eval
grep -r "eval(" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules || echo "No eval usage"
# Check for innerHTML
grep -r "innerHTML" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules || echo "No innerHTML usage"
```

### Phase 4: UI Integration Gate (NO HIDDEN FEATURES)
```bash
# 4.1 Route Existence
echo "=== Route Check ==="
find app -name "page.tsx" -type f | wc -l
ls -la app/**/page.tsx 2>/dev/null | head -20

# 4.2 Navigation Links
echo "=== Navigation Check ==="
grep -r "href=" components/shell/Sidebar.tsx components/layout/Header.tsx 2>/dev/null | head -10

# 4.3 Component Exports
echo "=== Component Exports ==="
grep "export" components/index.ts 2>/dev/null || echo "Check individual exports"
```

### Phase 5: DOM Verification Gate (Live UI)
```bash
# 5.1 Fetch Live DOM
echo "=== Live DOM Check ==="
LIVE_DOM=$(curl -sL https://premiumradar-saas-staging-191599223867.us-central1.run.app 2>/dev/null)

# 5.2 Required Strings Present
echo "Checking required strings..."
echo "$LIVE_DOM" | grep -q "SIVA" && echo "✓ SIVA found" || echo "✗ SIVA missing"
echo "$LIVE_DOM" | grep -q "Q/T/L/E\|QTLE" && echo "✓ Q/T/L/E found" || echo "✗ Q/T/L/E missing"

# 5.3 Forbidden Strings Absent
echo "Checking forbidden strings..."
echo "$LIVE_DOM" | grep -q "AI-Powered Intelligence Platform" && echo "✗ Template content found" || echo "✓ No template content"
echo "$LIVE_DOM" | grep -q "15 integrations" && echo "✗ Template content found" || echo "✓ Clean"
```

### Phase 6: Notion Verification Gate
```bash
# 6.1 Fetch Token
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)

# 6.2 Sprint Status
echo "=== Notion Sprint Status ==="
node scripts/notion/getCurrentSprint.js 2>/dev/null

# 6.3 Feature Completion
echo "=== Feature Completion ==="
# Query features for sprint and check status
node -e "
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

notion.databases.query({
  database_id: '26ae5afe-4b5f-4d97-b402-5c459f188944',
  filter: { property: 'Sprint', number: { equals: SPRINT_NUMBER } }
}).then(res => {
  const done = res.results.filter(r => r.properties.Status?.select?.name === 'Done').length;
  const total = res.results.length;
  console.log('Features: ' + done + '/' + total + ' complete');
});
" 2>/dev/null
```

---

## QA REPORT FORMAT

```
╔══════════════════════════════════════════════════════════════╗
║                    QA CERTIFICATION REPORT                   ║
║                Sprint: SX-SY | Date: YYYY-MM-DD              ║
╠══════════════════════════════════════════════════════════════╣
║ PHASE 1: CODE QUALITY                                        ║
║   TypeScript:     [PASS/FAIL]                                ║
║   Build:          [PASS/FAIL]                                ║
║   Lint:           [PASS/FAIL]                                ║
║   Tests:          [PASS/FAIL] (X/Y passed)                   ║
╠══════════════════════════════════════════════════════════════╣
║ PHASE 2: SERVICE HEALTH                                      ║
║   Staging:        [200 OK/FAIL]                              ║
║   OS Service:     [HEALTHY/UNHEALTHY]                        ║
║   Worker:         [HEALTHY/UNHEALTHY]                        ║
╠══════════════════════════════════════════════════════════════╣
║ PHASE 3: SECURITY                                            ║
║   npm audit:      [PASS/FAIL] (X vulnerabilities)            ║
║   Secrets scan:   [PASS/FAIL]                                ║
║   OWASP markers:  [PASS/FAIL]                                ║
╠══════════════════════════════════════════════════════════════╣
║ PHASE 4: UI INTEGRATION                                      ║
║   Routes:         [X routes found]                           ║
║   Navigation:     [PASS/FAIL]                                ║
║   Components:     [PASS/FAIL]                                ║
╠══════════════════════════════════════════════════════════════╣
║ PHASE 5: LIVE DOM                                            ║
║   Required:       [X/Y present]                              ║
║   Forbidden:      [0 found/X found]                          ║
╠══════════════════════════════════════════════════════════════╣
║ PHASE 6: NOTION                                              ║
║   Sprint status:  [Done/In Progress]                         ║
║   Features:       [X/Y complete]                             ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  OVERALL: [CERTIFIED / NOT CERTIFIED]                        ║
║                                                              ║
║  Issues: X | Warnings: Y                                     ║
╚══════════════════════════════════════════════════════════════╝
```

---

## CERTIFICATION CRITERIA

### MUST PASS (Blocking)
- [ ] TypeScript compilation (0 errors)
- [ ] Build success
- [ ] Tests pass (>80% coverage recommended)
- [ ] Staging service healthy (200)
- [ ] No high/critical vulnerabilities
- [ ] No exposed secrets
- [ ] Required DOM strings present
- [ ] No forbidden DOM strings
- [ ] All sprint features marked Done

### SHOULD PASS (Warning)
- [ ] Lint clean
- [ ] OS/Worker services healthy
- [ ] Knowledge Page updated
- [ ] No medium vulnerabilities

---

## POST-CERTIFICATION (if passed)

### Create Git Tag
```bash
git tag -a sprint-SX-certified -m "Sprint SX QA Certified - $(date +%Y-%m-%d)"
git push origin sprint-SX-certified
```

### Update Notion
```bash
# Run notion-update to ensure all fields populated
/notion-update SX
```

### Generate Certificate
```
Sprint SX Certification Complete
Date: YYYY-MM-DD
Commit: [hash]
Tag: sprint-SX-certified
QA Report: docs/qa/Sprint_SX_QA_Report.md
```

---

## FAILURE HANDLING

If QA fails:
1. **Do NOT tag or certify**
2. **Document failures** in QA report
3. **Create fix tasks** for each failure
4. **Re-run QA** after fixes
5. **Only certify when ALL blocking criteria pass**

---

## ENTERPRISE COMPLIANCE MARKERS

This QA process aligns with:
- **ISO 27001** - Security controls verification
- **SOC 2** - Change management & testing
- **GDPR** - Data handling verification
- **OWASP** - Security best practices

---

**NOTE:** This command is QA-only. Use `/deploy` for deployments, `/audit` for security audits.
