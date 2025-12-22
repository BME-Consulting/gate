#!/bin/bash

# OAuth 認証・認可の統合テスト
# - Test 1: 正常なJWT（roles有り）→ 200
# - Test 2: 偽JWT → 401
# - Test 3: Bearer無し → 401
# - Test 4: roles無しユーザー → 403
# - Test 5: audience不一致 → 401

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/jwt-utils.sh"

# API URL（環境変数で上書き可能）
API_URL="${API_URL:-http://192.168.1.4:7070/api/me/projects}"

# テスト結果カウント
PASSED=0
FAILED=0

# ユーザー資格情報（CI Secrets から設定可能）
KC_USERNAME="${KC_USERNAME:-admin}"
KC_PASSWORD="${KC_PASSWORD:-admin}"
KC_TEST_USERNAME="${KC_TEST_USERNAME:-testuser}"
KC_TEST_PASSWORD="${KC_TEST_PASSWORD:-test123}"

echo "=========================================="
echo "OAuth 認証・認可 統合テスト"
echo "=========================================="
echo ""
echo "API URL: $API_URL"
echo "KC_TOKEN_URL: $KC_TOKEN_URL"
echo "KC_CLIENT_ID: $KC_CLIENT_ID"
echo ""

# Test 1: 正常なJWT（roles有り）→ 200
echo "📝 Test 1: 正常なJWT（roles有り）→ 200"
echo "----------------------------------------"

JWT=$(get_jwt_for_user "$KC_USERNAME" "$KC_PASSWORD")
if [ $? -ne 0 ]; then
  echo "❌ Test 1 FAILED: Failed to get JWT"
  FAILED=$((FAILED + 1))
else
  echo "✅ JWT obtained"

  RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -H "Authorization: Bearer $JWT" \
    "$API_URL")

  HTTP_CODE=$(echo "$RESULT" | grep "HTTP_CODE:" | cut -d: -f2)
  BODY=$(echo "$RESULT" | sed '/HTTP_CODE:/d')

  if [ "$HTTP_CODE" = "200" ]; then
    PROJECT_COUNT=$(echo "$BODY" | jq '.projects | length')
    echo "✅ Test 1 PASSED: HTTP 200, projects count = $PROJECT_COUNT"
    PASSED=$((PASSED + 1))
  else
    echo "❌ Test 1 FAILED: Expected 200, got $HTTP_CODE"
    echo "$BODY" | jq '.'
    FAILED=$((FAILED + 1))
  fi
fi
echo ""

# Test 2: 偽JWT → 401
echo "📝 Test 2: 偽JWT → 401"
echo "----------------------------------------"

RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer fake-token-12345" \
  "$API_URL")

HTTP_CODE=$(echo "$RESULT" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Test 2 PASSED: HTTP 401 (偽JWTを拒否)"
  PASSED=$((PASSED + 1))
else
  echo "❌ Test 2 FAILED: Expected 401, got $HTTP_CODE"
  FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Bearer無し → 401
echo "📝 Test 3: Bearer無し → 401"
echo "----------------------------------------"

RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_URL")

HTTP_CODE=$(echo "$RESULT" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Test 3 PASSED: HTTP 401 (Bearer無しを拒否)"
  PASSED=$((PASSED + 1))
else
  echo "❌ Test 3 FAILED: Expected 401, got $HTTP_CODE"
  FAILED=$((FAILED + 1))
fi
echo ""

# Test 4: roles無しユーザー → 403
echo "📝 Test 4: roles無しユーザー → 403"
echo "----------------------------------------"

# testuser の JWT を取得（roles無し想定）
JWT=$(get_jwt_for_user "$KC_TEST_USERNAME" "$KC_TEST_PASSWORD" 2>/dev/null || echo "")

if [ -z "$JWT" ]; then
  echo "⚠️  testuser does not exist or login failed"
  echo "   Skipping Test 4"
else
  RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -H "Authorization: Bearer $JWT" \
    "$API_URL")

  HTTP_CODE=$(echo "$RESULT" | grep "HTTP_CODE:" | cut -d: -f2)
  BODY=$(echo "$RESULT" | sed '/HTTP_CODE:/d')

  if [ "$HTTP_CODE" = "403" ]; then
    ERROR_CODE=$(echo "$BODY" | jq -r '.error')
    if [ "$ERROR_CODE" = "FORBIDDEN" ]; then
      echo "✅ Test 4 PASSED: HTTP 403 FORBIDDEN (roles無しユーザーを拒否)"
      PASSED=$((PASSED + 1))
    else
      echo "❌ Test 4 FAILED: HTTP 403 but error code is not FORBIDDEN"
      FAILED=$((FAILED + 1))
    fi
  else
    echo "❌ Test 4 FAILED: Expected 403, got $HTTP_CODE"
    FAILED=$((FAILED + 1))
  fi
fi
echo ""

# Test 5: audience不一致 → 401
echo "📝 Test 5: audience不一致（master realmトークン）→ 401"
echo "----------------------------------------"

# master realm の admin token（aud が異なる）
ADMIN_TOKEN=$(get_admin_token)
if [ $? -ne 0 ]; then
  echo "⚠️  Failed to get admin token, skipping Test 5"
else
  PAYLOAD=$(decode_jwt_payload "$ADMIN_TOKEN")
  AUD=$(echo "$PAYLOAD" | jq -r '.aud')
  ISSUER=$(echo "$PAYLOAD" | jq -r '.iss')
  echo "aud: $AUD"
  echo "iss: $ISSUER"
  echo ""

  RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API_URL")

  HTTP_CODE=$(echo "$RESULT" | grep "HTTP_CODE:" | cut -d: -f2)

  if [ "$HTTP_CODE" = "401" ]; then
    echo "✅ Test 5 PASSED: HTTP 401 (別issuerのトークンを拒否)"
    PASSED=$((PASSED + 1))
  else
    echo "❌ Test 5 FAILED: Expected 401, got $HTTP_CODE"
    FAILED=$((FAILED + 1))
  fi
fi
echo ""

# 結果サマリー
echo "=========================================="
echo "テスト結果"
echo "=========================================="
echo "✅ PASSED: $PASSED"
echo "❌ FAILED: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "🎉 All tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
