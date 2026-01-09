#!/bin/bash

# JWT 取得の共通関数
# 使用例:
#   source scripts/lib/jwt-utils.sh
#   JWT=$(get_jwt_for_user "admin" "admin")

# 環境変数（CI Secrets から設定可能）
KC_TOKEN_URL="${KC_TOKEN_URL:-https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect/token}"
KC_CLIENT_ID="${KC_CLIENT_ID:-mc-gate-mobile}"

# ユーザー認証でJWTを取得
# $1: username
# $2: password
# 戻り値: JWT（標準出力）
get_jwt_for_user() {
  local username="$1"
  local password="$2"

  if [ -z "$username" ] || [ -z "$password" ]; then
    echo "Error: username and password required" >&2
    return 1
  fi

  # CIでsecretが無い / 環境変数が無い場合はスキップ（失敗扱いにしない）
  if [ -z "${KC_TOKEN_URL:-}" ] || [ -z "${KC_CLIENT_ID:-}" ]; then
    echo "SKIP: KC_TOKEN_URL or KC_CLIENT_ID not set" >&2
    echo ""
    return 0
  fi

  local resp
  resp=$(curl -sS -X POST \
    "$KC_TOKEN_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=$KC_CLIENT_ID" \
    -d "username=$username" \
    -d "password=$password")

  # JSONか確認（jqが死ぬ前に）
  if ! echo "$resp" | jq -e . >/dev/null 2>&1; then
    echo "Error: Token endpoint did not return JSON" >&2
    echo "Response: $resp" >&2
    return 1
  fi

  local jwt
  jwt=$(echo "$resp" | jq -r '.access_token // empty')

  # 空なら失敗（ここはちゃんと落とす）
  if [ -z "$jwt" ]; then
    echo "Error: access_token missing in response" >&2
    echo "$resp" | jq . >&2
    return 1
  fi

  echo "$jwt"
}

# Admin token を取得（master realm）
# 戻り値: Admin token（標準出力）
get_admin_token() {
  local admin_username="${KC_ADMIN_USERNAME:-admin}"
  local admin_password="${KC_ADMIN_PASSWORD:-admin}"

  local resp
  resp=$(curl -sS -X POST \
    "https://auth-gate-prod.bme-service.monster/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=$admin_username" \
    -d "password=$admin_password")

  # JSON検証
  if ! echo "$resp" | jq -e . >/dev/null 2>&1; then
    echo "Error: Admin token endpoint did not return JSON" >&2
    echo "Response: $resp" >&2
    return 1
  fi

  local token
  token=$(echo "$resp" | jq -r '.access_token // empty')

  if [ -z "$token" ]; then
    echo "Error: access_token missing in admin token response" >&2
    echo "$resp" | jq . >&2
    return 1
  fi

  echo "$token"
}

# JWTのpayloadをデコード
# $1: JWT
# 戻り値: JSON payload（標準出力）
decode_jwt_payload() {
  local jwt="$1"

  if [ -z "$jwt" ]; then
    echo "Error: JWT required" >&2
    return 1
  fi

  local payload
  payload=$(echo "$jwt" | cut -d. -f2)

  # Base64デコード（padding追加）
  local padding_len=$((4 - ${#payload} % 4))
  if [ $padding_len -ne 4 ]; then
    payload="${payload}$(printf '=%.0s' $(seq 1 $padding_len))"
  fi

  echo "$payload" | base64 -d 2>/dev/null
}
