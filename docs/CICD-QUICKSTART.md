# CI/CD クイックスタートガイド

**対象**: mc-gate プロジェクト
**所要時間**: 約30分

---

## 前提条件

- [ ] GitHubリポジトリへの管理者権限
- [ ] EAS アカウントへのオーナー権限
- [ ] `EXPO_TOKEN` の取得方法を理解している

---

## ステップ1: EXPO_TOKEN の取得（5分）

```bash
# EAS にログイン
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
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

`currentAccessToken` の値をコピーしておく。

---

## ステップ2: GitHub Secrets の設定（5分）

1. GitHub リポジトリを開く
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** をクリック
4. 以下を入力:
   - **Name**: `EXPO_TOKEN`
   - **Value**: ステップ1でコピーしたトークン
5. **Add secret** をクリック

---

## ステップ3: ブランチ保護ルールの設定（5分）

1. GitHub リポジトリ → **Settings** → **Branches**
2. **Add branch protection rule** をクリック
3. 以下を設定:

### main ブランチ保護

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

### develop ブランチ保護（オプション）

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

## ステップ4: ワークフローファイルの確認（5分）

以下のファイルが存在することを確認:

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
.releaserc.json      # semantic-release設定
.github/dependabot.yml  # 依存関係自動更新
```

---

## ステップ5: 動作確認（10分）

### 5.1 CI の動作確認

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

# 5. GitHub でプルリクエスト作成
# Actions タブでCI実行状況を確認
```

**期待される結果**:
- ✅ Lint & Type Check が成功
- ✅ Unit Tests が成功
- ✅ Build Validation が成功
- ✅ プルリクエストに緑のチェックマークが表示される

### 5.2 EAS Update の動作確認

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

# 5. GitHub Actions でEAS Update実行を確認
# https://github.com/YOUR_ORG/mc-gate/actions
```

**期待される結果**:
- ✅ CI が成功
- ✅ EAS Update が `preview` チャンネルに配信される
- ✅ コミットにコメントが追加される

### 5.3 元に戻す

```bash
# テスト用の変更を削除
git checkout develop
git reset --hard HEAD~1
git push -f origin develop

# ブランチ削除
git branch -D test/ci-verification
git push origin --delete test/ci-verification
```

---

## トラブルシューティング

### エラー1: EXPO_TOKEN が無効

**症状**:
```
Error: Invalid token
```

**解決策**:
```bash
# 1. 新しいトークンを取得
npx eas-cli whoami --json

# 2. GitHub Secrets を更新
# Settings → Secrets → EXPO_TOKEN → Update
```

### エラー2: CI が実行されない

**症状**: プルリクエスト作成後、GitHub Actions が起動しない

**解決策**:
1. `.github/workflows/ci.yml` が存在することを確認
2. ワークフローファイルに構文エラーがないか確認
3. GitHub リポジトリの Settings → Actions → General で、GitHub Actions が有効になっているか確認

### エラー3: Status Checks が表示されない

**症状**: プルリクエストに緑のチェックマークが表示されない

**解決策**:
1. 一度CIを実行する（プッシュまたはプルリクエスト作成）
2. CIが成功した後、ブランチ保護ルールで Status Checks を選択可能になる

---

## 次のステップ

### フェーズ1: CI 運用開始（完了）

- [x] CI ワークフロー作成
- [x] GitHub Secrets 設定
- [x] ブランチ保護ルール設定
- [x] 動作確認

### フェーズ2: EAS Update 自動化（完了）

- [x] EAS Update ワークフロー作成
- [x] develop → preview 自動配信
- [x] main → production 自動配信

### フェーズ3: Semantic Release 導入（次のステップ）

- [ ] チームに Conventional Commits を説明
- [ ] `.releaserc.json` の調整（必要に応じて）
- [ ] main マージ時の自動バージョンアップを有効化

### フェーズ4: EAS Build 自動化

- [ ] タグpush時の自動ビルドを有効化
- [ ] Android/iOS 並列ビルドのテスト

### フェーズ5: 通知・モニタリング

- [ ] Slack 通知の設定
- [ ] エラーアラートの設定

---

## Conventional Commits クイックリファレンス

| コミットタイプ | 用途 | バージョン変更 |
|--------------|------|---------------|
| `feat:` | 新機能追加 | MINOR (1.0.0 → 1.1.0) |
| `fix:` | バグ修正 | PATCH (1.0.0 → 1.0.1) |
| `perf:` | パフォーマンス改善 | PATCH |
| `docs:` | ドキュメント変更 | PATCH |
| `refactor:` | リファクタリング | PATCH |
| `test:` | テスト追加 | なし |
| `chore:` | ビルド設定変更 | なし |
| `ci:` | CI設定変更 | なし |
| `BREAKING CHANGE:` | 破壊的変更 | MAJOR (1.0.0 → 2.0.0) |

**例**:

```bash
# MINOR version bump
git commit -m "feat: QRコードスキャン機能追加"

# PATCH version bump
git commit -m "fix: オフライン同期バグ修正"

# No version bump
git commit -m "test: seedData ユニットテスト追加"

# MAJOR version bump
git commit -m "feat!: API v2に移行

BREAKING CHANGE: API v1のサポートを終了"
```

---

## チェックリスト

### 導入完了チェックリスト

- [ ] `EXPO_TOKEN` を GitHub Secrets に設定済み
- [ ] main ブランチ保護ルール設定済み
- [ ] CI ワークフローが正常に動作する
- [ ] EAS Update ワークフローが正常に動作する
- [ ] チームメンバーに Conventional Commits を説明済み

### 日常運用チェックリスト

- [ ] プルリクエスト作成時、CI が自動実行されることを確認
- [ ] develop へのマージ後、preview チャンネルに配信されることを確認
- [ ] main へのマージ後、production チャンネルに配信されることを確認
- [ ] Conventional Commits 形式でコミットメッセージを記述

---

## サポート

問題が発生した場合:

1. **ドキュメント確認**: `/volume2/Project/MCD3/TUMON/mc-gate/docs/CICD-PIPELINE-DESIGN.md`
2. **GitHub Actions ログ確認**: Actions タブで詳細ログを確認
3. **EAS Dashboard 確認**: https://expo.dev/accounts/bme_llc/projects/mc-gate

---

**最終更新**: 2025-11-18
**作成者**: Claude Code

🤖 Generated with [Claude Code](https://claude.com/claude-code)
