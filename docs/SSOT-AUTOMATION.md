# SSOT Automation Guide

## Overview

This document describes the SSOT (Single Source of Truth) automation tools implemented to prevent configuration drift and ensure consistency across the mc-gate project.

**SSOT Principle**: Cloudflare Tunnel Dashboard is the **ONLY** source of truth for all port and URL configurations.

## The 3-Layer Defense

### Layer 1: Manual Validation - `ssot-doctor.sh`

**When to use**: Before committing, during debugging, or as a health check

**Usage**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
./scripts/ssot-doctor.sh
```

**What it checks**:
1. SSOT definition (Cloudflare Tunnel Dashboard reference)
2. Cloudflare Tunnel config file
3. Face API Dockerfile port configuration
4. Docker container port mappings (runtime)
5. Active port listeners
6. Endpoint health via Cloudflare Tunnel
7. Mobile app config (eas.json)
8. App config static analysis
9. GS API environment consistency

**Exit codes**:
- `0`: All checks passed
- `1`: Errors detected (SSOT violations)

**Example output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SSOT Definition (Cloudflare Tunnel Dashboard)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Face API:  face-gate.bme-service.monster → 127.0.0.1:8101
  GS API:    api-gate.bme-service.monster  → 127.0.0.1:7070
  Auth API:  auth-gate.bme-service.monster → 127.0.0.1:8081

✅ SSOT definition confirmed
```

---

### Layer 2: Commit-Time Guard - Pre-Commit Hook

**When it runs**: Automatically on every `git commit`

**Location**: `.git/hooks/pre-commit`

**What it validates**:
1. Face API Dockerfile EXPOSE port is 8101
2. Face API CMD doesn't hardcode port 8100
3. eas.json preview/production profiles don't use LAN IPs
4. No port 8100 in any config files
5. Cloudflare Tunnel config alignment
6. Docker Compose port mappings

**Behavior**:
- ✅ **Pass**: Commit proceeds normally
- ⚠️  **Warning**: Commit allowed, but warnings displayed
- ❌ **Error**: Commit blocked until violations are fixed

**Example (blocking violation)**:
```bash
$ git commit -m "Update Face API port"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Face API Dockerfile Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ SSOT VIOLATION: Face API EXPOSE: 8100 (MUST be 8101 per SSOT)
  SSOT: Cloudflare Tunnel maps face-gate.bme-service.monster → :8101

╔════════════════════════════════════════════════════════════════╗
║  COMMIT BLOCKED: SSOT VIOLATIONS DETECTED                      ║
║  Fix the errors above before committing.                       ║
╚════════════════════════════════════════════════════════════════╝
```

**Bypassing the hook** (NOT recommended):
```bash
git commit --no-verify  # Skip pre-commit hook (use with caution)
```

---

### Layer 3: PR Review-Time - GitHub Actions CI

**When it runs**: Automatically on pull requests and pushes to main/develop

**Location**: `.github/workflows/ssot-validation.yml`

**Workflow jobs**:

#### Job 1: `ssot-validation`
- Runs `ssot-doctor.sh` in CI environment
- Generates SSOT compliance report
- Auto-comments on PRs with results

#### Job 2: `additional-checks`
- Port 8100 violation detection
- LAN IP in production configs
- Cloudflare Tunnel YAML syntax validation
- Required hostname verification

**GitHub UI Integration**:
- ✅ Green checkmark: All validations passed
- ❌ Red X: SSOT violations detected
- 💬 Auto-comment on PR with summary

**Example PR comment**:
```
✅ SSOT Validation Passed

All configurations are aligned with the Single Source of Truth (Cloudflare Tunnel Dashboard).
```

**Manual trigger**:
```bash
# Via GitHub UI: Actions → SSOT Validation → Run workflow
```

---

## SSOT Reference

### Cloudflare Tunnel Dashboard (SSOT)

| Service | Hostname | Backend |
|---------|----------|---------|
| Face API | face-gate.bme-service.monster | 127.0.0.1:8101 |
| GS API | api-gate.bme-service.monster | 127.0.0.1:7070 |
| Auth API | auth-gate.bme-service.monster | 127.0.0.1:8081 |

**Critical Rules**:
1. **Never** change ports to make things work
2. **Always** check Cloudflare Dashboard first
3. **Then** adjust Docker/App to match SSOT
4. **Port 8101** for Face API (not 8100)

---

## Common Violations and Fixes

### Violation 1: Port 8100 in Face API Dockerfile

**Problem**:
```dockerfile
# ❌ Wrong
EXPOSE 8100
CMD ["uvicorn", "app.main:app", "--port", "8100"]
```

**Fix**:
```dockerfile
# ✅ Correct
EXPOSE 8101
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8101}
```

### Violation 2: LAN IP in eas.json preview profile

**Problem**:
```json
{
  "build": {
    "preview": {
      "env": {
        "API_FACE_API": "http://192.168.1.4:8101"
      }
    }
  }
}
```

**Fix**:
```json
{
  "build": {
    "preview": {
      "env": {
        "API_FACE_API": "https://face-gate.bme-service.monster"
      }
    }
  }
}
```

### Violation 3: Hardcoded port in app.config.ts

**Problem**:
```typescript
// ❌ Wrong
apiFaceApi: "http://192.168.1.4:8100"
```

**Fix**:
```typescript
// ✅ Correct
apiFaceApi: process.env.API_FACE_API || "https://face-gate.bme-service.monster"
```

---

## Troubleshooting

### Pre-commit hook not running

**Symptoms**: Commits go through without validation

**Solution**:
```bash
# Check if hook is executable
ls -la .git/hooks/pre-commit

# Make it executable if needed
chmod +x .git/hooks/pre-commit

# Test manually
.git/hooks/pre-commit
```

### ssot-doctor.sh fails with command not found

**Solution**:
```bash
# Make script executable
chmod +x scripts/ssot-doctor.sh

# Run from project root
cd /volume2/Project/MCD3/TUMON/mc-gate
./scripts/ssot-doctor.sh
```

### GitHub Actions workflow not triggering

**Possible causes**:
1. Workflow file has YAML syntax errors
2. Changes don't affect monitored paths
3. Workflow is disabled in GitHub repository settings

**Solution**:
```bash
# Validate YAML syntax
cat .github/workflows/ssot-validation.yml | yq eval .

# Check workflow status in GitHub UI:
# Repository → Actions → Workflows
```

---

## Integration with Development Workflow

### Recommended Flow

```
1. Code changes
   ↓
2. Run ssot-doctor.sh (optional, recommended for major changes)
   ↓
3. git add <files>
   ↓
4. git commit -m "message"
   ↓  (pre-commit hook validates)
   ↓
5. git push
   ↓
6. Create Pull Request
   ↓  (GitHub Actions CI validates)
   ↓
7. Review, approve, merge
```

### Best Practices

1. **Run `ssot-doctor.sh` before committing major config changes**
   ```bash
   ./scripts/ssot-doctor.sh && git commit
   ```

2. **Check pre-commit hook output carefully**
   - Don't ignore warnings
   - Fix errors immediately

3. **Monitor GitHub Actions results**
   - Wait for green checkmark before merging PR
   - Investigate failures before proceeding

4. **Keep SSOT in mind**
   - Always reference Cloudflare Dashboard when in doubt
   - Never modify ports to make things "work"
   - Fix infrastructure, not configuration

---

## Maintenance

### Updating SSOT Configuration

If Cloudflare Tunnel configuration needs to change:

1. **Update Cloudflare Dashboard first** (SSOT)
2. Update `scripts/ssot-doctor.sh` reference values
3. Update `.github/workflows/ssot-validation.yml` reference values
4. Update this documentation
5. Update Docker configurations to match
6. Update mobile app configs to match
7. Run full validation

### Adding New Services

To add a new service to SSOT validation:

1. Add to Cloudflare Tunnel config
2. Add validation in `ssot-doctor.sh`:
   - Section for Tunnel config check
   - Section for Dockerfile validation
   - Section for endpoint health check
3. Add validation in pre-commit hook
4. Add validation in GitHub Actions workflow
5. Update this documentation

---

## Files Modified/Created

```
scripts/ssot-doctor.sh                    # Layer 1: Manual validation
.git/hooks/pre-commit                     # Layer 2: Commit-time guard
.github/workflows/ssot-validation.yml     # Layer 3: PR review-time CI
docs/SSOT-AUTOMATION.md                   # This document
```

---

## References

- **CLAUDE.md**: Project-wide rules and guidelines
- **Cloudflare Tunnel Dashboard**: https://one.dash.cloudflare.com/ (SSOT)
- **GitHub Actions**: Repository → Actions tab
- **Previous incidents**: See CLAUDE.md for port 8100→8101 migration history

---

**Last Updated**: 2025-12-17
**Author**: Claude (with user collaboration)
**Version**: 1.0.0
