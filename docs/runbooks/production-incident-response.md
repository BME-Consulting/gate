# Production Incident Response Runbook

**最終更新**: 2025-12-22
**適用対象**: mc-gate Production 環境
**緊急度**: 🚨 このドキュメントは事故時に参照する最終防衛ライン

---

## 🎯 目的

Production 環境で発生する典型的なインシデントに対し、**考えずに対応できる**手順を提供する。

**原則**:
- 迷わない
- 事故らない
- 最短距離で復旧する

---

## 📋 インシデント対応フロー

### ① debug / camera / vision-test タブが見えたら

**理論上**: 起きない（3層ロックで構造的に防止済み）

**発生したら**:

#### 確認①: GitHub Actions CI ログ
```bash
# 最新の CI 実行を確認
# URL: https://github.com/[org]/mc-gate/actions/workflows/ci.yml
```

**期待される結果**:
```
✅ No prohibited Tab.Screen components found
```

**失敗していたら**: 該当コミットを特定

#### 確認②: 該当コミット特定
```bash
git log --oneline --grep="debug\|vision-test\|camera-test" -10
```

#### 対応: 緊急ロールバック or Hotfix

**オプション A: EAS Update ロールバック（最速）**
```bash
# Expo Dashboard で1つ前の Update を Promote
# URL: https://expo.dev/accounts/bme_llc/projects/mc-gate/updates?branch=production
```

**オプション B: Hotfix（即座に修正）**
```bash
# 該当 Tabs.Screen を削除
vim apps/mobile/src/app/(tabs)/_layout.tsx

# コミット
git add apps/mobile/src/app/(tabs)/_layout.tsx
git commit -m "Hotfix: 禁止タブを削除"

# EAS Update 配信
export EXPO_TOKEN="..."
cd apps/mobile
npx eas-cli update --branch production --message "Hotfix: 禁止タブ削除"
```

**判断基準**:
- ネイティブビルド: ❌ **不要**
- EAS Update: ✅ **必須**

**想定復旧時間**: 5分以内

---

### ② OAuth 401 / 403 が急増したら

**原因の8割**: audience mismatch または JWKS 取得失敗

#### 確認①: AUTH_ISSUER 設定
```bash
# apps/mobile/.env.production
cat apps/mobile/.env.production | grep AUTH_ISSUER

# 期待値:
# AUTH_ISSUER=https://auth-gate-prod.bme-service.monster/realms/mcd3
```

#### 確認②: AUTH_AUDIENCE 設定
```bash
cat apps/mobile/.env.production | grep AUTH_AUDIENCE

# 期待値:
# AUTH_AUDIENCE=mc-gate-mobile
```

#### 確認③: Keycloak Audience Mapper
```bash
# Keycloak Admin Console にログイン
# URL: https://auth-gate-prod.bme-service.monster/admin/master/console/

# Clients → mc-gate-mobile → Client Scopes → Dedicated → Mappers
# 確認: "audience-mapper" が存在し、Included Client Audience = "mc-gate-mobile"
```

#### 確認④: JWKS URL 生存確認
```bash
curl -s https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect/certs | jq '.keys | length'

# 期待値: 1以上（公開鍵が存在）
```

#### 対応: 設定修正 + EAS Update

**Audience mismatch の場合**:
```bash
# .env.production を修正
vim apps/mobile/.env.production

# AUTH_AUDIENCE=mc-gate-mobile に修正

# EAS Update 配信（環境変数は再ビルド不要）
cd apps/mobile
npx eas-cli update --branch production --message "Fix: AUTH_AUDIENCE 修正"
```

**JWKS URL 障害の場合**:
- Keycloak サーバーの復旧を待つ
- Cloudflare Tunnel の状態確認
- Fallback: 一時的に MOCK_AUTH=true（開発環境のみ）

**想定復旧時間**: 10分以内

---

### ③ プロジェクトが 0 件になる

**原因**: Keycloak の roles 設定ミス

#### 確認①: JWT の中身を確認
```bash
# JWT を取得（モバイルアプリのログから、または Keycloak から直接）
# JWT をデコード: https://jwt.io/

# 確認ポイント:
# resource_access["mc-gate-mobile"].roles に project:PRJxxx が含まれているか
```

**期待される構造**:
```json
{
  "resource_access": {
    "mc-gate-mobile": {
      "roles": [
        "project:PRJ001",
        "project:PRJ002"
      ]
    }
  }
}
```

#### 確認②: Keycloak でユーザーの roles を確認
```bash
# Keycloak Admin Console
# Users → [該当ユーザー] → Role Mappings → Client Roles: mc-gate-mobile

# 確認: project:PRJxxx が割り当てられているか
```

#### 対応: Keycloak で roles を付与

```bash
# Keycloak Admin Console
# Users → [該当ユーザー] → Role Mappings → Client Roles: mc-gate-mobile
# Available Roles から project:PRJxxx を選択 → Add selected
```

**想定復旧時間**: 5分以内

---

### ④ 緊急ロールバック手順

**いつ使う**: 重大なバグ、クラッシュ、データ破壊の恐れがある場合

#### 手順①: Expo Dashboard で前回の Update を確認
```bash
# URL: https://expo.dev/accounts/bme_llc/projects/mc-gate/updates?branch=production
```

#### 手順②: 1つ前の Update Group を Promote
```bash
# Dashboard で該当の Update Group を選択
# 右上の「...」メニュー → "Republish"
# または CLI で:

cd apps/mobile
npx eas-cli update:republish \
  --group [前回のUpdate Group ID] \
  --branch production \
  --message "Rollback: [理由]"
```

**例**:
```bash
npx eas-cli update:republish \
  --group 01b8e626-5ae6-4f34-adf5-2ae1c7e9ac8a \
  --branch production \
  --message "Rollback: クラッシュ修正のため"
```

#### 手順③: ユーザーにアプリ再起動を促す
- プッシュ通知（実装されている場合）
- 社内連絡（Slack/Email）
- アプリ内メッセージ（次回起動時に表示）

**想定復旧時間**: 3分以内

---

## 📦 Production Evidence Pack

### Evidence Pack とは

Production環境の健全性を自動的に収集・証拠化するための仕組み。
スクリーンショット不要、手動入力不要で、誰が見ても同じ結論になる形で保存される。

### Evidence Pack の生成方法

```bash
# ローカル環境で実行
bash scripts/gen-prod-evidence.sh
```

出力先: `docs/evidence/prod-evidence.md`

### 収集される情報

1. **Git Commit Hash** - 現在のHEAD commit
2. **Prohibited Tabs Detection** - debug/vision-test/camera-testタブの検出結果
3. **EAS Update Status** - 最新のUpdate Group ID（EXPO_TOKEN設定時のみ）
4. **API Health Checks** - GS API /health エンドポイントのステータス
5. **Keycloak Issuer Check** - Keycloak issuer / JWKS エンドポイントのステータス
6. **Authorization Smoke Test** - 認証境界の動作確認

### CI での自動チェック

GitHub Actions の `production-evidence` ジョブで自動実行される。
Evidence Pack が outdated の場合、CI が失敗する。

### Evidence Pack が outdated の場合の対応

```bash
# Evidence Pack を再生成
bash scripts/gen-prod-evidence.sh

# 変更をコミット
git add docs/evidence/prod-evidence.md
git commit -m "docs: update production evidence pack"

# プッシュ
git push
```

### Authorization Smoke Test の手動実行

```bash
# デバイス非依存の認証境界テスト
bash apps/gs-api/scripts/smoke-authz.sh
```

期待される結果:
- ✅ PASS: No auth header → 401
- ✅ PASS: Invalid JWT → 401
- ⏭️  SKIP: JWT without roles → 403 (要:有効なJWT)
- ⏭️  SKIP: Valid JWT with roles → 200 (要:有効なJWT)

---

## 🔒 Production Freeze Operations

### Production Freeze とは

Production 環境を「変更できない状態」として固定し、安定性を構造的に保証する仕組み。

**Freeze対象**:
- UI Security (禁止タブ)
- OAuth/JWT/Authentication
- Evidence Pack 構造
- CI Security Checks

詳細: `docs/PRODUCTION_FREEZE.md`

### Freeze 状態の確認

```bash
# 現在の Freeze 状態を確認
cat docs/PRODUCTION_FREEZE.md | grep "ステータス"

# 期待される出力:
# **ステータス**: 🔒 **FROZEN** (変更禁止)
```

### Drift 検知の仕組み

**自動検知**: CI で `scripts/check-prod-drift.sh` が実行され、以下をチェック:
1. 禁止タブの混入
2. Evidence Pack 構造の変更
3. AUTH_AUDIENCE / MOCK_AUTH の変更
4. OAuth middleware ファイルの差分
5. CI Security Checks の削除

**検知時の挙動**: CI が失敗し、以下のメッセージを表示:
```
❌ PRODUCTION FREEZE VIOLATION DETECTED

The following frozen components have been modified:
  - [変更された箇所]

Production Freeze は変更禁止です。
詳細: docs/PRODUCTION_FREEZE.md
```

### Freeze Violation への対応

#### オプション A: 変更を Revert (推奨)

```bash
# 該当コミットを revert
git revert [commit-hash]

# または unstage
git reset HEAD [file]
git checkout -- [file]
```

#### オプション B: Freeze 解除手順 (要承認)

**前提条件**:
- 技術リード or プロジェクトマネージャーの承認が必要
- 承認理由を明確に文書化

**手順**:

1. **PRODUCTION_FREEZE.md の更新**
   ```bash
   vim docs/PRODUCTION_FREEZE.md

   # Freeze Status を変更
   # **ステータス**: 🔒 **FROZEN** (変更禁止)
   # ↓
   # **ステータス**: 🔓 **TEMPORARILY_UNFROZEN** (一時解除)

   # Unfreeze Reason を記載
   # **解除理由**: [承認された理由]
   # **解除期間**: 2025-12-23 〜 2025-12-25
   # **承認者**: [技術リードの名前]
   ```

2. **変更の実施**
   ```bash
   # 必要な変更を実装
   # ...

   # コミット
   git add -A
   git commit -m "変更内容"
   ```

3. **CI チェックの確認**
   ```bash
   # CI が通ることを確認
   # GitHub Actions で drift-check が pass することを確認
   ```

4. **Re-Freeze**
   ```bash
   vim docs/PRODUCTION_FREEZE.md

   # Freeze Status を戻す
   # **ステータス**: 🔓 **TEMPORARILY_UNFROZEN** (一時解除)
   # ↓
   # **ステータス**: 🔒 **FROZEN** (変更禁止)

   # 新しい Freeze Version を記録
   # | **Git Commit Hash** | `新しいコミットハッシュ` |
   # | **EAS Update Group ID** | `新しいUpdate Group ID` |
   # | **Freeze Date** | 2025-12-XX |
   ```

#### オプション C: 緊急時の例外ルート

**適用条件**: 緊急度が高く、承認を待てない場合のみ

**手順**:

```bash
# 1. CI をスキップして緊急 commit
git commit -m "[EMERGENCY] 緊急修正: [理由]" --no-verify

# 2. プッシュ
git push

# 3. Incident Report を作成（必須）
vim docs/incident-reports/$(date +%Y-%m-%d)-emergency-fix.md

# 4. PRODUCTION_FREEZE.md を更新（新しい Baseline を記録）
vim docs/PRODUCTION_FREEZE.md

# 5. 次の営業日に承認者にレビュー依頼
# Slack/Email で技術リードに報告
```

**注意**: 緊急時例外ルートの濫用は厳禁。必ず事後承認を取得すること。

### Freeze 解除の判断基準

**解除が許可されるケース**:
- セキュリティ脆弱性の緊急修正
- Production 障害の根本対応
- 法的要件（GDPR等）への対応
- ビジネスクリティカルな機能追加（承認必須）

**解除が許可されないケース**:
- UI デザインの変更（Freeze 対象外）
- 新機能の追加（Freeze 対象外）
- パフォーマンス改善（Freeze 対象外）
- ログ追加・削除（Freeze 対象外）

---

## 🔍 トラブルシューティング Q&A

### Q: EAS Update が反映されない
**A**:
1. アプリがバックグラウンドにいる場合、再起動が必要
2. `Updates.reloadAsync()` を実行（設定画面の「アップデート確認」）
3. 最悪の場合、アプリをアンインストール→再インストール

### Q: CI が失敗している（Layer 3）
**A**:
```bash
# 禁止タブが混入していないか確認
cd apps/mobile
grep -E '<Tabs\.Screen[^>]*name="(debug|vision-test|camera-test)"' \
  src/app/(tabs)/_layout.tsx

# 見つかったら削除してコミット
```

### Q: Production ビルドが必要か判断できない
**A**:
- **ネイティブ変更（ビルド必須）**:
  - `app.config.js` のプラグイン設定変更
  - `android/` or `ios/` ディレクトリの変更
  - SDK バージョンアップ
  - `expo-build-properties` の変更

- **JS変更のみ（EAS Update で OK）**:
  - コンポーネント追加/修正
  - ロジック変更
  - スタイル変更
  - 環境変数の値変更（`.env` ファイル）

### Q: 実機で確認する方法
**A**:
```bash
# 1. Production アプリを起動
# 2. 設定画面 → 「アップデート確認」をタップ
# 3. Update が適用されたら、アプリ再起動
# 4. タブ一覧を目視確認
```

---

## 📊 インシデント記録テンプレート

インシデント発生時は、以下の形式で記録する：

```markdown
## インシデント: [タイトル]

**発生日時**: 2025-XX-XX XX:XX:XX JST
**検出者**: [名前]
**影響範囲**: [ユーザー数/機能]

### 原因
[根本原因]

### 対応
[実施した手順]

### 再発防止策
[今後の改善点]

### 想定復旧時間 vs 実績
- 想定: XX分
- 実績: XX分
```

---

## 🎯 エスカレーション基準

### Level 1: 自己対応可能
- 単一ユーザーの問題
- 既知のエラーパターン
- Runbook に手順が記載されている

### Level 2: チームリーダー相談
- 複数ユーザーに影響
- 原因不明
- Runbook に該当なし

### Level 3: 緊急対応（開発チーム召集）
- 全ユーザーに影響
- データ破壊の恐れ
- セキュリティインシデント

---

## 📞 連絡先

**開発チーム**: [Slack #mc-gate-dev]
**インフラ担当**: [Slack #mc-gate-infra]
**緊急連絡先**: [オンコール担当の電話番号]

---

## 🔗 関連ドキュメント

- **セキュリティポリシー**: `docs/SECURITY_POLICY_UI.md`
- **SSOT (Single Source of Truth)**: `docs/SSOT.md`
- **EAS Build & Update ガイド**: `CLAUDE.md`
- **OAuth 認証設定**: `apps/gs-api/.env.production.example`
- **3層セキュリティロック**: Commit `faf1f94`

---

## ✅ 定期メンテナンスチェックリスト

**月次**:
- [ ] Keycloak バックアップ確認
- [ ] EAS Update 履歴の整理（古いUpdateの削除）
- [ ] CI/CD ログのレビュー

**四半期**:
- [ ] 環境変数の棚卸し（`.env.production`）
- [ ] API Key のローテーション
- [ ] Runbook の更新（新しいインシデントパターンの追加）

---

## 📜 Evidence (Production Deployment Record)

**配信日時**: 2025-12-22 09:28 JST

### EAS Update 情報

**Update Group ID**: `a4d74837-a7d6-4c35-b048-7bb508232a49`

- **Android Update ID**: `89edcf5a-7b79-4498-92e5-f5b2f985abdd`
- **iOS Update ID**: `73096e80-e2a1-4d94-b2a8-39391c07bc59`
- **Branch**: `production`
- **Runtime Version**: `exposdk:54.0.0`
- **Message**: "Security: 3層ロックでdebug/カメラテストタブの再発を防止 (commit faf1f94)"

**EAS Dashboard**:
https://expo.dev/accounts/bme_llc/projects/mc-gate/updates/a4d74837-a7d6-4c35-b048-7bb508232a49

### 関連コミット

1. **faf1f94**: Security: 3層ロックでdebug/カメラテストタブの再発を防止
   - Layer 1: ビルド時ロック（_layout.tsx）
   - Layer 2: 実行時ガード（useEffect + Alert）
   - Layer 3: CI強制化（.github/workflows/ci.yml）

2. **2760e96**: Ops: Production Incident Response Runbook を追加
   - このRunbook自体の作成

### 期待されるタブ一覧（Production環境）

以下の **5つのタブのみ** が表示される必要があります：

1. **ホーム** (home)
2. **認証** (auth)
3. **顔登録** (face-registration)
4. **履歴** (history)
5. **設定** (settings)

**🚨 重要**: 以下のタブが存在した場合は **バグ** です：
- `debug`
- `vision-test`
- `camera-test`

即座に緊急ロールバック（④参照）を実施してください。

### CI 検証証跡

#### ソースコード検証（禁止タブが存在しないこと）

```bash
$ grep -nE '<Tabs\.Screen[^>]*name="(debug|vision-test|camera-test)"' \
    apps/mobile/src/app/(tabs)/_layout.tsx

✅ No prohibited tabs found (0件)
```

#### CI Enforcement Rule（.github/workflows/ci.yml）

```yaml
# Line 136-159:
- name: Security Check - Prohibited Debug Tabs
  working-directory: apps/mobile
  run: |
    echo "🔒 Checking for prohibited debug tabs in production..."

    LAYOUT_FILE="src/app/(tabs)/_layout.tsx"

    # Pattern: <Tabs.Screen name="debug" or name="vision-test" or name="camera-test"
    FOUND=$(grep -E '<Tabs\.Screen[^>]*name="(debug|vision-test|camera-test)"' "$LAYOUT_FILE" || true)

    if [ -n "$FOUND" ]; then
      echo "❌ SECURITY ERROR: Prohibited debug tabs found in _layout.tsx!"
      echo "Production builds MUST NOT include debug/vision-test/camera-test tabs."
      exit 1
    fi

    echo "✅ No prohibited Tab.Screen components found"
```

**GitHub Actions URL**:
https://github.com/[org]/mc-gate/actions/workflows/ci.yml

### 実機検証手順

詳細な検証手順は `scripts/verify-prod-tabs.md` を参照してください。

---

**このRunbookは生きたドキュメントです。新しいインシデントが発生したら、必ず追記してください。**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
