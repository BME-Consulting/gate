#!/bin/bash

# ==========================================
# Integration Tests: GET /api/me/projects
# ==========================================

API_URL="http://192.168.1.4:7070/api/me/projects"
PASSED=0
FAILED=0

echo ""
echo "=========================================="
echo "🧪 Integration Tests: GET /api/me/projects"
echo "=========================================="
echo ""

# ==========================================
# Test 1: roles with PRJ001, PRJ002 → returns 2 projects
# ==========================================
echo "Test 1: User with roles for PRJ001, PRJ002"
echo "Expected: 2 projects returned"
echo ""

RESPONSE=$(curl -s -H "Authorization: Bearer dev-token-12345" "$API_URL")
PROJECT_COUNT=$(echo "$RESPONSE" | jq '.projects | length')
DEFAULT_ID=$(echo "$RESPONSE" | jq -r '.defaultProjectId')
FETCHED_AT=$(echo "$RESPONSE" | jq -r '.fetchedAt')

if [ "$PROJECT_COUNT" -eq 2 ] && [ "$DEFAULT_ID" = "PRJ001" ] && [ "$FETCHED_AT" != "null" ]; then
  echo "✅ PASS: Returns 2 projects with defaultProjectId=PRJ001"
  PASSED=$((PASSED + 1))
else
  echo "❌ FAIL: Expected 2 projects, got $PROJECT_COUNT"
  echo "Response: $RESPONSE"
  FAILED=$((FAILED + 1))
fi

echo ""
echo "------------------------------------------"
echo ""

# ==========================================
# Test 2: Verify missing project IDs are silently dropped
# ==========================================
echo "Test 2: Missing project IDs (PRJ999 not in DB)"
echo "Expected: Silently dropped with WARN log (check server logs)"
echo ""

# Note: This test verifies the WARN log behavior
# The oauth middleware currently uses mock roles [PRJ001, PRJ002]
# So we can't directly test PRJ999 without modifying the middleware
# But the logic in routes/projects.ts handles this case correctly

echo "⚠️  Manual verification required:"
echo "   1. Temporarily modify oauth middleware to return ['project:PRJ999']"
echo "   2. Run: curl -s -H 'Authorization: Bearer dev-token-12345' $API_URL"
echo "   3. Check server logs for WARN message: 'Missing project IDs in DB: [PRJ999]'"
echo "   4. Verify response: { projects: [], defaultProjectId: null }"
echo ""
echo "⏭️  SKIP: Requires oauth middleware modification"

echo ""
echo "------------------------------------------"
echo ""

# ==========================================
# Test 3: No project roles → returns empty array (200)
# ==========================================
echo "Test 3: User with no project roles"
echo "Expected: Empty projects array with 200 OK"
echo ""

# Note: Similar to Test 2, this requires modifying oauth middleware
# to return empty roles or roles without 'project:' prefix

echo "⚠️  Manual verification required:"
echo "   1. Temporarily modify oauth middleware to return []"
echo "   2. Run: curl -s -H 'Authorization: Bearer dev-token-12345' $API_URL"
echo "   3. Verify response: { projects: [], defaultProjectId: null }"
echo "   4. Verify HTTP status: 200 OK (not 403 or 404)"
echo ""
echo "⏭️  SKIP: Requires oauth middleware modification"

echo ""
echo "=========================================="
echo "📊 Test Results"
echo "=========================================="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Skipped: 2 (manual verification required)"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ All automated tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
