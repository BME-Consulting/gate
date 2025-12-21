# Runbook: OAuth/Keycloak/Cloudflare Tunnel 障害対応

**目的**: DNS/Tunnel/Keycloak/Issuer 関連の障害を再現性100%で復旧する

**最終更新**: 2025-12-21
**作成者**: Claude Code (with user collaboration)

---

## 📋 サービスドメイン一覧

### Production

| サービス | ドメイン | ポート | 用途 |
|---------|---------|-------|------|
| GS API | `api-gate-prod.bme-service.monster` | 7070 | 作業員マスタ同期 |
| Face API | `face-gate-prod.bme-service.monster` | 8101 | 顔認証 |
| Auth (Keycloak) | `auth-gate-prod.bme-service.monster` | 8081 | OAuth認証 |

### Preview

| サービス | ドメイン | ポート | 用途 |
|---------|---------|-------|------|
| GS API | `api-gate.bme-service.monster` | 7070 | 作業員マスタ同期 |
| Face API | `face-gate.bme-service.monster` | 8101 | 顔認証 |
| Auth (Keycloak) | `auth-gate.bme-service.monster` | 8081 | OAuth認証 |

### Staging（将来用）

| サービス | ドメイン | ポート | 用途 |
|---------|---------|-------|------|
| GS API | `api-gate-stg.bme-service.monster` | 7070 | 作業員マスタ同期 |
| Face API | `face-gate-stg.bme-service.monster` | 8101 | 顔認証 |
| Auth (Keycloak) | `auth-gate-stg.bme-service.monster` | 8081 | OAuth認証 |

---

## 🌐 Cloudflare DNS 設定

### 手順: DNS レコード追加

1. Cloudflare Dashboard にログイン
2. ドメイン `bme-service.monster` を選択
3. **DNS > Records** に移動
4. 以下のレコードを追加：

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| CNAME | `api-gate-prod` | `<Tunnel CNAME>` | ✅ Proxied | Auto |
| CNAME | `face-gate-prod` | `<Tunnel CNAME>` | ✅ Proxied | Auto |
| CNAME | `auth-gate-prod` | `<Tunnel CNAME>` | ✅ Proxied | Auto |

**注意**: `<Tunnel CNAME>` は Cloudflare Tunnel の CNAME（例: `xxxx.cfargotunnel.com`）

### 確認コマンド

```bash
# DNS解決確認（Cloudflare DNS）
dig @1.1.1.1 auth-gate-prod.bme-service.monster +short
# 期待値: 172.67.x.x, 104.21.x.x (Cloudflare IP)

# Google DNS でも確認
dig @8.8.8.8 auth-gate-prod.bme-service.monster +short
# 期待値: 同上

# nslookup でも確認可能
nslookup auth-gate-prod.bme-service.monster 1.1.1.1
```

---

## 🚇 Cloudflare Tunnel 設定

### 手順: Public Hostname 追加

1. Cloudflare Zero Trust Dashboard にログイン
2. **Networks > Tunnels** に移動
3. 該当 Tunnel を選択
4. **Public Hostname** タブで以下を追加：

#### Production

| Public Hostname | Service |
|----------------|---------|
| `api-gate-prod.bme-service.monster` | `http://localhost:7070` |
| `face-gate-prod.bme-service.monster` | `http://localhost:8101` |
| `auth-gate-prod.bme-service.monster` | `http://localhost:8081` |

#### Preview

| Public Hostname | Service |
|----------------|---------|
| `api-gate.bme-service.monster` | `http://localhost:7070` |
| `face-gate.bme-service.monster` | `http://localhost:8101` |
| `auth-gate.bme-service.monster` | `http://localhost:8081` |

**重要ポイント**:
- Service URL は必ず `http://localhost:<port>` 形式
- Tunnel はホスト OS 上で動作しているため、Docker ネットワーク名（`keycloak:8080`）ではなく `localhost` を使用
- ポート番号は Docker port mapping の**左側**（ホスト側）を指定

### 確認コマンド

```bash
# HTTPSアクセス確認
curl -I https://auth-gate-prod.bme-service.monster/realms/mcd3

# 期待値（正常）:
# HTTP/2 200 OK (または 302/405)

# NG例:
# HTTP/2 404 → Public Hostname が未設定
# HTTP/2 502 → Service URL が間違っている or origin が停止
```

---

## 🔐 Keycloak 設定

### 設定ファイル

**ファイルパス**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/docker-compose.yml`

### 重要な環境変数

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:23.0.0
  container_name: mc-gate-keycloak
  environment:
    # ✅ 必ず Public Hostname と一致させる
    KC_HOSTNAME: auth-gate-prod.bme-service.monster

    # ✅ Cloudflare Tunnel 経由のため edge proxy 必須
    KC_PROXY: edge

    # ✅ HTTPS strict モード（本番必須）
    KC_HOSTNAME_STRICT: "true"
    KC_HOSTNAME_STRICT_HTTPS: "true"

    # その他の設定...
  ports:
    # ✅ localhost only binding（セキュリティ）
    - "127.0.0.1:8081:8080"
  command: start-dev  # 本番では start に変更推奨
```

### コンテナ再作成手順

**重要**: `KC_HOSTNAME` 等の環境変数を変更した場合は、`docker restart` ではなく**コンテナ再作成**が必要

```bash
# 1. Keycloak コンテナを停止
docker stop mc-gate-keycloak

# 2. Keycloak コンテナを削除
docker rm mc-gate-keycloak

# 3. docker-compose.yml のディレクトリに移動
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api

# 4. Keycloak コンテナを再作成
docker compose up -d keycloak

# 5. ヘルスチェック確認（約30秒待つ）
docker ps --filter "name=keycloak" --format "table {{.Names}}\t{{.Status}}"

# 期待値: healthy 状態になるまで待つ
```

### Issuer URL 確認

```bash
# Keycloak の Issuer URL を確認
curl -sS https://auth-gate-prod.bme-service.monster/realms/mcd3 | jq '{realm, "token-service"}'

# 期待値:
# {
#   "realm": "mcd3",
#   "token-service": "https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect"
# }

# ❌ NG例（KC_HOSTNAME が間違っている）:
# {
#   "token-service": "https://auth-gate.bme-service.monster/..."  # ドメインが違う！
# }
```

---

## 🔍 機械判定コマンド集

### 1. DNS 解決確認

```bash
# Cloudflare DNS で解決確認
dig @1.1.1.1 auth-gate-prod.bme-service.monster +short

# 期待値: Cloudflare IP（172.67.x.x, 104.21.x.x）
# NG: NXDOMAIN または空 → DNS レコードが存在しない
```

### 2. Cloudflare Tunnel 経由確認

```bash
# HTTPS アクセスでステータス確認
curl -I https://auth-gate-prod.bme-service.monster/realms/mcd3

# 期待値（正常系）:
# HTTP/2 200 OK
# HTTP/2 302 Found
# HTTP/2 405 Method Not Allowed（GET は許可されていない）

# NG例:
# HTTP/2 404 → Tunnel Public Hostname 未設定
# HTTP/2 502 → Service URL 間違い or origin 停止
# HTTP/2 521 → origin サーバーが応答しない
```

### 3. Keycloak Issuer 確認

```bash
# Issuer URL が正しいか確認
curl -sS https://auth-gate-prod.bme-service.monster/realms/mcd3 | jq '.["token-service"]'

# 期待値:
# "https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect"

# ドメインが KC_HOSTNAME と一致していることを確認
```

### 4. Docker コンテナ確認

```bash
# Keycloak コンテナの状態確認
docker ps --filter "name=keycloak" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 期待値:
# mc-gate-keycloak    Up (healthy)    127.0.0.1:8081->8080/tcp

# ポートマッピング確認
docker inspect mc-gate-keycloak --format='{{.HostConfig.PortBindings}}'

# 期待値: map[8080/tcp:[{127.0.0.1 8081}]]
```

### 5. ローカル接続確認

```bash
# localhost:8081 で Keycloak が応答するか確認
curl -I http://localhost:8081/realms/mcd3

# 期待値:
# HTTP/1.1 200 OK または 405 Method Not Allowed
```

---

## ⚠️ 障害の早見表

### HTTP 404 Not Found

**症状**: `curl -I https://auth-gate-prod... → HTTP/2 404`

**原因**: Cloudflare Tunnel の Public Hostname が未設定

**対処**:
1. Cloudflare Zero Trust Dashboard にアクセス
2. Tunnel の Public Hostname を確認
3. `auth-gate-prod.bme-service.monster → http://localhost:8081` を追加
4. 数分待ってから再確認

---

### HTTP 502 Bad Gateway

**症状**: `curl -I https://auth-gate-prod... → HTTP/2 502`

**原因**:
- Service URL が間違っている（例: `keycloak:8080` になっている）
- Origin サーバー（Keycloak）が起動していない
- ポート番号が間違っている

**対処**:

```bash
# 1. Keycloak が起動しているか確認
docker ps --filter "name=keycloak"

# 2. ポートマッピングを確認
docker ps --filter "name=keycloak" --format "{{.Ports}}"
# 期待値: 127.0.0.1:8081->8080/tcp

# 3. localhost:8081 が応答するか確認
curl -I http://localhost:8081/realms/mcd3

# 4. Tunnel の Service URL を確認
# → `http://localhost:8081` になっているか
# → `http://keycloak:8080` になっていたら修正

# 5. Keycloak コンテナを再起動
docker restart mc-gate-keycloak
```

---

### Issuer URL のドメインが違う

**症状**: OAuth ログイン時に "Network request failed" または issuer mismatch エラー

**原因**: `KC_HOSTNAME` が Public Hostname と一致していない

**確認**:

```bash
# 1. Keycloak Issuer を確認
curl -sS https://auth-gate-prod.bme-service.monster/realms/mcd3 | jq '.["token-service"]'

# NG例: "https://auth-gate.bme-service.monster/..."
# → KC_HOSTNAME が "auth-gate.bme-service.monster" になっている

# 2. docker-compose.yml を確認
cat apps/gs-api/docker-compose.yml | grep KC_HOSTNAME
# 期待値: KC_HOSTNAME: auth-gate-prod.bme-service.monster
```

**対処**:

```bash
# 1. docker-compose.yml を修正
vim apps/gs-api/docker-compose.yml
# KC_HOSTNAME: auth-gate-prod.bme-service.monster に変更

# 2. Keycloak コンテナを再作成（restart ではなく recreate）
docker stop mc-gate-keycloak
docker rm mc-gate-keycloak
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api
docker compose up -d keycloak

# 3. 再確認
curl -sS https://auth-gate-prod.bme-service.monster/realms/mcd3 | jq '.["token-service"]'
# 期待値: "https://auth-gate-prod.bme-service.monster/..."
```

---

### Network request failed（アプリ側）

**症状**: モバイルアプリで "Network request failed" エラー

**原因分類**（ApiError の kind で自動判定）:

| kind | 原因 | 対処 |
|------|------|------|
| `DNS_ERROR` | DNS レコードが存在しない | Cloudflare DNS 設定を確認 |
| `TLS_ERROR` | TLS/SSL 証明書エラー | Cloudflare Proxy 設定を確認 |
| `NETWORK_ERROR` | ネットワーク到達不可 | Tunnel が起動しているか確認 |
| `TIMEOUT` | サーバー応答遅延 | Origin サーバー負荷を確認 |
| `UNAUTHORIZED` | トークン期限切れ | ユーザーに再ログイン要求 |
| `FORBIDDEN` | 権限不足 | Keycloak ロール設定を確認 |
| `NOT_FOUND` | API エンドポイント不在 | アプリバージョンを確認 |
| `SERVER_ERROR` | サーバー内部エラー | Origin サーバーログを確認 |

**確認コマンド**:

```bash
# モバイルアプリのログから kind を確認
adb logcat | grep "ApiError"

# エラー種別に応じて上記の対処を実施
```

---

## 🔄 復旧フロー（完全版）

### シナリオ1: 新しい環境を追加（例: staging）

```bash
# 1. DNS レコード追加
# Cloudflare Dashboard で CNAME レコード追加
# - api-gate-stg.bme-service.monster → <Tunnel CNAME>
# - face-gate-stg.bme-service.monster → <Tunnel CNAME>
# - auth-gate-stg.bme-service.monster → <Tunnel CNAME>

# 2. Tunnel Public Hostname 追加
# Cloudflare Zero Trust で Public Hostname 追加
# - auth-gate-stg.bme-service.monster → http://localhost:8081

# 3. Keycloak 設定変更
vim apps/gs-api/docker-compose.yml
# KC_HOSTNAME: auth-gate-stg.bme-service.monster

# 4. Keycloak コンテナ再作成
docker stop mc-gate-keycloak
docker rm mc-gate-keycloak
docker compose up -d keycloak

# 5. 確認
dig @1.1.1.1 auth-gate-stg.bme-service.monster +short
curl -I https://auth-gate-stg.bme-service.monster/realms/mcd3
curl -sS https://auth-gate-stg.bme-service.monster/realms/mcd3 | jq '.["token-service"]'
```

### シナリオ2: 既存環境の復旧（障害発生時）

```bash
# 1. DNS 確認
dig @1.1.1.1 auth-gate-prod.bme-service.monster +short
# → NXDOMAIN なら Cloudflare DNS レコード追加

# 2. Tunnel 確認
curl -I https://auth-gate-prod.bme-service.monster/realms/mcd3
# → 404 なら Public Hostname 追加
# → 502 なら Service URL 修正 or Keycloak 起動確認

# 3. Keycloak 確認
docker ps --filter "name=keycloak"
# → 停止していれば起動
# → healthy でなければログ確認

# 4. Issuer 確認
curl -sS https://auth-gate-prod.bme-service.monster/realms/mcd3 | jq '.["token-service"]'
# → ドメインが違えば KC_HOSTNAME 修正 + コンテナ再作成
```

---

## 📚 参考情報

### 関連ドキュメント

- [Cloudflare Tunnel ドキュメント](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Keycloak 公式ドキュメント](https://www.keycloak.org/documentation)
- [ApiError 仕様](../api/error-classification.md)（本プロジェクト）

### 関連ファイル

- `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/docker-compose.yml` - Keycloak 設定
- `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/services/auth.ts` - OAuth クライアント
- `/volume2/Project/MCD3/TUMON/mc-gate/packages/api-client/src/client.ts` - ApiError 定義

### 過去の障害事例

- **2025-12-20**: auth-gate-prod DNS レコード不在 → 追加で解決
- **2025-12-20**: Tunnel Service URL が `keycloak:8080` → `localhost:8081` に修正
- **2025-12-20**: KC_HOSTNAME が `auth-gate` → `auth-gate-prod` に修正

---

## ✅ チェックリスト（復旧完了判定）

- [ ] DNS 解決成功（dig コマンドで確認）
- [ ] Tunnel 経由で HTTPS アクセス成功（200/302/405）
- [ ] Keycloak Issuer URL のドメインが正しい
- [ ] Docker コンテナが healthy 状態
- [ ] モバイルアプリでログイン成功

**すべて ✅ なら復旧完了**

---

**最終更新**: 2025-12-21
**メンテナ**: DevOps Team
