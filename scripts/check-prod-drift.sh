#!/bin/bash
set -euo pipefail

# ==========================================
# Production Drift Detection
# ==========================================
# Purpose: Detect unauthorized changes to frozen production components
#
# Frozen Targets:
#   1. Evidence Pack structure (scripts/gen-prod-evidence.sh)
#   2. Prohibited tabs detection (_layout.tsx)
#   3. AUTH_AUDIENCE / MOCK_AUTH configuration
#   4. OAuth middleware files
#
# Exit Code:
#   0 - No drift detected
#   1 - Drift detected (Production Freeze violation)
# ==========================================

DRIFT_DETECTED=0
VIOLATIONS=()

echo "=========================================="
echo "Production Drift Detection"
echo "=========================================="
echo ""

# ==========================================
# Check 1: Evidence Pack Structure
# ==========================================
echo "🔍 Checking Evidence Pack structure..."

EVIDENCE_SCRIPT="scripts/gen-prod-evidence.sh"

if git diff --exit-code HEAD~1 HEAD -- "$EVIDENCE_SCRIPT" > /dev/null 2>&1; then
  echo "✅ Evidence Pack structure: No changes"
else
  # Check if changes remove critical sections
  DIFF_OUTPUT=$(git diff HEAD~1 HEAD -- "$EVIDENCE_SCRIPT" || true)

  # Check for removal of secret masking
  if echo "$DIFF_OUTPUT" | grep -q "^-.*mask_secret"; then
    echo "❌ VIOLATION: Secret masking function removed"
    VIOLATIONS+=("Evidence Pack: Secret masking removed")
    DRIFT_DETECTED=1
  fi

  # Check for removal of evidence collection sections
  if echo "$DIFF_OUTPUT" | grep -qE "^-.*## (Git Commit Hash|Prohibited Tabs|EAS Update|API Health|Keycloak|Authorization)"; then
    echo "❌ VIOLATION: Evidence collection section removed"
    VIOLATIONS+=("Evidence Pack: Collection section removed")
    DRIFT_DETECTED=1
  fi

  if [ $DRIFT_DETECTED -eq 0 ]; then
    echo "✅ Evidence Pack structure: Changes appear safe"
  fi
fi

# ==========================================
# Check 2: Prohibited Tabs Configuration
# ==========================================
echo "🔍 Checking prohibited tabs configuration..."

LAYOUT_FILE="apps/mobile/src/app/(tabs)/_layout.tsx"

# Check if prohibited tabs have been added
PROHIBITED_TABS=$(grep -E '<Tabs\.Screen[^>]*name="(debug|vision-test|camera-test)"' "$LAYOUT_FILE" || true)

if [ -n "$PROHIBITED_TABS" ]; then
  echo "❌ VIOLATION: Prohibited tabs detected in _layout.tsx"
  echo "$PROHIBITED_TABS"
  VIOLATIONS+=("UI Security: Prohibited tabs (debug/vision-test/camera-test) found")
  DRIFT_DETECTED=1
else
  echo "✅ Prohibited tabs: None detected"
fi

# ==========================================
# Check 3: AUTH_AUDIENCE / MOCK_AUTH
# ==========================================
echo "🔍 Checking AUTH_AUDIENCE and MOCK_AUTH configuration..."

ENV_PROD_FILE="apps/mobile/.env.production"

if [ -f "$ENV_PROD_FILE" ]; then
  # Check if file was modified
  if ! git diff --exit-code HEAD~1 HEAD -- "$ENV_PROD_FILE" > /dev/null 2>&1; then
    DIFF_OUTPUT=$(git diff HEAD~1 HEAD -- "$ENV_PROD_FILE" || true)

    # Check for AUTH_AUDIENCE changes
    if echo "$DIFF_OUTPUT" | grep -q "AUTH_AUDIENCE"; then
      echo "❌ VIOLATION: AUTH_AUDIENCE modified in .env.production"
      VIOLATIONS+=("OAuth Config: AUTH_AUDIENCE changed")
      DRIFT_DETECTED=1
    fi

    # Check for MOCK_AUTH changes
    if echo "$DIFF_OUTPUT" | grep -q "MOCK_AUTH"; then
      echo "❌ VIOLATION: MOCK_AUTH modified in .env.production"
      VIOLATIONS+=("OAuth Config: MOCK_AUTH changed")
      DRIFT_DETECTED=1
    fi
  fi
fi

# Check app.config.js for MOCK_AUTH enforcement
APP_CONFIG="apps/mobile/app.config.js"

if ! git diff --exit-code HEAD~1 HEAD -- "$APP_CONFIG" > /dev/null 2>&1; then
  DIFF_OUTPUT=$(git diff HEAD~1 HEAD -- "$APP_CONFIG" || true)

  # Check if useMockAuth enforcement was removed
  if echo "$DIFF_OUTPUT" | grep -q "^-.*useMockAuth.*false"; then
    echo "❌ VIOLATION: useMockAuth enforcement removed in app.config.js"
    VIOLATIONS+=("OAuth Config: useMockAuth enforcement removed")
    DRIFT_DETECTED=1
  fi
fi

if [ $DRIFT_DETECTED -eq 0 ] || [ ${#VIOLATIONS[@]} -eq 0 ]; then
  echo "✅ AUTH_AUDIENCE / MOCK_AUTH: No violations"
fi

# ==========================================
# Check 4: OAuth Middleware Files
# ==========================================
echo "🔍 Checking OAuth middleware files..."

OAUTH_FILES=(
  "apps/mobile/src/services/auth.ts"
  "apps/mobile/src/services/tokenManager.ts"
  "apps/mobile/src/store/appStore.ts"
  "apps/mobile/src/hooks/useWorkers.ts"
)

OAUTH_MODIFIED=0

for file in "${OAUTH_FILES[@]}"; do
  if [ -f "$file" ]; then
    if ! git diff --exit-code HEAD~1 HEAD -- "$file" > /dev/null 2>&1; then
      DIFF_OUTPUT=$(git diff HEAD~1 HEAD -- "$file" || true)

      # Check for removal of Authorization header
      if echo "$DIFF_OUTPUT" | grep -q "^-.*Authorization.*Bearer"; then
        echo "❌ VIOLATION: Authorization header removed in $file"
        VIOLATIONS+=("OAuth Middleware: Authorization header removed in $file")
        DRIFT_DETECTED=1
        OAUTH_MODIFIED=1
      fi

      # Check for removal of logout on 401/403
      if echo "$DIFF_OUTPUT" | grep -qE "^-.*logout.*401|^-.*logout.*403"; then
        echo "❌ VIOLATION: Auto-logout on 401/403 removed in $file"
        VIOLATIONS+=("OAuth Middleware: Auto-logout removed in $file")
        DRIFT_DETECTED=1
        OAUTH_MODIFIED=1
      fi
    fi
  fi
done

if [ $OAUTH_MODIFIED -eq 0 ]; then
  echo "✅ OAuth middleware: No violations"
fi

# ==========================================
# Check 5: CI Security Checks
# ==========================================
echo "🔍 Checking CI security checks..."

CI_FILE=".github/workflows/ci.yml"

if ! git diff --exit-code HEAD~1 HEAD -- "$CI_FILE" > /dev/null 2>&1; then
  DIFF_OUTPUT=$(git diff HEAD~1 HEAD -- "$CI_FILE" || true)

  # Check for removal of prohibited tabs check
  if echo "$DIFF_OUTPUT" | grep -q "^-.*Security Check - Prohibited Debug Tabs"; then
    echo "❌ VIOLATION: Prohibited tabs CI check removed"
    VIOLATIONS+=("CI Security: Prohibited tabs check removed")
    DRIFT_DETECTED=1
  fi

  # Check for removal of API authorization check
  if echo "$DIFF_OUTPUT" | grep -q "^-.*Security Check - API Authorization"; then
    echo "❌ VIOLATION: API authorization CI check removed"
    VIOLATIONS+=("CI Security: API authorization check removed")
    DRIFT_DETECTED=1
  fi

  # Check for removal of production-evidence job
  if echo "$DIFF_OUTPUT" | grep -q "^-.*production-evidence:"; then
    echo "❌ VIOLATION: production-evidence job removed"
    VIOLATIONS+=("CI Security: production-evidence job removed")
    DRIFT_DETECTED=1
  fi
fi

if [ ${#VIOLATIONS[@]} -eq 0 ] || [ $DRIFT_DETECTED -eq 0 ]; then
  echo "✅ CI security checks: No violations"
fi

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "Drift Detection Summary"
echo "=========================================="

if [ $DRIFT_DETECTED -eq 0 ]; then
  echo "✅ No production freeze violations detected"
  echo ""
  exit 0
else
  echo "❌ PRODUCTION FREEZE VIOLATION DETECTED"
  echo ""
  echo "The following frozen components have been modified:"
  for violation in "${VIOLATIONS[@]}"; do
    echo "  - $violation"
  done
  echo ""
  echo "Production Freeze は変更禁止です。"
  echo "詳細: docs/PRODUCTION_FREEZE.md"
  echo ""
  echo "To resolve:"
  echo "1. 変更を revert する"
  echo "2. または Freeze 解除手順に従う (docs/PRODUCTION_FREEZE.md#freeze-解除手順)"
  echo ""
  exit 1
fi
