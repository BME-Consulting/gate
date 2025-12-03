# Cloudflare 外部公開設定ガイド - mc-gate プロジェクト

## 📋 目次

1. [プロジェクト構成概要](#プロジェクト構成概要)
2. [DNS設定](#dns設定)
3. [Cloudflare Tunnel設定](#cloudflare-tunnel設定)
4. [SSL/TLS設定](#ssltls設定)
5. [プロキシとロードバランシング](#プロキシとロードバランシング)
6. [セキュリティ設定](#セキュリティ設定)
7. [実装手順](#実装手順)
8. [トラブルシューティング](#トラブルシューティング)

---

## プロジェクト構成概要

### 現在のサービス構成

mc-gate プロジェクトは以下のサービスで構成されています：

| サービス名 | 内部ポート | 用途 | 公開の必要性 |
|-----------|-----------|------|------------|
| **GS API** | 7070 | メインAPI (PostgreSQL/Redis/Keycloak連携) | ✅ 必須 |
| **Face API** | 8100 | 顔認証API (Python FastAPI) | ✅ 必須 |
| **Keycloak** | 8080/8081 | 認証サーバー (OAuth 2.0) | ✅ 必須 |
| **PostgreSQL** | 5432/5435 | データベース | ❌ 内部のみ |
| **Redis** | 6379/6380 | キャッシュ | ❌ 内部のみ |
| **Keycloak DB** | 5432 | Keycloak用DB | ❌ 内部のみ |

### 現在のローカル設定

- **ホストIP**: 192.168.1.4 (LAN内)
- **Keycloak**: http://192.168.1.4:8081
- **GS API**: http://192.168.1.4:7070
- **Face API**: http://192.168.1.4:8100

---

## DNS設定

### 1. 推奨サブドメイン構成

```
mc-gate.example.com            → ルートドメイン（ランディングページ）
api.mc-gate.example.com        → GS API (7070)
face-api.mc-gate.example.com   → Face API (8100)
auth.mc-gate.example.com       → Keycloak (8080/8081)
```

### 2. DNS レコード設定

#### オプション A: Cloudflare Tunnel 使用（推奨）

Cloudflare Tunnel を使用する場合、DNS レコードは自動的に作成されます。

```
# Cloudflare ダッシュボード > Zero Trust > Access > Tunnels

Tunnel Name: mc-gate-tunnel
Route Type: Public Hostname

api.mc-gate.example.com       → http://192.168.1.4:7070
face-api.mc-gate.example.com  → http://192.168.1.4:8100
auth.mc-gate.example.com      → http://192.168.1.4:8081
```

**Cloudflare が自動的に以下の CNAME レコードを作成:**
```
api.mc-gate.example.com       CNAME   <tunnel-id>.cfargotunnel.com
face-api.mc-gate.example.com  CNAME   <tunnel-id>.cfargotunnel.com
auth.mc-gate.example.com      CNAME   <tunnel-id>.cfargotunnel.com
```

#### オプション B: 固定IPアドレス使用（VPS/専用サーバー）

固定 IP を持つサーバーの場合（例: VPS, 専用サーバー）

```
# Cloudflare ダッシュボード > DNS > Records

Type    Name         Content         Proxy Status    TTL
A       api          203.0.113.10    Proxied (🧡)    Auto
A       face-api     203.0.113.10    Proxied (🧡)    Auto
A       auth         203.0.113.10    Proxied (🧡)    Auto
```

**Proxy Status (オレンジクラウド) の意味:**
- ✅ Proxied (🧡): Cloudflare 経由でトラフィックを転送（推奨）
- ❌ DNS Only (☁️): Cloudflare を経由せず、直接サーバーに接続

### 3. Wildcard DNS（オプション）

将来的にサブドメインを追加する可能性がある場合:

```
Type    Name         Content         Proxy Status    TTL
A       *            203.0.113.10    Proxied         Auto
```

**注意**: Wildcard DNS は柔軟ですが、セキュリティリスクもあるため慎重に使用してください。

---

## Cloudflare Tunnel設定

### 概要

**Cloudflare Tunnel (旧 Argo Tunnel)** は、オンプレミス/NAS環境から外部に安全にサービスを公開する方法です。

### メリット

| 項目 | 説明 |
|------|------|
| ✅ **ファイアウォール不要** | 外部からの受信ポート開放が不要 |
| ✅ **動的IP対応** | 固定IPアドレス不要（家庭用インターネット回線でも可） |
| ✅ **自動SSL** | Cloudflare が SSL/TLS 証明書を自動発行 |
| ✅ **DDoS保護** | Cloudflare のネットワークで DDoS 攻撃を緩和 |
| ✅ **Zero Trust統合** | Cloudflare Access でアクセス制御が可能 |

### デメリット

| 項目 | 説明 |
|------|------|
| ❌ **レイテンシ増加** | Cloudflare のエッジサーバー経由のため遅延が増える |
| ❌ **帯域制限** | 無料プランでは帯域制限あり（有料プランで解除） |
| ❌ **cloudflared依存** | cloudflared デーモンの稼働が必須 |
| ❌ **Cloudflare障害** | Cloudflare ダウン時にサービスも停止 |

### 実装手順

#### 1. Cloudflare Zero Trust アカウント作成

1. Cloudflare ダッシュボードにログイン
2. 左サイドバー > **Zero Trust** をクリック
3. チーム名を入力してアカウント作成

#### 2. Tunnel 作成

```bash
# cloudflared をインストール（Linux x64）
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# Cloudflare にログイン
cloudflared tunnel login

# Tunnel を作成
cloudflared tunnel create mc-gate-tunnel

# Tunnel ID を確認（次のステップで使用）
cloudflared tunnel list
```

#### 3. 設定ファイル作成

`/etc/cloudflared/config.yml` を作成:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  # GS API (7070)
  - hostname: api.mc-gate.example.com
    service: http://192.168.1.4:7070
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: api.mc-gate.example.com

  # Face API (8100)
  - hostname: face-api.mc-gate.example.com
    service: http://192.168.1.4:8100
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: face-api.mc-gate.example.com

  # Keycloak (8081)
  - hostname: auth.mc-gate.example.com
    service: http://192.168.1.4:8081
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: auth.mc-gate.example.com

  # デフォルトルート（404）
  - service: http_status:404
```

#### 4. DNS ルート設定

```bash
# DNS レコードを作成（各サブドメイン）
cloudflared tunnel route dns mc-gate-tunnel api.mc-gate.example.com
cloudflared tunnel route dns mc-gate-tunnel face-api.mc-gate.example.com
cloudflared tunnel route dns mc-gate-tunnel auth.mc-gate.example.com
```

#### 5. Tunnel 起動

```bash
# フォアグラウンドで起動（テスト）
cloudflared tunnel run mc-gate-tunnel

# バックグラウンドで起動（systemd サービス）
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# ステータス確認
sudo systemctl status cloudflared
```

#### 6. Docker Compose 統合（推奨）

`docker-compose.yml` に cloudflared を追加:

```yaml
services:
  # ... 既存のサービス ...

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: mc-gate-cloudflared
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    networks:
      - mc-gate-network
    depends_on:
      - gs-api
      - keycloak
```

**環境変数を設定:**

```bash
# .env ファイル
CLOUDFLARE_TUNNEL_TOKEN=<トークン>
```

**トークンの取得:**
1. Cloudflare ダッシュボード > Zero Trust > Access > Tunnels
2. mc-gate-tunnel をクリック
3. "Configure" > "Token" をコピー

---

## SSL/TLS設定

### 1. SSL/TLSモードの選択

Cloudflare は以下の SSL/TLS モードを提供します:

| モード | 説明 | 推奨度 | 使用ケース |
|--------|------|--------|----------|
| **Off** | SSL無効（HTTP） | ❌ 非推奨 | 絶対に使用しない |
| **Flexible** | Cloudflare↔クライアント: HTTPS<br>Cloudflare↔オリジン: HTTP | ⚠️ 開発のみ | オリジンがHTTPのみ |
| **Full** | Cloudflare↔クライアント: HTTPS<br>Cloudflare↔オリジン: HTTPS (自己署名可) | ✅ 推奨 | 自己署名証明書使用 |
| **Full (Strict)** | Cloudflare↔クライアン: HTTPS<br>Cloudflare↔オリジン: HTTPS (信頼された証明書) | 🏆 最高 | 本番環境 |

### 2. 推奨設定: Full (Strict)

#### ステップ1: オリジンサーバーに証明書をインストール

**オプションA: Cloudflare Origin Certificate（推奨）**

1. Cloudflare ダッシュボード > SSL/TLS > Origin Server
2. "Create Certificate" をクリック
3. 有効期限: 15年
4. ホスト名: `*.mc-gate.example.com, mc-gate.example.com`
5. 証明書と秘密鍵をダウンロード

**Nginx に設定:**

```nginx
server {
    listen 443 ssl http2;
    server_name api.mc-gate.example.com;

    ssl_certificate /etc/ssl/certs/cloudflare-origin.pem;
    ssl_certificate_key /etc/ssl/private/cloudflare-origin-key.pem;

    location / {
        proxy_pass http://192.168.1.4:7070;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**オプションB: Let's Encrypt（無料）**

```bash
# Certbot をインストール
sudo apt install certbot python3-certbot-nginx

# 証明書を取得
sudo certbot --nginx -d api.mc-gate.example.com -d face-api.mc-gate.example.com -d auth.mc-gate.example.com

# 自動更新設定
sudo systemctl enable certbot.timer
```

**オプションC: Cloudflare Tunnel 使用時（最も簡単）**

Cloudflare Tunnel を使用する場合、**オリジンサーバーに証明書は不要**です（HTTP で接続可）。

```yaml
# config.yml
ingress:
  - hostname: api.mc-gate.example.com
    service: http://192.168.1.4:7070  # HTTP でOK
    originRequest:
      noTLSVerify: true  # TLS検証スキップ
```

#### ステップ2: Cloudflare SSL/TLS モード設定

1. Cloudflare ダッシュボード > SSL/TLS
2. "Full (Strict)" を選択（Origin Certificate 使用時）
3. "Full" を選択（自己署名証明書使用時）
4. "Flexible" を選択（Cloudflare Tunnel + HTTP 使用時）

### 3. HSTS (HTTP Strict Transport Security) 有効化

**HSTS の効果:**
- ブラウザが常に HTTPS で接続するよう強制
- 中間者攻撃 (MITM) を防止

**設定方法:**

1. Cloudflare ダッシュボード > SSL/TLS > Edge Certificates
2. "HTTP Strict Transport Security (HSTS)" を有効化
3. 設定:
   - **Max Age**: 6 months (15768000秒)
   - **Include subdomains**: ✅ 有効
   - **Preload**: ⚠️ 慎重に（一度有効化すると取り消し困難）
   - **No-Sniff Header**: ✅ 有効

**本番環境のみ有効化を推奨（開発環境では無効化）**

---

## プロキシとロードバランシング

### 1. Cloudflare Proxy (オレンジクラウド)

#### メリット

| 項目 | 説明 |
|------|------|
| ✅ **DDoS 保護** | Cloudflare のネットワークで攻撃を緩和 |
| ✅ **SSL/TLS 終端** | Cloudflare が SSL 処理を代行 |
| ✅ **キャッシュ** | 静的コンテンツをキャッシュ |
| ✅ **IP 隠蔽** | オリジンサーバーの実 IP を隠す |
| ✅ **WAF** | Web Application Firewall で攻撃を防御 |

#### デメリット

| 項目 | 説明 |
|------|------|
| ❌ **レイテンシ増加** | エッジサーバー経由のため遅延 |
| ❌ **WebSocket 制限** | 無料プランでは WebSocket 接続に制限あり |

#### 設定方法

1. Cloudflare ダッシュボード > DNS > Records
2. 各レコードの "Proxy Status" をクリック
3. **Proxied (🧡)** を選択

### 2. キャッシュ設定

#### API エンドポイントはキャッシュ無効化

API レスポンスは動的なため、キャッシュを無効化する必要があります。

**Page Rule で設定:**

1. Cloudflare ダッシュボード > Rules > Page Rules
2. "Create Page Rule" をクリック

**ルール設定:**

```
URL Pattern: api.mc-gate.example.com/*
Settings:
  - Cache Level: Bypass
  - Disable Performance
```

```
URL Pattern: face-api.mc-gate.example.com/*
Settings:
  - Cache Level: Bypass
  - Disable Performance
```

```
URL Pattern: auth.mc-gate.example.com/*
Settings:
  - Cache Level: Bypass
  - Disable Performance
```

#### 静的コンテンツはキャッシュ有効化（将来的）

もし静的ファイル（画像、CSS、JS）を配信する場合:

```
URL Pattern: cdn.mc-gate.example.com/*
Settings:
  - Cache Level: Standard
  - Edge Cache TTL: 1 week
```

### 3. ロードバランシング（有料プランのみ）

複数のオリジンサーバーを設定する場合、Cloudflare Load Balancing を使用できます。

**設定例:**

1. Cloudflare ダッシュボード > Traffic > Load Balancing
2. "Create Load Balancer" をクリック
3. オリジンプールを作成:

```
Pool Name: mc-gate-api-pool
Origins:
  - Name: api-server-1
    Origin Address: 192.168.1.4:7070
    Weight: 100
    Enabled: ✅

  - Name: api-server-2
    Origin Address: 192.168.1.5:7070
    Weight: 100
    Enabled: ✅
```

4. ヘルスチェック設定:

```
Monitor Type: HTTPS
Path: /health
Expected HTTP Status: 200
Interval: 60 seconds
Retries: 2
Timeout: 5 seconds
```

**注意**: Load Balancing は有料機能（月額 $5 から）

---

## セキュリティ設定

### 1. CORS 設定

モバイルアプリから API を呼び出す場合、CORS ヘッダーが必要です。

#### サーバー側（GS API / Face API）で設定

**FastAPI (Face API) の例:**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://api.mc-gate.example.com",
        "https://face-api.mc-gate.example.com",
        "https://auth.mc-gate.example.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Node.js/Express (GS API) の例:**

```javascript
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: [
    'https://api.mc-gate.example.com',
    'https://face-api.mc-gate.example.com',
    'https://auth.mc-gate.example.com',
  ],
  credentials: true,
}));
```

#### Cloudflare Transform Rules で設定（代替方法）

1. Cloudflare ダッシュボード > Rules > Transform Rules > Modify Response Header
2. "Create rule" をクリック

**ルール設定:**

```
Rule name: CORS Headers for API

When incoming requests match:
  Field: Hostname
  Operator: equals
  Value: api.mc-gate.example.com

Then:
  Set static header:
    - Access-Control-Allow-Origin: *
    - Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
    - Access-Control-Allow-Headers: Content-Type, Authorization
```

**注意**: `Access-Control-Allow-Origin: *` はすべてのオリジンを許可するため、本番環境では具体的なドメインを指定することを推奨します。

### 2. Rate Limiting

API への過剰なリクエストを防止します。

#### Cloudflare Rate Limiting（有料プランのみ）

1. Cloudflare ダッシュボード > Security > WAF > Rate Limiting Rules
2. "Create rule" をクリック

**ルール設定:**

```
Rule name: API Rate Limiting

When incoming requests match:
  Field: Hostname
  Operator: equals
  Value: api.mc-gate.example.com

And request characteristics:
  Field: IP Address
  Count: 100 requests
  Period: 60 seconds

Then:
  Action: Block
  Duration: 60 seconds
```

#### 無料プランでの代替方法: サーバー側で実装

**Node.js/Express の例:**

```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分
  max: 100, // 100リクエスト
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', apiLimiter);
```

**FastAPI の例:**

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.get("/api/events")
@limiter.limit("100/minute")
async def get_events():
    return {"events": []}
```

### 3. DDoS Protection

Cloudflare は無料プランでも基本的な DDoS 保護を提供します。

#### 追加設定（推奨）

1. Cloudflare ダッシュボード > Security > DDoS
2. "DDoS Attack Protection" が有効になっていることを確認

#### 高度な保護（有料プラン）

- **Advanced DDoS Protection**: より大規模な攻撃に対応
- **Magic Transit**: ネットワーク層の保護

### 4. Web Application Firewall (WAF)

#### 無料プランで利用可能な機能

1. Cloudflare ダッシュボード > Security > WAF > Managed Rules
2. **Cloudflare Managed Ruleset** を有効化
   - OWASP Top 10 脆弱性を防御
   - SQLインジェクション、XSS、RCE などを検出

#### カスタムルール作成

1. Cloudflare ダッシュボード > Security > WAF > Custom Rules
2. "Create rule" をクリック

**例: 特定の国からのアクセスをブロック**

```
Rule name: Block countries except Japan

When incoming requests match:
  Field: Country
  Operator: does not equal
  Value: JP (Japan)

Then:
  Action: Block
```

**例: 特定の User-Agent をブロック**

```
Rule name: Block malicious bots

When incoming requests match:
  Field: User Agent
  Operator: contains
  Value: BadBot

Then:
  Action: Block
```

### 5. IP アクセス制限（Cloudflare Access）

特定の IP アドレスからのみアクセスを許可する場合:

#### オプションA: Cloudflare Access（Zero Trust）

1. Cloudflare ダッシュボード > Zero Trust > Access > Applications
2. "Add an application" をクリック
3. アプリケーション設定:

```
Application name: MC Gate API
Domain: api.mc-gate.example.com
Session duration: 24 hours

Policy:
  Rule name: Allow from office IP
  Action: Allow
  Include:
    - IP ranges: 203.0.113.0/24
```

#### オプションB: Firewall Rules（無料プラン）

1. Cloudflare ダッシュボード > Security > WAF > Firewall Rules
2. "Create a Firewall rule" をクリック

```
Rule name: Allow only office IP

When incoming requests match:
  Field: IP Source Address
  Operator: does not equal
  Value: 203.0.113.0/24

Then:
  Action: Block
```

### 6. API Key / Bearer Token 認証

Cloudflare では API キーの検証はできないため、サーバー側で実装します。

**Face API の現在の実装:**

```python
# apps/face-api/app.py
API_KEY = os.getenv("API_KEY", "development-api-key-12345")

@app.get("/health")
def health_check(api_key: str = Header(None, alias="X-API-Key")):
    if api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"status": "ok"}
```

**モバイルアプリからの呼び出し:**

```typescript
// apps/mobile/src/services/api.ts
const response = await fetch('https://face-api.mc-gate.example.com/health', {
  headers: {
    'X-API-Key': process.env.FACE_API_KEY,
  },
});
```

**Keycloak OAuth 2.0 Bearer Token:**

```typescript
// apps/mobile/src/services/api.ts
const response = await fetch('https://api.mc-gate.example.com/events', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});
```

---

## 実装手順

### フェーズ1: 準備（ローカル環境）

#### 1. ドメイン取得

- Cloudflare Registrar で購入（推奨）
- または既存のドメインを Cloudflare に移管

#### 2. Cloudflare にドメイン追加

1. Cloudflare ダッシュボード > "Add a Site"
2. ドメイン名を入力: `mc-gate.example.com`
3. プランを選択: **Free** or **Pro**
4. ネームサーバーを変更:

```
NS レコードをドメインレジストラで変更:
ns1.cloudflare.com
ns2.cloudflare.com
```

5. DNS 伝播を待つ（最大48時間、通常は数時間）

#### 3. SSL/TLS モード設定

1. Cloudflare ダッシュボード > SSL/TLS
2. "Full (Strict)" を選択（本番環境）
3. "Flexible" を選択（開発環境、Cloudflare Tunnel使用時）

---

### フェーズ2: Cloudflare Tunnel 構築

#### 1. cloudflared インストール

```bash
# NAS/サーバーにSSHログイン
ssh admin@192.168.1.4

# cloudflared をダウンロード
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64

# 実行権限を付与
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# バージョン確認
cloudflared --version
```

#### 2. Cloudflare にログイン

```bash
cloudflared tunnel login
```

ブラウザが開き、Cloudflare にログインするよう促されます。

#### 3. Tunnel 作成

```bash
cloudflared tunnel create mc-gate-tunnel

# 出力例:
# Created tunnel mc-gate-tunnel with id <TUNNEL_ID>
# Credentials written to /root/.cloudflared/<TUNNEL_ID>.json
```

**Tunnel ID をメモしておく（次のステップで使用）**

#### 4. 設定ファイル作成

```bash
sudo mkdir -p /etc/cloudflared
sudo vim /etc/cloudflared/config.yml
```

**config.yml の内容:**

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  # GS API (7070)
  - hostname: api.mc-gate.example.com
    service: http://192.168.1.4:7070
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: api.mc-gate.example.com

  # Face API (8100)
  - hostname: face-api.mc-gate.example.com
    service: http://192.168.1.4:8100
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: face-api.mc-gate.example.com

  # Keycloak (8081)
  - hostname: auth.mc-gate.example.com
    service: http://192.168.1.4:8081
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: auth.mc-gate.example.com

  # デフォルトルート（404）
  - service: http_status:404
```

#### 5. DNS ルート設定

```bash
cloudflared tunnel route dns mc-gate-tunnel api.mc-gate.example.com
cloudflared tunnel route dns mc-gate-tunnel face-api.mc-gate.example.com
cloudflared tunnel route dns mc-gate-tunnel auth.mc-gate.example.com
```

**確認:**

```bash
cloudflared tunnel route dns mc-gate-tunnel
```

#### 6. Tunnel 起動テスト

```bash
# フォアグラウンドで起動（テスト）
cloudflared tunnel run mc-gate-tunnel

# ログ確認
# 正常に起動すると以下のようなログが表示される:
# INF Connection registered connIndex=0 location=NRT ip=198.41.192.227
# INF Connection registered connIndex=1 location=NRT ip=198.41.192.227
```

**別のターミナルで疎通確認:**

```bash
curl https://api.mc-gate.example.com/health
```

**期待される出力:**

```json
{"status":"ok"}
```

#### 7. Systemd サービス化（自動起動）

```bash
# サービスをインストール
sudo cloudflared service install

# サービスを起動
sudo systemctl start cloudflared

# サービスを有効化（システム起動時に自動起動）
sudo systemctl enable cloudflared

# ステータス確認
sudo systemctl status cloudflared

# ログ確認
sudo journalctl -u cloudflared -f
```

---

### フェーズ3: アプリケーション設定変更

#### 1. Keycloak 設定変更

**docker-compose.yml の修正:**

```yaml
keycloak:
  environment:
    # ❌ 修正前
    KC_HOSTNAME: 192.168.1.4

    # ✅ 修正後
    KC_HOSTNAME: auth.mc-gate.example.com
    KC_HOSTNAME_STRICT: "false"
    KC_PROXY: edge
```

**Keycloak Realm 設定:**

1. Keycloak 管理コンソールにログイン: https://auth.mc-gate.example.com
2. Realm Settings > General > Frontend URL:
   - ❌ `http://192.168.1.4:8081`
   - ✅ `https://auth.mc-gate.example.com`
3. Clients > mc-gate-mobile > Settings:
   - Valid Redirect URIs: `exp://192.168.1.4:8081/*` を追加
   - Web Origins: `https://api.mc-gate.example.com` を追加

#### 2. モバイルアプリ設定変更

**apps/mobile/app.config.ts の修正:**

```typescript
export default ({ config }: ConfigContext): ExpoConfig => ({
  // ...
  extra: {
    // ❌ 修正前
    apiBaseGs: "http://192.168.1.4:7070",
    apiFaceApi: "http://192.168.1.4:8100",
    auth: {
      issuer: "http://192.168.1.4:8081/realms/mcd3",
    },

    // ✅ 修正後
    apiBaseGs: "https://api.mc-gate.example.com",
    apiFaceApi: "https://face-api.mc-gate.example.com",
    auth: {
      issuer: "https://auth.mc-gate.example.com/realms/mcd3",
    },
  },
});
```

**環境変数での切り替え:**

```typescript
export default ({ config }: ConfigContext): ExpoConfig => ({
  // ...
  extra: {
    apiBaseGs:
      process.env.ENV === "production"
        ? "https://api.mc-gate.example.com"
        : "http://192.168.1.4:7070",
    apiFaceApi:
      process.env.ENV === "production"
        ? "https://face-api.mc-gate.example.com"
        : "http://192.168.1.4:8100",
    auth: {
      issuer:
        process.env.ENV === "production"
          ? "https://auth.mc-gate.example.com/realms/mcd3"
          : "http://192.168.1.4:8081/realms/mcd3",
    },
  },
});
```

#### 3. ビルド & EAS Update

```bash
# 変更をコミット
git add -A
git commit -m "Ops: Cloudflare Tunnel で外部公開設定"

# プロダクションビルド作成
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
npx eas-cli build --platform android --profile production --non-interactive

# ビルド完了後（10〜15分）、EAS Update 配信
npx eas-cli update --branch production --message "Ops: Cloudflare Tunnel で外部公開設定"
```

---

### フェーズ4: セキュリティ設定

#### 1. CORS ヘッダー設定

**apps/face-api/app.py の修正:**

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://api.mc-gate.example.com",
        "https://face-api.mc-gate.example.com",
        "https://auth.mc-gate.example.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### 2. Rate Limiting 設定

**apps/face-api/app.py の修正:**

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/detect")
@limiter.limit("100/minute")
async def detect_face():
    # ...
```

#### 3. Cloudflare Firewall Rules 設定

1. Cloudflare ダッシュボード > Security > WAF > Firewall Rules
2. "Create a Firewall rule" をクリック

**ルール1: Bot 保護**

```
Rule name: Block bots

When incoming requests match:
  Field: Known Bots
  Operator: equals
  Value: On

Then:
  Action: JS Challenge
```

**ルール2: 国別制限（オプション）**

```
Rule name: Allow only Japan

When incoming requests match:
  Field: Country
  Operator: does not equal
  Value: JP

Then:
  Action: Block
```

#### 4. WAF Managed Ruleset 有効化

1. Cloudflare ダッシュボード > Security > WAF > Managed Rules
2. **Cloudflare Managed Ruleset** を有効化

---

### フェーズ5: 動作確認

#### 1. 疎通確認

```bash
# GS API
curl https://api.mc-gate.example.com/health

# Face API
curl https://face-api.mc-gate.example.com/health

# Keycloak
curl https://auth.mc-gate.example.com/realms/mcd3/.well-known/openid-configuration
```

#### 2. モバイルアプリでテスト

1. アプリを起動
2. ログイン画面で Keycloak 認証を実行
3. スキャン画面で QR コードをスキャン
4. イベントが正常に送信されることを確認

#### 3. SSL/TLS 検証

```bash
# SSL証明書を確認
openssl s_client -connect api.mc-gate.example.com:443 -servername api.mc-gate.example.com

# 期待される出力:
# Verify return code: 0 (ok)
```

#### 4. Cloudflare Analytics 確認

1. Cloudflare ダッシュボード > Analytics & Logs > Traffic
2. リクエスト数、帯域幅、脅威をモニタリング

---

## トラブルシューティング

### 問題1: cloudflared が起動しない

**症状:**

```
ERR Failed to create new quic connection error="failed to dial to edge"
```

**原因:**
- ファイアウォールが UDP 7844 をブロックしている
- インターネット接続が不安定

**解決策:**

```bash
# ファイアウォールで UDP 7844 を開放
sudo ufw allow 7844/udp

# cloudflared を再起動
sudo systemctl restart cloudflared
```

---

### 問題2: DNS レコードが反映されない

**症状:**

```bash
curl https://api.mc-gate.example.com
# curl: (6) Could not resolve host: api.mc-gate.example.com
```

**原因:**
- DNS 伝播が完了していない
- DNS レコードが正しく設定されていない

**解決策:**

```bash
# DNS レコードを確認
dig api.mc-gate.example.com

# Cloudflare DNS を直接クエリ
dig @1.1.1.1 api.mc-gate.example.com
```

**手動でDNSレコードを追加:**

1. Cloudflare ダッシュボード > DNS > Records
2. CNAME レコードを確認

```
Type    Name         Content
CNAME   api          <TUNNEL_ID>.cfargotunnel.com
```

---

### 問題3: CORS エラー

**症状:**

```
Access to fetch at 'https://api.mc-gate.example.com/events' from origin 'https://face-api.mc-gate.example.com' has been blocked by CORS policy
```

**原因:**
- サーバー側で CORS ヘッダーが設定されていない
- `Access-Control-Allow-Origin` が間違っている

**解決策:**

**FastAPI の場合:**

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開発時のみ
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Cloudflare Transform Rules で設定:**

1. Cloudflare ダッシュボード > Rules > Transform Rules > Modify Response Header
2. "Create rule" をクリック

```
Rule name: CORS Headers

When incoming requests match:
  Field: Hostname
  Operator: equals
  Value: api.mc-gate.example.com

Then:
  Set static header:
    - Access-Control-Allow-Origin: *
    - Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
    - Access-Control-Allow-Headers: Content-Type, Authorization
```

---

### 問題4: Keycloak リダイレクトエラー

**症状:**

```
Invalid parameter: redirect_uri
```

**原因:**
- Keycloak の Valid Redirect URIs に新しいドメインが登録されていない

**解決策:**

1. Keycloak 管理コンソール: https://auth.mc-gate.example.com
2. Clients > mc-gate-mobile > Settings
3. Valid Redirect URIs に追加:

```
https://api.mc-gate.example.com/*
https://face-api.mc-gate.example.com/*
exp://192.168.1.4:8081/*
```

4. Save をクリック

---

### 問題5: SSL/TLS ハンドシェイクエラー

**症状:**

```
ERR SSL routines:ssl3_get_server_certificate:certificate verify failed
```

**原因:**
- オリジンサーバーの証明書が信頼されていない
- SSL/TLS モードが Full (Strict) だが自己署名証明書を使用

**解決策:**

**オプション1: SSL/TLS モードを Full に変更**

1. Cloudflare ダッシュボード > SSL/TLS
2. "Full" を選択（自己署名証明書を許可）

**オプション2: Cloudflare Origin Certificate を使用**

1. Cloudflare ダッシュボード > SSL/TLS > Origin Server
2. "Create Certificate" をクリック
3. 証明書をダウンロードして Nginx/Apache に設定

**オプション3: Cloudflare Tunnel で HTTP 接続**

```yaml
# config.yml
ingress:
  - hostname: api.mc-gate.example.com
    service: http://192.168.1.4:7070  # HTTP で接続
    originRequest:
      noTLSVerify: true  # TLS検証をスキップ
```

---

### 問題6: 502 Bad Gateway

**症状:**

```
Error 502: Bad Gateway
```

**原因:**
- オリジンサーバーが停止している
- オリジンサーバーが応答していない
- cloudflared が停止している

**解決策:**

```bash
# サービスの状態を確認
sudo systemctl status cloudflared
sudo docker ps

# GS API が起動しているか確認
curl http://192.168.1.4:7070/health

# cloudflared を再起動
sudo systemctl restart cloudflared
```

---

### 問題7: Rate Limiting で誤ってブロックされる

**症状:**

```
Error 429: Too Many Requests
```

**原因:**
- Rate Limiting のしきい値が低すぎる
- 同じ IP アドレスから大量のリクエストが来ている

**解決策:**

**Rate Limiting ルールを調整:**

1. Cloudflare ダッシュボード > Security > WAF > Rate Limiting Rules
2. しきい値を変更:
   - 100 requests/minute → 500 requests/minute

**IP アドレスをホワイトリストに追加:**

1. Cloudflare ダッシュボード > Security > WAF > Tools
2. "IP Access Rules" をクリック
3. IP アドレスを追加:

```
IP Address: 203.0.113.10
Action: Allow
Zone: This website
```

---

## まとめ

### 推奨構成

```
[モバイルアプリ]
    ↓ HTTPS
[Cloudflare CDN]
    ↓ Cloudflare Tunnel (TLS)
[NAS/サーバー (192.168.1.4)]
    ├─ GS API (7070)
    ├─ Face API (8100)
    ├─ Keycloak (8081)
    ├─ PostgreSQL (5432) ← 外部非公開
    └─ Redis (6379) ← 外部非公開
```

### 設定サマリー

| 項目 | 推奨設定 |
|------|---------|
| **DNS** | Cloudflare Tunnel で自動作成される CNAME |
| **SSL/TLS モード** | Full (Flexible for Cloudflare Tunnel) |
| **Proxy Status** | Proxied (🧡) |
| **CORS** | サーバー側で設定 |
| **Rate Limiting** | サーバー側で実装（無料プラン）|
| **DDoS Protection** | Cloudflare 自動有効 |
| **WAF** | Cloudflare Managed Ruleset 有効 |
| **HSTS** | 本番環境のみ有効化 |

### 次のステップ

1. ✅ Cloudflare Tunnel 構築完了
2. ✅ DNS レコード設定完了
3. ✅ SSL/TLS 設定完了
4. ⏳ アプリケーション設定変更
5. ⏳ セキュリティ設定追加
6. ⏳ 動作確認
7. ⏳ 本番環境デプロイ

### 参考リンク

- [Cloudflare Tunnel ドキュメント](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflare SSL/TLS ドキュメント](https://developers.cloudflare.com/ssl/)
- [Cloudflare WAF ドキュメント](https://developers.cloudflare.com/waf/)
- [Keycloak リバースプロキシ設定](https://www.keycloak.org/server/reverseproxy)

---

**最終更新**: 2025-12-02
**作成者**: Claude (with user collaboration)
**バージョン**: 1.0.0
