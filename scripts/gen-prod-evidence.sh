#!/bin/bash
set -euo pipefail

# ==========================================
# Production Evidence Pack Generator
# ==========================================
# Purpose: Automatically collect production health evidence
# without screenshots or manual input.
#
# Output: docs/evidence/prod-evidence.md (overwritten)
#
# Usage:
#   bash scripts/gen-prod-evidence.sh
#
# Environment Variables (optional):
#   EXPO_TOKEN          - EAS CLI authentication
#   SKIP_EAS_CHECK      - Set to "1" to skip EAS Update check
#   SKIP_API_CHECK      - Set to "1" to skip API health checks
# ==========================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUTPUT_FILE="docs/evidence/prod-evidence.md"

# Deterministic timestamps (same commit => same evidence)
EPOCH="${SOURCE_DATE_EPOCH:-$(git show -s --format=%ct HEAD)}"
NOW_UTC="$(date -u -d "@$EPOCH" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date -u -r "$EPOCH" '+%Y-%m-%d %H:%M:%S UTC')"
NOW_ISO="$(date -u -d "@$EPOCH" '+%Y-%m-%dT%H:%M:%S.000Z' 2>/dev/null || date -u -r "$EPOCH" '+%Y-%m-%dT%H:%M:%S.000Z')"

COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
COMMIT_SHORT="${COMMIT_SHA:0:7}"

TIMESTAMP="$NOW_UTC"

# ==========================================
# Helper: Mask secrets in output
# ==========================================
mask_secret() {
  sed -E \
    -e 's/(Bearer |EXPO_TOKEN=)[^ ]+/\1***MASKED***/g' \
    -e 's/(password|secret|token)=[^ &]+/\1=***MASKED***/g'
}

# ==========================================
# Section 1: Git Commit Hash
# ==========================================
get_git_commit() {
  echo "## Git Commit Hash"
  echo ""
  echo '```'
  git log --oneline -1
  echo '```'
  echo ""
}

# ==========================================
# Section 2: Prohibited Tabs Check
# ==========================================
check_prohibited_tabs() {
  echo "## Prohibited Tabs Detection"
  echo ""
  echo "Checking for debug/vision-test/camera-test tabs in _layout.tsx..."
  echo ""

  local layout_file="apps/mobile/src/app/(tabs)/_layout.tsx"

  if [ -f "$layout_file" ]; then
    local found=$(grep -E '<Tabs\.Screen[^>]*name="(debug|vision-test|camera-test)"' "$layout_file" || true)

    if [ -z "$found" ]; then
      echo "**Status**: ✅ PASS - No prohibited tabs detected"
    else
      echo "**Status**: ❌ FAIL - Prohibited tabs found:"
      echo ""
      echo '```'
      echo "$found"
      echo '```'
    fi
  else
    echo "**Status**: ⚠️  WARNING - Layout file not found"
  fi

  echo ""
}

# ==========================================
# Section 3: Mobile JS Integrity Evidence (P2-6)
# ==========================================
check_js_integrity() {
  echo "## Mobile JS Integrity Evidence"
  echo ""
  echo "**P2-6 Runtime Integrity Check**"
  echo ""

  local expected_commit="$COMMIT_SHORT"
  local timestamp="$NOW_ISO"

  echo "**Timestamp**: $timestamp"
  echo "**Status**: ⏳ PENDING (Requires runtime execution)"
  echo ""

  echo "### Runtime Information"
  echo "- **Runtime Version**: \`exposdk:54.0.0\`"
  echo "- **Update ID**: _To be determined at runtime_"
  echo "- **Commit Hash (Runtime)**: _To be determined at runtime_"
  echo "- **Expected Commit Hash**: \`$expected_commit\` (current HEAD)"
  echo "- **Launch Mode**: _To be determined at runtime_"
  echo "- **Channel**: _To be determined at runtime_"
  echo ""

  echo "### Required Symbols Check"
  echo "- \`syncFromServer\`: _To be checked at runtime_"
  echo "- \`getAllWorkers\`: _To be checked at runtime_"
  echo "- \`getWorkerById\`: _To be checked at runtime_"
  echo ""

  echo "### Integrity Validation Rules"
  echo "1. **Commit Hash Match**: Runtime commit must match expected commit"
  echo "2. **Required Functions**: All required symbols must be type \`function\`"
  echo "3. **Update Consistency**: Update ID must correspond to the correct branch"
  echo ""

  echo "### Test Execution Command"
  echo '```bash'
  echo '# Generate runtime integrity evidence'
  echo 'adb shell am broadcast -a com.bmeconsulting.mcgate.CHECK_INTEGRITY'
  echo '# Or trigger via app startup'
  echo '```'
  echo ""

  echo "**Note**: This section requires actual app runtime execution to populate values."
  echo "CI/CD should fail if Status = FAIL after runtime check."
  echo ""
}

# ==========================================
# Section 4: EAS Update Latest Group ID
# ==========================================
get_eas_update_info() {
  echo "## EAS Update Status"
  echo ""

  if [ "${SKIP_EAS_CHECK:-0}" = "1" ]; then
    echo "**Status**: SKIPPED (SKIP_EAS_CHECK=1)"
    echo ""
    return
  fi

  if [ -z "${EXPO_TOKEN:-}" ]; then
    echo "**Status**: SKIPPED (EXPO_TOKEN not set)"
    echo ""
    return
  fi

  echo "Fetching latest EAS Update for production branch..."
  echo ""

  # Try to get latest update
  local update_output
  if update_output=$(npx eas-cli update:list --branch production --limit 1 --json 2>&1); then
    # Extract group ID if JSON output is valid
    local group_id=$(echo "$update_output" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "N/A")
    echo "**Latest Update Group ID**: \`$group_id\`"
  else
    echo "**Status**: ⚠️  WARNING - Could not fetch EAS Update info"
    echo ""
    echo "Error output (masked):"
    echo '```'
    echo "$update_output" | mask_secret
    echo '```'
  fi

  echo ""
}

# ==========================================
# Section 4: API Health Checks
# ==========================================
check_api_health() {
  echo "## API Health Checks"
  echo ""

  if [ "${SKIP_API_CHECK:-0}" = "1" ]; then
    echo "**Status**: SKIPPED (SKIP_API_CHECK=1)"
    echo ""
    return
  fi

  # Check if API is accessible
  local api_url="${API_BASE_URL:-http://192.168.1.4:7070}"

  echo "### GS API Health (\`$api_url/health\`)"
  echo ""

  local health_response
  local health_status
  if health_response=$(timeout 5 curl -s -w "\nHTTP_STATUS:%{http_code}" "$api_url/health" 2>&1); then
    health_status=$(echo "$health_response" | grep "HTTP_STATUS:" | cut -d':' -f2)
    local health_body=$(echo "$health_response" | sed '/HTTP_STATUS:/d' | head -c 200)

    echo "**Status Code**: \`$health_status\`"
    echo ""
    echo "**Response Body** (first 200 chars):"
    echo '```json'
    echo "$health_body"
    echo '```'
  else
    echo "**Status**: ❌ FAIL - Timeout or connection error"
    echo ""
    echo "Error details (masked):"
    echo '```'
    echo "$health_response" | mask_secret
    echo '```'
  fi

  echo ""
}

# ==========================================
# Section 5: Keycloak Issuer Check
# ==========================================
check_keycloak_issuer() {
  echo "## Keycloak Issuer Check"
  echo ""

  if [ "${SKIP_API_CHECK:-0}" = "1" ]; then
    echo "**Status**: SKIPPED (SKIP_API_CHECK=1)"
    echo ""
    return
  fi

  local issuer_url="${AUTH_ISSUER_URL:-http://192.168.1.4:8081/realms/mcd3}"

  echo "### Issuer URL: \`$issuer_url\`"
  echo ""

  local issuer_response
  local issuer_status
  if issuer_response=$(timeout 5 curl -s -w "\nHTTP_STATUS:%{http_code}" "$issuer_url" 2>&1); then
    issuer_status=$(echo "$issuer_response" | grep "HTTP_STATUS:" | cut -d':' -f2)

    echo "**Status Code**: \`$issuer_status\`"
  else
    echo "**Status**: ❌ FAIL - Timeout or connection error"
  fi

  echo ""

  # JWKS endpoint
  local jwks_url="$issuer_url/protocol/openid-connect/certs"
  echo "### JWKS URL: \`$jwks_url\`"
  echo ""

  local jwks_response
  local jwks_status
  if jwks_response=$(timeout 5 curl -s -w "\nHTTP_STATUS:%{http_code}" "$jwks_url" 2>&1); then
    jwks_status=$(echo "$jwks_response" | grep "HTTP_STATUS:" | cut -d':' -f2)

    echo "**Status Code**: \`$jwks_status\`"
  else
    echo "**Status**: ❌ FAIL - Timeout or connection error"
  fi

  echo ""
}

# ==========================================
# Section 6: Authorization Smoke Test
# ==========================================
run_authz_smoke() {
  echo "## Authorization Smoke Test"
  echo ""

  if [ "${SKIP_API_CHECK:-0}" = "1" ]; then
    echo "**Status**: SKIPPED (SKIP_API_CHECK=1)"
    echo ""
    return
  fi

  local smoke_script="apps/gs-api/scripts/smoke-authz.sh"

  if [ -f "$smoke_script" ]; then
    echo "Running \`$smoke_script\`..."
    echo ""
    echo '```'
    if bash "$smoke_script" 2>&1 | mask_secret; then
      echo '```'
      echo ""
      echo "**Status**: ✅ PASS"
    else
      echo '```'
      echo ""
      echo "**Status**: ⚠️  SOME CHECKS FAILED (see above)"
    fi
  else
    echo "**Status**: SKIPPED (smoke script not found)"
  fi

  echo ""
}

# ==========================================
# Main: Generate Evidence Pack
# ==========================================
generate_evidence_pack() {
  echo "# Production Evidence Pack"
  echo ""
  echo "**Generated**: $TIMESTAMP"
  echo ""
  echo "**Purpose**: Automated production health verification without screenshots or manual input."
  echo ""
  echo "**Source**: \`scripts/gen-prod-evidence.sh\`"
  echo ""
  echo "---"
  echo ""

  get_git_commit
  check_js_integrity
  check_prohibited_tabs
  get_eas_update_info
  check_api_health
  check_keycloak_issuer
  run_authz_smoke

  echo "---"
  echo ""
  echo "**Evidence Pack Generation Complete**"
  echo ""
  echo "Review the sections above to verify production health."
  echo ""
  echo "If any section shows ❌ FAIL or ⚠️  WARNING, investigate immediately."
  echo ""
  echo "For incident response procedures, see: \`docs/runbooks/production-incident-response.md\`"
}

# ==========================================
# Execute
# ==========================================
echo "🔍 Generating Production Evidence Pack..."
echo ""

generate_evidence_pack > "$OUTPUT_FILE"

echo "✅ Evidence pack generated: $OUTPUT_FILE"
echo ""
echo "Run the following to review:"
echo "  cat $OUTPUT_FILE"
