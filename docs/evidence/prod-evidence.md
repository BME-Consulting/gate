# Production Evidence Pack

**Generated**: 2026-01-09 07:00:38 UTC

**Purpose**: Automated production health verification without screenshots or manual input.

**Source**: `scripts/gen-prod-evidence.sh`

---

## Git Commit Hash

```
16b36c8 chore: bump version to 1.0.6 (versionCode 39) [skip ci]
```

## Mobile JS Integrity Evidence

**P2-6 Runtime Integrity Check**

**Timestamp**: 2026-01-09T07:00:38.000Z
**Status**: ⏳ PENDING (Requires runtime execution)

### Runtime Information
- **Runtime Version**: `exposdk:54.0.0`
- **Update ID**: _To be determined at runtime_
- **Commit Hash (Runtime)**: _To be determined at runtime_
- **Expected Commit Hash**: `16b36c8` (current HEAD)
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

---

**Evidence Pack Generation Complete**

Review the sections above to verify production health.

If any section shows ❌ FAIL or ⚠️  WARNING, investigate immediately.

For incident response procedures, see: `docs/runbooks/production-incident-response.md`
