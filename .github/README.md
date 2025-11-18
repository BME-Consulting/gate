# GitHub Actions ワークフロー

このディレクトリには mc-gate プロジェクトの CI/CD パイプライン設定が含まれています。

---

## ワークフロー一覧

### 1. CI（`workflows/ci.yml`）

**トリガー**: Pull Request、develop/main への push

**目的**: コード品質保証

**実行内容**:
- ESLint（コード品質チェック）
- TypeScript 型チェック
- Jest 単体テスト
- Expo/EAS 設定検証

**実行時間**: 約5-10分

### 2. EAS Update（`workflows/eas-update.yml`）

**トリガー**: develop/main への push

**目的**: JavaScript/TypeScript コード変更のOTA配信

**実行内容**:
- develop → `preview` チャンネル
- main → `production` チャンネル

**実行時間**: 約3-5分

### 3. EAS Build（`workflows/eas-build.yml`）

**トリガー**: タグpush（`v*.*.*`）

**目的**: ネイティブコード変更時の新ビルド作成

**実行内容**:
- Android/iOS 並列ビルド
- バージョン検証
- GitHub Release 作成

**実行時間**: 約10-15分（プラットフォームごと）

### 4. Semantic Release（`workflows/release.yml`）

**トリガー**: main への push

**目的**: 自動バージョニング

**実行内容**:
- Conventional Commits 解析
- バージョン番号決定
- CHANGELOG.md 生成
- Git タグ作成
- app.config.ts 自動更新

**実行時間**: 約2-3分

---

## 設定ファイル

### `dependabot.yml`

**目的**: 依存関係の自動更新

**更新頻度**: 週次

**対象**:
- npm パッケージ（Expo, React, Testing）
- GitHub Actions

---

## 必要な設定

### GitHub Secrets

| Secret名 | 用途 | 設定方法 |
|---------|------|---------|
| `EXPO_TOKEN` | EAS CLI 認証 | `npx eas-cli whoami --json` で取得 |
| `GITHUB_TOKEN` | 自動生成 | 設定不要 |

**設定場所**: Settings → Secrets and variables → Actions

### ブランチ保護ルール

**main ブランチ**:
- Require pull request before merging
- Require status checks:
  - Lint & Type Check
  - Unit Tests
  - Build Validation

**設定場所**: Settings → Branches → Add branch protection rule

---

## 使い方

### 開発フロー

```bash
# 1. feature ブランチで開発
git checkout -b feature/new-feature

# 2. コミット（Conventional Commits形式）
git commit -m "feat: 新機能追加"

# 3. プルリクエスト作成
git push -u origin feature/new-feature
# → CI が自動実行

# 4. develop にマージ
# → EAS Update (preview) が自動配信

# 5. main にマージ
# → Semantic Release + EAS Update (production) が自動実行
```

### リリースフロー

```bash
# 1. main ブランチにマージ済み
# → semantic-release が自動でバージョンアップ

# 2. 新しいタグが自動作成される（例: v1.2.3）

# 3. ネイティブビルドが必要な場合、タグをプッシュ
git push origin v1.2.3
# → EAS Build (Android + iOS) が自動実行
```

---

## Conventional Commits

### フォーマット

```
<type>(<scope>): <subject>
```

### Type一覧

- `feat`: 新機能 → MINOR
- `fix`: バグ修正 → PATCH
- `perf`: パフォーマンス改善 → PATCH
- `docs`: ドキュメント → PATCH
- `refactor`: リファクタリング → PATCH
- `test`: テスト追加 → バージョンアップなし
- `chore`: ビルド設定 → バージョンアップなし
- `ci`: CI設定 → バージョンアップなし
- `BREAKING CHANGE`: 破壊的変更 → MAJOR

### 例

```bash
# MINOR (1.0.0 → 1.1.0)
git commit -m "feat: QRスキャン機能追加"

# PATCH (1.0.0 → 1.0.1)
git commit -m "fix: オフライン同期バグ修正"

# MAJOR (1.0.0 → 2.0.0)
git commit -m "feat!: API v2移行

BREAKING CHANGE: API v1のサポートを終了"
```

---

## トラブルシューティング

### CI が実行されない

**原因**: ワークフローファイルの構文エラー

**解決策**:
```bash
# YAML構文チェック
yamllint .github/workflows/*.yml
```

### EXPO_TOKEN が無効

**原因**: トークンの期限切れ

**解決策**:
```bash
# 新しいトークンを取得
npx eas-cli whoami --json

# GitHub Secrets を更新
# Settings → Secrets → EXPO_TOKEN
```

### EAS Update が反映されない

**原因**: Build と Update のコミットハッシュ不一致

**解決策**:
```bash
# コミットハッシュ確認
npx eas-cli build:list --platform android --limit 1
npx eas-cli update:list --branch preview --limit 1

# 一致していなければ再配信
npx eas-cli update --branch preview --message "Sync"
```

---

## 参考ドキュメント

- **完全設計書**: `/volume2/Project/MCD3/TUMON/mc-gate/docs/CICD-PIPELINE-DESIGN.md`
- **クイックスタート**: `/volume2/Project/MCD3/TUMON/mc-gate/docs/CICD-QUICKSTART.md`
- **実装サマリー**: `/volume2/Project/MCD3/TUMON/mc-gate/docs/CICD-IMPLEMENTATION-SUMMARY.md`

---

**最終更新**: 2025-11-18
**作成者**: Claude Code
