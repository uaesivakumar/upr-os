# UPR Security Checklist

**Purpose:** Weekly security hygiene review to ensure UPR remains secure
**Frequency:** Every Friday afternoon (before weekend)
**Owner:** Security Lead / Tech Lead
**Duration:** ~30 minutes

---

## Weekly Security Review (Every Friday)

### ✅ Access & Authentication

- [ ] **API Key Rotation Status**
  - Check when API keys were last rotated
  - Flag any keys >90 days old for rotation
  - Verify keys stored in Secret Manager (not code/env files)

- [ ] **User Account Audit**
  - Review new user registrations this week
  - Check for any admin/elevated privilege accounts created
  - Verify no suspicious account activity

- [ ] **Session Management**
  - Review active sessions count
  - Check for unusually long-lived sessions (>7 days)
  - Verify session timeout settings are working

### ✅ Infrastructure Security

- [ ] **Git Repository Security**
  - Run: `git log --all --full-history -- '*.env' '*secret*' '*key*'`
  - Verify no sensitive files accidentally committed
  - Check `.gitignore` is protecting private docs

- [ ] **Dependency Vulnerabilities**
  - Run: `npm audit`
  - Address any HIGH or CRITICAL vulnerabilities
  - Update dependencies if patches available
  - Document any accepted risks

- [ ] **SSL/TLS Certificates**
  - Verify certificates valid and not expiring soon (<30 days)
  - Check HTTPS enforced on all endpoints
  - Confirm HSTS headers present

### ✅ Application Security

- [ ] **Rate Limiting**
  - Check Cloud Armor dashboard for blocked requests
  - Verify rate limits functioning correctly
  - Review any legitimate users hitting limits (adjust if needed)

- [ ] **Security Logs Review**
  - Check logs for failed authentication attempts
  - Look for SQL injection patterns
  - Review prompt injection attempts
  - Identify any anomalous API usage patterns

- [ ] **Error Handling**
  - Verify no verbose error messages leaking to users
  - Check logs for stack traces in production
  - Ensure sensitive data not logged

### ✅ Data Security

- [ ] **Database Backups**
  - Verify automated backups running successfully
  - Test restore from latest backup (monthly, not weekly)
  - Check backup encryption enabled
  - Confirm offsite backup storage

- [ ] **Data Access Patterns**
  - Review queries returning >1000 records (potential exfiltration)
  - Check for bulk export attempts
  - Monitor unusual data access times (e.g., 3 AM queries)

- [ ] **Privacy Compliance**
  - Review data retention policies enforced
  - Check for any user data deletion requests processed
  - Verify PII handling compliance

### ✅ Monitoring & Alerting

- [ ] **Security Monitoring Active**
  - Verify security alerts are being sent (check Slack #security-alerts)
  - Test alert system (trigger test alert)
  - Review any alerts from this week and actions taken

- [ ] **Uptime & Availability**
  - Check uptime percentage (target: >99.9%)
  - Review any outages or degraded performance
  - Verify incident response procedures followed

- [ ] **Cloud Infrastructure**
  - Review Cloud Run service health
  - Check database connection pool status
  - Verify no unusual resource consumption

### ✅ Code & Deployment

- [ ] **Recent Deployments**
  - Review all deployments this week
  - Verify security patches included
  - Check for any rollbacks (investigate why)

- [ ] **Security Tests Passing**
  - Run security test suite
  - Verify no new security warnings in CI/CD
  - Check code coverage for security-critical paths

- [ ] **Secrets Management**
  - Audit Secret Manager access logs
  - Verify no secrets in environment variables (use Secret Manager)
  - Check for any hardcoded credentials in recent commits

---

## Monthly Security Deep Dive (First Friday of Month)

### 🔒 Comprehensive Security Audit

- [ ] **Penetration Testing**
  - Run automated security scans (OWASP ZAP, Burp Suite)
  - Test for common vulnerabilities (SQL injection, XSS, CSRF)
  - Document findings and remediation plan

- [ ] **Access Control Audit**
  - Review all user roles and permissions
  - Verify principle of least privilege
  - Remove unused service accounts

- [ ] **Third-Party Risk Assessment**
  - Review all third-party services (Apollo, SerpAPI, OpenAI)
  - Check for any security advisories
  - Verify vendor compliance (SOC 2, ISO 27001)

- [ ] **Incident Response Readiness**
  - Review incident response plan
  - Update contact information
  - Test emergency communication channels

- [ ] **Compliance Check**
  - Review UAE data protection compliance
  - Check GDPR compliance (if applicable)
  - Verify all required documentation up to date

- [ ] **Security Training**
  - Review security awareness for all team members
  - Share recent security incidents (anonymized)
  - Update security documentation

---

## Quarterly Security Activities (Every 3 Months)

### 🛡️ Advanced Security Measures

- [ ] **Full Security Audit**
  - Engage third-party security firm
  - Conduct comprehensive penetration test
  - Review architecture for security improvements

- [ ] **Disaster Recovery Drill**
  - Test full system recovery from backups
  - Verify RTO/RPO targets met
  - Update disaster recovery procedures

- [ ] **API Key Rotation**
  - Rotate ALL API keys (not just expired ones)
  - Update in Secret Manager
  - Test applications with new keys

- [ ] **Security Policy Review**
  - Update security policies based on new threats
  - Review and update incident response playbooks
  - Conduct tabletop exercise for major incident

- [ ] **Infrastructure Security Review**
  - Review Cloud Run configuration
  - Audit IAM permissions
  - Check firewall rules and network security

---

## Critical Security Incidents (Immediate Action Required)

If ANY of the following occur, STOP and follow incident response procedures:

🚨 **Immediate Escalation Required:**
- [ ] Data breach detected or suspected
- [ ] Unauthorized access to production systems
- [ ] API keys or credentials leaked publicly
- [ ] Successful SQL injection or XSS attack
- [ ] Ransomware or malware detected
- [ ] DDoS attack causing service outage
- [ ] Customer reports unauthorized account access

**Action:** Follow INCIDENT_RESPONSE.md procedures immediately

---

## Security Metrics Dashboard

Track these metrics weekly (trend over time):

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| Failed login attempts | ___ | ___ | <100/week | ⚪ |
| Rate limit triggers | ___ | ___ | <50/week | ⚪ |
| Security alerts | ___ | ___ | 0 critical | ⚪ |
| Uptime % | ___ | ___ | >99.9% | ⚪ |
| Vulnerable dependencies | ___ | ___ | 0 critical | ⚪ |
| Days since last key rotation | ___ | ___ | <90 days | ⚪ |
| Database backup success rate | ___ | ___ | 100% | ⚪ |

**Legend:** 🟢 Good | 🟡 Warning | 🔴 Critical

---

## Quick Command Reference

### Security Verification Commands

```bash
# Check git for accidentally committed secrets
git log --all --full-history --diff-filter=D -- '*.env' '*secret*' '**private/**'

# Verify .gitignore working
git check-ignore -v progress/private/

# Check for security vulnerabilities
npm audit

# Review recent authentication failures
# (Run in database)
psql $DATABASE_URL -c "
  SELECT COUNT(*) AS failed_attempts
  FROM auth_attempts
  WHERE success = false
    AND timestamp > NOW() - INTERVAL '7 days';
"

# Check Cloud Armor blocked requests
gcloud logging read "resource.type=http_load_balancer AND httpRequest.status=403" --limit=50

# Review recent deployments
gcloud run revisions list --service=upr-api --limit=10

# Check active user sessions
psql $DATABASE_URL -c "
  SELECT COUNT(*) AS active_sessions
  FROM refresh_tokens
  WHERE expires_at > NOW();
"
```

### Security Testing Commands

```bash
# Run security test suite
npm run test:security

# Check for outdated dependencies
npm outdated

# Scan for known vulnerabilities
npx snyk test

# Test SSL configuration
curl -I https://api.upr.ae | grep -i "strict-transport-security"

# Verify API rate limiting
# (Should return 429 after 100 requests)
for i in {1..105}; do curl -s -o /dev/null -w "%{http_code}\n" https://api.upr.ae/api/companies; done
```

---

## Security Improvement Backlog

Document security improvements to implement (prioritized):

| Priority | Improvement | Owner | Target Date | Status |
|----------|-------------|-------|-------------|--------|
| P0 | [Example: Implement MFA for admin] | Security Lead | 2025-11-01 | 🔴 Overdue |
| P1 | [Example: Add Web Application Firewall] | DevOps | 2025-12-01 | 🟡 In Progress |
| P2 | [Example: Security training for team] | CTO | 2026-01-01 | ⚪ Planned |

---

## Checklist Completion Log

**Week of October 14-18, 2025**
- Completed by: [Name]
- Date: October 18, 2025
- Issues found: 0 critical, 2 low-priority
- Actions taken: Updated dependencies, rotated 1 expired key
- Next review: October 25, 2025

**Week of October 21-25, 2025**
- Completed by: ___________
- Date: ___________
- Issues found: ___________
- Actions taken: ___________
- Next review: ___________

---

## Best Practices Reminder

✅ **DO:**
- Review security logs EVERY week
- Update dependencies regularly
- Rotate credentials on schedule
- Test backups monthly
- Report security concerns immediately
- Document all security incidents

❌ **DON'T:**
- Commit secrets to version control
- Ignore security alerts
- Skip security updates
- Share credentials via insecure channels
- Deploy without security testing
- Delay incident response

---

## Additional Resources

- **Security Architecture:** See SECURITY_ARCHITECTURE.md (private, encrypted)
- **Incident Response:** See INCIDENT_RESPONSE.md (private, encrypted)
- **Security Quick Reference:** See SECURITY_QUICK_REFERENCE.md
- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **Cloud Security Best Practices:** https://cloud.google.com/security/best-practices

---

**This checklist is PUBLIC-SAFE - no implementation details or secrets.**
**For detailed security procedures, see private documentation (encrypted).**

**Last Updated:** October 18, 2025
**Next Review:** October 25, 2025
**Owner:** Security Lead
