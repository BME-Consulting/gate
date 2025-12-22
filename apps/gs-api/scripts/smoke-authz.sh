#!/bin/bash
set -euo pipefail

# ==========================================
# Authorization Smoke Test (Device-Agnostic)
# ==========================================
# Purpose: Verify authorization behavior without device dependency
#
# Tests:
#   1. No Authorization header → 401
#   2. Invalid JWT token → 401
#   3. Valid JWT without roles → 403 (if applicable)
#   4. Valid JWT with roles → 200 + projects (if token available)
#
# Environment Variables (optional):
#   API_BASE_URL        - GS API base URL (default: http://192.168.1.4:7070)
#   SKIP_VALID_JWT_TEST - Set to "1" to skip tests requiring valid JWT
# ==========================================

API_BASE_URL="${API_BASE_URL:-http://192.168.1.4:7070}"
PROJECTS_ENDPOINT="$API_BASE_URL/api/me/projects"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ==========================================
# Helper: Test Result
# ==========================================
report_result() {
  local test_name="$1"
  local status="$2"
  local details="${3:-}"

  if [ "$status" = "PASS" ]; then
    echo "✅ PASS: $test_name"
    PASS_COUNT=$((PASS_COUNT + 1))
  elif [ "$status" = "FAIL" ]; then
    echo "❌ FAIL: $test_name"
    if [ -n "$details" ]; then
      echo "   Details: $details"
    fi
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo "⏭️  SKIP: $test_name"
    if [ -n "$details" ]; then
      echo "   Reason: $details"
    fi
    SKIP_COUNT=$((SKIP_COUNT + 1))
  fi
}

# ==========================================
# Test 1: No Authorization Header → 401
# ==========================================
test_no_auth_header() {
  echo ""
  echo "Test 1: No Authorization header → 401"
  echo "--------------------------------------"

  local response
  local http_code

  response=$(timeout 5 curl -s -w "\nHTTP_CODE:%{http_code}" "$PROJECTS_ENDPOINT" 2>&1 || true)
  http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d':' -f2)

  if [ "$http_code" = "401" ]; then
    report_result "No auth header → 401" "PASS"
  else
    report_result "No auth header → 401" "FAIL" "Expected 401, got $http_code"
  fi
}

# ==========================================
# Test 2: Invalid JWT → 401
# ==========================================
test_invalid_jwt() {
  echo ""
  echo "Test 2: Invalid JWT token → 401"
  echo "--------------------------------------"

  local fake_jwt="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkZha2UgVXNlciIsImlhdCI6MTUxNjIzOTAyMn0.INVALID_SIGNATURE"

  local response
  local http_code

  response=$(timeout 5 curl -s -w "\nHTTP_CODE:%{http_code}" \
    -H "Authorization: $fake_jwt" \
    "$PROJECTS_ENDPOINT" 2>&1 || true)
  http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d':' -f2)

  if [ "$http_code" = "401" ]; then
    report_result "Invalid JWT → 401" "PASS"
  else
    report_result "Invalid JWT → 401" "FAIL" "Expected 401, got $http_code"
  fi
}

# ==========================================
# Test 3: Valid JWT without roles → 403
# ==========================================
test_jwt_without_roles() {
  echo ""
  echo "Test 3: Valid JWT without roles → 403"
  echo "--------------------------------------"

  if [ "${SKIP_VALID_JWT_TEST:-0}" = "1" ]; then
    report_result "JWT without roles → 403" "SKIP" "SKIP_VALID_JWT_TEST=1"
    return
  fi

  # This test requires a valid JWT without roles, which is difficult to generate
  # in an automated script without access to Keycloak
  report_result "JWT without roles → 403" "SKIP" "Requires valid JWT (not available in CI)"
}

# ==========================================
# Test 4: Valid JWT with roles → 200
# ==========================================
test_valid_jwt_with_roles() {
  echo ""
  echo "Test 4: Valid JWT with roles → 200 + projects"
  echo "--------------------------------------"

  if [ "${SKIP_VALID_JWT_TEST:-0}" = "1" ]; then
    report_result "Valid JWT with roles → 200" "SKIP" "SKIP_VALID_JWT_TEST=1"
    return
  fi

  # This test requires a valid JWT with roles
  # Can be run manually with a real JWT token
  report_result "Valid JWT with roles → 200" "SKIP" "Requires valid JWT (not available in CI)"
}

# ==========================================
# Main
# ==========================================
echo "=========================================="
echo "Authorization Smoke Test"
echo "=========================================="
echo "API Base URL: $API_BASE_URL"
echo "Projects Endpoint: $PROJECTS_ENDPOINT"
echo ""

test_no_auth_header
test_invalid_jwt
test_jwt_without_roles
test_valid_jwt_with_roles

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "✅ PASS: $PASS_COUNT"
echo "❌ FAIL: $FAIL_COUNT"
echo "⏭️  SKIP: $SKIP_COUNT"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo "Some tests failed. Review the output above."
  exit 1
else
  echo "All executable tests passed."
  exit 0
fi
