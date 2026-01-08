# Production移行 - 最初の3項目決定

**作成日**: 2026-01-08
**目的**: 本番移行の最小アクションを定義し、実装ブロックを解除する
**状態**: 🟡 決定待ち（3項目すべて未決定）

---

## 🎯 なぜ3項目だけ決めるのか

**理由**:
- 550行の差分表を全部読んでも、最初の一歩が踏み出せない
- 3項目決めれば、残りは自動的に決まる（連鎖決定）
- 実装しながら学ぶ方が速い（ペーパープランで止まるな）

**3項目の選定基準**:
1. **ブロッカー**: これが決まらないと何も進まない
2. **連鎖効果**: これが決まると他の項目も決まる
3. **リスク最小**: 失敗しても戻せる（不可逆変更を避ける）

---

## 📋 最初の3項目（優先度順）

### 1️⃣ 本番APIキーの注入方式

**問題**:
- 現在: 開発用fallback (`"development-api-key-12345"`) がコードに埋め込まれている
- 本番: APIキーをどうやって注入するか？

**選択肢**:

#### Option A: EAS Secrets（推奨）
```bash
# 設定方法
eas secret:create --scope project --name API_GS_API_KEY --value "production-secret-key-xxx" --type string
eas secret:create --scope project --name API_FACE_API_KEY --value "production-secret-key-yyy" --type string
```

**メリット**:
- ✅ セキュア（gitに載らない）
- ✅ EAS Dashboardで管理可能
- ✅ 環境ごとに異なるキーを設定可能

**デメリット**:
- ❌ 初回設定が手間
- ❌ ローカル開発時は `.env` 併用が必要

**実装影響**:
- `eas.json` の `production` profile に環境変数参照を追加
- `app.config.ts` で `process.env.API_GS_API_KEY` を参照
- fallbackを環境判定で保護

**実装コード**:
```typescript
// app.config.ts
const isDevelopment = process.env.APP_ENV !== "production";
const apiGsApiKey = process.env.API_GS_API_KEY || (isDevelopment ? "development-api-key-12345" : null);

if (!apiGsApiKey && process.env.APP_ENV === "production") {
  throw new Error("API_GS_API_KEY is required in production");
}
```

---

#### Option B: eas.jsonにハードコード
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

**メリット**:
- ✅ シンプル
- ✅ 設定が明確

**デメリット**:
- ❌ gitにコミットすると漏洩リスク
- ❌ `.gitignore` に追加が必要

**実装影響**:
- `eas.json` を `.gitignore` に追加
- チーム内で `eas.json` の共有方法を決める

---

#### Option C: Remote Config（Firebase/Expo Constants）
**メリット**:
- ✅ ビルド不要で変更可能
- ✅ 動的に切り替え可能

**デメリット**:
- ❌ 初回設定が複雑
- ❌ オフライン時に取得できない

---

**🟡 決定事項** (未決定):
```
[ ] Option A: EAS Secrets（推奨）
[ ] Option B: eas.jsonにハードコード
[ ] Option C: Remote Config
[ ] その他:
```

**決定者**: ___________
**決定日**: ___________

---

### 2️⃣ ログアウト条件（401のみ、403はログアウト禁止）

**問題**:
- 現在: 401/403両方でログアウトしている
- 本番: 403は権限不足であり、セッション切れではない → ログアウト不要

**選択肢**:

#### Option A: 401のみでログアウト（推奨）
```typescript
// apps/mobile/src/app/index.tsx
if (error.response?.status === 401) {
  console.error("[Auth] Session expired (401), logging out");
  logout();
}
if (error.response?.status === 403) {
  console.warn("[Auth] Access forbidden (403)");
  Alert.alert("権限不足", "この操作を実行する権限がありません。");
}
```

**メリット**:
- ✅ 正しいHTTPセマンティクス
- ✅ UX改善（権限不足のたびに再ログイン不要）

**デメリット**:
- ❌ なし

**実装影響**:
- `apps/mobile/src/app/index.tsx` のHTTPインターセプター修正
- 1箇所のみ変更

---

#### Option B: 現状維持（401/403両方でログアウト）
**メリット**:
- ✅ 変更不要

**デメリット**:
- ❌ UX悪化（権限不足のたびに再ログイン）
- ❌ 不正確なHTTPセマンティクス

---

**🟢 決定事項** (推奨を採用):
```
[x] Option A: 401のみでログアウト（推奨）
[ ] Option B: 現状維持
```

**理由**: HTTPセマンティクスに準拠し、UX改善につながる
**実装者**: Claude Code
**実装予定日**: 2026-01-09

---

### 3️⃣ SSOT環境判定（preview/prodでAPIエンドポイントの切り替え）

**問題**:
- 現在: `app.config.ts` のfallbackがpreview APIエンドポイントを指している
- 本番: production profileでビルドしても、fallbackがpreview APIを使ってしまう

**選択肢**:

#### Option A: EAS profileでAPI URLを完全に上書き（推奨）
```json
// eas.json
{
  "build": {
    "preview": {
      "channel": "preview",
      "env": {
        "APP_ENV": "preview",
        "API_FACE_API": "https://face-gate.bme-service.monster",
        "API_BASE_GS": "https://api-gate.bme-service.monster",
        "API_BASE_CCUS": "https://api-gate.bme-service.monster",
        "AUTH_ISSUER": "https://auth-gate.bme-service.monster/realms/mcd3"
      }
    },
    "production": {
      "channel": "production",
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

```typescript
// app.config.ts
const appEnv = process.env.APP_ENV || "development";

extra: {
  apiFaceApi: process.env.API_FACE_API,
  apiBaseGs: process.env.API_BASE_GS,
  apiBaseCcus: process.env.API_BASE_CCUS,
  auth: {
    issuer: process.env.AUTH_ISSUER,
  },
}
```

**メリット**:
- ✅ 明確（環境ごとにエンドポイントが決まる）
- ✅ fallbackなし（環境変数が必須）
- ✅ 本番で誤ってpreview APIにアクセスするリスクゼロ

**デメリット**:
- ❌ ローカル開発時は `.env` が必須

**実装影響**:
- `eas.json` に環境変数追加
- `app.config.ts` からfallbackを削除
- `.env.example` を作成してドキュメント化

---

#### Option B: fallbackを環境判定で保護
```typescript
// app.config.ts
const appEnv = process.env.APP_ENV || "development";

const getApiEndpoints = () => {
  if (appEnv === "production") {
    return {
      apiFaceApi: process.env.API_FACE_API || null,
      apiBaseGs: process.env.API_BASE_GS || null,
      apiBaseCcus: process.env.API_BASE_CCUS || null,
      authIssuer: process.env.AUTH_ISSUER || null,
    };
  } else {
    return {
      apiFaceApi: process.env.API_FACE_API || "https://face-gate.bme-service.monster",
      apiBaseGs: process.env.API_BASE_GS || "https://api-gate.bme-service.monster",
      apiBaseCcus: process.env.API_BASE_CCUS || "https://api-gate.bme-service.monster",
      authIssuer: process.env.AUTH_ISSUER || "https://auth-gate.bme-service.monster/realms/mcd3",
    };
  }
};

const endpoints = getApiEndpoints();

if (appEnv === "production" && (!endpoints.apiFaceApi || !endpoints.apiBaseGs)) {
  throw new Error("API endpoints are required in production");
}

extra: {
  apiFaceApi: endpoints.apiFaceApi,
  apiBaseGs: endpoints.apiBaseGs,
  apiBaseCcus: endpoints.apiBaseCcus,
  auth: {
    issuer: endpoints.authIssuer,
  },
}
```

**メリット**:
- ✅ ローカル開発時にfallbackが効く
- ✅ 本番では環境変数が必須（fallbackが効かない）

**デメリット**:
- ❌ コードが複雑
- ❌ fallback URLがpreview/productionどちらを指すか不明確

---

**🟡 決定事項** (未決定):
```
[ ] Option A: EAS profileでAPI URLを完全に上書き（推奨）
[ ] Option B: fallbackを環境判定で保護
[ ] その他:
```

**決定者**: ___________
**決定日**: ___________

---

## 🚀 決定後のアクションプラン

### 3項目すべて決定したら

1. **即座に実装開始**（ペーパープランで止まるな）
2. **1項目ずつコミット**（3項目まとめない）
3. **実装後に差分表を更新**（PREVIEW_TO_PRODUCTION_DIFF.mdにチェックマーク）

### 実装順序

```
1. ログアウト条件修正（401のみ）
   ↓ 10分で完了、リスクゼロ
2. SSOT環境判定（API URLの切り替え）
   ↓ 30分で完了、preview環境でテスト可能
3. APIキー注入方式の実装
   ↓ 1時間で完了、EAS Secretsの初回設定が手間
```

---

## 📊 連鎖決定マップ（3項目が決まると...）

### 1️⃣ APIキー注入方式が決まると...
- ✅ `apps/mobile/src/app/(tabs)/settings.tsx` の修正方針が決まる
- ✅ `apps/mobile/src/hooks/useFaceApi.ts` の修正方針が決まる
- ✅ ローカル開発環境のセットアップ手順が決まる
- ✅ `.env.example` の内容が決まる

### 2️⃣ ログアウト条件が決まると...
- ✅ HTTPインターセプターの実装が決まる
- ✅ エラーハンドリングの統一方針が決まる
- ✅ UX設計の基準が決まる

### 3️⃣ SSOT環境判定が決まると...
- ✅ `app.config.ts` のfallback削除/保護が決まる
- ✅ `eas.json` の環境変数設定が決まる
- ✅ Cloudflare Tunnelの本番ドメイン設定が決まる
- ✅ 本番データベースの接続先が決まる

**つまり**:
- 3項目 → 約15項目が自動的に決まる
- 差分表550行 → 実装可能な状態になる

---

## ⚠️ 決定を遅らせるリスク

**遅らせる = リスク増大**:
- ❌ ペーパープランで止まる（実装が進まない）
- ❌ 全部決めようとして、何も決まらない
- ❌ 本番移行が無限に先延ばしになる

**決める = リスク減少**:
- ✅ 実装しながら学べる
- ✅ 失敗しても戻せる（不可逆変更ではない）
- ✅ 次の項目が見えてくる

---

## 💡 決定のためのヒント

### Q1: APIキー注入方式、どれを選べばいい？

**迷ったら**: **Option A: EAS Secrets**

**理由**:
- Expoが推奨する方法
- gitに載らない（セキュア）
- 環境ごとに切り替え可能
- 初回設定の手間は1回だけ

### Q2: ログアウト条件、本当に変えていい？

**答え**: **Yes、変えるべき**

**理由**:
- HTTPセマンティクスに準拠
- UX改善
- デメリットなし

### Q3: SSOT環境判定、fallbackは完全に削除していい？

**迷ったら**: **Option A: 完全に削除**（推奨）

**理由**:
- 明確（環境変数が必須）
- 本番で誤ったAPIにアクセスするリスクゼロ
- ローカル開発は `.env` で対応可能

---

## 📝 決定記録テンプレート

決定したら、以下のフォーマットで記録してください：

```markdown
## 決定記録（2026-01-XX）

### 1️⃣ APIキー注入方式
- **決定**: Option A: EAS Secrets
- **決定者**: [名前]
- **理由**: セキュアで環境ごとに切り替え可能
- **実装予定日**: 2026-01-XX

### 2️⃣ ログアウト条件
- **決定**: Option A: 401のみでログアウト
- **決定者**: [名前]
- **理由**: HTTPセマンティクスに準拠
- **実装予定日**: 2026-01-XX

### 3️⃣ SSOT環境判定
- **決定**: Option A: EAS profileでAPI URLを完全に上書き
- **決定者**: [名前]
- **理由**: 本番で誤ったAPIにアクセスするリスクゼロ
- **実装予定日**: 2026-01-XX
```

---

**Document Version**: 1.0
**Last Updated**: 2026-01-08
**Status**: 🟡 決定待ち（3項目すべて未決定）
**Next Step**: 決定者がこのドキュメントを読み、3項目を決定する
