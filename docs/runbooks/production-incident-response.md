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

**このRunbookは生きたドキュメントです。新しいインシデントが発生したら、必ず追記してください。**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
