# 本番環境リリース前チェックリスト

**プロジェクト**: mc-gate
**作成日**: 2025-11-18
**対象ビルド**: v1.0.11 (versionCode: 12)

---

## 1. セキュリティチェック

### 1.1 認証・認可

#### モックトークンの完全削除
- [ ] **`apps/mobile/src/app/index.tsx:33`** - `development-api-key-12345` を削除
- [ ] **`apps/mobile/src/app/(tabs)/auth.tsx`** - モックトークンの存在確認
- [ ] **`apps/mobile/src/app/(tabs)/face-registration.tsx`** - モックトークンの存在確認

**確認コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
grep -r "mock-token\|development-api-key" apps/mobile/src/
```
**期待される出力**: 検索結果なし

#### OAuth 2.0 / Keycloak実装
- [ ] `expo-auth-session` パッケージの実装確認（インストール済み: v7.0.0）
- [ ] トークン取得フローの実装
- [ ] トークンリフレッシュロジックの実装
- [ ] トークン検証ロジックの実装（JWT Decode）
- [ ] `expo-secure-store` による安全なトークン保存（インストール済み: v14.0.0）

**実装例**:
```typescript
// apps/mobile/src/services/auth.ts (新規作成)
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";

const { issuer, clientId } = Constants.expoConfig?.extra?.auth || {};

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
    return exchangeCodeForToken(code);
  }

  throw new Error("ログインに失敗しました");
}
```

### 1.2 通信セキュリティ

#### HTTPS通信の強制（本番環境）
- [ ] `app.config.ts:16-44` - HTTPS強制バリデーションの動作確認
- [ ] 本番環境用APIエンドポイントがすべて `https://` で始まることを確認

**確認コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# 環境変数を本番設定に変更してから
export ENV=production
npx expo config --json | jq '{
  apiBaseGs: .expo.extra.apiBaseGs,
  apiBaseCcus: .expo.extra.apiBaseCcus,
  apiFaceApi: .expo.extra.apiFaceApi,
  authIssuer: .expo.extra.auth.issuer
}'
```

**期待される出力**: すべてのURLが `https://` で始まる、またはHTTP URLによるビルドエラー

#### ネイティブ設定の本番化
- [ ] `app.config.ts:120` - `usesCleartextTraffic: !isProduction` の動作確認（本番では `false`）
- [ ] `app.config.ts:114` - `NSAllowsArbitraryLoads: !isProduction` の動作確認（本番では `false`）

### 1.3 機密情報管理

#### ハードコード確認
- [ ] `app.config.ts:9-13` - ハードコードされたURL・APIキーの削除
- [ ] APIキー、Secret、Tokenが埋め込まれていないか全体スキャン

**確認コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate

# ハードコードされた機密情報のスキャン
grep -rn "192.168.1.4\|development-api-key" apps/mobile/src/
grep -rn "api[_-]key\|secret\|password" apps/mobile/src/ | grep -v "// " | grep -v "placeholder"
```

#### 環境変数の適切な設定
- [ ] 本番用 `.env.production` ファイルの作成
- [ ] EAS Secrets への機密情報登録
- [ ] `app.config.ts` で環境変数から値を取得するように修正

**実装例**:
```typescript
// app.config.ts (本番対応版)
const apiBaseGs = process.env.API_BASE_GS || (
  isProduction
    ? (() => { throw new Error("API_BASE_GS is required in production"); })()
    : "http://localhost:7070"
);
```

**EAS Secrets設定**:
```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
npx eas-cli secret:create --scope project --name API_BASE_GS --value "https://api.production.example.com"
npx eas-cli secret:create --scope project --name API_BASE_CCUS --value "https://ccus.production.example.com"
npx eas-cli secret:create --scope project --name API_FACE_API --value "https://face-api.production.example.com"
npx eas-cli secret:create --scope project --name API_FACE_API_KEY --value "production-secure-key"
npx eas-cli secret:create --scope project --name AUTH_ISSUER --value "https://auth.production.example.com/realms/mcd3"
```

#### Git履歴の確認
- [ ] `.env` ファイルがGit履歴に含まれていないか確認
- [ ] 過去のコミットに機密情報が含まれていないか確認

**確認コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate

# Git履歴から機密情報を検索
git log -p --all -S "api-key" -S "secret" -S "password"
git log -p --all -- "*.env" "**/env*"
```

---

## 2. コード品質チェック

### 2.1 型チェック

- [ ] すべての型エラーの解消

**実行コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
pnpm type-check
```

**期待される出力**: エラー0件

- [ ] `any` 型の使用箇所の確認と修正
- [ ] 型ガードの適切な実装確認

**確認コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
grep -rn ": any\|as any" apps/mobile/src/ packages/*/src/
```

### 2.2 Lintチェック

- [ ] Lintエラーの解消

**実行コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
pnpm lint
```

**期待される出力**: エラー0件

- [ ] 未使用のimportの削除確認

### 2.3 ログレベル制御

#### logger.ts の実装
- [ ] `apps/mobile/src/utils/logger.ts` の新規作成
- [ ] すべての `console.*` を `logger.*` に置き換え

**実装例**:
```typescript
// apps/mobile/src/utils/logger.ts
const isDevelopment = __DEV__;

export const logger = {
  error: isDevelopment ? console.error : () => {},
  warn: isDevelopment ? console.warn : () => {},
  info: isDevelopment ? console.log : () => {},
  debug: isDevelopment ? console.debug : () => {},
};
```

**置き換え対象（109箇所）**:
- [ ] `apps/mobile/src/app/_layout.tsx` (1箇所)
- [ ] `apps/mobile/src/hooks/useWorkers.ts` (4箇所)
- [ ] `apps/mobile/src/hooks/useQueue.ts` (6箇所)
- [ ] `apps/mobile/src/app/(tabs)/auth.tsx` (24箇所)
- [ ] `apps/mobile/src/app/(tabs)/debug.tsx` (3箇所)
- [ ] `apps/mobile/src/app/(tabs)/settings.tsx` (31箇所)
- [ ] `apps/mobile/src/app/(tabs)/face-registration.tsx` (21箇所)
- [ ] `apps/mobile/src/app/(tabs)/home.tsx` (1箇所)
- [ ] `apps/mobile/src/app/(tabs)/history.tsx` (1箇所)
- [ ] `apps/mobile/src/utils/seedData.ts` (11箇所)
- [ ] `apps/mobile/src/utils/debugLogger.ts` (6箇所)

**一括置換コマンド（慎重に実行）**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src

# console.error → logger.error
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/console\.error/logger.error/g'

# console.warn → logger.warn
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/console\.warn/logger.warn/g'

# console.log → logger.info
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/console\.log/logger.info/g'

# console.debug → logger.debug
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/console\.debug/logger.debug/g'

# logger のimport追加（手動で各ファイルに追加）
```

---

## 3. パフォーマンスチェック

### 3.1 バンドルサイズ

#### バンドルサイズの確認
- [ ] ソースマップのダンプと分析

**実行コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
npx expo export --dump-sourcemap --output-dir dist

# バンドルサイズの確認
du -sh dist/_expo/static/js/web/*.js
```

- [ ] 不要な依存関係の削除
- [ ] コード分割（動的import）の検討

### 3.2 画像最適化

- [ ] `assets/icon.png` の圧縮
- [ ] `assets/splash-icon.png` の圧縮
- [ ] `assets/adaptive-icon.png` の圧縮
- [ ] `assets/favicon.png` の圧縮
- [ ] WebP形式への変換検討

**画像圧縮ツール**:
```bash
# ImageOptim (Mac) または TinyPNG (Web) を使用
# または CLI ツール:
pnpm add -D @squoosh/cli
npx @squoosh/cli --webp auto assets/*.png
```

### 3.3 データベース最適化

#### SQLiteクエリの最適化
- [ ] `CLAUDE.md:1039-1095` の最適化案を適用
  - `getCount()` の3回のSELECTを1回に統合
  - `getTodayStats()` の2回のSELECTを1回に統合

- [ ] インデックスの適切な設定確認
- [ ] 不要なデータの定期削除機能実装

---

## 4. 機能テスト

### 4.1 E2Eテスト（手動）

#### 基本フロー
- [ ] ログイン → ホーム画面遷移
- [ ] QRコードスキャン → イベント登録
- [ ] 顔認証スキャン → イベント登録
- [ ] 履歴画面でイベント確認
- [ ] オフライン時のイベント保存
- [ ] オンライン復帰時の同期

#### エラーハンドリング
- [ ] ネットワークエラー時の挙動
- [ ] 無効なQRコード読み取り時の挙動
- [ ] 顔認証失敗時の挙動
- [ ] データベースエラー時の挙動

### 4.2 実機テスト

#### Android実機
- [ ] デバイス1: Pixel 6 (Android 13)
- [ ] デバイス2: Galaxy S21 (Android 14)
- [ ] デバイス3: その他（メーカー混在推奨）

#### iOS実機
- [ ] デバイス1: iPhone 12 (iOS 17)
- [ ] デバイス2: iPhone 14 (iOS 18)
- [ ] デバイス3: iPad Pro (iPadOS 17)

#### ネットワークテスト
- [ ] Wi-Fi接続時の動作
- [ ] モバイルデータ接続時の動作
- [ ] ネットワーク切断時の挙動
- [ ] 低速ネットワーク（3G）での動作
- [ ] ネットワーク切り替え時の挙動

---

## 5. 設定確認

### 5.1 app.config.ts

- [ ] `version` が正しい（現在: `1.0.11`）
- [ ] Android `versionCode` が正しい（現在: `12`）
- [ ] iOS `buildNumber` が設定されている（必要に応じて）
- [ ] `apiBaseGs` が本番URL（HTTPS）
- [ ] `apiBaseCcus` が本番URL（HTTPS）
- [ ] `apiFaceApi` が本番URL（HTTPS）
- [ ] `auth.issuer` が本番Keycloak URL（HTTPS）
- [ ] `ENV === "production"` で設定が正しい

**確認コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

export ENV=production
export API_BASE_GS="https://api.production.example.com"
export API_BASE_CCUS="https://ccus.production.example.com"
export API_FACE_API="https://face-api.production.example.com"
export AUTH_ISSUER="https://auth.production.example.com/realms/mcd3"

npx expo config --json | jq '{
  owner: .expo.owner,
  slug: .expo.slug,
  version: .expo.version,
  versionCode: .expo.android.versionCode,
  apiBaseGs: .expo.extra.apiBaseGs,
  apiBaseCcus: .expo.extra.apiBaseCcus,
  apiFaceApi: .expo.extra.apiFaceApi,
  authIssuer: .expo.extra.auth.issuer,
  usesCleartextTraffic: .expo.plugins[1][1].android.usesCleartextTraffic,
  NSAllowsArbitraryLoads: .expo.plugins[1][1].ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads
}'
```

**期待される出力**:
```json
{
  "owner": "bme_llc",
  "slug": "mc-gate",
  "version": "1.0.11",
  "versionCode": 12,
  "apiBaseGs": "https://api.production.example.com",
  "apiBaseCcus": "https://ccus.production.example.com",
  "apiFaceApi": "https://face-api.production.example.com",
  "authIssuer": "https://auth.production.example.com/realms/mcd3",
  "usesCleartextTraffic": false,
  "NSAllowsArbitraryLoads": false
}
```

### 5.2 eas.json

- [ ] `production` プロファイルの設定確認
- [ ] `channel: "production"` が設定されている
- [ ] Android `buildType: "app-bundle"` が設定されている
- [ ] 環境変数が正しく設定されている

**確認コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
cat eas.json | jq '.build.production'
```

**期待される出力**:
```json
{
  "channel": "production",
  "ios": {
    "simulator": false
  },
  "android": {
    "buildType": "app-bundle"
  }
}
```

### 5.3 環境変数

- [ ] `EXPO_TOKEN` が設定されている
- [ ] 本番用環境変数がEAS Secretsに登録されている
  - `API_BASE_GS`
  - `API_BASE_CCUS`
  - `API_FACE_API`
  - `API_FACE_API_KEY`
  - `AUTH_ISSUER`
  - `AUTH_AUDIENCE`
  - `AUTH_CLIENT_ID`

**確認コマンド**:
```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
npx eas-cli secret:list
```

---

## 6. 法的要件

### 6.1 プライバシーポリシー

- [ ] プライバシーポリシーの作成（`docs/privacy-policy.md`）
- [ ] 利用規約の作成（`docs/terms-of-service.md`）
- [ ] アプリ内からリンク可能なURL設定
- [ ] HTMLページの公開（GitHub Pages または自社サーバー）

**必須記載事項**:
- 収集する個人情報の種類（カメラ、位置情報、Bluetooth等）
- 個人情報の利用目的
- 第三者への提供の有無
- 個人情報の保管期間
- 問い合わせ先

### 6.2 ストア審査要件

#### App Store
- [ ] App Store審査ガイドライン準拠確認
- [ ] スクリーンショット準備（5-10枚、iPhone & iPad）
- [ ] アプリ説明文作成（日本語・英語）
- [ ] アプリアイコン（1024x1024 PNG）
- [ ] プライバシーポリシーURL設定
- [ ] サポートURL設定
- [ ] 審査用テストアカウント準備

#### Google Play
- [ ] Google Play審査ガイドライン準拠確認
- [ ] スクリーンショット準備（2-8枚、Phone & Tablet）
- [ ] フィーチャーグラフィック（1024x500 PNG）
- [ ] アプリ説明文作成（日本語・英語）
- [ ] アプリアイコン（512x512 PNG）
- [ ] プライバシーポリシーURL設定
- [ ] データ安全性セクション記入

---

## 7. モニタリング・エラー追跡

### 7.1 エラー追跡ツール

#### Sentry導入（推奨）
- [ ] Sentryアカウント作成
- [ ] `sentry-expo` パッケージインストール

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
pnpm add sentry-expo
npx @sentry/wizard@latest -i reactNative
```

- [ ] `app.config.ts` にSentry設定追加

```typescript
// app.config.ts
plugins: [
  // ...
  [
    "sentry-expo",
    {
      organization: "your-org",
      project: "mc-gate-mobile",
    }
  ]
]
```

- [ ] エラーレポート設定
- [ ] アラート設定（Slack/Email）

#### または Firebase Crashlytics
- [ ] Firebase プロジェクト作成
- [ ] `@react-native-firebase/app` インストール
- [ ] `@react-native-firebase/crashlytics` インストール
- [ ] `google-services.json` / `GoogleService-Info.plist` 配置
- [ ] クラッシュレポート設定

### 7.2 アナリティクス

#### Google Analytics / Firebase Analytics
- [ ] Firebase プロジェクト作成（または既存使用）
- [ ] `@react-native-firebase/analytics` インストール
- [ ] 主要イベントのトラッキング設定
  - `login`
  - `scan_qr`
  - `scan_face`
  - `sync_success`
  - `sync_failure`
- [ ] ユーザー行動分析設定
- [ ] コンバージョン設定

---

## 8. バックアップ・復旧

### 8.1 データバックアップ

- [ ] ローカルデータベース（SQLite）のエクスポート機能実装
- [ ] サーバーサイドバックアップ戦略の確立
- [ ] 定期バックアップの自動化
- [ ] バックアップからの復旧テスト

### 8.2 ロールバック計画

#### EAS Build ロールバック
- [ ] 前バージョンのビルドIDを記録
- [ ] App Store / Google Play での段階的ロールアウト設定
- [ ] 緊急時のロールバック手順書作成

#### EAS Update ロールバック
- [ ] 前回のUpdate Group IDを記録
- [ ] ロールバックコマンドの準備

```bash
# 特定のUpdate Group IDにロールバック
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
npx eas-cli channel:rollback production --group-id <previous-update-group-id>
```

- [ ] データベースマイグレーションのロールバックスクリプト準備

---

## 9. ドキュメント

### 9.1 ユーザードキュメント

- [ ] ユーザーマニュアル作成（`docs/user-manual.md`）
  - インストール手順
  - 初回セットアップ
  - QRコードスキャン方法
  - 顔認証登録方法
  - 履歴確認方法
  - 設定変更方法
- [ ] FAQ作成（`docs/faq.md`）
  - よくある質問と回答
  - トラブルシューティング
- [ ] トラブルシューティングガイド（`docs/troubleshooting.md`）
  - ネットワークエラー時の対処
  - カメラが使えない場合
  - 同期エラー時の対処

### 9.2 運用ドキュメント

- [ ] デプロイ手順書（`docs/deployment.md`）
  - EAS Buildの実行手順
  - EAS Updateの配信手順
  - App Store / Google Playへの申請手順
- [ ] 障害対応手順書（`docs/incident-response.md`）
  - サーバーダウン時の対応
  - データ消失時の対応
  - セキュリティインシデント時の対応
- [ ] 問い合わせ対応フロー（`docs/support-flow.md`）
  - 問い合わせの受付方法
  - エスカレーションフロー
  - SLA定義

---

## 10. 最終確認

### 10.1 ビルド確認

**ステップ1: 型チェック**
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
pnpm type-check
```
**期待される出力**: エラー0件

**ステップ2: Lint**
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
pnpm lint
```
**期待される出力**: エラー0件

**ステップ3: 設定確認**
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

export ENV=production
export API_BASE_GS="https://api.production.example.com"
export API_BASE_CCUS="https://ccus.production.example.com"
export API_FACE_API="https://face-api.production.example.com"
export API_FACE_API_KEY="production-secure-key"
export AUTH_ISSUER="https://auth.production.example.com/realms/mcd3"

npx expo config --json | jq '{
  owner: .expo.owner,
  slug: .expo.slug,
  version: .expo.version,
  versionCode: .expo.android.versionCode,
  apiBaseGs: .expo.extra.apiBaseGs,
  apiBaseCcus: .expo.extra.apiBaseCcus,
  apiFaceApi: .expo.extra.apiFaceApi,
  authIssuer: .expo.extra.auth.issuer,
  usesCleartextTraffic: .expo.plugins[1][1].android.usesCleartextTraffic,
  NSAllowsArbitraryLoads: .expo.plugins[1][1].ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads
}'
```

**期待される出力**:
- すべてのURLが `https://` で始まる
- `usesCleartextTraffic: false`
- `NSAllowsArbitraryLoads: false`

**ステップ4: プロダクションビルド（Android）**
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate

export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
export ENV=production
export API_BASE_GS="https://api.production.example.com"
export API_BASE_CCUS="https://ccus.production.example.com"
export API_FACE_API="https://face-api.production.example.com"
export API_FACE_API_KEY="production-secure-key"
export AUTH_ISSUER="https://auth.production.example.com/realms/mcd3"

# ビルド実行（10〜15分かかる）
npx eas-cli build --platform android --profile production --non-interactive
```

**ステップ5: プロダクションビルド（iOS）**
```bash
# iOS証明書・Provisioning Profileの準備後
npx eas-cli build --platform ios --profile production --non-interactive
```

**ステップ6: EAS Update配信**
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# ビルド完了後に配信
npx eas-cli update --branch production --message "Release: v1.0.11"
```

### 10.2 モックトークンの完全削除確認

**確認コマンド**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate

# モックトークンの存在確認（0件であるべき）
grep -rn "mock-token\|development-api-key" apps/mobile/src/

# ハードコードされたIPアドレスの確認（0件であるべき）
grep -rn "192.168.1.4" apps/mobile/src/
```

**期待される出力**: 検索結果なし

### 10.3 本番環境動作確認

- [ ] ビルド済みAPK/IPAをダウンロード
- [ ] 実機にインストール
- [ ] ログイン動作確認（OAuth）
- [ ] QRコードスキャン動作確認
- [ ] 顔認証動作確認
- [ ] データ同期動作確認
- [ ] エラーハンドリング動作確認

---

## 11. リリースチェックリスト（最終段階）

### 11.1 コミット・タグ作成

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate

# すべての変更をコミット
git add -A
git commit -m "Release: v1.0.11 - 本番環境対応完了"

# タグ作成
git tag -a v1.0.11 -m "Release v1.0.11 - Production Ready"
git push origin main
git push origin v1.0.11
```

### 11.2 App Store申請（iOS）

- [ ] App Store Connectにログイン
- [ ] 新しいバージョン作成（1.0.11）
- [ ] ビルドアップロード（EAS Submit）
- [ ] スクリーンショット・説明文・アイコン設定
- [ ] プライバシーポリシーURL設定
- [ ] 審査用アカウント情報入力
- [ ] 審査申請

**EAS Submit実行**:
```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
npx eas-cli submit --platform ios --profile production
```

### 11.3 Google Play申請（Android）

- [ ] Google Play Consoleにログイン
- [ ] 新しいリリース作成（Production track）
- [ ] AABアップロード（EAS Submit）
- [ ] スクリーンショット・説明文・アイコン設定
- [ ] プライバシーポリシーURL設定
- [ ] データ安全性セクション記入
- [ ] 審査申請

**EAS Submit実行**:
```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
npx eas-cli submit --platform android --profile production
```

### 11.4 リリースノート作成

- [ ] `CHANGELOG.md` 更新
- [ ] GitHub Releasesにリリースノート公開
- [ ] 社内向けリリース通知

---

## 12. リリース後の監視

### 12.1 初期監視（リリース後24時間）

- [ ] Sentry / Crashlyticsでクラッシュレート確認
- [ ] Google Analytics / Firebase Analyticsでアクティブユーザー数確認
- [ ] サーバーログでAPIエラー率確認
- [ ] App Store / Google Play レビュー監視
- [ ] 問い合わせ対応準備

### 12.2 継続監視（リリース後1週間）

- [ ] クラッシュレートの推移
- [ ] アクティブユーザー数の推移
- [ ] データ同期エラー率
- [ ] ネットワークエラー率
- [ ] レビュー評価の推移

---

## 付録A: CLAUDE.mdからの重要事項

### 技術的負債（優先度順）

#### 優先度: 高
1. **データベース名の定数化** (`CLAUDE.md:1010-1030`)
   - `"mc-gate.db"` が3ファイルにハードコード
   - `packages/core/src/constants/database.ts` を作成

2. **バックエンドAPI実装** (`CLAUDE.md:656-734`)
   - GS Service の実装
   - POST /api/events
   - GET /api/events
   - GET /api/stats

3. **OAuth 2.0 / Keycloak ログイン実装** (`CLAUDE.md:1107-1150`)
   - モックトークンの完全削除
   - expo-auth-sessionを使用したログインフロー

#### 優先度: 中
1. **SQLクエリの最適化** (`CLAUDE.md:1039-1095`)
   - `getCount()` の3回のSELECTを1回に統合
   - `getTodayStats()` の2回のSELECTを1回に統合

2. **テストコードの追加** (`CLAUDE.md:1171-1176`)
   - OfflineQueue のCRUD操作テスト
   - SyncWorker のリトライロジックテスト

### 開発ルール（重要）

1. **EAS Buildは実行しない** (`CLAUDE.md:7-26`)
   - Claude Codeは EAS Build を実行してはいけない
   - ビルドコマンドはMarkdownで提案のみ

2. **Build-Update同期** (`CLAUDE.md:1705-1746`)
   - ビルド作成後は必ずEAS Update配信
   - コミット → ビルド → Update の順序厳守

3. **チャンネル設定** (`CLAUDE.md:1810-2026`)
   - `eas.json` に `channel` 設定が必須
   - チャンネル名とブランチ名を一致させる

---

## 付録B: 連絡先・リソース

### プロジェクト情報
- **Owner**: bme_llc
- **Slug**: mc-gate
- **Project ID**: 0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Updates URL**: https://u.expo.dev/0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Dashboard**: https://expo.dev/accounts/bme_llc/projects/mc-gate

### 重要なドキュメント
- [EAS Update公式ドキュメント](https://docs.expo.dev/eas-update/introduction/)
- [app.config.js/tsの設定](https://docs.expo.dev/workflow/configuration/)
- [App Store審査ガイドライン](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play審査ガイドライン](https://play.google.com/about/developer-content-policy/)

---

**チェックリスト作成日**: 2025-11-18
**最終更新日**: 2025-11-18
**作成者**: Claude Code (based on CLAUDE.md and project analysis)
