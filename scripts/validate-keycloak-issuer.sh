#!/usr/bin/env bash
set -euo pipefail

# Keycloak Issuer SSOT Validation Script
# Ensures Keycloak issuer URLs match SSOT (no LAN IP leak)

fail() { echo "❌ $*" >&2; exit 1; }
ok()   { echo "✅ $*"; }

echo "🔒 Validating Keycloak issuer configuration..."

# SSOT: Expected issuer URL
EXPECTED_ISSUER="https://auth-gate.bme-service.monster/realms/mcd3"

# Fetch issuer from Keycloak discovery endpoint
echo "Fetching issuer from Keycloak discovery endpoint..."
ACTUAL_ISSUER=$(curl -sS https://auth-gate.bme-service.monster/realms/mcd3/.well-known/openid-configuration 2>/dev/null | jq -r '.issuer' || echo "")

if [[ -z "$ACTUAL_ISSUER" ]]; then
  fail "Failed to fetch issuer from Keycloak discovery endpoint"
fi

echo "Expected: $EXPECTED_ISSUER"
echo "Actual:   $ACTUAL_ISSUER"

# Check if issuer matches SSOT
if [[ "$ACTUAL_ISSUER" != "$EXPECTED_ISSUER" ]]; then
  fail "Issuer mismatch! Expected: $EXPECTED_ISSUER, Got: $ACTUAL_ISSUER"
fi

# Check for LAN IP leak (192.168.x.x)
if echo "$ACTUAL_ISSUER" | grep -qE '192\.168\.[0-9]+\.[0-9]+'; then
  fail "Issuer contains LAN IP address: $ACTUAL_ISSUER"
fi

# Check for HTTP (must be HTTPS)
if echo "$ACTUAL_ISSUER" | grep -q '^http://'; then
  fail "Issuer uses HTTP instead of HTTPS: $ACTUAL_ISSUER"
fi

ok "Keycloak issuer matches SSOT"

# Validate other critical endpoints
echo ""
echo "Validating OAuth endpoints..."

ENDPOINTS=$(curl -sS https://auth-gate.bme-service.monster/realms/mcd3/.well-known/openid-configuration 2>/dev/null | jq -r '.authorization_endpoint, .token_endpoint, .userinfo_endpoint' || echo "")

if [[ -z "$ENDPOINTS" ]]; then
  fail "Failed to fetch OAuth endpoints from discovery"
fi

VIOLATIONS=0

while IFS= read -r endpoint; do
  # Check for LAN IP
  if echo "$endpoint" | grep -qE '192\.168\.[0-9]+\.[0-9]+'; then
    echo "❌ Endpoint contains LAN IP: $endpoint"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Check for HTTP
  if echo "$endpoint" | grep -q '^http://'; then
    echo "❌ Endpoint uses HTTP: $endpoint"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Check for correct domain
  if ! echo "$endpoint" | grep -q 'auth-gate.bme-service.monster'; then
    echo "❌ Endpoint does not use SSOT domain: $endpoint"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done <<< "$ENDPOINTS"

if [[ $VIOLATIONS -gt 0 ]]; then
  fail "Found $VIOLATIONS OAuth endpoint violations"
fi

ok "All OAuth endpoints are valid (HTTPS + SSOT domain)"

echo "🎯 Keycloak issuer validation PASSED"
