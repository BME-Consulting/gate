# GitHub Branch Protection Setup Guide

**目的**: mainブランチをPR強制にし、リリース事故を防ぐ
**推定時間**: 5分
**設定者**: Repository Admin

---

## 🎯 設定手順

### Step 1: Branch Protection Rules にアクセス

1. GitHubで `https://github.com/BME-Consulting/gate` を開く
2. **Settings** タブをクリック
3. 左サイドバーの **Branches** をクリック
4. **Branch protection rules** セクションで **Add branch protection rule** をクリック

---

### Step 2: Branch Name Pattern を設定

**Branch name pattern** に以下を入力:
```
main
```

---

### Step 3: 必須設定（事故防止の本丸）

以下の項目に**必ずチェック**を入れる:

#### ✅ Require a pull request before merging
- **必須理由**: main への直接 push を禁止
- **効果**: PRテンプレートが必ず使われる

**サブオプション**:
- ✅ **Require approvals**: 最低 1 人（推奨: 2人）
- ✅ **Dismiss stale pull request approvals when new commits are pushed**: 新しいコミットでレビューをリセット
- ❌ Require review from Code Owners: チームが存在しない場合はOFF

#### ✅ Require status checks to pass before merging
- **必須理由**: CI/CDチェックが通らないとマージできない
- **効果**: SSOT Guard が自動実行される

**サブオプション**:
- ✅ **Require branches to be up to date before merging**: マージ前にbase更新を強制
- ✅ **Status checks that are required**:
  - `SSOT Change Detection` を検索して追加
  - 他のCIジョブがあれば追加（例: `type-check`, `lint`）

#### ✅ Require conversation resolution before merging
- **必須理由**: レビューコメントの未解決のままマージ禁止
- **効果**: 指摘事項の対応漏れを防ぐ

---

### Step 4: 推奨設定（品質向上）

以下は必須ではないが、品質向上に有効:

#### 🟡 Require linear history
- **効果**: マージコミットを禁止し、履歴を一直線に保つ
- **推奨**: チームが git rebase に慣れている場合のみ

#### 🟡 Include administrators
- **効果**: 管理者も Branch Protection Rules に従う
- **推奨**: 「緊急時の抜け道」が不要な場合のみ

#### 🟡 Restrict who can push to matching branches
- **効果**: 特定のユーザー/チームのみがpush可能
- **推奨**: チームが明確に分かれている場合のみ

---

### Step 5: 保存

画面下部の **Create** ボタンをクリック

---

## ✅ 設定確認

### 確認方法 1: 直接pushを試す（失敗するはず）

```bash
# ローカルで適当な変更
echo "test" >> README.md
git add README.md
git commit -m "test: check branch protection"
git push origin main
```

**期待される結果**:
```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Changes must be made through a pull request.
```

✅ このエラーが出れば、Branch Protection が正しく設定されている

### 確認方法 2: PRを作成して確認

```bash
# 新しいブランチを作成
git checkout -b test/branch-protection
git push origin test/branch-protection

# GitHub UIでPRを作成
# → PRテンプレートが自動的に表示されるはず
# → SSOT Guard CI が自動実行されるはず
```

---

## 🔧 トラブルシューティング

### 問題 1: SSOT Guard が Required Status Check に表示されない

**原因**: まだ一度も SSOT Guard が実行されていない

**解決策**:
1. SSOTドキュメントを軽微に変更してコミット
2. mainにpush（Branch Protectionが有効になる前）
3. SSOT Guard が実行される
4. 実行後、Branch Protection設定で `SSOT Change Detection` が選択可能になる

### 問題 2: Code Owners のレビューが自動リクエストされない

**原因**: `.github/CODEOWNERS` で指定したチーム/ユーザーが存在しない

**解決策**:
1. GitHub Organization の **Teams** でチームを作成
   - 例: `gate-maintainers`, `mobile-team`
2. または、`.github/CODEOWNERS` で個人のユーザー名を使用
   ```
   /SSOT_*.md    @your-github-username
   ```

### 問題 3: Admin として push できてしまう

**原因**: "Include administrators" がOFFになっている

**解決策**:
- Branch Protection Rules で "Include administrators" にチェック
- または、管理者も必ずPR経由で作業する習慣をつける

---

## 📊 設定後の運用フロー

### 正しいフロー（PR運用）

```
1. ブランチ作成
   git checkout -b feature/new-feature

2. 開発・コミット
   git add .
   git commit -m "feat: 新機能"

3. Push
   git push origin feature/new-feature

4. GitHub UIでPR作成
   - PRテンプレートが表示される
   - SSOT準拠チェックに答える
   - レビュアーを指定（CODEOWNERS で自動）

5. CI実行
   - SSOT Guard が自動実行
   - type-check, lint などが実行

6. レビュー
   - レビュアーが承認

7. マージ
   - Merge pull request
```

### 緊急時の対応（Branch Protection を一時的に解除）

**原則**: 緊急時でも PR を作成すべき

**どうしても必要な場合**:
1. Settings → Branches → Edit Branch Protection Rule
2. 必要な設定を一時的にOFFにする
3. 作業完了後、**必ず元に戻す**

---

## 🎯 設定完了チェックリスト

- [ ] Branch Protection Rule を作成した（Branch name pattern: `main`）
- [ ] "Require a pull request before merging" にチェックした
- [ ] "Require approvals" を 1人以上に設定した
- [ ] "Require status checks to pass before merging" にチェックした
- [ ] `SSOT Change Detection` を Required Status Check に追加した
- [ ] "Require conversation resolution before merging" にチェックした
- [ ] 直接pushが拒否されることを確認した
- [ ] PRテンプレートが自動表示されることを確認した
- [ ] SSOT Guard CI が自動実行されることを確認した

---

## 📝 補足: CODEOWNERS の設定

### チームが存在しない場合の対処法

`.github/CODEOWNERS` を編集して、個人のユーザー名を使用:

```
# 例: あなたのユーザー名が "your-username" の場合

/SSOT_WORKER_SYNC_FACE_AUTH_E2E.md    @your-username
/PREVIEW_TO_PRODUCTION_DIFF.md         @your-username
/DEVELOPMENT_RULES.md                  @your-username
/apps/mobile/                          @your-username @another-developer
```

### チームを作成する場合

1. GitHub Organization の **Settings** → **Teams**
2. **New team** をクリック
3. チーム名を入力（例: `gate-maintainers`）
4. メンバーを追加
5. `.github/CODEOWNERS` でチーム名を使用（例: `@BME-Consulting/gate-maintainers`）

---

**Document Version**: 1.0
**Last Updated**: 2026-01-08
**Status**: 📋 設定待ち
**Next Step**: Repository Admin がこのガイドに従って設定する
