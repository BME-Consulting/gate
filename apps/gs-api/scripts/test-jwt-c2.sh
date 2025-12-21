#!/bin/bash

# ==========================================
# Step C-2: JWKS署名検証テスト
# ==========================================

API_URL="http://192.168.1.4:7070/api/me/projects"

echo ""
echo "=========================================="
echo "🧪 Step C-2: JWKS Signature Verification Tests"
echo "=========================================="
echo ""

# Test 1: MOCK_AUTH=true（既存動作）
echo "Test 1: MOCK_AUTH=true - existing behavior"
RESPONSE=$(curl -s -H "Authorization: Bearer dev-token-12345" "$API_URL" | jq -r '.projects | length')
if [ "$RESPONSE" = "2" ]; then
  echo "✅ PASS: Returns 2 projects with MOCK_AUTH=true"
else
  echo "❌ FAIL: Expected 2 projects, got $RESPONSE"
fi
echo ""

# Test 2: 偽トークン（署名検証なし - MOCK_AUTH=true）
echo "Test 2: Invalid token with MOCK_AUTH=true"
echo "Note: MOCK_AUTH=true では形式チェックをスキップするため 200 が返る"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -H "Authorization: Bearer fake.token.here" "$API_URL" | tail -1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ PASS: MOCK_AUTH=true skips validation, returns 200"
else
  echo "⚠️  INFO: Got $HTTP_CODE (expected 200 with MOCK_AUTH=true)"
fi
echo ""

# Test 3: Authorization ヘッダーなし
echo "Test 3: Missing Authorization header"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_URL" | tail -1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ PASS: Returns 401"
else
  echo "❌ FAIL: Expected 401, got $HTTP_CODE"
fi
echo ""

# Test 4: Bearer 形式でない
echo "Test 4: Invalid authorization header format"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -H "Authorization: InvalidFormat" "$API_URL" | tail -1)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
if [ "$HTTP_CODE" = "401" ]; then
  echo "✅ PASS: Returns 401"
else
  echo "❌ FAIL: Expected 401, got $HTTP_CODE"
fi
echo ""

echo "=========================================="
echo "📋 Manual Verification Required"
echo "=========================================="
echo ""
echo "To test JWKS signature verification (MOCK_AUTH=false):"
echo ""
echo "1. Get a real JWT from Keycloak:"
echo "   curl -X POST https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect/token \\"
echo "     -d 'grant_type=password' \\"
echo "     -d 'client_id=mc-gate' \\"
echo "     -d 'username=YOUR_USERNAME' \\"
echo "     -d 'password=YOUR_PASSWORD'"
echo ""
echo "2. Set MOCK_AUTH=false in .env"
echo ""
echo "3. Restart the server"
echo ""
echo "4. Test with real JWT:"
echo "   curl -H 'Authorization: Bearer <REAL_JWT>' $API_URL"
echo ""
echo "5. Test with fake JWT (should fail with 401):"
echo "   curl -H 'Authorization: Bearer fake.jwt.token' $API_URL"
echo ""
echo "Expected Results:"
echo "  - Real JWT with valid signature → 200 OK"
echo "  - Fake JWT → 401 UNAUTHORIZED"
echo "  - Expired JWT → 401 UNAUTHORIZED"
echo "  - Wrong issuer → 401 UNAUTHORIZED"
echo ""
