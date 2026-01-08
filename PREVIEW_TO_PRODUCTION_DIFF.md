# Preview → Production 環境差分洗い出し

**作成日**: 2026-01-08
**目的**: 本番リリース前の差分を明確化し、実装ミスを防ぐ
**状態**: 📋 設計フェーズ（コードは触らない）

---

## 🎯 差分表（Configuration Differences）

| 項目 | Preview (現在) | Production (目標) | 変更必要性 | 優先度 | 備考 |
|------|---------------|------------------|----------|--------|------|
| **API Endpoints** |  |  |  |  |  |
| Face API | `face-gate.bme-service.monster` | `face-gate-prod.bme-service.monster` | ✅ 必須 | 🔴 高 | Cloudflare Tunnelで分離 |
| GS API | `api-gate.bme-service.monster` | `api-gate-prod.bme-service.monster` | ✅ 必須 | 🔴 高 | 本番データベース使用 |
| CCUS API | `api-gate.bme-service.monster` | `api-gate-prod.bme-service.monster` | ✅ 必須 | 🔴 高 | 本番データベース使用 |
| Auth (Keycloak) | `auth-gate.bme-service.monster` | `auth-gate-prod.bme-service.monster` | ✅ 必須 | 🔴 高 | 本番Realm使用 |
| **API Keys** |  |  |  |  |  |
| apiGsApiKey | 開発用fallback有り | fallback除去 or 明示ガード | ✅ 必須 | 🔴 高 | 空文字列でクラッシュ防止 |
| apiFaceApiKey | 開発用fallback有り | fallback除去 or 明示ガード | ✅ 必須 | 🔴 高 | 本番キーのみ許可 |
| **Build Configuration** |  |  |  |  |  |
| EAS Channel | `preview` | `production` | ✅ 必須 | 🔴 高 | eas.jsonで設定済み |
| App Version | 1.0.8 (versionCode 9) | 1.1.0 (versionCode 10+) | ✅ 必須 | 🟡 中 | 本番初回リリース |
| Distribution | `internal` (APK) | `store` (AAB) | ✅ 必須 | 🟡 中 | Google Playストア用 |
| **Security Settings** |  |  |  |  |  |
| useMockAuth | false（環境変数制御） | false（強制） | ✅ 必須 | 🔴 高 | 本番で絶対false |
| usesCleartextTraffic | true（開発用） | false | ✅ 必須 | 🔴 高 | HTTPS強制 |
| ログアウト条件 | 401/403両方 | 401のみ | ✅ 必須 | 🔴 高 | 403は権限不足（ログアウト不要） |
| **Monitoring & Logging** |  |  |  |  |  |
| Sentry DSN | 未設定 | 本番DSN設定 | 🟡 推奨 | 🟡 中 | エラー追跡 |
| console.log | 有効 | 無効化 or レベル制御 | 🟡 推奨 | 🟢 低 | パフォーマンス改善 |
| **Database** |  |  |  |  |  |
| SQLite DB Name | `mc-gate.db` | `mc-gate.db` | ❌ 不要 | - | 同じでOK |
| Seed Data | 開発用ダミー生成可能 | 生成機能を隠す | 🟡 推奨 | 🟢 低 | 本番では不要 |

---

## 📋 変更が必要な箇所（File Mapping）

### 1. API Endpoints 変更

#### `apps/mobile/app.config.ts`
**現在**:
```typescript
extra: {
  apiFaceApi: process.env.API_FACE_API || "https://face-gate.bme-service.monster",
  apiBaseGs: process.env.API_BASE_GS || "https://api-gate.bme-service.monster",
  apiBaseCcus: process.env.API_BASE_CCUS || "https://api-gate.bme-service.monster",
  auth: {
    issuer: process.env.AUTH_ISSUER || "https://auth-gate.bme-service.monster/realms/mcd3",
  },
}
```

**Production**:
```typescript
extra: {
  apiFaceApi: process.env.API_FACE_API || "https://face-gate-prod.bme-service.monster",
  apiBaseGs: process.env.API_BASE_GS || "https://api-gate-prod.bme-service.monster",
  apiBaseCcus: process.env.API_BASE_CCUS || "https://api-gate-prod.bme-service.monster",
  auth: {
    issuer: process.env.AUTH_ISSUER || "https://auth-gate-prod.bme-service.monster/realms/mcd3",
  },
}
```

#### `eas.json` (production profile)
**確認項目**:
- `channel: "production"` が設定されているか
- 環境変数で本番APIエンドポイントが注入されるか

**現在**:
```json
{
  "build": {
    "production": {
      "channel": "production",
      "distribution": "store",
      "autoIncrement": true
    }
  }
}
```

**Production 用の環境変数追加（推奨）**:
```json
{
  "build": {
    "production": {
      "channel": "production",
      "distribution": "store",
      "autoIncrement": true,
      "env": {
        "APP_ENV": "production",
        "API_FACE_API": "https://face-gate-prod.bme-service.monster",
        "API_BASE_GS": "https://api-gate-prod.bme-service.monster",
        "API_BASE_CCUS": "https://api-gate-prod.bme-service.monster",
        "AUTH_ISSUER": "https://auth-gate-prod.bme-service.monster/realms/mcd3"
      }
    }
  }
}
```

---

### 2. API Keys 変更

#### `apps/mobile/src/app/(tabs)/settings.tsx:390-414`

**現在** (開発用fallback有り):
```typescript
const effectiveApiKey = apiGsApiKey || "development-api-key-12345";
```

**Production Option A** (fallback除去):
```typescript
// 本番では空文字列の場合はエラー表示
if (!apiGsApiKey) {
  Alert.alert("設定エラー", "API Keyが設定されていません。管理者に連絡してください。");
  return;
}
const effectiveApiKey = apiGsApiKey;
```

**Production Option B** (明示的なガード):
```typescript
const isDevelopment = __DEV__ || process.env.APP_ENV === "development";
const effectiveApiKey = apiGsApiKey || (isDevelopment ? "development-api-key-12345" : null);

if (!effectiveApiKey) {
  Alert.alert("設定エラー", "API Keyが設定されていません。");
  return;
}
```

**推奨**: Option B（開発環境との互換性を保ちつつ、本番で明示的にエラー）

#### `apps/mobile/src/hooks/useFaceApi.ts` (apiFaceApiKey)

同様の変更が必要。

---

### 3. Security Settings 変更

#### `apps/mobile/app.config.ts` (useMockAuth強制false)

**現在**:
```typescript
extra: {
  useMockAuth: process.env.USE_MOCK_AUTH === "true" && (process.env.APP_ENV !== "production"),
}
```

**Production** (すでに安全):
- `APP_ENV=production` なら強制的に `false`
- 追加変更は不要 ✅

#### `apps/mobile/app.config.ts` (usesCleartextTraffic 無効化)

**現在** (開発用HTTP許可):
```typescript
plugins: [
  [
    "expo-build-properties",
    {
      android: {
        usesCleartextTraffic: true,  // 開発用
      },
    },
  ],
],
```

**Production** (HTTPS強制):
```typescript
plugins: [
  [
    "expo-build-properties",
    {
      android: {
        usesCleartextTraffic: false,  // 本番はHTTPSのみ
      },
    },
  ],
],
```

**注意**: ネイティブ変更のため、**新しいビルドが必要**

#### `apps/mobile/src/app/index.tsx` (ログアウト条件)

**現在** (401/403両方でログアウト):
```typescript
if (error.response?.status === 401 || error.response?.status === 403) {
  console.error("[Auth] Session expired, logging out");
  logout();
}
```

**Production** (401のみでログアウト):
```typescript
if (error.response?.status === 401) {
  console.error("[Auth] Session expired, logging out");
  logout();
}
// 403 は権限不足（ログアウト不要、エラー表示のみ）
if (error.response?.status === 403) {
  console.warn("[Auth] Access forbidden (insufficient permissions)");
  Alert.alert("権限不足", "この操作を実行する権限がありません。");
}
```

---

### 4. Monitoring & Logging

#### Sentry導入（推奨）

**追加が必要なパッケージ**:
```bash
npx expo install @sentry/react-native
```

**app.config.ts**:
```typescript
extra: {
  sentryDsn: process.env.SENTRY_DSN || null,
}
```

**apps/mobile/src/app/index.tsx**:
```typescript
import * as Sentry from "@sentry/react-native";

if (Constants.expoConfig?.extra?.sentryDsn) {
  Sentry.init({
    dsn: Constants.expoConfig.extra.sentryDsn,
    environment: process.env.APP_ENV || "development",
  });
}
```

#### console.log 制御（推奨）

**現在**: すべての `console.log` が有効

**Production Option A** (完全無効化):
```typescript
// apps/mobile/src/utils/logger.ts (新規作成)
const isDevelopment = __DEV__;

export const logger = {
  error: isDevelopment ? console.error : () => {},
  warn: isDevelopment ? console.warn : () => {},
  info: isDevelopment ? console.log : () => {},
  debug: isDevelopment ? console.debug : () => {},
};
```

**Production Option B** (Sentryに送信):
```typescript
export const logger = {
  error: (msg: string, ...args: any[]) => {
    console.error(msg, ...args);
    Sentry.captureException(new Error(msg));
  },
  warn: isDevelopment ? console.warn : () => {},
  info: isDevelopment ? console.log : () => {},
  debug: () => {},
};
```

---

## 🚨 実装前の重要な確認事項

### チェックリスト（実装前に必ず確認）

#### Cloudflare Tunnel 設定
- [ ] `face-gate-prod.bme-service.monster` が正しいポートを指している
- [ ] `api-gate-prod.bme-service.monster` が正しいポートを指している
- [ ] `auth-gate-prod.bme-service.monster` が正しいポートを指している
- [ ] 本番データベースが別途用意されている

#### EAS Secrets 設定（オプション）
- [ ] `eas secret:create` で本番API Keyを登録するか検討
- [ ] eas.jsonで環境変数として注入するか検討
- [ ] ハードコードを避けるための方針決定

#### ビルド要件確認
- [ ] `usesCleartextTraffic: false` はネイティブ変更（新ビルド必須）
- [ ] API URL変更はJSのみ（EAS Updateで対応可能）
- [ ] バージョン番号は 1.1.0 以上にする

#### テスト環境確認
- [ ] 本番APIサーバーが起動している
- [ ] 本番Keycloakが正しく設定されている
- [ ] 本番Face APIが正しく設定されている
- [ ] 本番データベースが初期化されている

---

## 🎯 実装順序（推奨）

### Phase 1: 設計確認（今ここ） ✅
- [x] 差分表を作成
- [x] 変更が必要な箇所を洗い出し
- [x] Cloudflare Tunnel設定を確認
- [ ] チーム内で方針合意（API Key注入方法、ログレベルなど）

### Phase 2: インフラ準備
- [ ] Cloudflare Tunnelで本番ドメイン設定
- [ ] 本番データベース構築
- [ ] 本番Keycloak設定
- [ ] 本番Face APIデプロイ
- [ ] 疎通テスト（curl/Postman）

### Phase 3: コード変更
- [ ] app.config.ts の API URL変更
- [ ] eas.json の production profile 環境変数設定
- [ ] settings.tsx の API Key fallback 変更
- [ ] usesCleartextTraffic を false に変更
- [ ] ログアウト条件を401のみに変更
- [ ] Sentry導入（オプション）

### Phase 4: ビルド & テスト
- [ ] Production ビルド作成（新ビルド必須）
- [ ] EAS Update 配信
- [ ] 実機テスト（本番API接続）
- [ ] E2Eテスト再実行
- [ ] SSOT更新（本番テスト結果を追記）

### Phase 5: リリース
- [ ] Google Play Console 設定
- [ ] ストアリスティング作成
- [ ] 審査提出
- [ ] 本番監視開始

---

## 💡 重要な設計判断が必要な項目

### 1. API Key の注入方法

**Option A**: eas.jsonで環境変数注入
```json
{
  "build": {
    "production": {
      "env": {
        "API_GS_API_KEY": "production-secret-key-xxx"
      }
    }
  }
}
```
- メリット: シンプル
- デメリット: eas.jsonをgitにコミットすると漏洩リスク

**Option B**: EAS Secrets使用
```bash
eas secret:create --scope project --name API_GS_API_KEY --value "production-secret-key-xxx" --type string
```
- メリット: セキュア、gitに載らない
- デメリット: 初回設定が手間

**推奨**: Option B（EAS Secrets）

### 2. ログアウト条件

**現在の実装**: 401/403両方でログアウト
**問題**: 403は権限不足であり、セッション切れではない

**推奨**: 401のみでログアウト、403はエラー表示のみ

### 3. console.log 制御

**Option A**: 完全無効化（パフォーマンス優先）
**Option B**: Sentryに送信（デバッグ優先）

**推奨**: Option B（本番エラーのデバッグが重要）

---

## 🔗 関連ドキュメント

- `SSOT_WORKER_SYNC_FACE_AUTH_E2E.md`: テスト結果の真実
- `CLAUDE.md`: EAS Build & Update ガイドライン
- `docs/SECURITY_POLICY_UI.md`: UI Security Policy

---

**Document Version**: 1.0
**Last Updated**: 2026-01-08
**Status**: 📋 設計フェーズ（実装待ち）
**Next Step**: チーム内で方針合意 → インフラ準備
