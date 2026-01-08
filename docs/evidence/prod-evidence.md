# Production Evidence Pack

**Generated**: 2026-01-08 08:22:10 UTC

**Purpose**: Automated production health verification without screenshots or manual input.

**Source**: `scripts/gen-prod-evidence.sh`

---

## Git Commit Hash

```
292e493 ops: 事故防止3点セットを「効かせる」 - Actions修正/main保護/CODEOWNERS
```

## Mobile JS Integrity Evidence

**P2-6 Runtime Integrity Check**

**Timestamp**: 2026-01-08T08:22:10.000Z
**Status**: ⏳ PENDING (Requires runtime execution)

### Runtime Information
- **Runtime Version**: `exposdk:54.0.0`
- **Update ID**: _To be determined at runtime_
- **Commit Hash (Runtime)**: _To be determined at runtime_
- **Expected Commit Hash**: `292e493` (current HEAD)
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

**Status**: SKIPPED (EXPO_TOKEN not set)

## API Health Checks

### GS API Health (`http://192.168.1.4:7070/health`)

**Status**: ❌ FAIL - Timeout or connection error

Error details (masked):
```

```

## Keycloak Issuer Check

### Issuer URL: `http://192.168.1.4:8081/realms/mcd3`

**Status**: ❌ FAIL - Timeout or connection error

### JWKS URL: `http://192.168.1.4:8081/realms/mcd3/protocol/openid-connect/certs`

**Status**: ❌ FAIL - Timeout or connection error

## Authorization Smoke Test

Running `apps/gs-api/scripts/smoke-authz.sh`...

```
==========================================
Authorization Smoke Test
==========================================
API Base URL: http://192.168.1.4:7070
Projects Endpoint: http://192.168.1.4:7070/api/me/projects


Test 1: No Authorization header → 401
--------------------------------------
```

**Status**: ⚠️  SOME CHECKS FAILED (see above)

---

**Evidence Pack Generation Complete**

Review the sections above to verify production health.

If any section shows ❌ FAIL or ⚠️  WARNING, investigate immediately.

For incident response procedures, see: `docs/runbooks/production-incident-response.md`
