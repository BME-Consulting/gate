# CI/CD セットアップガイド - mc-gate プロジェクト

**作成日**: 2025-11-18
**対象**: DevOps Engineer, プロジェクト管理者
**所要時間**: 約30分

---

## 目次

1. [概要](#概要)
2. [前提条件](#前提条件)
3. [セットアップ手順](#セットアップ手順)
4. [ワークフロー説明](#ワークフロー説明)
5. [ブランチ戦略](#ブランチ戦略)
6. [リリースフロー](#リリースフロー)
7. [トラブルシューティング](#トラブルシューティング)
8. [運用ガイドライン](#運用ガイドライン)

---

## 概要

このガイドでは、mc-gate プロジェクトの完全自動化されたCI/CDパイプラインのセットアップ手順を説明します。

### 実装されている機能

- **継続的インテグレーション (CI)**: Lint、TypeCheck、テストの自動実行
- **自動EAS Update配信**: develop/mainブランチへのpush時に自動配信
- **自動ビルド**: タグpush時のAndroid/iOSビルド自動作成
- **セマンティックバージョニング**: Conventional Commitsに基づく自動バージョン管理

### プロジェクト情報

- **Owner**: bme_llc
- **Slug**: mc-gate
- **Project ID**: 0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Updates URL**: https://u.expo.dev/0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Dashboard**: https://expo.dev/accounts/bme_llc/projects/mc-gate

---

## 前提条件

セットアップを開始する前に、以下を確認してください。

### 必須

- [ ] GitHubリポジトリへの管理者権限
- [ ] EAS (Expo Application Services) アカウントへのオーナー権限
- [ ] Node.js 22.x がインストール済み
- [ ] pnpm 9.15.4 がインストール済み
- [ ] Git がインストール済み

### 推奨

- [ ] GitHub CLI (`gh`) がインストール済み
- [ ] EXPO_TOKEN の取得方法を理解している
- [ ] Conventional Commits の基本を理解している

---

## セットアップ手順

### ステップ1: EXPO_TOKEN の取得 (5分)

EXPO_TOKENは、GitHub ActionsがEAS CLIを実行するために必要な認証トークンです。

```bash
# プロジェクトディレクトリに移動
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# EAS にログイン
npx eas-cli login

# トークンを取得
npx eas-cli whoami --json
```

**出力例**:
```json
{
  "username": "bme_llc",
  "id": "...",
  "currentAccessToken": "r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
}
```

`currentAccessToken` の値をコピーしておいてください。

---

### ステップ2: GitHub Secrets の設定 (5分)

EXPO_TOKENをGitHub Secretsに安全に保存します。

#### 2.1 GitHub リポジトリにアクセス

1. ブラウザで GitHub リポジトリを開く
2. **Settings** タブをクリック

#### 2.2 Secrets の設定

1. 左側のメニューから **Secrets and variables** → **Actions** を選択
2. **New repository secret** ボタンをクリック
3. 以下を入力:
   - **Name**: `EXPO_TOKEN`
   - **Value**: ステップ1でコピーしたトークン
4. **Add secret** ボタンをクリック

#### 2.3 その他のSecrets（オプション）

必要に応じて以下のSecretsも設定できます:

| Secret名 | 用途 | 取得方法 |
|---------|------|---------|
| `SLACK_WEBHOOK_URL` | Slack通知 | Slack App設定 |
| `CODECOV_TOKEN` | カバレッジ送信 | Codecov設定 |

---

### ステップ3: ブランチ保護ルールの設定 (10分)

main/developブランチを保護し、CI/CDパイプラインを強制します。

#### 3.1 main ブランチ保護

1. GitHub リポジトリ → **Settings** → **Branches**
2. **Add branch protection rule** をクリック
3. 以下を設定:

```
Branch name pattern: main

✅ Require a pull request before merging
  - Required approvals: 1

✅ Require status checks to pass before merging
  - Status checks that are required:
    ✅ Lint & Type Check
    ✅ Unit Tests
    ✅ Build Validation

✅ Require branches to be up to date before merging

✅ Do not allow bypassing the above settings
```

4. **Create** をクリック

#### 3.2 develop ブランチ保護（推奨）

同様の手順で develop ブランチも保護します:

```
Branch name pattern: develop

✅ Require a pull request before merging
  - Required approvals: 0

✅ Require status checks to pass before merging
  - Status checks that are required:
    ✅ Lint & Type Check
    ✅ Unit Tests
```

---

### ステップ4: ワークフローファイルの確認 (5分)

以下のファイルがリポジトリに存在することを確認します:

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate

# ワークフローファイル一覧
ls -la .github/workflows/
```

**期待される出力**:
```
ci.yml          # CI（Lint/Test/TypeCheck）
eas-update.yml  # EAS Update配信
eas-build.yml   # EAS Build（タグpush時）
release.yml     # semantic-release
```

**設定ファイル**:
```
.releaserc.json              # semantic-release設定
.github/dependabot.yml       # 依存関係自動更新（オプション）
docs/CICD-SETUP-GUIDE.md     # このファイル
```

---

### ステップ5: 動作確認 (10分)

#### 5.1 CI の動作確認

```bash
# 1. 新しいブランチを作成
git checkout -b test/ci-verification

# 2. 軽微な変更を加える（例: README.md に空行追加）
echo "" >> README.md

# 3. コミット
git add README.md
git commit -m "test: CI動作確認"

# 4. プッシュ
git push -u origin test/ci-verification
```

5. GitHub でプルリクエストを作成
6. **Actions** タブでCI実行状況を確認

**期待される結果**:
- ✅ Lint & Type Check が成功
- ✅ Unit Tests が成功
- ✅ Build Validation が成功
- ✅ プルリクエストに緑のチェックマークが表示される

#### 5.2 EAS Update の動作確認

```bash
# 1. develop ブランチに切り替え
git checkout develop

# 2. 軽微な変更を加える
echo "// Test comment" >> apps/mobile/app.config.ts

# 3. コミット（Conventional Commits形式）
git add apps/mobile/app.config.ts
git commit -m "test: EAS Update動作確認"

# 4. プッシュ
git push origin develop
```

5. GitHub Actions でEAS Update実行を確認
   - https://github.com/YOUR_ORG/mc-gate/actions

**期待される結果**:
- ✅ CI が成功
- ✅ EAS Update が `preview` チャンネルに配信される
- ✅ コミットにコメントが追加される

#### 5.3 テスト用の変更を削除

```bash
# develop ブランチの変更を元に戻す
git checkout develop
git reset --hard HEAD~1
git push -f origin develop

# テストブランチを削除
git branch -D test/ci-verification
git push origin --delete test/ci-verification
```

---

## ワークフロー説明

### 1. ci.yml - 継続的インテグレーション

**トリガー**:
- Pull Request 作成・更新時 (main, develop)
- main, develop ブランチへの push

**ジョブ**:
1. **Lint & Type Check**: ESLint + TypeScript型チェック
2. **Unit Tests**: Jest テスト実行
3. **Build Validation**: Expo設定の検証、EAS設定の確認

**実行時間**: 約5-10分

**重要な設定**:
- Node.js 22.x 使用
- pnpm 9.15.4 使用
- pnpm store キャッシュによる高速化

---

### 2. eas-update.yml - 自動EAS Update配信

**トリガー**:
- main ブランチへの push → `production` チャンネル
- develop ブランチへの push → `preview` チャンネル

**ジョブ**:
1. 依存関係インストール
2. チャンネル判定（main → production, develop → preview）
3. EAS Update 配信
4. コミットにコメント追加

**実行時間**: 約3-5分

**重要な設定**:
- EXPO_TOKEN を GitHub Secrets から取得
- コミットメッセージを Update メッセージに使用
- 配信後に自動でコメントを追加

---

### 3. eas-build.yml - 自動ビルド作成

**トリガー**:
- タグpush (v*.*.*)

**ジョブ**:
1. バージョン検証（app.config.ts のバージョンとタグの一致確認）
2. Android/iOS 並列ビルド（production プロファイル）
3. GitHub Release 作成

**実行時間**: 約10-15分（ビルドは非同期で実行）

**重要な設定**:
- `--no-wait` でビルドを非同期実行
- バージョン不一致の場合は失敗する
- ビルド完了後に GitHub Release を自動作成

**注意事項**:
- ビルド回数には上限があるため、不要なビルドは避ける
- タグpushの前に必ず app.config.ts のバージョンを更新する

---

### 4. release.yml - セマンティックバージョニング

**トリガー**:
- main ブランチへの push

**ジョブ**:
1. Conventional Commits に基づくバージョン判定
2. CHANGELOG.md 自動生成
3. Git タグ作成
4. GitHub Release 作成
5. app.config.ts のバージョン/versionCode を自動更新

**実行時間**: 約2-3分

**重要な設定**:
- Conventional Commits 形式のコミットメッセージが必須
- `[skip ci]` でCI実行をスキップ（無限ループ防止）
- semantic-release の設定は `.releaserc.json` に記述

---

## ブランチ戦略

### ブランチ構成

| ブランチ | 用途 | CI/CD 動作 | EAS Channel |
|---------|------|-----------|-------------|
| `feature/*` | 機能開発 | Lint + Test のみ | - |
| `develop` | 開発環境 | CI + EAS Update | preview |
| `main` | 本番環境 | CI + Semantic Release + EAS Update | production |
| `v*.*.*` (tag) | リリース | CI + EAS Build | production |

### ブランチ運用フロー

```
1. feature/* ブランチで開発
   ↓
2. Pull Request 作成 → CI 実行
   ↓
3. develop にマージ → EAS Update (preview)
   ↓
4. 動作確認・テスト
   ↓
5. main にマージ → Semantic Release + EAS Update (production)
   ↓
6. 必要に応じてタグpush → EAS Build (production)
```

---

## リリースフロー

### パターンA: JS/TSコード変更のみ（OTA配信）

ネイティブコードの変更がない場合は、EAS Update のみで配信可能です。

```bash
# 1. feature/* でコード変更
git checkout -b feature/new-feature
# ... コーディング ...

# 2. コミット（Conventional Commits形式）
git add .
git commit -m "feat: 新機能を追加"

# 3. Pull Request 作成 → CI 実行
git push -u origin feature/new-feature

# 4. develop にマージ → EAS Update (preview)
# GitHub UI でマージ

# 5. 動作確認
# アプリを再起動して preview チャンネルで確認

# 6. main にマージ → EAS Update (production)
# GitHub UI でマージ
```

**所要時間**: 約10-15分

---

### パターンB: ネイティブ変更を含む（新ビルド必須）

ネイティブコードの変更がある場合は、新しいビルドが必要です。

**ネイティブ変更とは**:
- `app.config.ts` のプラグイン設定変更
- `expo-build-properties` の変更
- SDK バージョンアップ
- Android/iOS の権限追加

```bash
# 1. feature/* でネイティブ設定変更
git checkout -b feature/native-change
# ... app.config.ts 等を編集 ...

# 2. Pull Request 作成 → CI 実行
git add .
git commit -m "feat: カメラ権限を追加"
git push -u origin feature/native-change

# 3. main にマージ
# GitHub UI でマージ

# 4. バージョンを更新
# app.config.ts の version と versionCode を更新
git add apps/mobile/app.config.ts
git commit -m "chore: bump version to 1.2.3"
git push origin main

# 5. タグpush → EAS Build (production)
git tag v1.2.3
git push origin v1.2.3

# 6. ビルド完了を待つ（10〜15分）
# https://expo.dev/accounts/bme_llc/projects/mc-gate/builds

# 7. ビルド完了後、EAS Update 配信
# （自動で配信されるが、手動で確認可能）
```

**所要時間**: 約30-40分（ビルド時間含む）

---

## トラブルシューティング

### エラー1: EXPO_TOKEN が無効

**症状**:
```
Error: Invalid token
```

**原因**: EXPO_TOKEN が期限切れまたは無効

**解決策**:
```bash
# 1. 新しいトークンを取得
npx eas-cli whoami --json

# 2. GitHub Secrets を更新
# Settings → Secrets → EXPO_TOKEN → Update
```

---

### エラー2: CI が実行されない

**症状**: プルリクエスト作成後、GitHub Actions が起動しない

**原因**: ワークフローファイルの構文エラー、または GitHub Actions が無効

**解決策**:
1. `.github/workflows/ci.yml` が存在することを確認
2. YAML構文エラーをチェック
3. GitHub リポジトリの Settings → Actions → General で、GitHub Actions が有効になっているか確認

---

### エラー3: Status Checks が表示されない

**症状**: プルリクエストに緑のチェックマークが表示されない

**原因**: 一度もCIを実行していないため、Status Checks が登録されていない

**解決策**:
1. 一度CIを実行する（プッシュまたはプルリクエスト作成）
2. CIが成功した後、ブランチ保護ルールで Status Checks を選択可能になる

---

### エラー4: EAS Update が反映されない

**症状**: EAS Update 配信後、アプリに変更が反映されない

**原因**: ビルドとUpdateのコミットハッシュが不一致

**解決策**:
```bash
# 1. コミット確認
git log --oneline -1

# 2. ビルドのコミットハッシュ確認
npx eas-cli build:list --platform android --limit 1

# 3. Updateのコミットハッシュ確認
npx eas-cli update:list --branch preview --limit 1

# 4. 一致していなければ再配信
npx eas-cli update --branch preview --message "Sync with Build"
```

---

### エラー5: semantic-release がバージョンアップしない

**症状**: main マージ後もバージョンが変わらない

**原因**: Conventional Commits 形式でない

**解決策**:
```bash
# コミットメッセージを確認
git log --oneline -5

# 正しい形式でコミット
git commit -m "feat: 新機能追加"
# ❌ "Added new feature" ← NG
```

---

## 運用ガイドライン

### Conventional Commits クイックリファレンス

| コミットタイプ | 用途 | バージョン変更 | 例 |
|--------------|------|---------------|-----|
| `feat:` | 新機能追加 | MINOR (1.0.0 → 1.1.0) | `feat: QRスキャン機能追加` |
| `fix:` | バグ修正 | PATCH (1.0.0 → 1.0.1) | `fix: オフライン同期バグ修正` |
| `perf:` | パフォーマンス改善 | PATCH | `perf: SQLクエリ最適化` |
| `docs:` | ドキュメント変更 | PATCH | `docs: READMEに環境構築手順追加` |
| `refactor:` | リファクタリング | PATCH | `refactor: useQueue フック抽出` |
| `test:` | テスト追加 | なし | `test: seedData ユニットテスト追加` |
| `chore:` | ビルド設定変更 | なし | `chore: pnpm 9.15.4 に更新` |
| `ci:` | CI設定変更 | なし | `ci: GitHub Actions ワークフロー追加` |
| `BREAKING CHANGE:` | 破壊的変更 | MAJOR (1.0.0 → 2.0.0) | `feat!: API v2に移行` |

---

### 日常運用チェックリスト

#### プルリクエスト作成時

- [ ] Conventional Commits 形式でコミットメッセージを記述
- [ ] CI が自動実行されることを確認
- [ ] 全てのStatus Checksが成功することを確認

#### develop へのマージ時

- [ ] CI が成功している
- [ ] EAS Update が preview チャンネルに配信されることを確認
- [ ] アプリで動作確認（開発環境）

#### main へのマージ時

- [ ] CI が成功している
- [ ] semantic-release が自動でバージョンアップすることを確認
- [ ] EAS Update が production チャンネルに配信されることを確認
- [ ] アプリで動作確認（本番環境）

#### タグpush時（ネイティブ変更がある場合）

- [ ] app.config.ts のバージョンとタグが一致している
- [ ] EAS Build が自動で開始されることを確認
- [ ] ビルド完了後、GitHub Release が作成されることを確認

---

### ベストプラクティス

#### 1. コミットメッセージ

- Conventional Commits 形式を必ず使用
- 変更内容を簡潔に記述（1行50文字以内）
- 必要に応じて詳細をボディに記述

**例**:
```bash
# 良い例
git commit -m "feat: QRコードスキャン機能追加"
git commit -m "fix: オフライン同期時のエラーを修正"

# 悪い例
git commit -m "Updated code"
git commit -m "修正"
```

#### 2. ブランチ命名

- `feature/` プレフィックスを使用（機能追加）
- `fix/` プレフィックスを使用（バグ修正）
- `chore/` プレフィックスを使用（ビルド設定等）

**例**:
```bash
feature/qr-scanner
fix/offline-sync
chore/update-dependencies
```

#### 3. プルリクエスト

- タイトルはConventional Commits形式
- 変更内容を詳細に記述
- レビュアーを指定

#### 4. バージョン管理

- ネイティブ変更がある場合のみタグpush
- タグは `v1.2.3` 形式（セマンティックバージョニング）
- app.config.ts のバージョンを必ず更新

---

## サポート

問題が発生した場合:

1. **ドキュメント確認**:
   - `/volume2/Project/MCD3/TUMON/mc-gate/docs/CICD-PIPELINE-DESIGN.md`
   - `/volume2/Project/MCD3/TUMON/mc-gate/docs/CICD-QUICKSTART.md`
   - `/volume2/Project/MCD3/TUMON/mc-gate/CLAUDE.md`

2. **GitHub Actions ログ確認**:
   - Actions タブで詳細ログを確認
   - エラーメッセージを検索

3. **EAS Dashboard 確認**:
   - https://expo.dev/accounts/bme_llc/projects/mc-gate
   - ビルド/Update の状態を確認

4. **GitHub CLI でログ確認**:
```bash
gh run list
gh run view <RUN_ID> --log
```

---

## チェックリスト

### セットアップ完了チェックリスト

- [ ] `EXPO_TOKEN` を GitHub Secrets に設定済み
- [ ] main ブランチ保護ルール設定済み
- [ ] develop ブランチ保護ルール設定済み
- [ ] CI ワークフローが正常に動作する
- [ ] EAS Update ワークフローが正常に動作する
- [ ] チームメンバーに Conventional Commits を説明済み
- [ ] 動作確認が完了した

### 運用開始チェックリスト

- [ ] プルリクエスト作成時、CI が自動実行される
- [ ] develop へのマージ後、preview チャンネルに配信される
- [ ] main へのマージ後、production チャンネルに配信される
- [ ] Conventional Commits 形式でコミットメッセージを記述できる
- [ ] タグpush時、ビルドが自動で開始される

---

## 参考リンク

- [EAS Build 公式ドキュメント](https://docs.expo.dev/build/introduction/)
- [EAS Update 公式ドキュメント](https://docs.expo.dev/eas-update/introduction/)
- [GitHub Actions 公式ドキュメント](https://docs.github.com/en/actions)
- [semantic-release 公式ドキュメント](https://semantic-release.gitbook.io/)
- [Conventional Commits 仕様](https://www.conventionalcommits.org/)
- [pnpm 公式ドキュメント](https://pnpm.io/)

---

**最終更新**: 2025-11-18
**作成者**: Claude Code (DevOps Engineer)
**バージョン**: 1.0

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
