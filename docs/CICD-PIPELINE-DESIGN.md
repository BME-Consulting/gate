# CI/CD パイプライン設計書 - mc-gate プロジェクト

**作成日**: 2025-11-18
**対象プロジェクト**: mc-gate (Expo React Native モバイルアプリ)
**バージョン**: 1.0

---

## 目次

1. [概要](#1-概要)
2. [現在の状況と課題](#2-現在の状況と課題)
3. [CI/CDパイプライン全体設計](#3-cicdパイプライン全体設計)
4. [GitHub Actions ワークフロー設計](#4-github-actions-ワークフロー設計)
5. [自動バージョニング戦略](#5-自動バージョニング戦略)
6. [環境変数とシークレット管理](#6-環境変数とシークレット管理)
7. [キャッシュ戦略](#7-キャッシュ戦略)
8. [通知とモニタリング](#8-通知とモニタリング)
9. [実装ロードマップ](#9-実装ロードマップ)
10. [ベストプラクティス](#10-ベストプラクティス)
11. [トラブルシューティング](#11-トラブルシューティング)

---

## 1. 概要

### 1.1 目的

mc-gate プロジェクトの開発・デプロイプロセスを自動化し、以下を実現する:

- **品質保証**: 自動テスト・Lint・型チェックで品質を維持
- **迅速なデプロイ**: コミット後、数分でユーザーに配信
- **安全性**: 本番環境へのデプロイ前の厳格なチェック
- **トレーサビリティ**: すべての変更履歴と配信状況を追跡

### 1.2 技術スタック

- **CI/CD**: GitHub Actions
- **ビルドサービス**: EAS (Expo Application Services)
- **パッケージマネージャー**: pnpm 9.15.4
- **Monorepo**: pnpm workspaces
- **Runtime**: Node.js 22.x

### 1.3 プロジェクト情報

- **Owner**: bme_llc
- **Slug**: mc-gate
- **Project ID**: 0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Updates URL**: https://u.expo.dev/0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Dashboard**: https://expo.dev/accounts/bme_llc/projects/mc-gate

---

## 2. 現在の状況と課題

### 2.1 現在の状況

- ✅ EAS Build/Update の基本設定完了
- ✅ pnpm monorepo 構成
- ✅ TypeScript + ESLint + Jest セットアップ済み
- ✅ ローカル開発環境整備済み
- ❌ **手動ビルド・デプロイ**
- ❌ **手動テスト実行**
- ❌ **手動バージョニング**
- ❌ **CI/CD パイプラインなし**

### 2.2 解決すべき課題

| 課題 | 現状 | 理想 |
|------|------|------|
| ビルド | 手動実行（15分/回） | プルリクマージ時に自動実行 |
| テスト | 開発者のローカルのみ | CI で全コミット自動実行 |
| デプロイ | 手動で `eas update` 実行 | main/develop ブランチpush時に自動配信 |
| バージョニング | 手動で version/versionCode 更新 | semantic-release で自動管理 |
| 品質チェック | レビュー時に手動確認 | PR 作成時に自動チェック |

---

## 3. CI/CDパイプライン全体設計

### 3.1 パイプライン構成図

```
┌─────────────────────────────────────────────────────────────┐
│                        Git Push                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Actions                            │
├─────────────────────────────────────────────────────────────┤
│  Pull Request:                                              │
│    ├─ Lint & Type Check                                    │
│    ├─ Unit Tests                                            │
│    └─ Build Validation                                      │
├─────────────────────────────────────────────────────────────┤
│  Push to develop:                                           │
│    ├─ Run CI                                                │
│    └─ EAS Update → preview channel                         │
├─────────────────────────────────────────────────────────────┤
│  Push to main:                                              │
│    ├─ Run CI                                                │
│    ├─ Semantic Release (version bump)                      │
│    └─ EAS Update → production channel                      │
├─────────────────────────────────────────────────────────────┤
│  Tag Push (v*):                                             │
│    ├─ Run CI                                                │
│    └─ EAS Build → production (Android + iOS)               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 ブランチ戦略

| ブランチ | 用途 | CI/CD 動作 | EAS Channel |
|---------|------|-----------|-------------|
| `feature/*` | 機能開発 | Lint + Test のみ | - |
| `develop` | 開発環境 | CI + EAS Update | preview |
| `main` | 本番環境 | CI + Semantic Release + EAS Update | production |
| `v*.*.*` (tag) | リリース | CI + EAS Build | production |

### 3.3 デプロイフロー

#### パターンA: JS/TSコード変更のみ（OTA配信）

```
1. feature/* でコード変更
2. Pull Request 作成 → CI 実行（Lint/Test）
3. develop にマージ → EAS Update (preview)
4. 動作確認
5. main にマージ → EAS Update (production)
```

#### パターンB: ネイティブ変更を含む（新ビルド必須）

```
1. feature/* でネイティブ設定変更（app.config.ts など）
2. Pull Request 作成 → CI 実行
3. main にマージ
4. タグpush (v1.2.3) → EAS Build (production)
5. ビルド完了後 → EAS Update (production)
```

---

## 4. GitHub Actions ワークフロー設計

### 4.1 CI ワークフロー（`.github/workflows/ci.yml`）

**目的**: コード品質チェック（Lint/Test/TypeCheck）

**トリガー**:
- Pull Request 作成・更新時
- `develop`, `main` ブランチへの push

**実装**:

```yaml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.4

      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run ESLint
        run: pnpm lint

      - name: Run TypeScript type check
        run: pnpm type-check

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.4

      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test

      - name: Upload test coverage
        uses: codecov/codecov-action@v4
        if: always()
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella
          fail_ci_if_error: false

  build-check:
    name: Build Validation
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Validate Expo config
        working-directory: apps/mobile
        run: npx expo config --json > /dev/null

      - name: Check EAS configuration
        working-directory: apps/mobile
        run: |
          if [ ! -f "eas.json" ]; then
            echo "❌ eas.json not found"
            exit 1
          fi
          echo "✅ eas.json found"
```

---

### 4.2 EAS Update ワークフロー（`.github/workflows/eas-update.yml`）

**目的**: JavaScript/TypeScriptコード変更をOTA配信

**トリガー**:
- `develop` ブランチへの push → `preview` チャンネル
- `main` ブランチへの push → `production` チャンネル

**実装**:

```yaml
name: EAS Update

on:
  push:
    branches: [main, develop]

jobs:
  update:
    name: Deploy EAS Update
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 全履歴取得（semantic-release用）

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Determine channel
        id: channel
        run: |
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            echo "channel=production" >> $GITHUB_OUTPUT
            echo "branch=production" >> $GITHUB_OUTPUT
            echo "message=Production release: ${{ github.event.head_commit.message }}" >> $GITHUB_OUTPUT
          else
            echo "channel=preview" >> $GITHUB_OUTPUT
            echo "branch=preview" >> $GITHUB_OUTPUT
            echo "message=Preview: ${{ github.event.head_commit.message }}" >> $GITHUB_OUTPUT
          fi

      - name: Publish EAS Update
        working-directory: apps/mobile
        run: |
          npx eas-cli update \
            --branch ${{ steps.channel.outputs.branch }} \
            --message "${{ steps.channel.outputs.message }}" \
            --non-interactive

      - name: Comment on PR (if exists)
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const channel = '${{ steps.channel.outputs.channel }}';
            const updateUrl = 'https://expo.dev/accounts/bme_llc/projects/mc-gate/updates';

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `✅ EAS Update deployed to **${channel}** channel!\n\n[View Updates](${updateUrl})`
            });
```

---

### 4.3 EAS Build ワークフロー（`.github/workflows/eas-build.yml`）

**目的**: ネイティブコード変更時の新ビルド作成

**トリガー**: タグpush（`v*.*.*`）

**重要**: このワークフローは **EXPO_TOKEN の消費に注意**（ビルド回数制限）

**実装**:

```yaml
name: EAS Build

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build:
    name: Build for ${{ matrix.platform }}
    runs-on: ubuntu-latest
    timeout-minutes: 60
    strategy:
      matrix:
        platform: [android, ios]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Validate version in app.config.ts
        working-directory: apps/mobile
        run: |
          VERSION=$(npx expo config --json | jq -r '.expo.version')
          TAG_VERSION=${GITHUB_REF#refs/tags/v}

          if [ "$VERSION" != "$TAG_VERSION" ]; then
            echo "❌ Version mismatch!"
            echo "app.config.ts version: $VERSION"
            echo "Git tag version: $TAG_VERSION"
            exit 1
          fi

          echo "✅ Version validated: $VERSION"

      - name: Build with EAS
        working-directory: apps/mobile
        run: |
          npx eas-cli build \
            --platform ${{ matrix.platform }} \
            --profile production \
            --non-interactive \
            --no-wait

      - name: Get build status
        working-directory: apps/mobile
        run: |
          echo "Build started for ${{ matrix.platform }}"
          echo "Monitor at: https://expo.dev/accounts/bme_llc/projects/mc-gate/builds"

  notify:
    name: Notify build completion
    runs-on: ubuntu-latest
    needs: [build]
    if: always()

    steps:
      - name: Create GitHub Release
        if: needs.build.result == 'success'
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          body: |
            ## Changes
            ${{ github.event.head_commit.message }}

            ## Builds
            - [Android Build](https://expo.dev/accounts/bme_llc/projects/mc-gate/builds?platform=android)
            - [iOS Build](https://expo.dev/accounts/bme_llc/projects/mc-gate/builds?platform=ios)

            🤖 Generated with [Claude Code](https://claude.com/claude-code)
          draft: false
          prerelease: false
```

---

### 4.4 Semantic Release ワークフロー（`.github/workflows/release.yml`）

**目的**: Conventional Commits に基づく自動バージョニング

**トリガー**: `main` ブランチへの push

**実装**:

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    name: Semantic Release
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 全履歴取得
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9.15.4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install semantic-release
        run: |
          pnpm add -D \
            semantic-release \
            @semantic-release/changelog \
            @semantic-release/git \
            @semantic-release/github \
            conventional-changelog-conventionalcommits

      - name: Run semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GIT_AUTHOR_NAME: github-actions[bot]
          GIT_AUTHOR_EMAIL: github-actions[bot]@users.noreply.github.com
          GIT_COMMITTER_NAME: github-actions[bot]
          GIT_COMMITTER_EMAIL: github-actions[bot]@users.noreply.github.com
        run: npx semantic-release

      - name: Update app.config.ts version
        if: success()
        run: |
          # 最新のバージョンタグを取得
          NEW_VERSION=$(git describe --tags --abbrev=0 | sed 's/^v//')

          # app.config.ts を更新
          sed -i "s/version: \".*\"/version: \"$NEW_VERSION\"/" apps/mobile/app.config.ts

          # versionCode を自動インクリメント
          CURRENT_VERSION_CODE=$(grep -oP 'versionCode: \K\d+' apps/mobile/app.config.ts)
          NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))
          sed -i "s/versionCode: $CURRENT_VERSION_CODE/versionCode: $NEW_VERSION_CODE/" apps/mobile/app.config.ts

          # コミット
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add apps/mobile/app.config.ts
          git commit -m "chore: bump version to $NEW_VERSION (versionCode $NEW_VERSION_CODE) [skip ci]"
          git push
```

**`.releaserc.json`**:

```json
{
  "branches": ["main"],
  "plugins": [
    [
      "@semantic-release/commit-analyzer",
      {
        "preset": "conventionalcommits",
        "releaseRules": [
          { "type": "feat", "release": "minor" },
          { "type": "fix", "release": "patch" },
          { "type": "perf", "release": "patch" },
          { "type": "revert", "release": "patch" },
          { "type": "docs", "release": "patch" },
          { "type": "style", "release": false },
          { "type": "refactor", "release": "patch" },
          { "type": "test", "release": false },
          { "type": "build", "release": "patch" },
          { "type": "ci", "release": false },
          { "type": "chore", "release": false },
          { "breaking": true, "release": "major" }
        ]
      }
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        "preset": "conventionalcommits"
      }
    ],
    [
      "@semantic-release/changelog",
      {
        "changelogFile": "CHANGELOG.md"
      }
    ],
    [
      "@semantic-release/github",
      {
        "successComment": "✅ This ${issue.pull_request ? 'PR is included' : 'issue has been resolved'} in version ${nextRelease.version}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
      }
    ],
    [
      "@semantic-release/git",
      {
        "assets": ["CHANGELOG.md"],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
      }
    ]
  ]
}
```

---

## 5. 自動バージョニング戦略

### 5.1 Conventional Commits フォーマット

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type（必須）**:
- `feat`: 新機能 → **MINOR** バージョンアップ
- `fix`: バグ修正 → **PATCH** バージョンアップ
- `perf`: パフォーマンス改善 → **PATCH**
- `docs`: ドキュメント変更 → **PATCH**
- `refactor`: リファクタリング → **PATCH**
- `test`: テスト追加・修正 → バージョンアップなし
- `chore`: ビルド設定変更 → バージョンアップなし
- `ci`: CI設定変更 → バージョンアップなし
- `BREAKING CHANGE`: 破壊的変更 → **MAJOR** バージョンアップ

**Scope（任意）**: `mobile`, `core`, `api-client`, `ui-kit` など

**例**:

```bash
# MINOR (1.0.0 → 1.1.0)
git commit -m "feat(mobile): QRコードスキャン機能追加"

# PATCH (1.0.0 → 1.0.1)
git commit -m "fix(core): オフラインキュー同期バグ修正"

# MAJOR (1.0.0 → 2.0.0)
git commit -m "feat(api-client): 新API v2に移行

BREAKING CHANGE: API v1のサポートを終了"
```

### 5.2 バージョン管理フロー

```
1. 開発者がコミット（Conventional Commits形式）
2. main ブランチにマージ
3. semantic-release がコミットメッセージを解析
4. バージョン番号を自動決定（MAJOR.MINOR.PATCH）
5. CHANGELOG.md を自動生成
6. Git タグ作成（v1.2.3）
7. GitHub Release 作成
8. app.config.ts の version/versionCode を自動更新
```

### 5.3 app.config.ts との同期

```typescript
// apps/mobile/app.config.ts
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  version: "1.0.11",      // semantic-release が自動更新
  android: {
    versionCode: 12,      // 自動インクリメント
  },
  // ...
});
```

---

## 6. 環境変数とシークレット管理

### 6.1 GitHub Secrets 設定

| Secret名 | 用途 | 取得方法 |
|---------|------|---------|
| `EXPO_TOKEN` | EAS CLI 認証 | `npx eas-cli login` → `npx eas-cli whoami --json` |
| `GITHUB_TOKEN` | 自動生成（GitHub Actions） | - |
| `SLACK_WEBHOOK_URL` | Slack通知（オプション） | Slack App設定 |
| `CODECOV_TOKEN` | カバレッジ送信（オプション） | Codecov設定 |

**設定方法**:

```
GitHub Repository
  → Settings
  → Secrets and variables
  → Actions
  → New repository secret
```

### 6.2 環境変数の管理

#### 開発環境（ローカル）

```bash
# .env.local (gitignored)
ENV=development
API_BASE_GS=http://192.168.1.4:7070
API_BASE_CCUS=http://192.168.1.4:7071
API_FACE_API=http://192.168.1.4:8100
AUTH_ISSUER=http://192.168.1.4:8080/auth/realms/mcd3
```

#### プレビュー環境（develop）

```bash
# eas.json
{
  "build": {
    "preview": {
      "env": {
        "ENV": "preview",
        "API_BASE_GS": "https://api-preview.example.com",
        "API_BASE_CCUS": "https://ccus-preview.example.com"
      }
    }
  }
}
```

#### 本番環境（main）

```bash
# eas.json
{
  "build": {
    "production": {
      "env": {
        "ENV": "production",
        "API_BASE_GS": "https://api.example.com",
        "API_BASE_CCUS": "https://ccus.example.com"
      }
    }
  }
}
```

### 6.3 セキュリティベストプラクティス

1. **HTTPSの強制**

```typescript
// app.config.ts
if (isProduction) {
  const httpUrls = urls.filter(url => url.value.startsWith("http://"));
  if (httpUrls.length > 0) {
    throw new Error("Production requires HTTPS");
  }
}
```

2. **シークレットのローテーション**

- `EXPO_TOKEN`: 90日ごとに更新
- `SLACK_WEBHOOK_URL`: 変更時に即座に更新

3. **最小権限の原則**

- GitHub Actions には必要最小限の権限のみ付与
- Personal Access Token は使用しない（GITHUB_TOKEN を使用）

---

## 7. キャッシュ戦略

### 7.1 依存関係キャッシュ

```yaml
- name: Get pnpm store directory
  shell: bash
  run: |
    echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

- name: Setup pnpm cache
  uses: actions/cache@v4
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-pnpm-store-
```

**効果**: 依存関係インストール時間を **5分 → 30秒** に短縮

### 7.2 EAS Build キャッシュ

EAS側で自動的にキャッシュされるため、追加設定不要。

- ネイティブ依存関係（`node_modules`）
- Gradle/CocoaPods キャッシュ
- Docker レイヤーキャッシュ

### 7.3 キャッシュ無効化

```bash
# GitHub Actions のキャッシュをクリア
gh cache delete --all

# EAS Build キャッシュをクリア
npx eas-cli build --platform android --profile production --clear-cache
```

---

## 8. 通知とモニタリング

### 8.1 Slack 通知（オプション）

```yaml
name: Slack Notification

on:
  workflow_run:
    workflows: ["CI", "EAS Update", "EAS Build"]
    types: [completed]

jobs:
  notify:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion != 'success' }}

    steps:
      - name: Send Slack notification
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "❌ GitHub Actions failed",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Workflow*: ${{ github.event.workflow_run.name }}\n*Branch*: ${{ github.ref_name }}\n*Status*: ${{ github.event.workflow_run.conclusion }}\n*URL*: ${{ github.event.workflow_run.html_url }}"
                  }
                }
              ]
            }
```

### 8.2 GitHub Status Checks

**Pull Request のマージ要件設定**:

```
Settings
  → Branches
  → Branch protection rules (main)
  → Require status checks to pass before merging
    ✅ Lint & Type Check
    ✅ Unit Tests
    ✅ Build Validation
```

### 8.3 デプロイメント環境

```yaml
environment:
  name: production
  url: https://expo.dev/accounts/bme_llc/projects/mc-gate

# 環境保護ルール:
# - Required reviewers: 1名以上
# - Wait timer: 0分（即座にデプロイ）
```

---

## 9. 実装ロードマップ

### フェーズ1: CI 基盤構築（1週間）

**目標**: Pull Request時の自動品質チェック

- [ ] `.github/workflows/ci.yml` 作成
- [ ] ESLint + TypeScript + Jest 実行
- [ ] pnpm キャッシュ設定
- [ ] GitHub Status Checks 有効化
- [ ] **成功基準**: PR作成時にCI が自動実行され、結果が表示される

### フェーズ2: EAS Update 自動化（1週間）

**目標**: develop/main ブランチへのpush時に自動配信

- [ ] `.github/workflows/eas-update.yml` 作成
- [ ] `EXPO_TOKEN` シークレット設定
- [ ] develop → preview チャンネル配信
- [ ] main → production チャンネル配信
- [ ] **成功基準**: コミット後5分以内にOTA配信完了

### フェーズ3: 自動バージョニング（1週間）

**目標**: Conventional Commits に基づく自動バージョン管理

- [ ] `.releaserc.json` 作成
- [ ] `.github/workflows/release.yml` 作成
- [ ] Conventional Commits 運用ルール策定
- [ ] CHANGELOG.md 自動生成
- [ ] **成功基準**: main マージ時に自動でバージョンアップとタグ作成

### フェーズ4: EAS Build 自動化（1週間）

**目標**: タグpush時の自動ビルド

- [ ] `.github/workflows/eas-build.yml` 作成
- [ ] Android/iOS 並列ビルド
- [ ] バージョン検証ロジック追加
- [ ] **成功基準**: タグpush後、自動でビルドが開始される

### フェーズ5: 通知・モニタリング（1週間）

**目標**: チーム全体への可視化

- [ ] Slack 通知設定
- [ ] デプロイメント環境設定
- [ ] エラーアラート設定
- [ ] **成功基準**: ビルド失敗時にSlack通知が届く

---

## 10. ベストプラクティス

### 10.1 高速化

1. **並列ジョブ実行**

```yaml
jobs:
  lint:
    # ...
  test:
    # ...
  build-check:
    # ...
# 3つのジョブが並列実行 → 高速化
```

2. **キャッシュ活用**

- pnpm store キャッシュ
- Node.js setup の cache オプション
- EAS Build のキャッシュ

3. **不要なステップのスキップ**

```yaml
- name: Run tests
  if: github.event_name == 'pull_request'
  # PRの時のみテスト実行
```

### 10.2 セキュリティ

1. **Secrets の適切な管理**

- GitHub Secrets に保存
- 環境変数として注入
- ログに出力しない

2. **最小権限の原則**

```yaml
permissions:
  contents: read
  pull-requests: write
```

3. **依存関係の自動更新（Dependabot）**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

### 10.3 保守性

1. **ワークフローの分割**

- CI: 品質チェック
- EAS Update: デプロイ
- EAS Build: ビルド
- Release: バージョニング

2. **再利用可能なアクション**

```yaml
# .github/actions/setup-pnpm/action.yml
name: Setup pnpm
runs:
  using: "composite"
  steps:
    - uses: pnpm/action-setup@v4
      with:
        version: 9.15.4
    - run: pnpm install --frozen-lockfile
```

3. **ドキュメント整備**

- ワークフローごとにコメント追加
- トラブルシューティングガイド作成
- 運用マニュアル整備

---

## 11. トラブルシューティング

### 11.1 よくあるエラー

#### エラー1: `EXPO_TOKEN` 認証失敗

**症状**:
```
Error: Invalid token
```

**解決策**:
```bash
# 新しいトークンを取得
npx eas-cli whoami --json

# GitHub Secrets を更新
# Repository → Settings → Secrets → EXPO_TOKEN
```

#### エラー2: pnpm キャッシュ復元失敗

**症状**:
```
Cache restored from key: ...
Warning: No cache found for input keys
```

**解決策**:
```yaml
# restore-keys を追加
restore-keys: |
  ${{ runner.os }}-pnpm-store-
```

#### エラー3: EAS Update が反映されない

**症状**: ビルドは成功するが、アプリに変更が反映されない

**原因**: Build と Update のコミットハッシュが不一致

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

#### エラー4: semantic-release がバージョンアップしない

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

### 11.2 デバッグ方法

#### GitHub Actions ログ確認

```bash
# GitHub CLI でログ確認
gh run list
gh run view <RUN_ID> --log
```

#### EAS CLI でビルド状況確認

```bash
# 最新ビルドの状態
npx eas-cli build:list --platform android --limit 1

# ビルドログを表示
npx eas-cli build:view <BUILD_ID>
```

#### ローカルで再現

```bash
# CI と同じコマンドをローカル実行
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test
```

### 11.3 ロールバック手順

#### EAS Update のロールバック

```bash
# 直前のUpdateにロールバック
npx eas-cli update:rollback --branch production

# 特定のUpdate IDにロールバック
npx eas-cli update:rollback --branch production --group <UPDATE_GROUP_ID>
```

#### Semantic Release のロールバック

```bash
# タグを削除
git tag -d v1.2.3
git push origin :refs/tags/v1.2.3

# GitHub Release を削除
gh release delete v1.2.3
```

---

## 付録A: ワークフロー全体概要

| ワークフロー | トリガー | 実行時間 | 主な処理 |
|------------|---------|---------|---------|
| CI | PR作成、develop/main push | 5-10分 | Lint, Test, Build Check |
| EAS Update | develop/main push | 3-5分 | OTA配信 |
| EAS Build | タグpush (v*) | 10-15分 | ネイティブビルド |
| Release | main push | 2-3分 | バージョニング、CHANGELOG生成 |

---

## 付録B: Conventional Commits チートシート

| Type | 用途 | バージョン | 例 |
|------|------|-----------|-----|
| `feat` | 新機能 | MINOR | `feat: QRスキャン機能追加` |
| `fix` | バグ修正 | PATCH | `fix: オフライン同期バグ修正` |
| `perf` | パフォーマンス改善 | PATCH | `perf: SQLクエリ最適化` |
| `docs` | ドキュメント | PATCH | `docs: READMEに環境構築手順追加` |
| `refactor` | リファクタリング | PATCH | `refactor: useQueue フック抽出` |
| `test` | テスト追加 | なし | `test: seedData ユニットテスト追加` |
| `chore` | ビルド設定変更 | なし | `chore: pnpm 9.15.4 に更新` |
| `ci` | CI設定変更 | なし | `ci: GitHub Actions ワークフロー追加` |
| `BREAKING CHANGE` | 破壊的変更 | MAJOR | `feat!: API v2に移行` |

---

## 付録C: チェックリスト

### CI/CD導入前チェックリスト

- [ ] GitHub リポジトリに admin 権限がある
- [ ] EAS アカウントに owner 権限がある
- [ ] `EXPO_TOKEN` を取得済み
- [ ] `.github/workflows/` ディレクトリを作成可能
- [ ] ブランチ保護ルールを設定可能
- [ ] チームメンバーに Conventional Commits を説明済み

### フェーズ1完了チェックリスト

- [ ] `.github/workflows/ci.yml` が存在する
- [ ] PR作成時にCI が自動実行される
- [ ] Lint/Test/TypeCheck が通る
- [ ] GitHub Status Checks が表示される

### フェーズ2完了チェックリスト

- [ ] `.github/workflows/eas-update.yml` が存在する
- [ ] `EXPO_TOKEN` が GitHub Secrets に設定済み
- [ ] develop push で preview チャンネルに配信される
- [ ] main push で production チャンネルに配信される

### フェーズ3完了チェックリスト

- [ ] `.releaserc.json` が存在する
- [ ] `.github/workflows/release.yml` が存在する
- [ ] main マージ時に自動でバージョンアップする
- [ ] CHANGELOG.md が自動生成される
- [ ] Git タグが自動作成される

### フェーズ4完了チェックリスト

- [ ] `.github/workflows/eas-build.yml` が存在する
- [ ] タグpush時に自動ビルドが開始される
- [ ] Android/iOS 並列ビルドが動作する
- [ ] バージョン検証が機能する

### フェーズ5完了チェックリスト

- [ ] Slack 通知が動作する
- [ ] デプロイメント環境が設定済み
- [ ] エラーアラートが機能する

---

## 付録D: 参考リンク

- [EAS Build 公式ドキュメント](https://docs.expo.dev/build/introduction/)
- [EAS Update 公式ドキュメント](https://docs.expo.dev/eas-update/introduction/)
- [GitHub Actions 公式ドキュメント](https://docs.github.com/en/actions)
- [semantic-release 公式ドキュメント](https://semantic-release.gitbook.io/)
- [Conventional Commits 仕様](https://www.conventionalcommits.org/)
- [pnpm 公式ドキュメント](https://pnpm.io/)

---

**最終更新**: 2025-11-18
**作成者**: Claude Code with user collaboration
**バージョン**: 1.0

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
