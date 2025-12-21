# JWT検証の実装ガイド

## 概要

GS API は OAuth 2.0 Bearer トークン認証を実装しており、Keycloak からの JWT を検証します。

## 実装フェーズ

### Step C-1: JWT基本検証（署名検証なし）✅

最低限の形式チェックで「ただの文字列トークン」事故を防ぐ。

**チェック項目**:
- ✅ Authorization ヘッダーの有無
- ✅ Bearer 形式
- ✅ JWT 形式（3パート: header.payload.signature）
- ✅ issuer (iss) クレーム検証
- ✅ 有効期限 (exp) クレーム検証

**ライブラリ**: `jsonwebtoken` (decode のみ)

### Step C-2: JWKS署名検証（RS256）✅

Keycloak の公開鍵で署名を検証し、改ざん耐性を実現。

**チェック項目**:
- ✅ RS256 署名検証
- ✅ issuer (iss) クレーム検証
- ✅ audience (aud) クレーム検証
- ✅ 有効期限 (exp) / 使用開始時刻 (nbf) 検証

**ライブラリ**: `jose`

**JWKS キャッシュ**: `jose` が内部で自動処理（レート制御あり）

## 環境変数

### 必須設定

```bash
# OAuth 2.0 / Keycloak JWT Settings
AUTH_ISSUER=https://auth-gate-prod.bme-service.monster/realms/mcd3
AUTH_AUDIENCE=mc-gate
AUTH_JWKS_URL=https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect/certs
```

### 開発モード

```bash
# モック認証（JWT検証スキップ）
MOCK_AUTH=true
```

### 本番モード

```bash
# JWKS署名検証（RS256）
MOCK_AUTH=false
```

## Audience (aud) の確認方法

### 問題: audience 不一致で 401 エラー

Keycloak の client 設定によって、JWT の `aud` クレームが異なる場合があります。

**よくあるパターン**:
- `mc-gate` (Client ID)
- `account` (Keycloak デフォルト)
- `azp` クレームに Client ID が入る場合もある

### 確認手順

#### 1. Keycloak から実際の JWT を取得

```bash
curl -X POST https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect/token \
  -d 'grant_type=password' \
  -d 'client_id=mc-gate' \
  -d 'username=YOUR_USERNAME' \
  -d 'password=YOUR_PASSWORD' \
  | jq -r '.access_token'
```

#### 2. JWT をデコードして aud を確認

https://jwt.io/ にアクセスし、JWT を貼り付けてデコード。

または:

```bash
# JWT の payload をデコード（Base64）
echo "<JWT>" | cut -d. -f2 | base64 -d | jq '.aud'
```

**例**:
```json
{
  "aud": ["account", "mc-gate"],
  "azp": "mc-gate"
}
```

#### 3. AUTH_AUDIENCE を修正

`.env` の `AUTH_AUDIENCE` を実際の `aud` に合わせる:

```bash
# aud が ["account", "mc-gate"] の場合
AUTH_AUDIENCE=mc-gate

# aud が ["account"] のみの場合
AUTH_AUDIENCE=account
```

**注意**: `jose` の `audience` オプションは配列の一部でもマッチします。

### Keycloak 設定の修正（推奨）

audience を GS API 専用にするには、Keycloak で Client Scope を設定:

1. Keycloak Admin Console → Clients → `mc-gate`
2. Client Scopes タブ → Dedicated scope を開く
3. Mappers → Add mapper → Audience
4. Name: `mc-gate-audience`
5. Included Client Audience: `mc-gate`
6. Add to access token: ON

これで JWT の `aud` に `mc-gate` が確実に含まれます。

## トラブルシューティング

### 401 エラー: "Invalid token"

**原因**:
- 署名検証失敗
- issuer 不一致
- audience 不一致
- 有効期限切れ

**確認**:
1. サーバーログを確認: `[OAuth Middleware] JWT verification failed: <詳細>`
2. JWT をデコードして iss / aud / exp を確認
3. JWKS URL が正しいか確認

### 500 エラー: "JWKS endpoint not configured"

**原因**: MOCK_AUTH=false だが JWKS URL が設定されていない

**修正**: `.env` に `AUTH_JWKS_URL` を追加

### JWKS 取得エラー

**原因**: JWKS URL が間違っている、またはネットワークエラー

**確認**:
```bash
curl https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect/certs
```

**期待される結果**:
```json
{
  "keys": [
    {
      "kid": "...",
      "kty": "RSA",
      "alg": "RS256",
      ...
    }
  ]
}
```

## テスト

### 自動テスト

```bash
./apps/gs-api/scripts/test-jwt-c2.sh
```

### 手動テスト（本番 JWT）

1. Keycloak から JWT を取得
2. `.env` で `MOCK_AUTH=false` に設定
3. サーバー再起動
4. テスト:

```bash
# 正しい JWT → 200 OK
curl -H "Authorization: Bearer <REAL_JWT>" http://192.168.1.4:7070/api/me/projects

# 偽の JWT → 401 UNAUTHORIZED
curl -H "Authorization: Bearer fake.jwt.token" http://192.168.1.4:7070/api/me/projects
```

## 本番デプロイ前チェックリスト

- [ ] `MOCK_AUTH=false` に設定
- [ ] `AUTH_ISSUER` が本番 Keycloak を指している
- [ ] `AUTH_AUDIENCE` が正しい（JWT の `aud` と一致）
- [ ] `AUTH_JWKS_URL` が正しい
- [ ] 実際の JWT でテスト成功
- [ ] 偽の JWT で 401 エラー確認
- [ ] 有効期限切れ JWT で 401 エラー確認

## 参考

- [jose ライブラリ](https://github.com/panva/jose)
- [Keycloak Token Endpoint](https://www.keycloak.org/docs/latest/securing_apps/#token-endpoint)
- [JWT.io デバッガ](https://jwt.io/)
