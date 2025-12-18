#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LAYOUT="$ROOT/apps/mobile/src/app/(tabs)/_layout.tsx"
SETTINGS="$ROOT/apps/mobile/src/app/(tabs)/settings.tsx"

fail() { echo "❌ $*" >&2; exit 1; }
ok()   { echo "✅ $*"; }

[[ -f "$LAYOUT"   ]] || fail "Missing: $LAYOUT"
[[ -f "$SETTINGS" ]] || fail "Missing: $SETTINGS"

echo "🔒 Validating production UI guards..."

# -------------------------
# A) Debug / vision-test tabs must be guarded by non-production condition
# -------------------------

# 1) If debug/vision-test appear in layout, they MUST be inside a non-production guard.
# We check:
#  - file contains debug-related route/screen text
#  - and also contains a guard token like "!isProduction" or "appEnv !== 'production'"
# NOTE: allow flexible implementations; just require at least one strong guard.
LAYOUT_HAS_DEBUG=$(
  grep -nE "(debug|vision-test|vision_test|visiontest)" "$LAYOUT" >/dev/null && echo "yes" || echo "no"
)

if [[ "$LAYOUT_HAS_DEBUG" == "yes" ]]; then
  grep -nE "(!isProduction|appEnv\s*!==\s*['\"]production['\"]|APP_ENV\s*!==\s*['\"]production['\"])" "$LAYOUT" >/dev/null \
    || fail "Debug/Vision-test found in _layout.tsx but no non-production guard detected"
  ok "A) Debug/Vision-test tabs are present and guarded"
else
  # If not present at all, it's also fine (even stricter).
  ok "A) Debug/Vision-test tabs not present in _layout.tsx (strict OK)"
fi

# Extra safety: forbid explicit routes in production by ensuring no unconditional Tab.Screen for debug.
# This is a heuristic: if Tab.Screen exists with name/href containing debug without any guard nearby, fail.
# (Lightweight: require at least one guard token anywhere if debug tokens exist.)
# Already covered above.

# -------------------------
# B) Internal URLs must NOT be visible in production settings UI
# -------------------------
SETTINGS_HAS_INTERNAL=$(
  grep -nE "(Face API URL|GS API URL|Auth Issuer|authIssuer|AUTH_ISSUER|api-gate\.|face-gate\.|auth-gate\.)" "$SETTINGS" >/dev/null && echo "yes" || echo "no"
)

if [[ "$SETTINGS_HAS_INTERNAL" == "yes" ]]; then
  # More flexible guard detection: check for !== "production" pattern or !isProduction
  grep -nE "(!==\s*['\"]production['\"]|===\s*['\"]development['\"]|!isProduction)" "$SETTINGS" >/dev/null \
    || fail "Internal config labels/values found in settings.tsx but no production-hide guard detected"
  ok "B) Internal config is guarded (hidden in production)"
else
  ok "B) No internal config strings detected in settings.tsx (strict OK)"
fi

echo "🎯 Production UI guard checks PASSED"
