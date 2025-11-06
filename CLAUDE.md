# Claude Knowledge Base - mc-gate Project

## EAS Update 配信の完全ガイド（2025-11-06 解決済み）

### 🎯 黄金ルール

```
expo config で見えないものは EAS には存在しない
```

app.json をいくら編集しても、**app.config.ts が最終的に上書き**するなら意味がない。

---

## ✅ 必須設定（決定版）

### 1. app.config.ts（最重要）

**EAS に必要な値は必ず app.config.ts の最終 return に入れる**

```typescript
// app.config.ts
import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  // EAS 必須項目（絶対に忘れない）
  owner: "bme_llc",
  slug: "mc-gate",

  extra: {
    eas: {
      projectId: "0f0feec5-4f4b-4252-ad34-c1594238b4b8"
    },
    // その他のカスタム設定
    apiBaseGs: process.env.API_BASE_GS || "http://localhost:7070",
    apiBaseCcus: process.env.API_BASE_CCUS || "http://localhost:7071",
    auth: {
      issuer: process.env.AUTH_ISSUER || "http://localhost:8080/auth/realms/mcd3",
      audience: process.env.AUTH_AUDIENCE || "mc-gate",
      clientId: process.env.AUTH_CLIENT_ID || "mc-gate-mobile",
    },
  },

  updates: {
    url: "https://u.expo.dev/0f0feec5-4f4b-4252-ad34-c1594238b4b8"
  },

  runtimeVersion: {
    policy: "sdkVersion"  // または "appVersion"
  },

  plugins: [
    "expo-updates",
    [
      "expo-build-properties",
      {
        ios: { newArchEnabled: true },
        android: { newArchEnabled: true },
      },
    ],
  ],

  // その他の設定...
});
```

### 2. eas.json（最小正解形）

```json
{
  "cli": {
    "version": ">= 16.0.0"
  },
  "build": {
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

**注意**:
- `autoIncrement` は **boolean** である必要がある（`"version"` は NG）
- `cli.projectId` は**書かない**（EAS CLI が自動設定するため、手動設定は禁止）

### 3. 必須パッケージ

```bash
pnpm add expo-updates
```

---

## 🔧 デバッグ手順（秒でトラブル解決）

### ステップ 1: 最終設定の確認

```bash
# EAS に必要な3つの値が揃っているか確認
npx expo config --json | jq '.expo.owner, .expo.slug, .expo.extra.eas.projectId'

# 期待値:
# "bme_llc"
# "mc-gate"
# "0f0feec5-4f4b-4252-ad34-c1594238b4b8"
```

**すべて `null` の場合** → app.config.ts を疑え

### ステップ 2: 動的設定ファイルの確認

```bash
# どのファイルが最終的に使われているか確認
npx expo config --full --json | jq '.dynamicConfigPath'

# 出力例:
# "/path/to/app.config.ts"
```

app.config.ts が存在する場合、**そのファイルに EAS 必須項目を追加**する

### ステップ 3: 認証の確認

```bash
# EXPO_TOKEN が設定されているか
echo $EXPO_TOKEN

# 現在のユーザーを確認
npx eas whoami
# 期待値: bme_llc
```

---

## 🚀 EAS Update コマンド

### 基本コマンド

```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
npx eas-cli update --branch preview --message "更新内容"
```

### 成功時の出力例

```
✔ Published!
Branch             preview
Runtime version    exposdk:54.0.0
Platform           android, ios
Update group ID    c7242b86-f0c7-4bf2-92f1-4275da97a870
EAS Dashboard      https://expo.dev/accounts/bme_llc/projects/mc-gate/updates/...
```

---

## 🐛 よくあるエラーと解決策

### エラー 1: "Cannot read properties of undefined (reading 'projectId')"

**原因**: app.config.ts に `extra.eas.projectId` が存在しない

**解決策**:
```typescript
extra: {
  eas: {
    projectId: "0f0feec5-4f4b-4252-ad34-c1594238b4b8"
  }
}
```

### エラー 2: "EAS project not configured"

**原因**: `owner`, `slug`, `extra.eas.projectId` のいずれかが欠けている

**解決策**: `npx expo config --json` で3つの値を確認

### エラー 3: "eas.json is not valid - autoIncrement must be a boolean"

**原因**: `autoIncrement: "version"` のように文字列で指定している

**解決策**:
```json
{
  "build": {
    "production": {
      "autoIncrement": true  // boolean に修正
    }
  }
}
```

### エラー 4: expo-updates プラグインが見つからない

**原因**: `expo-updates` パッケージがインストールされていない

**解決策**:
```bash
pnpm add expo-updates
```

---

## 🎯 チェックリスト（配信前に必ず確認）

- [ ] `npx expo config --json | jq '.expo.owner'` → `"bme_llc"`
- [ ] `npx expo config --json | jq '.expo.slug'` → `"mc-gate"`
- [ ] `npx expo config --json | jq '.expo.extra.eas.projectId'` → `"0f0feec5-4f4b-4252-ad34-c1594238b4b8"`
- [ ] `npx expo config --json | jq '.expo.updates.url'` → URL が存在
- [ ] `npx expo config --json | jq '.expo.runtimeVersion'` → 設定が存在
- [ ] `echo $EXPO_TOKEN` → トークンが設定されている
- [ ] `npx eas whoami` → `bme_llc`
- [ ] `pnpm list expo-updates` → インストール済み

すべて ✓ なら `eas update` が成功する

---

## 📚 参考情報

### プロジェクト情報
- **Owner**: bme_llc
- **Slug**: mc-gate
- **Project ID**: 0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Updates URL**: https://u.expo.dev/0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Dashboard**: https://expo.dev/accounts/bme_llc/projects/mc-gate

### 重要なドキュメント
- [EAS Update 公式ドキュメント](https://docs.expo.dev/eas-update/introduction/)
- [app.config.js/ts の設定](https://docs.expo.dev/workflow/configuration/)

---

## 🔥 次のステップ（推奨）

1. **EAS Build の自動化**
   ```bash
   pnpm eas build --platform ios --profile production --non-interactive
   ```

2. **環境別設定の切り替え**
   ```typescript
   const getEnvConfig = () => {
     if (process.env.ENV === 'production') {
       return { apiBaseGs: 'https://api.prod.example.com' };
     }
     return { apiBaseGs: 'http://localhost:7070' };
   };
   ```

3. **GitHub Actions で CI/CD**
   ```yaml
   - name: EAS Update
     run: |
       export EXPO_TOKEN=${{ secrets.EXPO_TOKEN }}
       npx eas-cli update --branch ${{ github.ref_name }} --message "${{ github.event.head_commit.message }}"
   ```

4. **バージョン管理の自動化**
   - git tag との連携
   - semantic versioning
   - changelog 自動生成

---

## 📝 トラブルシューティング履歴

### 2025-11-06: EAS Update 初回配信成功

**問題**:
- `eas init` が `Cannot read properties of undefined (reading 'projectId')` で失敗
- EAS CLI のバージョンを変えても同じエラー
- app.json を編集しても反映されない

**根本原因**:
app.config.ts が app.json を上書きしており、EAS 必須項目（`owner`, `extra.eas.projectId`, `updates.url`, `runtimeVersion`）が欠けていた

**解決策**:
1. `npx expo config --full --json | jq '.dynamicConfigPath'` で app.config.ts の存在を確認
2. app.config.ts に EAS 必須項目をすべて追加
3. `npx expo config --json` で設定が反映されていることを確認
4. `eas init` をスキップして直接 `eas update` を実行

**重要な教訓**:
- `eas init` に頼らず、設定を手動で完璧に整える方が確実
- `expo config` の出力が唯一の真実
- app.json と app.config.ts が両方存在する場合、app.config.ts が優先される

---

## 📋 残TODO（今後実装予定）

### 1. バックエンドAPI実装（GS Service）

**優先度: 高**

現在はモックAPI実装のみ。実際のバックエンドサービスを構築する必要がある。

#### 必要なエンドポイント

```typescript
// イベント受信
POST /api/events
  Body: {
    id: string;
    projectId: string;
    personId: string;
    method: "QR" | "CARD";
    gateMode: "IN" | "OUT" | "AUTO";
    decidedMode: "IN" | "OUT";
    occurredAt: string; // ISO8601
    ruleResult: {
      action: "allow" | "warn" | "block";
      messages: string[];
      sendToCcus: boolean;
      includeInGs: boolean;
    };
    transport: {
      idempotencyKey: string;
    };
  }
  Response: { success: boolean }

// イベント履歴取得
GET /api/projects/{projectId}/events
  Query: {
    dateFrom?: string;
    dateTo?: string;
    decidedMode?: "IN" | "OUT";
    limit?: number;
    offset?: number;
  }
  Response: {
    events: ScanEvent[];
    total: number;
  }

// 統計情報取得
GET /api/projects/{projectId}/stats
  Query: {
    date?: string; // デフォルトは今日
  }
  Response: {
    todayIn: number;
    todayOut: number;
    currentInSite: number;
  }
```

#### 実装タスク

- [ ] データベース設計（PostgreSQL or MySQL）
  - events テーブル（id, project_id, person_id, decided_mode, occurred_at, など）
  - インデックス（occurred_at, project_id, idempotency_key）
- [ ] POST /api/events エンドポイント実装
  - 冪等性チェック（idempotency_key でバリデーション）
  - データ永続化
- [ ] GET /api/events エンドポイント実装
  - フィルタリング（日付範囲、mode）
  - ページネーション
- [ ] GET /api/stats エンドポイント実装
  - 今日の入場/退場数計算
  - 現在場内人数計算
- [ ] Keycloak認証連携
  - Bearer token検証
  - プロジェクトアクセス権限チェック
- [ ] モバイルアプリのAPI接続切り替え
  - `/packages/api-client/src/client.ts` のモック実装を実APIに置き換え

---

### 2. リアルタイムデジタルサイネージ機能

**優先度: 中**

現場の入退場状況をリアルタイムでデジタルサイネージに表示する機能。

#### バックエンド実装

```typescript
// WebSocket接続
WebSocket: ws://localhost:7070/ws/projects/{projectId}/events
  - クライアント接続時: プロジェクトIDで購読
  - 新規イベント発生時: 接続中の全クライアントにブロードキャスト
  - 切断時: クリーンアップ

// または Server-Sent Events (SSE)
GET /api/projects/{projectId}/events/stream
  Content-Type: text/event-stream
  - 新規イベントをストリーム配信
  - 自動再接続対応
```

#### フロントエンド実装（サイネージアプリ）

- [ ] サイネージWebアプリ作成（React or Next.js）
  - WebSocketクライアント実装
  - リアルタイムイベント受信
  - 最新10〜20件の履歴表示
  - 入場/退場バッジ（色分け）
  - 現在の場内人数表示
  - 自動スクロール
- [ ] 認証機能
  - Keycloakログイン
  - トークンリフレッシュ
- [ ] オフライン対応
  - WebSocket切断時の再接続ロジック
  - ポーリングフォールバック
- [ ] デザイン
  - 大型ディスプレイ向けUI
  - ダークモード対応
  - レスポンシブデザイン

#### 実装タスク

- [ ] WebSocket/SSEサーバー実装（GS Service）
- [ ] イベントブロードキャスト機能
- [ ] サイネージアプリ開発
- [ ] 接続管理・エラーハンドリング
- [ ] パフォーマンス最適化（バッチ送信、デルタ圧縮）

---

### 3. CCUSカードリーダー（NFC/BLE）対応

**優先度: 中**

QRコードに加えて、CCUSカードの読み取り機能を実装する。

#### 調査事項

- [ ] CCUSカードの仕様確認
  - カード種別（FeliCa / MIFARE）
  - 公開領域で取得可能な情報（UID/IDm、その他）
  - 秘密領域のアクセス要件
- [ ] CCUS APIの仕様確認
  - UIDからworker情報取得APIの有無
  - 認証・権限要件
- [ ] 専用カードリーダーの必要性判断
  - スマホNFCで十分か
  - 専用BLEリーダーが必須か

#### 実装オプション

**オプションA: スマホ内蔵NFC**
- [ ] `react-native-nfc-manager` パッケージ追加
- [ ] app.config.ts に NFC権限追加
- [ ] NFCスキャン画面実装
- [ ] FeliCa IDm（UID）読み取り
- [ ] サーバーAPIでUID→worker情報取得

**オプションB: 専用BLEカードリーダー**
- [ ] メーカーSDK入手
- [ ] `/packages/reader-bridge/src/mock.ts` を実装で置き換え
- [ ] BLE接続・カード検出実装
- [ ] 秘密領域読み取り（SDKによる）

#### 実装タスク

- [ ] CCUSカード仕様調査
- [ ] 実装方針決定（NFC or BLE）
- [ ] reader-bridgeパッケージ実装
- [ ] スキャン画面にカードリーダーオプション追加
- [ ] テスト・デバッグ

---

### 4. iOS アプリ完成・App Store 公開

**優先度: 中**

現在はAndroidアプリのみ。iOSアプリをビルドしてApp Storeで公開する。

#### フェーズ1: 開発ビルド作成

- [ ] iOS開発環境セットアップ
  - Apple Developer Program登録
  - 開発者証明書取得
  - Provisioning Profile作成
- [ ] EAS Build（iOS Development）
  ```bash
  npx eas-cli build --platform ios --profile development
  ```
- [ ] シミュレーターでテスト
- [ ] 実機でテスト（TestFlight経由）

#### フェーズ2: TestFlight ベータ配信

- [ ] EAS Build（iOS Preview）
  ```bash
  npx eas-cli build --platform ios --profile preview
  ```
- [ ] TestFlightにアップロード
- [ ] 内部テスター招待
- [ ] フィードバック収集・バグ修正

#### フェーズ3: App Store 審査準備

- [ ] App Store Connect設定
  - アプリ名、説明、スクリーンショット
  - プライバシーポリシー作成
  - サポートURL設定
- [ ] eas.json の submit 設定更新
  ```json
  {
    "submit": {
      "production": {
        "ios": {
          "appleId": "your-apple-id@example.com",
          "ascAppId": "your-app-store-connect-app-id",
          "appleTeamId": "your-team-id"
        }
      }
    }
  }
  ```
- [ ] 審査用アカウント情報準備
- [ ] App Reviewガイドライン確認

#### フェーズ4: App Store 公開

- [ ] Production ビルド作成
  ```bash
  npx eas-cli build --platform ios --profile production
  ```
- [ ] EAS Submit で自動提出
  ```bash
  npx eas-cli submit --platform ios --profile production
  ```
- [ ] 審査待ち
- [ ] 審査通過後、公開

---

### 5. CI/CD パイプライン構築

**優先度: 低**

GitHub Actions で自動ビルド・デプロイを実現する。

#### 実装タスク

- [ ] GitHub Actions ワークフロー作成
  ```yaml
  name: EAS Build & Update
  on:
    push:
      branches: [main, develop]
    pull_request:

  jobs:
    update:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
        - name: Install dependencies
          run: pnpm install
        - name: EAS Update
          env:
            EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          run: |
            npx eas-cli update --branch ${{ github.ref_name }} \
              --message "${{ github.event.head_commit.message }}"
  ```
- [ ] GitHub Secrets 設定
  - `EXPO_TOKEN`
- [ ] ブランチ戦略決定
  - main → production
  - develop → preview
- [ ] 自動テスト追加
  - type-check
  - lint
  - unit tests
- [ ] Semantic versioning 導入
  - Conventional Commits
  - 自動バージョンアップ
  - CHANGELOG自動生成

---

### 6. その他の改善項目

#### パフォーマンス最適化

- [ ] 画像最適化（アイコン、スプラッシュ）
- [ ] バンドルサイズ削減
- [ ] コード分割（動的import）
- [ ] SQLiteクエリ最適化

#### セキュリティ強化

- [ ] 環境変数の適切な管理（.env.production）
- [ ] API通信のHTTPS化
- [ ] トークンの安全な保存（expo-secure-store使用中）
- [ ] 入力値バリデーション強化

#### ユーザビリティ改善

- [ ] エラーメッセージの多言語対応
- [ ] オンボーディング画面追加
- [ ] ヘルプ・FAQ画面
- [ ] 設定画面のUI改善

#### テスト強化

- [ ] E2Eテスト（Detox or Maestro）
- [ ] 統合テスト
- [ ] スナップショットテスト

---

## 🔍 技術的負債分析レポート（2025-11-06）

### 📊 総合評価: **7.8/10** 🟢

コードベースは良好な状態。重大な問題はなく、本番投入可能な品質レベル。

---

### フェーズ別対応優先度

## 🧪 フェーズ1: モック開発（現在）

**目的**: ローカル環境でのUI/UX検証、基本機能実装

### 対応不要（モック開発では許容）

✅ **モックトークンの使用** (index.tsx:32)
- `token: "mock-token-12345"` を継続使用可能
- ローカル開発では問題なし

✅ **HTTP接続の使用**
- `http://localhost:7070` を継続使用可能
- 本格開発フェーズで切り替え

✅ **console.error の使用**
- デバッグ用途として有効
- 本番リリース前にログレベル制御を実装

### 今すぐ対応（コード品質向上）

#### 🔴 優先度: 高

**1. データベース名の定数化** (seedData.ts, useQueue.ts)

**問題**: `"mc-gate.db"` が3ファイルにハードコード

**影響**: データベース名変更時に複数ファイルを修正が必要

**対応**:
```typescript
// packages/core/src/constants/database.ts (新規作成)
export const DB_NAME = "mc-gate.db";
export const DEFAULT_PROJECT_ID = "PRJ001";
export const DEFAULT_SEED_COUNT = 50;
export const DEFAULT_HISTORY_LIMIT = 100;
export const SYNC_INTERVAL_MS = 30000;
export const MAX_RETRIES = 5;
```

**修正箇所**:
- `apps/mobile/src/utils/seedData.ts:117, 225`
- `apps/mobile/src/hooks/useQueue.ts:58`

---

#### 🟡 優先度: 中

**2. SQLクエリの最適化** (packages/core/src/queue/sqlite.ts)

**問題1**: `getCount()` が3回のSELECTを実行 (sqlite.ts:129-149)

**影響**: データ量増加時にパフォーマンス劣化

**対応**:
```typescript
async getCount(): Promise<{ pending: number; sent: number; failed: number }> {
  const rows = await this.db.getAllAsync<{ status: string; count: number }>(
    `SELECT transport_status as status, COUNT(*) as count
     FROM scan_events
     GROUP BY transport_status`
  );

  const result = { pending: 0, sent: 0, failed: 0 };
  rows.forEach(row => {
    if (row.status === "pending") result.pending = row.count;
    if (row.status === "sent") result.sent = row.count;
    if (row.status === "failed") result.failed = row.count;
  });

  return result;
}
```

**問題2**: `getTodayStats()` が2回のSELECTを実行 (sqlite.ts:155-194)

**対応**:
```typescript
async getTodayStats(projectId: string): Promise<{
  todayIn: number;
  todayOut: number;
  currentInSite: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const rows = await this.db.getAllAsync<{ decided_mode: string; count: number }>(
    `SELECT decided_mode, COUNT(*) as count
     FROM scan_events
     WHERE project_id = ? AND occurred_at >= ? AND transport_status = 'sent'
     GROUP BY decided_mode`,
    [projectId, todayStr]
  );

  let todayIn = 0;
  let todayOut = 0;

  rows.forEach(row => {
    if (row.decided_mode === "IN") todayIn = row.count;
    if (row.decided_mode === "OUT") todayOut = row.count;
  });

  return {
    todayIn,
    todayOut,
    currentInSite: Math.max(0, todayIn - todayOut),
  };
}
```

---

## 🚀 フェーズ2: 本格開発

**目的**: バックエンドAPI実装、実環境接続、機能拡張

### 必須対応事項

#### 🔴 優先度: 高

**1. バックエンドAPI実装**

- [ ] GS Service の実装 (POST /api/events, GET /api/events, GET /api/stats)
- [ ] データベース設計（PostgreSQL or MySQL）
- [ ] Keycloak認証連携
- [ ] 冪等性チェック（idempotency_key）
- [ ] モバイルアプリのAPI接続切り替え

**2. OAuth 2.0 / Keycloak ログイン実装**

**現状**: index.tsx:32 で `token: "mock-token-12345"` を使用

**対応**:
```typescript
// apps/mobile/src/services/auth.ts (新規作成)
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";

const { issuer, clientId, audience } = Constants.expoConfig?.extra?.auth || {};

export async function loginWithKeycloak() {
  const discovery = await AuthSession.fetchDiscoveryAsync(issuer);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      scopes: ["openid", "profile", "email"],
      redirectUri: AuthSession.makeRedirectUri({ useProxy: true }),
    },
    discovery
  );

  const result = await promptAsync();

  if (result.type === "success") {
    const { code } = result.params;
    // トークン交換処理
    return exchangeCodeForToken(code);
  }

  throw new Error("ログインに失敗しました");
}
```

**3. HTTPS通信の強制**

- [ ] app.config.ts の環境変数チェック追加
- [ ] 本番環境では HTTP を拒否するバリデーション

```typescript
// app.config.ts
const apiBaseGs = process.env.API_BASE_GS || "http://localhost:7070";

// 本番環境ではHTTPSを強制
if (process.env.ENV === "production" && !apiBaseGs.startsWith("https://")) {
  throw new Error("Production requires HTTPS for API_BASE_GS");
}
```

---

#### 🟡 優先度: 中

**4. テストコードの追加**

- [ ] OfflineQueue のCRUD操作テスト
- [ ] SyncWorker のリトライロジックテスト
- [ ] スナップショットテスト

**5. 型安全性の向上**

**問題**: `as unknown as SQLiteDatabase` キャスト (3箇所)

**対応**: expo-sqlite の型定義を拡張

```typescript
// packages/core/src/queue/sqlite.d.ts (新規作成)
import "expo-sqlite";

declare module "expo-sqlite" {
  export interface SQLiteDatabase {
    execAsync(query: string): Promise<any>;
    runAsync(query: string, args?: any[]): Promise<any>;
    getAllAsync<T>(query: string, args?: any[]): Promise<T[]>;
  }
}
```

---

## 🎯 フェーズ3: 本番リリース直前

**目的**: セキュリティ強化、パフォーマンス最適化、本番環境設定

### 🚨 絶対対応（チェックリスト）

#### セキュリティ

- [ ] **モックトークンの完全削除** (index.tsx:32)
  - `token: "mock-token-12345"` を削除
  - OAuth実装のみを残す
  - モック判定フラグを環境変数で制御

```typescript
// ❌ 削除対象
setTimeout(() => {
  login({
    id: "user-1",
    name: username,
    token: "mock-token-12345", // REMOVE THIS
  });
  // ...
}, 1000);

// ✅ 本番実装
const token = await loginWithKeycloak();
login({
  id: user.id,
  name: user.name,
  token: token.accessToken,
});
```

- [ ] **トークン検証とリフレッシュ**

```typescript
// utils/tokenValidator.ts (新規作成)
import jwtDecode from "jwt-decode";

export function isTokenExpired(token: string): boolean {
  try {
    const decoded: any = jwtDecode(token);
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export async function refreshTokenIfNeeded(token: string, refreshToken: string) {
  if (isTokenExpired(token)) {
    // トークンリフレッシュAPI呼び出し
    return await refreshAccessToken(refreshToken);
  }
  return token;
}
```

- [ ] **HTTPS通信の確認**
  - `npx expo config --json | jq '.expo.extra.apiBaseGs'`
  - `https://` で始まることを確認

- [ ] **ログレベル制御の実装**

```typescript
// utils/logger.ts (新規作成)
const isDevelopment = __DEV__;

export const logger = {
  error: isDevelopment ? console.error : () => {},
  warn: isDevelopment ? console.warn : () => {},
  info: isDevelopment ? console.log : () => {},
  debug: isDevelopment ? console.debug : () => {},
};

// 使用例
// console.error() → logger.error()
// console.log() → logger.info()
```

- [ ] **機密情報のハードコード確認**
  - API Key、Secret、Token が埋め込まれていないか
  - `.env` ファイルに移行されているか

---

#### パフォーマンス

- [ ] **FlatList の最適化** (history.tsx:254)

```typescript
<FlatList
  data={history}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  getItemLayout={(data, index) => ({
    length: 150, // カードの固定高さ
    offset: 150 * index,
    index,
  })}
  initialNumToRender={10}
  maxToRenderPerBatch={10}
  windowSize={5}
  removeClippedSubviews={true}
  // ...
/>
```

- [ ] **バンドルサイズの確認**
  - `npx expo export --dump-sourcemap` でサイズ確認
  - 不要な依存関係の削除

- [ ] **画像最適化**
  - アイコン、スプラッシュ画像の圧縮
  - WebP形式の使用検討

---

#### 品質保証

- [ ] **型チェック**
  ```bash
  pnpm type-check
  ```

- [ ] **Lintエラーの解消**
  ```bash
  pnpm lint
  ```

- [ ] **E2Eテストの実施**
  - ログイン → スキャン → 履歴確認 のフロー
  - オフライン → オンライン復帰時の同期

- [ ] **実機テスト（Android & iOS）**
  - 各種デバイスでの動作確認
  - ネットワーク切断時の挙動確認

---

#### 設定確認

- [ ] **app.config.ts の本番設定確認**
  - `apiBaseGs`: HTTPS URL
  - `apiBaseCcus`: HTTPS URL
  - `auth.issuer`: 本番Keycloak URL

- [ ] **eas.json の本番プロファイル確認**
  ```json
  {
    "build": {
      "production": {
        "env": {
          "ENV": "production",
          "API_BASE_GS": "https://api.production.example.com",
          "API_BASE_CCUS": "https://ccus.production.example.com",
          "AUTH_ISSUER": "https://auth.production.example.com/realms/mcd3"
        }
      }
    }
  }
  ```

- [ ] **プライバシーポリシー・利用規約の準備**
  - App Store / Google Play の審査要件

- [ ] **エラー追跡ツールの導入（推奨）**
  - Sentry / Firebase Crashlytics
  - 本番環境でのエラーモニタリング

---

### 本番リリース前の最終チェックリスト

```bash
# 1. 型チェック
pnpm type-check

# 2. Lint
pnpm lint

# 3. ビルド確認
npx eas-cli build --platform android --profile production --non-interactive

# 4. 設定確認
npx expo config --json | jq '{
  owner: .expo.owner,
  slug: .expo.slug,
  apiBaseGs: .expo.extra.apiBaseGs,
  apiBaseCcus: .expo.extra.apiBaseCcus,
  authIssuer: .expo.extra.auth.issuer
}'

# 5. モックトークンの存在確認（0件であるべき）
grep -r "mock-token" apps/mobile/src/
```

**期待される出力**: grep でヒットなし

---

### 📋 技術的負債サマリー

| カテゴリ | スコア | 重大 | 中程度 | 軽微 | 状態 |
|---------|--------|------|--------|------|------|
| コード品質 | 7.5/10 | 0 | 3 | 2 | 🟡 改善推奨 |
| アーキテクチャ | 8.5/10 | 0 | 2 | 0 | 🟢 良好 |
| パフォーマンス | 7.0/10 | 0 | 3 | 2 | 🟡 改善推奨 |
| 保守性 | 8.0/10 | 0 | 2 | 1 | 🟢 良好 |
| セキュリティ | 7.5/10 | 1 | 2 | 1 | 🟡 要対応 |
| **総合** | **7.8/10** | **1** | **12** | **6** | 🟢 良好 |

---

### 🎯 結論

**現在の状態**: モック開発フェーズとして十分な品質
**本格開発への移行**: 問題なし
**本番リリース**: セキュリティ対応（モックトークン削除、OAuth実装）が必須

---

**最終更新**: 2025-11-06
**作成者**: Claude (with user collaboration)
