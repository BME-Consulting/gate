# Production Freeze Declaration

**宣言日時**: 2025-12-22
**適用範囲**: mc-gate Production 環境
**ステータス**: 🔒 **FROZEN** (変更禁止)

---

## 🎯 WHY: この Freeze が必要な理由

Production 環境は現在、以下の状態で安定稼働しています：

1. **Security Hardening 完了**
   - 3層ロック（ビルド時 + 実行時 + CI）でdebugタブの混入を構造的に防止
   - OAuth認証境界が固定され、401/403時の自動logout が実装済み
   - Authorization Header 無しの fetch を CI が検出

2. **Evidence Pack 自動化完了**
   - Production の健全性を画像なし・手動入力なしで証拠化
   - CI が Evidence Pack の outdated を検出して fail する

3. **Incident Response Runbook 完成**
   - 典型的なインシデントに対する対応手順が文書化済み
   - 想定復旧時間が明確（5分以内〜10分以内）

**この状態を壊すと**:
- 過去の努力が水の泡になる
- セキュリティホールが再発する
- 証拠が取れなくなる
- インシデント対応が遅れる

**したがって**:
この Freeze により、Production の安定性を**構造的に保証**します。

---

## 📌 WHAT: Freeze の対象（変更不可）

### ✅ Freeze Version (Baseline)

| 項目 | 値 |
|------|-----|
| **Git Commit Hash** | `6c73cbe` |
| **EAS Update Group ID** | `a4d74837-a7d6-4c35-b048-7bb508232a49` |
| **Freeze Date** | 2025-12-22 |
| **Branch** | `production` |
| **Runtime Version** | `exposdk:54.0.0` |

### 🔒 Freeze Scope: 変更禁止対象

#### 1. UI Security (Prohibited Tabs)

**対象ファイル**:
- `apps/mobile/src/app/(tabs)/_layout.tsx`

**Freeze 内容**:
- 以下のタブが存在してはならない（0件であること）:
  - `<Tabs.Screen name="debug" />`
  - `<Tabs.Screen name="vision-test" />`
  - `<Tabs.Screen name="camera-test" />`

**許可されるタブのみ**:
- `home`, `auth`, `face-registration`, `history`, `settings`

**検証コマンド**:
```bash
grep -E '<Tabs\.Screen[^>]*name="(debug|vision-test|camera-test)"' \
  apps/mobile/src/app/(tabs)/_layout.tsx
# 期待結果: 0件
```

#### 2. OAuth / JWT / Authentication

**対象ファイル**:
- `apps/mobile/src/services/auth.ts`
- `apps/mobile/src/services/tokenManager.ts`
- `apps/mobile/src/store/appStore.ts`
- `apps/mobile/src/app/(tabs)/settings.tsx`
- `apps/mobile/src/hooks/useWorkers.ts`

**Freeze 内容**:
- `AUTH_AUDIENCE` の値変更禁止（現在値: `mc-gate-mobile`）
- `MOCK_AUTH` フラグの production での有効化禁止（常に `false`）
- `Authorization: Bearer ${token}` ヘッダーの削除禁止
- `401/403` エラー時の `logout()` 自動呼び出しの削除禁止

**検証コマンド**:
```bash
# Authorization Header 設定箇所の確認
grep -rn "Authorization.*Bearer" apps/mobile/src --include="*.ts" --include="*.tsx"

# 401/403 logout 箇所の確認
grep -rn "401\|403" apps/mobile/src/store/appStore.ts apps/mobile/src/app/\(tabs\)/settings.tsx
```

#### 3. Evidence Pack Structure

**対象ファイル**:
- `scripts/gen-prod-evidence.sh`
- `docs/evidence/prod-evidence.md`

**Freeze 内容**:
- Evidence Pack の収集項目の削除禁止:
  - Git Commit Hash
  - Prohibited Tabs Detection
  - EAS Update Status
  - API Health Checks
  - Keycloak Issuer Check
  - Authorization Smoke Test

- 秘密情報マスク機能の削除禁止:
  - `Bearer`, `EXPO_TOKEN`, `password`, `secret` のマスク処理

**検証コマンド**:
```bash
# Evidence Pack が生成可能か確認
SKIP_EAS_CHECK=1 SKIP_API_CHECK=1 bash scripts/gen-prod-evidence.sh

# 秘密情報が漏れていないか確認
grep -E "Bearer [^*]|EXPO_TOKEN=[^*]|password=[^*]" docs/evidence/prod-evidence.md
# 期待結果: 0件（すべてマスクされている）
```

#### 4. CI Security Checks

**対象ファイル**:
- `.github/workflows/ci.yml`

**Freeze 内容**:
- `Security Check - Prohibited Debug Tabs` ステップの削除禁止
- `Security Check - API Authorization` ステップの削除禁止
- `production-evidence` job の削除禁止
- 上記チェックの `exit 1` 条件の削除禁止

**検証コマンド**:
```bash
# CI に必須チェックが含まれているか確認
grep -A 10 "Security Check - Prohibited Debug Tabs" .github/workflows/ci.yml
grep -A 10 "Security Check - API Authorization" .github/workflows/ci.yml
grep -A 5 "production-evidence:" .github/workflows/ci.yml
```

### ✅ 変更可能なもの (Freeze 対象外)

以下は Freeze の対象外です（変更可能）:

- **新機能の追加** (新しいタブ、新しいコンポーネント)
  - ただし、禁止タブ（debug/vision-test/camera-test）以外
- **ビジネスロジックの改善** (バグ修正、パフォーマンス改善)
- **UI デザインの変更** (色、フォント、レイアウト)
- **環境変数の値** (`.env.production` の値変更)
  - ただし、`AUTH_AUDIENCE` と `MOCK_AUTH` は除く
- **ドキュメントの追記** (Runbook の追加セクション、FAQ の追加)
- **テストコードの追加**

**重要**: 変更可能な項目でも、**Freeze 対象に影響を与える変更は禁止**です。

---

## 🚨 WHAT TO DO: Freeze を破った場合の対応

### Drift 検知時の CI 挙動

CI が以下のメッセージで失敗します:

```
❌ PRODUCTION FREEZE VIOLATION DETECTED

The following frozen file(s) have been modified:
  - apps/mobile/src/app/(tabs)/_layout.tsx

Production Freeze は変更禁止です。
詳細: docs/PRODUCTION_FREEZE.md

To resolve:
1. 変更を revert する
2. または Freeze 解除手順に従う (docs/PRODUCTION_FREEZE.md#freeze-解除手順)
```

### 対応手順

#### Option A: 変更を Revert (推奨)

```bash
# 該当コミットを revert
git revert [commit-hash]

# または unstage
git reset HEAD [file]
git checkout -- [file]
```

#### Option B: Freeze 解除手順 (要承認)

Freeze を解除する場合、以下の手順を踏む必要があります:

1. **承認者の確認**
   - 技術リード or プロジェクトマネージャーの承認が必要
   - 承認理由を明確に文書化

2. **PRODUCTION_FREEZE.md の更新**
   - Freeze Status を `FROZEN` → `TEMPORARILY_UNFROZEN` に変更
   - Unfreeze Reason を記載
   - Unfreeze Period を明記（例: 2025-12-23 〜 2025-12-25）

3. **変更の実施**
   - 変更内容を実装
   - CI チェックが通ることを確認

4. **Re-Freeze**
   - 変更完了後、Freeze Status を `FROZEN` に戻す
   - 新しい Freeze Version (Git commit hash, EAS Update Group ID) を記録

#### Option C: 緊急時の例外ルート

**緊急度: 高** の場合のみ、以下の手順で Freeze を一時的にバイパス可能:

```bash
# CI をスキップして緊急 commit
git commit -m "[EMERGENCY] 緊急修正: [理由]" --no-verify

# ただし、commit 後に必ず以下を実施:
# 1. Incident Report を作成 (docs/incident-reports/YYYY-MM-DD-emergency-fix.md)
# 2. PRODUCTION_FREEZE.md を更新（新しい Baseline を記録）
# 3. 次の営業日に承認者にレビュー依頼
```

**注意**: 緊急時例外ルートの濫用は厳禁です。

---

## 🔍 Drift Detection: 自動検知の仕組み

### Drift 検知スクリプト

`scripts/check-prod-drift.sh` が以下をチェックします:

1. **Prohibited Tabs の混入チェック**
   ```bash
   grep -E '<Tabs\.Screen[^>]*name="(debug|vision-test|camera-test)"' \
     apps/mobile/src/app/(tabs)/_layout.tsx
   ```

2. **Evidence Pack 構造の変更検知**
   ```bash
   git diff HEAD~1 HEAD -- scripts/gen-prod-evidence.sh
   # マスク機能の削除、収集項目の削除を検出
   ```

3. **AUTH_AUDIENCE / MOCK_AUTH の変更検知**
   ```bash
   git diff HEAD~1 HEAD -- apps/mobile/.env.production \
     | grep -E "AUTH_AUDIENCE|MOCK_AUTH"
   ```

4. **OAuth middleware ファイルの差分検知**
   ```bash
   git diff HEAD~1 HEAD -- apps/mobile/src/services/auth.ts \
     apps/mobile/src/services/tokenManager.ts \
     apps/mobile/src/store/appStore.ts
   ```

### CI での自動実行

`.github/workflows/ci.yml` の `production-evidence` job 内で自動実行されます:

```yaml
- name: Drift Detection
  run: |
    bash scripts/check-prod-drift.sh
```

**結果**:
- Drift 検出 → CI が `exit 1` で失敗
- Drift なし → CI が続行

---

## 📚 関連ドキュメント

- **Incident Response Runbook**: `docs/runbooks/production-incident-response.md`
- **Security Policy**: `docs/SECURITY_POLICY_UI.md`
- **Evidence Pack Generator**: `scripts/gen-prod-evidence.sh`
- **Drift Detection Script**: `scripts/check-prod-drift.sh`
- **Mobile Auth Boundary**: `docs/security/mobile-auth-boundary.md`

---

## 📝 Freeze 履歴

### v1 - Initial Freeze (2025-12-22)

- **Baseline Commit**: `6c73cbe`
- **Scope**: UI Security, OAuth/JWT, Evidence Pack, CI Checks
- **Reason**: Security Hardening 完了、Evidence Pack 自動化完了、Runbook 完成
- **Status**: 🔒 FROZEN

---

**このドキュメント自体も Freeze 対象です。変更には承認が必要です。**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
