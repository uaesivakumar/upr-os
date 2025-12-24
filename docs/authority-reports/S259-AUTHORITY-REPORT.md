# S259 AUTHORITY REPORT: Deterministic Replay Hard Gate

**Sprint:** S259
**Date:** 2025-12-24
**Status:** CERTIFIED

---

## 1. AUTHORITY SUMMARY

| Requirement | Implementation | Evidence |
|-------------|---------------|----------|
| Replay Tracking Table | DB Table | `os_replay_attempts` |
| Replay Initiation | DB Function | `initiate_replay()` |
| Drift Detection | DB Function | `complete_replay()` |
| Replay History | DB Function | `get_replay_history()` |
| DRIFT_DETECTED Hard Failure | Check Constraint | `replay_status IN (...)` |
| Control Plane Version | Version Table | `os_control_plane_version` = 2.5 |

---

## 2. SQL CONSTRAINT PROOF

### 2.1 os_replay_attempts Table Exists

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'os_replay_attempts';
```

**Result:**
```
table_name: os_replay_attempts
```

### 2.2 Replay Status Constraint

```sql
-- Check constraint enforced
INSERT INTO os_replay_attempts (envelope_hash, replay_status)
VALUES ('test', 'INVALID_STATUS');

-- Result: ERROR - violates check constraint
```

**Valid values:** PENDING, SUCCESS, DRIFT_DETECTED, ENVELOPE_NOT_FOUND, FAILED

### 2.3 Functions Exist

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('initiate_replay', 'complete_replay', 'get_replay_history');
```

**Result:**
```
proname: initiate_replay
proname: complete_replay
proname: get_replay_history
```

---

## 3. DRIFT DETECTION PROOF

### 3.1 Replay Without Drift (SUCCESS)

```sql
-- 1. Initiate replay
SELECT replay_id FROM initiate_replay('original_hash', NULL, 'test', 'test');

-- 2. Complete with SAME hash
SELECT replay_status, drift_detected
FROM complete_replay(replay_id, '{"output": "test"}'::jsonb, 'original_hash');

-- Result:
-- replay_status: SUCCESS
-- drift_detected: false
```

### 3.2 Replay With Drift (HARD FAILURE)

```sql
-- 1. Initiate replay
SELECT replay_id FROM initiate_replay('original_hash', NULL, 'test', 'test');

-- 2. Complete with DIFFERENT hash
SELECT replay_status, drift_detected, drift_details
FROM complete_replay(replay_id, '{"output": "different"}'::jsonb, 'different_hash');

-- Result:
-- replay_status: DRIFT_DETECTED
-- drift_detected: true
-- drift_details: {"drift_type": "HASH_MISMATCH", "original_hash": "...", "replay_hash": "..."}
```

### 3.3 Envelope Not Found

```sql
SELECT error_code FROM initiate_replay('nonexistent_hash', NULL, 'test', 'test');

-- Result:
-- error_code: ENVELOPE_NOT_SEALED
```

---

## 4. INTEGRATION TEST PROOF

```
$ npm test -- __tests__/s259-deterministic-replay.test.js

PASS __tests__/s259-deterministic-replay.test.js
  S259 AUTHORITY: Deterministic Replay Hard Gate
    os_replay_attempts Table
      ✓ os_replay_attempts table exists (228 ms)
      ✓ replay_status check constraint exists (238 ms)
    Replay Initiation
      ✓ initiate_replay returns envelope content for valid hash (1376 ms)
      ✓ initiate_replay returns ENVELOPE_NOT_SEALED for non-existent hash (230 ms)
    Replay Completion
      ✓ complete_replay with matching hash returns SUCCESS (458 ms)
      ✓ complete_replay with different hash returns DRIFT_DETECTED (HARD FAILURE) (456 ms)
    Replay History
      ✓ get_replay_history returns attempts for envelope (227 ms)
      ✓ get_replay_history by hash works (224 ms)
    Control Plane Version
      ✓ control plane is at version 2.5 (227 ms)
  S259 Error Codes
    ✓ REPLAY_DRIFT_DETECTED is a hard failure
    ✓ ENVELOPE_NOT_SEALED prevents replay

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

---

## 5. FILES CHANGED

| File | Change Type | Purpose |
|------|-------------|---------|
| `migrations/S259_deterministic_replay_hard_gate.sql` | NEW | DB migration with table and functions |
| `routes/os/controlplane/replay.js` | NEW | Replay API endpoint |
| `routes/os/controlplane/index.js` | MODIFIED | Route registration |
| `__tests__/s259-deterministic-replay.test.js` | NEW | Integration tests |

---

## 6. ERROR CODES IMPLEMENTED

| Code | HTTP Status | Trigger |
|------|-------------|---------|
| REPLAY_DRIFT_DETECTED | 409 | Replay hash differs from original |
| ENVELOPE_NOT_SEALED | 404 | Envelope not found in registry |
| ENVELOPE_REVOKED | 410 | Envelope has been revoked |
| ENVELOPE_EXPIRED | 410 | Envelope has expired |
| REPLAY_NOT_FOUND | 404 | Replay attempt ID not found |
| HASH_REQUIRED | 400 | envelope_hash not provided |

---

## 7. REPLAY FLOW

### Initiate Replay
```
POST /api/os/replay
{
  "envelope_hash": "abc123...",
  "source": "sales-bench"
}
    ↓
initiate_replay() → Look up envelope
    ↓
Return envelope_content for replay execution
    ↓
Create PENDING replay attempt
```

### Complete Replay
```
POST /api/os/replay/:replay_id/complete
{
  "output": { ... },
  "new_hash": "def456..."
}
    ↓
complete_replay() → Compare hashes
    ↓
If hashes match: SUCCESS
If hashes differ: DRIFT_DETECTED (HARD FAILURE)
```

### Query History
```
GET /api/os/replay/history?envelope_id=xxx
    ↓
get_replay_history() → All attempts
    ↓
Return with drift_detected flags
```

---

## 8. DRIFT DETECTION SEMANTICS

**Drift Detection = HARD FAILURE**

When `complete_replay` detects drift:
1. `replay_status` = 'DRIFT_DETECTED'
2. `drift_detected` = true
3. `drift_details` contains mismatch info
4. API returns HTTP 409 Conflict
5. `runtime_eligible` = false

**This is NOT a soft warning. Drift blocks execution.**

---

## 9. CERTIFICATION

**S259 AUTHORITY CERTIFIED**

- [x] os_replay_attempts table created
- [x] initiate_replay function returns envelope content
- [x] complete_replay function detects drift
- [x] DRIFT_DETECTED is a hard failure (HTTP 409)
- [x] Replay history tracked for audit
- [x] Error codes are explicit and documented
- [x] Integration tests pass (11/11)
- [x] Control plane version updated to 2.5

**Certification Date:** 2025-12-24
**Certification ID:** S259-AUTH-20251224
