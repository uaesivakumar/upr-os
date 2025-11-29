# PremiumRadar-SAAS Security Audit

Enterprise-grade Security Audit aligned with ISO 27001, SOC 2, and OWASP standards.

**Usage:**
- `/audit` - Full security audit
- `/audit quick` - Quick security scan
- `/audit deep` - Deep penetration-style audit

---

## AUDIT FRAMEWORK

### ISO 27001 Controls
- A.12.6 - Technical Vulnerability Management
- A.14.2 - Secure Development
- A.18.2 - Information Security Reviews

### SOC 2 Trust Principles
- Security - Protection against unauthorized access
- Availability - System availability commitments
- Processing Integrity - Complete & accurate processing
- Confidentiality - Information confidentiality

### OWASP Top 10 (2021)
- A01: Broken Access Control
- A02: Cryptographic Failures
- A03: Injection
- A04: Insecure Design
- A05: Security Misconfiguration
- A06: Vulnerable Components
- A07: Authentication Failures
- A08: Software Integrity Failures
- A09: Logging Failures
- A10: SSRF

---

## AUDIT PHASES

### Phase 1: Dependency Vulnerability Scan
```bash
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              PHASE 1: DEPENDENCY VULNERABILITIES             ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# 1.1 npm audit
echo "=== npm audit ==="
npm audit --json > /tmp/npm-audit.json 2>/dev/null
CRITICAL=$(cat /tmp/npm-audit.json | jq '.metadata.vulnerabilities.critical // 0')
HIGH=$(cat /tmp/npm-audit.json | jq '.metadata.vulnerabilities.high // 0')
MODERATE=$(cat /tmp/npm-audit.json | jq '.metadata.vulnerabilities.moderate // 0')
echo "Critical: $CRITICAL | High: $HIGH | Moderate: $MODERATE"

# 1.2 Check for outdated packages with known CVEs
echo "=== Outdated Packages ==="
npm outdated --json 2>/dev/null | jq 'keys[]' | head -10

# 1.3 License compliance
echo "=== License Check ==="
npx license-checker --summary 2>/dev/null || echo "License checker not installed"
```

### Phase 2: Secrets & Credentials Scan
```bash
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              PHASE 2: SECRETS & CREDENTIALS                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# 2.1 Hardcoded secrets patterns
echo "=== Hardcoded Secrets Scan ==="
PATTERNS="password|secret|api_key|apikey|token|credential|private_key|auth"
grep -riE "$PATTERNS" --include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.next \
  | grep -v "process.env" \
  | grep -v ".example" \
  | grep -v "// " \
  | grep -v "test" \
  || echo "✓ No hardcoded secrets found"

# 2.2 .env file check
echo "=== Environment Files ==="
ls -la .env* 2>/dev/null || echo "No .env files in root"
cat .gitignore | grep -E "\.env" || echo "⚠ .env may not be in .gitignore"

# 2.3 Git history secrets (last 10 commits)
echo "=== Git History Secrets ==="
git log -p -10 --all -- "*.env" 2>/dev/null | head -20 || echo "✓ No .env in recent history"
```

### Phase 3: OWASP Top 10 Scan
```bash
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              PHASE 3: OWASP TOP 10                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# A01: Broken Access Control
echo "=== A01: Access Control ==="
grep -r "allUsers\|public" --include="*.ts" --include="*.yaml" --exclude-dir=node_modules | head -5

# A02: Cryptographic Failures
echo "=== A02: Cryptographic ==="
grep -rE "md5|sha1|http://" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules | head -5

# A03: Injection
echo "=== A03: Injection ==="
grep -rE "eval\(|innerHTML|dangerouslySetInnerHTML|exec\(|spawn\(" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules | head -5

# A04: Insecure Design
echo "=== A04: Design Review ==="
echo "Manual review required for: auth flows, data validation, error handling"

# A05: Security Misconfiguration
echo "=== A05: Misconfiguration ==="
grep -r "debug.*true\|DEBUG" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude="*.test.*" | head -5

# A06: Vulnerable Components
echo "=== A06: Components ==="
echo "See Phase 1 - npm audit results"

# A07: Authentication Failures
echo "=== A07: Authentication ==="
grep -rE "session|cookie|jwt|bearer" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules | wc -l
echo "auth-related patterns found (manual review)"

# A08: Software Integrity
echo "=== A08: Integrity ==="
cat package-lock.json | jq '.lockfileVersion' 2>/dev/null || echo "Check package-lock.json"

# A09: Logging Failures
echo "=== A09: Logging ==="
grep -rE "console.log|console.error" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules | wc -l
echo "console statements found (review for sensitive data)"

# A10: SSRF
echo "=== A10: SSRF ==="
grep -rE "fetch\(|axios\.|http\." --include="*.ts" --include="*.tsx" --exclude-dir=node_modules | wc -l
echo "HTTP calls found (review for user-controlled URLs)"
```

### Phase 4: Cloud Security Scan
```bash
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              PHASE 4: CLOUD SECURITY                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# 4.1 IAM Bindings
echo "=== Cloud Run IAM ==="
for svc in premiumradar-saas-staging premiumradar-saas-production upr-os-service upr-os-worker; do
  echo "--- $svc ---"
  gcloud run services get-iam-policy $svc --region=us-central1 2>/dev/null | grep -A2 "bindings:" | head -5 || echo "N/A"
done

# 4.2 Service Account Permissions
echo "=== Service Accounts ==="
gcloud iam service-accounts list --format="table(email,disabled)" 2>/dev/null | head -10

# 4.3 Secret Manager Access
echo "=== Secret Manager ==="
gcloud secrets list --format="table(name)" 2>/dev/null | head -10

# 4.4 Cloud Armor (WAF)
echo "=== Cloud Armor ==="
gcloud compute security-policies list 2>/dev/null || echo "No Cloud Armor policies"
```

### Phase 5: API Security Scan
```bash
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              PHASE 5: API SECURITY                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# 5.1 Rate Limiting
echo "=== Rate Limiting ==="
grep -r "rateLimit\|rate-limit\|throttle" --include="*.ts" --exclude-dir=node_modules | head -5

# 5.2 Input Validation
echo "=== Input Validation ==="
grep -r "zod\|yup\|joi\|validator" --include="*.ts" --exclude-dir=node_modules | wc -l
echo "validation library imports found"

# 5.3 CORS Configuration
echo "=== CORS ==="
grep -r "cors\|Access-Control" --include="*.ts" --exclude-dir=node_modules | head -5

# 5.4 Security Headers
echo "=== Security Headers ==="
curl -sI https://upr.sivakumar.ai 2>/dev/null | grep -iE "strict-transport|content-security|x-frame|x-content-type"
```

### Phase 6: Prompt Injection Scan (AI-Specific)
```bash
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              PHASE 6: AI/PROMPT SECURITY                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# 6.1 Prompt Injection Defenses
echo "=== Prompt Injection Defenses ==="
grep -r "sanitize\|escape\|filter.*prompt\|validatePrompt" --include="*.ts" --exclude-dir=node_modules | head -5

# 6.2 AI Output Filtering
echo "=== AI Output Filtering ==="
grep -r "filterOutput\|sanitizeResponse\|validateAI" --include="*.ts" --exclude-dir=node_modules | head -5

# 6.3 PII Handling
echo "=== PII Detection ==="
grep -r "pii\|personal.*data\|gdpr" --include="*.ts" --exclude-dir=node_modules | head -5
```

---

## AUDIT REPORT FORMAT

```
╔══════════════════════════════════════════════════════════════════════╗
║                    SECURITY AUDIT REPORT                             ║
║              PremiumRadar-SAAS | Date: YYYY-MM-DD                    ║
╠══════════════════════════════════════════════════════════════════════╣
║ EXECUTIVE SUMMARY                                                    ║
║   Overall Risk:    [LOW/MEDIUM/HIGH/CRITICAL]                        ║
║   Critical Issues: X                                                 ║
║   High Issues:     X                                                 ║
║   Medium Issues:   X                                                 ║
║   Low Issues:      X                                                 ║
╠══════════════════════════════════════════════════════════════════════╣
║ PHASE 1: DEPENDENCIES                          [PASS/WARN/FAIL]      ║
║   npm audit:           X critical, X high, X moderate               ║
║   Outdated packages:   X packages need updates                       ║
╠══════════════════════════════════════════════════════════════════════╣
║ PHASE 2: SECRETS                               [PASS/WARN/FAIL]      ║
║   Hardcoded secrets:   [None/X found]                               ║
║   .env protection:     [Protected/Exposed]                          ║
╠══════════════════════════════════════════════════════════════════════╣
║ PHASE 3: OWASP TOP 10                          [PASS/WARN/FAIL]      ║
║   A01 Access Control:  [OK/REVIEW]                                  ║
║   A02 Cryptographic:   [OK/REVIEW]                                  ║
║   A03 Injection:       [OK/REVIEW]                                  ║
║   A07 Authentication:  [OK/REVIEW]                                  ║
╠══════════════════════════════════════════════════════════════════════╣
║ PHASE 4: CLOUD SECURITY                        [PASS/WARN/FAIL]      ║
║   IAM bindings:        [Least privilege/Overpermissioned]           ║
║   Cloud Armor:         [Enabled/Disabled]                           ║
╠══════════════════════════════════════════════════════════════════════╣
║ PHASE 5: API SECURITY                          [PASS/WARN/FAIL]      ║
║   Rate limiting:       [Implemented/Missing]                        ║
║   Input validation:    [Implemented/Partial/Missing]                ║
║   Security headers:    [X/Y present]                                ║
╠══════════════════════════════════════════════════════════════════════╣
║ PHASE 6: AI SECURITY                           [PASS/WARN/FAIL]      ║
║   Prompt injection:    [Protected/Vulnerable]                       ║
║   Output filtering:    [Implemented/Missing]                        ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║ COMPLIANCE STATUS                                                    ║
║   ISO 27001:  [Aligned/Gaps identified]                             ║
║   SOC 2:      [Aligned/Gaps identified]                             ║
║   OWASP:      [X/10 controls passing]                               ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## REMEDIATION PRIORITY

### P0 - Critical (Fix immediately)
- Exposed secrets in code
- Critical npm vulnerabilities
- Authentication bypass
- SQL/Command injection

### P1 - High (Fix within 24h)
- High npm vulnerabilities
- Missing rate limiting on auth endpoints
- Insecure direct object references
- Missing HTTPS

### P2 - Medium (Fix within 1 week)
- Medium npm vulnerabilities
- Missing security headers
- Verbose error messages
- Insecure cookies

### P3 - Low (Track for next sprint)
- Low npm vulnerabilities
- Code quality issues
- Documentation gaps

---

## POST-AUDIT ACTIONS

1. **Generate Report**
   ```bash
   # Save audit report
   mkdir -p docs/security
   echo "Audit report" > docs/security/AUDIT_$(date +%Y%m%d).md
   ```

2. **Update Security Changelog**
   ```bash
   cat >> SECURITY_CHANGELOG.md << EOF
   ## Audit $(date +%Y-%m-%d)
   - Findings: X critical, X high, X medium
   - Remediation: [In progress/Complete]
   EOF
   ```

3. **Create Fix Tasks**
   - For each finding, create a task in Notion
   - Assign priority based on severity
   - Track remediation progress

---

## AUTOMATED AUDIT SCHEDULE

- **Daily:** npm audit (automated in CI)
- **Weekly:** Full security scan
- **Monthly:** Deep audit with manual review
- **Quarterly:** Third-party penetration test (recommended)

---

**NOTE:** This is a technical audit. For compliance certification, engage a qualified auditor.
