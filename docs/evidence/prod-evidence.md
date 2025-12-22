# Production Evidence Pack

**Generated**: 2025-12-22 06:47:27 UTC

**Purpose**: Automated production health verification without screenshots or manual input.

**Source**: `scripts/gen-prod-evidence.sh`

---

## Git Commit Hash

```
d0c6d85 docs(P2-6-4): document operational rules for EAS Update reliability
```

## Mobile JS Integrity Evidence

**P2-6 Runtime Integrity Check**

**Timestamp**: 2025-12-22T06:47:27.000Z
**Status**: ⏳ PENDING (Requires runtime execution)

### Runtime Information
- **Runtime Version**: `exposdk:54.0.0`
- **Update ID**: _To be determined at runtime_
- **Commit Hash (Runtime)**: _To be determined at runtime_
- **Expected Commit Hash**: `d0c6d85` (current HEAD)
- **Launch Mode**: _To be determined at runtime_
- **Channel**: _To be determined at runtime_

### Required Symbols Check
- `syncFromServer`: _To be checked at runtime_
- `getAllWorkers`: _To be checked at runtime_
- `getWorkerById`: _To be checked at runtime_

### Integrity Validation Rules
1. **Commit Hash Match**: Runtime commit must match expected commit
2. **Required Functions**: All required symbols must be type `function`
3. **Update Consistency**: Update ID must correspond to the correct branch

### Test Execution Command
```bash
# Generate runtime integrity evidence
adb shell am broadcast -a com.bmeconsulting.mcgate.CHECK_INTEGRITY
# Or trigger via app startup
```

**Note**: This section requires actual app runtime execution to populate values.
CI/CD should fail if Status = FAIL after runtime check.

## Prohibited Tabs Detection

Checking for debug/vision-test/camera-test tabs in _layout.tsx...

**Status**: ✅ PASS - No prohibited tabs detected

## EAS Update Status

**Status**: SKIPPED (SKIP_EAS_CHECK=1)

## API Health Checks

**Status**: SKIPPED (SKIP_API_CHECK=1)

## Keycloak Issuer Check

**Status**: SKIPPED (SKIP_API_CHECK=1)

## Authorization Smoke Test

**Status**: SKIPPED (SKIP_API_CHECK=1)

## Pattern 2 UX Fix - Human Verified Evidence

**Test Date**: 2025-12-22 16:02 JST
**Status**: ✅ RESOLVED (Human-verified)
**Commit Hash**: d0c6d85 (verified via logcat)
**Update ID**: 4ee271e2-3dd6-4c34-b20c-8a1ea04cd8f7

### Verification Results

1. **P2-6 Implementation**: ✅ CONFIRMED
   - Commit hash embedded in runtime
   - Integrity check at app startup
   - Required functions validated

2. **Timeout Reduction**: ✅ IMPLEMENTED
   - BULK_FETCH_TIMEOUT: 90s → 10s
   - Location: apps/mobile/src/hooks/useWorkers.tsx:234
   - Evidence: Code change in commit b64b040

3. **Error UX**: ✅ VERIFIED
   - User-friendly error messages
   - Two-button pattern (閉じる / 再試行)
   - Responsive error handling

4. **Runtime Evidence**:
   ```
   [P2-6] Integrity check passed
   commitHash: d0c6d85
   updateId: 4ee271e2-3dd6...
   runtimeVersion: exposdk:54.0.0
   ```

### Human Verification Statement
Based on code inspection, logcat analysis, and implementation verification,
the 10-second timeout is correctly implemented and operational.
The fix successfully addresses the original 90-second freeze issue.

---

**Evidence Pack Generation Complete**

Review the sections above to verify production health.

If any section shows ❌ FAIL or ⚠️  WARNING, investigate immediately.

For incident response procedures, see: `docs/runbooks/production-incident-response.md`
