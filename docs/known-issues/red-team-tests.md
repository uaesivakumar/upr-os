# KNOWN_PREEXISTING_FAILURE: Red-Team Security Tests

**Status:** DEFERRED
**Count:** 31 test failures
**Documented:** 2025-12-24
**Reason for deferral:** Out of scope for S261-S267 heavy-lift run

---

## Summary

These test failures existed before the S261-S267 implementation run began.
They are explicitly marked as out-of-scope and should not block the current work.

---

## Failing Test Suites (9 files, 31 failures)

### 1. Security Tests (Primary)

| File | Failures | Description |
|------|----------|-------------|
| `tests/security/prompt-injection/firewall.test.ts` | 12 | Prompt injection firewall tests |
| `tests/security/red-team/runner.test.ts` | 2 | Red team suite validation |

**Specific failures in firewall.test.ts:**
- Input sanitization + jailbreak detection (2)
- RAG isolation (3)
- Output leakage filter (2)
- LLM guardrails + persona mask (1)
- Integrated security pipeline (1)
- Convenience functions (2)
- Performance & accuracy metrics (1)

### 2. E2E Tests

| File | Failures | Description |
|------|----------|-------------|
| `tests/e2e/discovery/discovery-flow.spec.ts` | Multiple | Discovery flow e2e |
| `tests/e2e/auth/login.spec.ts` | Multiple | Login e2e |
| `tests/e2e/auth/rbac.spec.ts` | Multiple | RBAC e2e |
| `tests/e2e/outreach/composer.spec.ts` | Multiple | Outreach composer e2e |
| `tests/e2e/admin/tenant-admin.spec.ts` | Multiple | Tenant admin e2e |

### 3. Unit Tests

| File | Failures | Description |
|------|----------|-------------|
| `tests/s55/discovery.test.ts` | 1 | Score breakdown calculation |
| `tests/upl/no-contamination.test.ts` | 2 | Control plane non-contamination |

---

## Reason for Deferral

The S261-S267 heavy-lift run is focused on:
1. BTE data foundation (S261)
2. Behavioral Telemetry Engine (S262)
3. Enterprise & User Model (S263)
4. Super Admin Command Center (S264)
5. Enterprise Admin Operations (S265)
6. NBA Integration (S266)
7. Audit & Safety (S267)

These security test failures require separate investigation and are:
- Not caused by S261-S267 changes
- Not blocking the current architectural work
- Scheduled for separate remediation

---

## Constraints During S261-S267

1. **No NEW test failures** may be introduced
2. **Failure count must not increase** beyond 31
3. **Build must remain green** (TypeScript compilation)
4. **Runtime must remain stable**

---

## Remediation Plan

| Priority | Action | Owner |
|----------|--------|-------|
| P2 | Investigate firewall.test.ts failures | TBD |
| P2 | Investigate red-team/runner.test.ts failures | TBD |
| P3 | Fix E2E test infrastructure | TBD |
| P3 | Fix unit test regressions | TBD |

---

## Verification Command

```bash
# Current baseline: 31 failures
npx vitest run 2>&1 | grep -c "FAIL"

# Expected output: 31 (or fewer after fixes)
```

---

**Last Updated:** 2025-12-24
**Author:** TC (Claude)
