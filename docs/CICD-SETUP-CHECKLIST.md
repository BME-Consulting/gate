# CI/CD セットアップチェックリスト

このチェックリストに従って、CI/CDパイプラインを有効化してください。

**所要時間**: 約30分

---

## 📋 事前準備

### 必要な権限確認

- [ ] GitHubリポジトリへの **管理者権限** がある
- [ ] EAS アカウントへの **オーナー権限** がある
- [ ] ブランチ保護ルールを設定できる
- [ ] GitHub Secrets を設定できる

### 必要な情報

- [ ] EAS Project ID: `0f0feec5-4f4b-4252-ad34-c1594238b4b8`
- [ ] EAS Owner: `bme_llc`
- [ ] EAS Slug: `mc-gate`

---

## 🚀 ステップ1: EXPO_TOKEN 取得（5分）

### 1.1 EAS にログイン

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
npx eas-cli login
```

**入力情報**:
- Username: `bme_llc`
- Password: （EASアカウントのパスワード）

### 1.2 トークン取得

```bash
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

### 1.3 トークンをコピー

- [ ] `currentAccessToken` の値をコピーした
- [ ] 安全な場所に一時保存した

---

## 🔐 ステップ2: GitHub Secrets 設定（5分）

### 2.1 GitHub リポジトリを開く

1. ブラウザで GitHub リポジトリを開く
2. **Settings** タブをクリック
3. 左メニューから **Secrets and variables** → **Actions** を選択

### 2.2 EXPO_TOKEN を追加

1. **New repository secret** ボタンをクリック
2. 以下を入力:
   - **Name**: `EXPO_TOKEN`
   - **Value**: ステップ1.2でコピーしたトークン
3. **Add secret** ボタンをクリック

### 2.3 確認

- [ ] `EXPO_TOKEN` が Secrets 一覧に表示されている
- [ ] トークンの値が隠されている（`***` で表示）

---

## 🛡️ ステップ3: ブランチ保護ルール設定（10分）

### 3.1 main ブランチ保護

1. **Settings** → **Branches** を開く
2. **Add branch protection rule** をクリック
3. 以下を設定:

**Branch name pattern**:
```
main
```

**保護設定**:

- [x] **Require a pull request before merging**
  - Required approvals: `1`
  - Dismiss stale pull request approvals when new commits are pushed

- [x] **Require status checks to pass before merging**
  - Require branches to be up to date before merging
  - Status checks that are required:
    - `Lint & Type Check`
    - `Unit Tests`
    - `Build Validation`

- [x] **Do not allow bypassing the above settings**

4. **Create** ボタンをクリック

### 3.2 develop ブランチ保護（オプション）

1. **Add branch protection rule** をクリック
2. 以下を設定:

**Branch name pattern**:
```
develop
```

**保護設定**:

- [x] **Require a pull request before merging**
  - Required approvals: `0`（自動マージ可能）

- [x] **Require status checks to pass before merging**
  - Status checks that are required:
    - `Lint & Type Check`
    - `Unit Tests`

3. **Create** ボタンをクリック

### 3.3 確認

- [ ] main ブランチ保護ルールが作成された
- [ ] develop ブランチ保護ルール作成（オプション）
- [ ] Status checks が設定されている

---

## ✅ ステップ4: CI動作確認（5分）

### 4.1 テストブランチ作成

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
git checkout -b test/ci-verification
```

### 4.2 軽微な変更を加える

```bash
# README.md に空行を追加
echo "" >> README.md
```

### 4.3 コミット＆プッシュ

```bash
git add README.md
git commit -m "test: CI動作確認"
git push -u origin test/ci-verification
```

### 4.4 プルリクエスト作成

1. GitHub でプルリクエスト作成
2. **Actions** タブを開く
3. CI ワークフローの実行を確認

### 4.5 期待される結果

- [ ] ✅ **Lint & Type Check** が成功
- [ ] ✅ **Unit Tests** が成功
- [ ] ✅ **Build Validation** が成功
- [ ] プルリクエストに緑のチェックマークが表示される

### 4.6 クリーンアップ

```bash
# ブランチ削除
git checkout main
git branch -D test/ci-verification
git push origin --delete test/ci-verification

# プルリクエストをクローズ（GitHub UI）
```

---

## 🚢 ステップ5: EAS Update 動作確認（5分）

### 5.1 develop ブランチで変更

```bash
git checkout develop
echo "// CI/CD Test" >> apps/mobile/app.config.ts
```

### 5.2 コミット＆プッシュ（Conventional Commits形式）

```bash
git add apps/mobile/app.config.ts
git commit -m "test: EAS Update動作確認"
git push origin develop
```

### 5.3 GitHub Actions 確認

1. **Actions** タブを開く
2. **EAS Update** ワークフローの実行を確認

### 5.4 期待される結果

- [ ] ✅ CI ワークフローが成功
- [ ] ✅ EAS Update ワークフローが成功
- [ ] コミットにコメントが追加される（EAS Update deployed to **preview** channel）
- [ ] Expo Dashboard で Update が確認できる

### 5.5 クリーンアップ

```bash
# 変更を元に戻す
git reset --hard HEAD~1
git push -f origin develop
```

---

## 🎯 完了確認

### 必須項目

- [ ] `EXPO_TOKEN` が GitHub Secrets に設定済み
- [ ] main ブランチ保護ルールが設定済み
- [ ] CI ワークフローが正常に動作する
- [ ] EAS Update ワークフローが正常に動作する

### オプション項目

- [ ] develop ブランチ保護ルール設定済み
- [ ] Slack 通知設定済み（後日実施可能）
- [ ] チームメンバーに Conventional Commits を説明済み

---

## 📚 次のステップ

### 運用開始

1. **Conventional Commits の徹底**
   - チーム全員にフォーマットを周知
   - コミットメッセージテンプレート作成

2. **日常的な開発フロー**
   ```bash
   # 1. feature ブランチで開発
   git checkout -b feature/new-feature

   # 2. Conventional Commits でコミット
   git commit -m "feat: 新機能追加"

   # 3. プルリクエスト作成 → CI自動実行

   # 4. develop マージ → EAS Update (preview)

   # 5. main マージ → Semantic Release + EAS Update (production)
   ```

3. **定期的なメンテナンス**
   - Dependabot のPR確認（週次）
   - `EXPO_TOKEN` の更新（90日ごと）
   - ワークフローの最適化

---

## 🆘 トラブルシューティング

### CI が実行されない

**症状**: プルリクエスト作成後、GitHub Actions が起動しない

**解決策**:
1. `.github/workflows/ci.yml` が存在するか確認
2. GitHub → Settings → Actions → General で Actions が有効か確認
3. ワークフローファイルの構文エラーをチェック

### EXPO_TOKEN エラー

**症状**: `Error: Invalid token`

**解決策**:
```bash
# 新しいトークンを取得
npx eas-cli whoami --json

# GitHub Secrets を更新
# Settings → Secrets → EXPO_TOKEN → Update
```

### Status Checks が表示されない

**症状**: ブランチ保護ルールで Status Checks が選択できない

**解決策**:
1. まず一度CIを実行する（プッシュまたはPR作成）
2. CI成功後、Status Checks が選択可能になる
3. ブランチ保護ルールを再設定

---

## 📖 参考ドキュメント

| ドキュメント | パス | 用途 |
|------------|------|------|
| **完全設計書** | `docs/CICD-PIPELINE-DESIGN.md` | 詳細な仕様・実装 |
| **クイックスタート** | `docs/CICD-QUICKSTART.md` | 30分で導入 |
| **実装サマリー** | `docs/CICD-IMPLEMENTATION-SUMMARY.md` | 実装内容まとめ |
| **セットアップチェックリスト** | このファイル | 導入手順 |

---

## 📞 サポート

問題が発生した場合:

1. **ドキュメント確認**: 上記参考ドキュメント
2. **GitHub Actions ログ**: Actions タブで詳細ログを確認
3. **EAS Dashboard**: https://expo.dev/accounts/bme_llc/projects/mc-gate

---

**最終更新**: 2025-11-18
**作成者**: Claude Code
**推定所要時間**: 30分

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
