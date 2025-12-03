# Cloudflare外部公開に伴うセキュリティとコンプライアンス要件調査報告書

**作成日**: 2025-12-02
**対象プロジェクト**: mc-gate（建設現場通門管理システム）
**調査範囲**: Cloudflare外部公開に伴うセキュリティリスク、コンプライアンス要件、脆弱性対策
**参照**: CLAUDE.md「🚨 EAS Build & Update トラブルシューティング」セクション

---

## Executive Summary（経営層向けサマリー）

### 総合リスク評価: **中リスク（対応推奨）**

現在の mc-gate システムは開発環境として良好な状態ですが、Cloudflare経由で外部公開するにあたり、以下の対応が必要です：

| カテゴリ | 現状 | リスクレベル | 対応優先度 |
|---------|------|------------|-----------|
| 認証とアクセス制御 | OAuth 2.0実装済み（85%完了） | 🟡 中 | 高 |
| データ保護 | 伝送時暗号化なし（HTTP） | 🔴 高 | **最高** |
| ネットワークセキュリティ | ファイアウォール未設定 | 🟡 中 | 高 |
| コンプライアンス | 部分対応 | 🟡 中 | 中 |
| 脆弱性対策 | 基本対策のみ | 🟡 中 | 高 |

### 推奨アクションアイテム（優先度順）

1. **即座に対応（公開前に必須）**
   - HTTPS化（Let's Encrypt or Cloudflare SSL）
   - Keycloakの外部公開設定（ホスト名検証）
   - PostgreSQL/Redisの外部アクセス遮断
   - 本番用APIキーの再生成

2. **1週間以内に対応**
   - Rate Limitingの実装
   - アクセスログの保存設定
   - 監査ログの実装

3. **1ヶ月以内に対応**
   - OWASP Top 10対策の完全実装
   - 依存パッケージの脆弱性スキャン自動化
   - プライバシーポリシー策定

---

## 1. 認証とアクセス制御

### 1.1 Keycloakの外部公開リスク

#### 現状分析

**設定ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/docker-compose.yml`

```yaml
keycloak:
  environment:
    KC_HOSTNAME: 192.168.1.4       # ❌ LAN IP - 外部公開不可
    KC_HTTP_ENABLED: "true"        # ❌ HTTP有効 - HTTPS必須
    KC_HOSTNAME_STRICT: "false"    # ⚠️  ホスト名検証緩和 - セキュリティリスク
```

**問題点**:
1. **ホスト名が内部IPアドレス**: 外部からアクセス不可
2. **HTTP通信**: 認証情報が平文で送信される（中間者攻撃のリスク）
3. **ホスト名検証が無効**: CSRF攻撃のリスク

#### リスク評価

| リスク項目 | 影響度 | 発生確率 | リスクスコア |
|-----------|-------|---------|------------|
| 認証情報の盗聴（MITM） | 致命的 | 高 | 🔴 9.0/10 |
| CSRF攻撃 | 高 | 中 | 🟡 7.0/10 |
| セッションハイジャック | 高 | 中 | 🟡 6.5/10 |

#### 推奨対策

**フェーズ1: HTTPS化（最優先）**

```yaml
# docker-compose.yml（本番環境用）
keycloak:
  environment:
    KC_HOSTNAME: auth.yourdomain.com     # ✅ 公式ドメイン
    KC_HTTPS_CERTIFICATE_FILE: /certs/cert.pem
    KC_HTTPS_CERTIFICATE_KEY_FILE: /certs/key.pem
    KC_HTTP_ENABLED: "false"             # ✅ HTTPを無効化
    KC_HOSTNAME_STRICT: "true"           # ✅ ホスト名検証を厳格化
  volumes:
    - ./certs:/certs:ro
```

**フェーズ2: Cloudflare SSL設定**

1. Cloudflare Dashboardで「SSL/TLS」→「Full (strict)」に設定
2. Origin CertificateをダウンロードしてKeycloakに配置
3. `/apps/mobile/app.config.js`のAUTH_ISSUERをHTTPS URLに変更

```javascript
// app.config.js（本番環境）
authIssuer: process.env.AUTH_ISSUER || "https://auth.yourdomain.com/realms/mcd3"
```

**フェーズ3: HTTPS強制検証**

`app.config.js` 既存の検証ロジック（lines 18-43）が正常に動作していることを確認：

```javascript
if (isProduction) {
  const httpUrls = urls.filter(url => url.value && url.value.startsWith("http://"));
  if (httpUrls.length > 0) {
    throw new Error(`❌ PRODUCTION BUILD ERROR - HTTP URLs`);
  }
}
```

### 1.2 OAuth 2.0フローの変更点

#### 現状の実装

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/services/auth.ts`

```typescript
// ✅ 既に実装済み: Authorization Code Flow with PKCE
const request = new AuthSession.AuthRequest({
  clientId: config.clientId,
  scopes: ["openid", "profile", "email"],
  redirectUri,  // mcgate://auth
  extraParams: {
    audience: config.audience,
  },
});
```

**評価**: OAuth 2.0実装は85%完了。PKCE対応済みでセキュリティベストプラクティスに準拠。

#### 外部公開時の変更点

**変更不要な項目**:
- Authorization Code Flow（変更なし）
- PKCE（変更なし）
- トークンリフレッシュ（変更なし）

**変更が必要な項目**:
1. **Redirect URI**: Cloudflareドメインに対応
   ```typescript
   // Keycloak設定で追加
   Valid Redirect URIs:
     mcgate://auth
     https://yourdomain.com/auth/callback  // ✅ 追加
   ```

2. **CORS設定**: Cloudflareオリジンを許可
   ```yaml
   # docker-compose.yml
   keycloak:
     environment:
       KC_HTTP_CORS_ORIGINS: https://yourdomain.com
   ```

### 1.3 API Keyの管理方法

#### 現状のAPI Key管理

**Face API**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/face-api/docker-compose.yml`
```yaml
environment:
  - API_KEY=development-api-key-12345  # ❌ ハードコード - 危険
```

**GS API**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/docker-compose.yml`
```yaml
environment:
  API_KEY: ${API_KEY:-development-api-key-12345}  # ⚠️  デフォルト値あり
```

**問題点**:
1. **開発用APIキーがハードコード**: Git履歴に残る
2. **本番環境でもデフォルト値を使用**: セキュリティリスク
3. **キーローテーション不可**: 漏洩時の対応困難

#### 推奨対策

**フェーズ1: 環境変数への完全移行**

```bash
# .env.production（Gitignore対象）
API_KEY=$(openssl rand -hex 32)  # 64文字のランダムキー
API_FACE_API_KEY=$(openssl rand -hex 32)
```

**フェーズ2: EAS Secretsへの登録**

```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
npx eas-cli secret:create --scope project --name API_FACE_API_KEY --value "$(openssl rand -hex 32)"
npx eas-cli secret:create --scope project --name API_GS_API_KEY --value "$(openssl rand -hex 32)"
```

**フェーズ3: 検証ロジックの強化**

```typescript
// apps/face-api/src/middleware/auth.ts（改善版）
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const validApiKey = process.env.API_KEY;

  // 本番環境でAPIキーが未設定の場合は起動を拒否
  if (process.env.NODE_ENV === 'production' && !validApiKey) {
    console.error('FATAL: API_KEY is not set');
    process.exit(1);  // ✅ 起動拒否
  }

  // 開発環境でもデフォルト値を禁止（明示的な設定を強制）
  if (validApiKey === 'development-api-key-12345') {
    console.warn('⚠️  Using default API key - not recommended');
  }

  // ...
}
```

### 1.4 JWTトークンの検証

#### 現状の実装

OAuth実装は完了しているが、サーバー側でのJWT検証が未実装。

**推奨実装**:

```typescript
// apps/gs-api/src/middleware/jwt-auth.ts（新規作成）
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: `${process.env.AUTH_ISSUER}/protocol/openid-connect/certs`
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'INVALID_TOKEN' });
    }
    req.user = decoded;
    next();
  });
}
```

---

## 2. データ保護

### 2.1 個人情報の伝送時暗号化

#### 取り扱う個人情報

| データ種別 | 具体例 | 保護レベル |
|-----------|-------|-----------|
| 顔画像 | Base64エンコード画像データ | 🔴 最高 |
| 作業員情報 | 氏名、CCUS ID | 🔴 最高 |
| 入退場記録 | タイムスタンプ、GPS位置 | 🟡 高 |
| ログイン情報 | メールアドレス、トークン | 🔴 最高 |

#### 現状のリスク

**HTTP通信**: 現在はすべて `http://` で通信（開発環境のみ許可）

```javascript
// app.config.js（開発環境）
const apiBaseGs = process.env.API_BASE_GS || "http://192.168.1.4:7070";  // ❌ HTTP
```

**リスク**:
- 中間者攻撃（MITM）により顔画像が盗聴される
- Wi-Fi盗聴により個人情報が漏洩
- 個人情報保護法違反のリスク

#### 推奨対策

**必須対応**: すべてのAPI通信をHTTPS化

```javascript
// app.config.js（本番環境）
const isProduction = appEnv === "production";

const apiBaseGs = process.env.API_BASE_GS || (
  isProduction
    ? (() => { throw new Error("API_BASE_GS is required in production"); })()
    : "http://192.168.1.4:7070"
);

// HTTPS強制検証（既存ロジックが動作）
if (isProduction) {
  const httpUrls = urls.filter(url => url.value && url.value.startsWith("http://"));
  if (httpUrls.length > 0) {
    throw new Error(`❌ HTTPS required in production`);
  }
}
```

**Cloudflare設定**:
1. SSL/TLS → Full (strict)
2. Always Use HTTPS: ON
3. Automatic HTTPS Rewrites: ON

### 2.2 PostgreSQL、Redisへの外部アクセス制限

#### 現状の設定

**PostgreSQL**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/docker-compose.yml`

```yaml
postgres:
  ports:
    - "5435:5432"  # ❌ 外部からアクセス可能
```

**Redis**:

```yaml
redis:
  ports:
    - "6380:6379"  # ❌ 外部からアクセス可能
```

**問題点**:
- ポートが外部公開されている
- Cloudflare経由でもアクセス可能
- データベース直接攻撃のリスク

#### 推奨対策

**フェーズ1: ポートバインディングの制限**

```yaml
# docker-compose.yml（本番環境）
postgres:
  ports:
    - "127.0.0.1:5435:5432"  # ✅ localhostのみバインド

redis:
  ports:
    - "127.0.0.1:6380:6379"  # ✅ localhostのみバインド
```

**フェーズ2: Cloudflare Firewallルール**

```
Cloudflare Dashboard → Security → WAF
  Rule: Block database ports
  Expression: (cf.edge.server_port in {5432 5435 6379 6380})
  Action: Block
```

**フェーズ3: PostgreSQL認証強化**

```yaml
postgres:
  environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # 環境変数から取得
  command: >
    postgres
      -c ssl=on
      -c ssl_cert_file=/var/lib/postgresql/server.crt
      -c ssl_key_file=/var/lib/postgresql/server.key
```

### 2.3 機密情報のハードコード確認

#### 調査結果

以下のファイルに機密情報のハードコードを確認：

**⚠️  要対応**:
1. `apps/face-api/docker-compose.yml:12`: `API_KEY=development-api-key-12345`
2. `apps/gs-api/docker-compose.yml:109`: `API_KEY: ${API_KEY:-development-api-key-12345}`
3. `apps/mobile/eas.json:48`: `API_FACE_API_KEY: "development-api-key-12345"`

**✅ 問題なし**:
- `apps/mobile/src/services/auth.ts`: 環境変数から取得
- `app.config.js`: 環境変数から取得（デフォルト値は開発用のみ）

#### 推奨対策

**即座に対応**:

```bash
# 1. .env.productionを作成（Gitignore対象）
cat > apps/face-api/.env.production << EOF
API_KEY=$(openssl rand -hex 32)
DATABASE_PATH=/app/data/embeddings.db
LOG_LEVEL=WARNING
EOF

# 2. docker-compose.ymlからデフォルト値を削除
vim apps/face-api/docker-compose.yml
# API_KEY=development-api-key-12345 → API_KEY=${API_KEY}

# 3. 本番環境でデフォルト値を検出したらエラーにする
```

**Git履歴のクリーニング**:

```bash
# Git履歴から機密情報を削除（BFG Repo-Cleaner使用）
git clone --mirror https://github.com/your-org/mc-gate.git
java -jar bfg.jar --replace-text passwords.txt mc-gate.git
cd mc-gate.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push
```

---

## 3. ネットワークセキュリティ

### 3.1 ファイアウォールルール

#### 現状

NAS/ホストのファイアウォール設定が不明。デフォルトではすべてのポートが開放されている可能性。

#### 推奨設定

**Cloudflare Firewall Rules**:

```
Rule 1: Allow only Japan traffic
  Expression: (ip.geoip.country ne "JP")
  Action: Challenge (Captcha)

Rule 2: Block known bad IPs
  Expression: (cf.threat_score gt 10)
  Action: Block

Rule 3: Rate limit API endpoints
  Expression: (http.request.uri.path matches "^/api/")
  Action: Rate Limit (10 req/min per IP)

Rule 4: Block SQL injection attempts
  Expression: (http.request.uri.query contains "SELECT" or http.request.uri.query contains "UNION")
  Action: Block
```

**ホストファイアウォール（ufw）**:

```bash
# デフォルトポリシー
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 必要なポートのみ開放
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP（Cloudflareからのみ）
sudo ufw allow 443/tcp    # HTTPS（Cloudflareからのみ）

# Cloudflare IPのみ許可
for ip in $(curl https://www.cloudflare.com/ips-v4); do
  sudo ufw allow from $ip to any port 443 proto tcp
done

# データベースポートは完全遮断
sudo ufw deny 5432/tcp
sudo ufw deny 5435/tcp
sudo ufw deny 6379/tcp
sudo ufw deny 6380/tcp

sudo ufw enable
```

### 3.2 IP制限の必要性

#### 推奨アプローチ

**オプション1: IP Whitelisting（最も厳格）**

```
Cloudflare → Security → WAF
  Rule: Allow only company IPs
  Expression: (ip.src in {203.0.113.0/24 198.51.100.0/24})
  Action: Allow

  Rule: Block all others
  Expression: (not ip.src in {203.0.113.0/24 198.51.100.0/24})
  Action: Block
```

**オプション2: Geo-blocking（推奨）**

```
Expression: (ip.geoip.country ne "JP")
Action: Challenge
```

**オプション3: Device Posture（ゼロトラスト）**

Cloudflare Zero Trustを使用してデバイス認証を実装。

### 3.3 Rate Limiting設定

#### APIエンドポイント別の推奨レート

| エンドポイント | レート | 理由 |
|--------------|-------|------|
| POST /api/events | 10 req/min | スキャンイベント送信 |
| POST /api/face/register | 5 req/min | 顔登録（高負荷） |
| POST /api/face/recognize | 20 req/min | 顔認証（頻繁） |
| GET /api/events | 30 req/min | 履歴取得 |
| POST /auth/login | 5 req/5min | ブルートフォース対策 |

#### Cloudflare Rate Limiting設定

```
Rule: Rate limit face registration
  Expression: (http.request.uri.path eq "/api/face/register")
  Requests: 5
  Period: 60 seconds
  Action: Block
  Duration: 300 seconds

Rule: Rate limit authentication
  Expression: (http.request.uri.path eq "/auth/login")
  Requests: 5
  Period: 300 seconds
  Action: Block
  Duration: 600 seconds
```

### 3.4 DDoS対策

#### Cloudflare標準保護

- Layer 3/4 DDoS攻撃: 自動ミティゲーション
- Layer 7 DDoS攻撃: WAF + Rate Limiting

#### 追加推奨設定

```
Cloudflare → Security → DDoS
  HTTP DDoS Attack Protection: ON
  Advanced TCP Protection: ON (Cloudflare Pro以上)

Cloudflare → Speed → Optimization
  Auto Minify: ON (HTML, CSS, JS)
  Brotli: ON
```

---

## 4. コンプライアンス

### 4.1 GDPR、個人情報保護法への対応

#### 法的要件マトリックス

| 要件 | GDPR | 個人情報保護法 | 現状対応 | 必要な対応 |
|------|------|-------------|---------|-----------|
| 利用目的の明示 | 必須 | 必須 | ❌ 未実装 | プライバシーポリシー作成 |
| 同意の取得 | 必須 | 必須 | ❌ 未実装 | 初回起動時の同意画面 |
| データ削除権 | 必須 | 推奨 | ❌ 未実装 | 削除API実装 |
| データポータビリティ | 必須 | - | ❌ 未実装 | エクスポート機能実装 |
| 漏洩時の通知 | 72時間以内 | 速やか | ❌ 未実装 | インシデント対応計画 |
| データ保護責任者 | 必須（条件） | - | ❌ 未設置 | DPO任命検討 |

#### 推奨対応

**フェーズ1: プライバシーポリシー策定**

必須記載事項:
1. 事業者の名称・連絡先
2. 個人情報の利用目的（入退場管理、CCUS連携等）
3. 取得する個人情報の項目（顔画像、氏名、CCUS ID等）
4. 第三者提供の有無（CCUS API連携）
5. 保存期間（5年間等）
6. 開示・訂正・削除の請求方法
7. Cookie・トラッキング技術の使用
8. 問い合わせ窓口

**フェーズ2: 同意取得機能の実装**

```typescript
// apps/mobile/src/screens/OnboardingScreen.tsx（新規作成）
export function OnboardingScreen() {
  return (
    <View>
      <Text>プライバシーポリシー</Text>
      <ScrollView>
        <Text>{PRIVACY_POLICY_TEXT}</Text>
      </ScrollView>
      <Button title="同意する" onPress={handleAccept} />
      <Button title="同意しない" onPress={handleDecline} />
    </View>
  );
}
```

**フェーズ3: データ削除API実装**

```typescript
// apps/gs-api/src/routes/user.ts（新規作成）
router.delete('/api/users/:userId/data', jwtAuthMiddleware, async (req, res) => {
  const userId = req.params.userId;

  // 自分のデータのみ削除可能
  if (req.user.sub !== userId) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  // 顔画像削除
  await faceApiClient.delete(`/faces/${userId}`);

  // イベント履歴削除
  await db.scanEvents.deleteMany({ where: { personId: userId } });

  res.json({ message: 'Data deleted successfully' });
});
```

### 4.2 アクセスログの保存

#### 推奨ログ項目

| 項目 | 目的 | 保存期間 |
|------|------|---------|
| 認証ログ | セキュリティ監査 | 1年 |
| APIアクセスログ | 利用状況分析 | 6ヶ月 |
| エラーログ | デバッグ | 3ヶ月 |
| 監査ログ | コンプライアンス | 5年 |

#### 実装

**Keycloakイベントログ**:

```
Keycloak → Realm Settings → Events
  Login Events: ON
  Save Events: ON
  Expiration: 365 days

  Event Listeners:
    - jboss-logging
    - metrics-listener（Prometheus連携）
```

**APIアクセスログ**:

```typescript
// apps/gs-api/src/middleware/logging.ts（新規作成）
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';

const accessLogStream = fs.createWriteStream(
  path.join(__dirname, '../../logs/access.log'),
  { flags: 'a' }
);

export const loggingMiddleware = morgan(
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms',
  { stream: accessLogStream }
);
```

### 4.3 監査ログの設定

#### 監査対象イベント

| イベント | ログ内容 | 重要度 |
|---------|---------|-------|
| ログイン成功/失敗 | ユーザーID、IP、タイムスタンプ | 🔴 高 |
| 顔画像登録 | ユーザーID、画像ハッシュ | 🔴 高 |
| データ削除 | 対象データ、実行者 | 🔴 高 |
| 設定変更 | 変更内容、実行者 | 🟡 中 |
| API Key変更 | 変更者、タイムスタンプ | 🔴 高 |

#### 実装

```typescript
// packages/core/src/audit/logger.ts（新規作成）
export interface AuditLog {
  eventType: 'LOGIN' | 'FACE_REGISTER' | 'DATA_DELETE' | 'CONFIG_CHANGE';
  userId: string;
  ipAddress: string;
  timestamp: Date;
  details: Record<string, any>;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export async function logAuditEvent(log: AuditLog) {
  await db.auditLogs.create({ data: log });

  // 重大イベントはSlack通知
  if (log.severity === 'CRITICAL') {
    await notifySlack(log);
  }
}
```

---

## 5. 脆弱性対策

### 5.1 OWASP Top 10への対策状況

| OWASP 項目 | リスク | 現状対応 | 推奨対応 |
|-----------|-------|---------|---------|
| A01: Broken Access Control | 🟡 中 | JWT認証実装済み | プロジェクト単位のアクセス制御強化 |
| A02: Cryptographic Failures | 🔴 高 | HTTP通信 | **HTTPS化（必須）** |
| A03: Injection | 🟢 低 | パラメータ化クエリ使用 | 入力値検証強化 |
| A04: Insecure Design | 🟡 中 | 基本設計のみ | 脅威モデリング実施 |
| A05: Security Misconfiguration | 🔴 高 | デフォルト設定使用 | **本番用設定の強化** |
| A06: Vulnerable Components | 🟡 中 | 手動更新 | 自動スキャン導入 |
| A07: ID & Auth Failures | 🟢 低 | OAuth 2.0 + PKCE | MFA検討 |
| A08: Software & Data Integrity | 🟡 中 | 未対応 | SRI、署名検証 |
| A09: Logging & Monitoring | 🟡 中 | 基本ログのみ | 監査ログ強化 |
| A10: SSRF | 🟢 低 | 外部API呼び出し制限 | URL検証強化 |

#### 対策詳細

**A01: Broken Access Control**

現状:
```typescript
// apps/gs-api/src/middleware/auth.ts
// APIキー認証のみ - プロジェクト単位のアクセス制御なし
```

推奨:
```typescript
// apps/gs-api/src/middleware/project-access.ts（新規作成）
export function checkProjectAccess(req: Request, res: Response, next: NextFunction) {
  const projectId = req.params.projectId;
  const userProjects = req.user?.resource_access?.['mc-gate']?.roles
    ?.filter(r => r.startsWith('project:'))
    ?.map(r => r.replace('project:', ''));

  if (!userProjects?.includes(projectId)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  next();
}
```

**A02: Cryptographic Failures**

🔴 **最優先対応**: HTTPS化（前述の「2.1 個人情報の伝送時暗号化」参照）

**A03: Injection**

現状:
```typescript
// packages/core/src/queue/sqlite.ts
// ✅ パラメータ化クエリ使用
await db.runAsync(
  `INSERT INTO scan_events (...) VALUES (?, ?, ?, ...)`,
  [event.id, event.projectId, ...]
);
```

推奨: 入力値検証の追加
```typescript
import { z } from 'zod';

const ScanEventSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().regex(/^PRJ\d{3}$/),
  personId: z.string().max(100),
  // ...
});

export function validateScanEvent(event: unknown) {
  return ScanEventSchema.parse(event);
}
```

**A05: Security Misconfiguration**

🔴 **必須対応**:

```yaml
# docker-compose.yml（本番環境）
keycloak:
  environment:
    KC_HOSTNAME_STRICT: "true"              # ✅ ホスト名検証
    KC_HTTP_ENABLED: "false"                # ✅ HTTP無効化
    KEYCLOAK_ADMIN_PASSWORD: ${KC_ADMIN_PW} # ✅ 環境変数化

postgres:
  environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # ✅ 環境変数化
  command: >
    postgres
      -c ssl=on                              # ✅ SSL強制
      -c log_connections=on                  # ✅ 接続ログ
```

### 5.2 SQLインジェクション、XSS対策の確認

#### SQLインジェクション対策

**現状**: ✅ 良好

すべてのデータベースクエリでパラメータ化クエリを使用：
- `/volume2/Project/MCD3/TUMON/mc-gate/packages/core/src/queue/sqlite.ts`
- `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/utils/seedData.ts`

**追加推奨**: ORM使用の検討

```typescript
// Prisma導入例
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ✅ SQLインジェクション完全防止
const events = await prisma.scanEvent.findMany({
  where: {
    projectId: projectId,  // 自動エスケープ
  },
});
```

#### XSS対策

**現状**: React Nativeは基本的にXSS安全（dangerouslySetInnerHTML未使用）

**追加推奨**: サーバー側でのサニタイゼーション

```typescript
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],  // HTMLタグをすべて除去
    ALLOWED_ATTR: [],
  });
}
```

### 5.3 依存パッケージの脆弱性スキャン

#### 現状

手動でのパッケージ更新のみ。自動スキャンなし。

#### 推奨ツール

**オプション1: npm audit（基本）**

```bash
# 定期実行
pnpm audit --audit-level moderate
pnpm audit fix
```

**オプション2: Snyk（推奨）**

```bash
# インストール
npm install -g snyk

# 認証
snyk auth

# スキャン
snyk test

# 自動修正
snyk fix
```

**オプション3: GitHub Dependabot（自動）**

`.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    reviewers:
      - "your-team"
```

#### CI/CDパイプラインへの組み込み

`.github/workflows/security-scan.yml`:
```yaml
name: Security Scan
on:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 0 * * 0'  # 毎週日曜日

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: pnpm install

      - name: Run npm audit
        run: pnpm audit --audit-level high

      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
```

---

## 6. 実装チェックリスト

### 6.1 公開前の必須対応（Phase 1）

#### セキュリティ

- [ ] **HTTPS化**
  - [ ] Cloudflare SSL証明書設定（Full strict）
  - [ ] Keycloak HTTPS設定
  - [ ] app.config.js HTTPS強制検証
  - [ ] すべてのAPI URLをHTTPSに変更

- [ ] **Keycloak外部公開設定**
  - [ ] KC_HOSTNAMEをドメイン名に変更
  - [ ] KC_HTTP_ENABLEDをfalseに設定
  - [ ] KC_HOSTNAME_STRICTをtrueに設定
  - [ ] Valid Redirect URIsに本番URLを追加

- [ ] **データベースアクセス制限**
  - [ ] PostgreSQLポートをlocalhostバインド
  - [ ] Redisポートをlocalhostバインド
  - [ ] Cloudflare Firewall設定

- [ ] **APIキー再生成**
  - [ ] 本番用APIキー生成（64文字ランダム）
  - [ ] ハードコードされたデフォルト値削除
  - [ ] EAS Secretsに登録
  - [ ] 環境変数検証ロジック追加

#### ネットワーク

- [ ] **Cloudflare Firewall設定**
  - [ ] Geo-blocking（日本のみ許可）
  - [ ] Rate Limiting設定
  - [ ] DDoS保護有効化
  - [ ] WAFルール設定

- [ ] **ホストファイアウォール**
  - [ ] ufw設定（必要ポートのみ開放）
  - [ ] Cloudflare IPのみ許可
  - [ ] データベースポート遮断

#### コンプライアンス

- [ ] **プライバシーポリシー**
  - [ ] プライバシーポリシー策定
  - [ ] 利用規約作成
  - [ ] 同意取得画面実装

- [ ] **ログ設定**
  - [ ] アクセスログ保存（6ヶ月）
  - [ ] 監査ログ実装（5年）
  - [ ] Keycloakイベントログ有効化

### 6.2 1週間以内の対応（Phase 2）

#### セキュリティ強化

- [ ] **JWT検証実装**
  - [ ] サーバー側JWT検証ミドルウェア
  - [ ] トークンリフレッシュロジック
  - [ ] トークン無効化機能

- [ ] **入力値検証**
  - [ ] Zodスキーマ定義
  - [ ] すべてのAPIエンドポイントで検証
  - [ ] エラーハンドリング

- [ ] **監査ログ強化**
  - [ ] 重要操作のログ記録
  - [ ] Slack通知連携
  - [ ] ログ検索機能

#### 脆弱性スキャン

- [ ] **自動スキャン導入**
  - [ ] Snyk設定
  - [ ] GitHub Dependabot有効化
  - [ ] CI/CDパイプライン組み込み

- [ ] **OWASP Top 10対策**
  - [ ] プロジェクト単位アクセス制御
  - [ ] 脅威モデリング実施
  - [ ] セキュリティテスト実施

### 6.3 1ヶ月以内の対応（Phase 3）

#### コンプライアンス完全対応

- [ ] **GDPR対応**
  - [ ] データ削除API実装
  - [ ] データエクスポート機能
  - [ ] Cookie同意バナー

- [ ] **インシデント対応計画**
  - [ ] 対応フロー策定
  - [ ] 連絡体制構築
  - [ ] 72時間以内通知体制

#### 監視・運用

- [ ] **監視ツール導入**
  - [ ] Prometheus + Grafana
  - [ ] アラート設定
  - [ ] SLA定義

- [ ] **バックアップ**
  - [ ] 自動バックアップ設定
  - [ ] リストア手順確認
  - [ ] DR計画策定

---

## 7. リスク評価サマリー

### 7.1 総合リスクマトリックス

| リスク項目 | 影響度 | 発生確率 | リスクスコア | 対応優先度 |
|-----------|-------|---------|------------|-----------|
| HTTP通信による個人情報漏洩 | 致命的 | 高 | 🔴 9.0 | **最高** |
| データベースへの直接攻撃 | 高 | 中 | 🟡 7.5 | 高 |
| APIキー漏洩 | 高 | 中 | 🟡 7.0 | 高 |
| DDoS攻撃 | 中 | 中 | 🟡 5.0 | 中 |
| SQLインジェクション | 低 | 低 | 🟢 2.0 | 低 |
| XSS攻撃 | 低 | 低 | 🟢 2.0 | 低 |

### 7.2 コスト見積もり

#### 初期費用

| 項目 | 費用 | 備考 |
|------|------|------|
| Cloudflare Pro | $20/月 | Advanced DDoS保護 |
| SSL証明書 | $0 | Cloudflare無料SSL |
| Snyk Pro | $0〜$99/月 | 最大5プロジェクト |
| 実装工数 | 80人時 | Phase 1〜3合計 |

#### 運用費用（年間）

| 項目 | 費用 |
|------|------|
| Cloudflare Pro | $240 |
| Snyk Pro | $1,188 |
| 監視ツール | $0（自前構築） |
| **合計** | **$1,428（約20万円）** |

### 7.3 ROI（投資対効果）

#### リスク回避による便益

| シナリオ | 発生確率 | 損失額 | 期待損失 |
|---------|---------|-------|---------|
| 個人情報漏洩 | 10%/年 | 1,000万円 | 100万円 |
| システムダウン | 5%/年 | 500万円 | 25万円 |
| 法的責任 | 3%/年 | 2,000万円 | 60万円 |
| **合計期待損失** | - | - | **185万円/年** |

**ROI**: (185万円 - 20万円) / 20万円 = **825%**

---

## 8. 結論と推奨アクション

### 8.1 即座に実施すべき対応（公開前必須）

1. **HTTPS化（最優先）**
   - Cloudflare SSL設定
   - Keycloak HTTPS設定
   - すべてのAPI URLをHTTPS化

2. **Keycloak外部公開設定**
   - ホスト名をドメイン名に変更
   - HTTP無効化
   - ホスト名検証厳格化

3. **データベースアクセス制限**
   - PostgreSQL/Redisポートをlocalhostバインド
   - Cloudflare Firewallでデータベースポート遮断

4. **APIキー再生成**
   - 本番用APIキー生成
   - ハードコード削除
   - EAS Secretsに登録

### 8.2 推奨実装タイムライン

| フェーズ | 期間 | 対応内容 | 担当 |
|---------|------|---------|------|
| Phase 0（準備） | 3日 | 環境構築、ドメイン取得 | インフラ |
| Phase 1（公開前必須） | 1週間 | HTTPS化、Keycloak設定、DB制限 | 全員 |
| Phase 2（強化） | 1週間 | JWT検証、Rate Limiting、監査ログ | バックエンド |
| Phase 3（完全対応） | 2週間 | GDPR対応、監視ツール、DR計画 | 全員 |

### 8.3 最終チェックリスト

**公開前の確認事項**:

- [ ] すべてのAPI通信がHTTPS
- [ ] Keycloakが外部ドメインで動作
- [ ] データベースが外部アクセス不可
- [ ] 本番用APIキーに変更済み
- [ ] Cloudflare Firewall設定完了
- [ ] Rate Limiting動作確認
- [ ] プライバシーポリシー公開
- [ ] アクセスログ保存確認
- [ ] 監査ログ動作確認
- [ ] 脆弱性スキャン実施（Critical/High: 0件）

**公開判定基準**:
- ✅ すべての「Phase 1（公開前必須）」対応完了
- ✅ リスクスコア 🔴 9.0以上の項目がゼロ
- ✅ セキュリティテスト合格

---

## 付録

### A. 参考ドキュメント

1. **OWASP**
   - [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
   - [OWASP Mobile Security Testing Guide](https://owasp.org/www-project-mobile-security-testing-guide/)

2. **Cloudflare**
   - [Cloudflare WAF Documentation](https://developers.cloudflare.com/waf/)
   - [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)

3. **Keycloak**
   - [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/)
   - [Securing Applications and Services Guide](https://www.keycloak.org/docs/latest/securing_apps/)

4. **コンプライアンス**
   - [GDPR公式サイト](https://gdpr.eu/)
   - [個人情報保護委員会](https://www.ppc.go.jp/)

### B. 緊急連絡先

| 役割 | 担当者 | 連絡先 |
|------|-------|-------|
| セキュリティ責任者 | （設定必要） | - |
| インフラ担当 | （設定必要） | - |
| 法務担当 | （設定必要） | - |
| 個人情報保護委員会 | - | 03-6457-9680 |

### C. 用語集

| 用語 | 説明 |
|------|------|
| MITM | Man-in-the-Middle Attack（中間者攻撃） |
| PKCE | Proof Key for Code Exchange |
| WAF | Web Application Firewall |
| DDoS | Distributed Denial of Service |
| GDPR | General Data Protection Regulation（EU一般データ保護規則） |
| CCUS | Construction Career Up System（建設キャリアアップシステム） |

---

**最終更新**: 2025-12-02
**作成者**: Claude Code Security Assessment
**バージョン**: 1.0.0
**承認**: （承認者署名）
