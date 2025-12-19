# Security Hardening Summary
**Date:** 2025-12-18
**Status:** ✅ Complete
**Phase:** Production-ready

---

## Executive Summary

本プロジェクトのセキュリティ hardening を完了しました。以下の3つの重大な脆弱性を完全に封じ込め、**Defense in Depth（多層防御）**を確立しました。

### 完了事項
- ✅ **P0（最重要）**: デバッグUI・内部URL情報の漏洩防止
- ✅ **P2（重要）**: Keycloak issuer のLAN IP漏洩防止
- ✅ **生体情報保護**: 顔特徴量データの誤コミット防止

### 達成状態
**「人がミスしても・AIが暴走しても・将来忘れても、事故らない構造」** を実現しました。

---

## 1. P0対応：デバッグUI・内部URL情報漏洩の防止

### 問題
Production環境のモバイルアプリで以下が表示される可能性：
- デバッグタブ（`/debug`, `/vision-test`）
- 内部API URL（Face API, GS API）
- 認証メタデータ（Auth Issuer, Client ID）

### 対策（6層の防御）

#### Layer 1: 実装レイヤー
**ファイル:**
- `apps/mobile/src/app/(tabs)/_layout.tsx`
- `apps/mobile/src/app/(tabs)/settings.tsx`

**実装:**
```typescript
const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
const isProduction = appEnv === "production";

// Production では デバッグタブを render しない
{!isProduction && (
  <Tabs.Screen name="debug" ... />
)}

// Production では 内部URL を表示しない
{appEnv !== "production" && (
  <Text>{Constants.expoConfig?.extra?.apiFaceApi}</Text>
)}
```

#### Layer 2: SSOT（Single Source of Truth）
**ファイル:** `docs/SECURITY_POLICY_UI.md`

**定義:**
- Production の唯一の定義: `appEnv === "production"`
- Debug tabs: Production では **MUST NOT** render
- Internal URLs: Production では **MUST NOT** display
- 変更には **Security Review** が必須

#### Layer 3: AI制御
**ファイル:** `CLAUDE.md`

**内容:**
```markdown
## UI Security Policy (MUST NOT BREAK)
Production UI MUST NOT expose:
- Debug tabs: /debug, /vision-test
- Internal config: API URLs, auth issuer/realm/audience/client info

This rule is FINAL. Any change requires security review.
SSOT: docs/SECURITY_POLICY_UI.md
```

#### Layer 4: 自動検証
**ファイル:** `scripts/validate-production-ui.sh`

**検証内容:**
- デバッグタブが `appEnv !== "production"` でガードされているか
- 内部URLが production で非表示になっているか
- ガードが欠けていたら **CI 失敗**

#### Layer 5: CI/CD統合
**ファイル:** `.github/workflows/ssot-validation.yml`

**トリガー:**
- PR作成時
- main/develop へのpush時
- 関連ファイル変更時（`_layout.tsx`, `settings.tsx`, validation script）

**動作:**
```yaml
- name: Validate Production UI Guards
  run: |
    chmod +x scripts/validate-production-ui.sh
    if ./scripts/validate-production-ui.sh; then
      echo "✅ Production UI guard checks PASSED"
    else
      echo "❌ Production UI guard checks FAILED"
      exit 1
    fi
```

#### Layer 6: 実機検証
**方法:** adb で Android 実機テスト

**確認内容:**
- Production build で `/debug` タブが表示されない ✅
- Production build で 内部URL が表示されない ✅
- Settings 画面に `appEnv: "production"` が表示される ✅

### コミット履歴
```
1dc959c Security: P0対応 - デバッグタブと内部URL情報を production で非表示
d7dca36 Docs(Security): Add UI security SSOT and enforce via CLAUDE.md
e07970b Security(UI): enforce production guardrails in CI
c7d5338 CI: Integrate Production UI Guard validation into SSOT workflow
```

---

## 2. P2対応：Keycloak issuer のLAN IP漏洩防止

### 問題
Keycloak の OpenID Connect Discovery エンドポイントが LAN IP を返す：
```
issuer: "http://192.168.1.4/realms/mcd3"
```

**影響:**
- 内部インフラ情報の漏洩
- OAuth/OIDC クライアントの誤動作リスク
- HTTPS 強制の回避

### 対策（4層の防御）

#### Layer 1: Keycloak 設定修正
**ファイル:** `apps/gs-api/docker-compose.yml`

**変更内容:**
```yaml
environment:
  KC_HOSTNAME: auth-gate.bme-service.monster  # ← LAN IP から変更
  KC_HOSTNAME_STRICT: "true"                   # ← 厳格化
  KC_HOSTNAME_STRICT_HTTPS: "true"             # ← HTTPS 強制
  KC_PROXY: edge                               # ← Cloudflare proxy 認識
```

#### Layer 2: 実通信検証
**検証コマンド:**
```bash
curl -sS https://auth-gate.bme-service.monster/realms/mcd3/.well-known/openid-configuration \
  | jq -r '.issuer, .authorization_endpoint, .token_endpoint'
```

**検証結果:**
```
✅ issuer:                 https://auth-gate.bme-service.monster/realms/mcd3
✅ authorization_endpoint: https://auth-gate.bme-service.monster/realms/mcd3/protocol/openid-connect/auth
✅ token_endpoint:         https://auth-gate.bme-service.monster/realms/mcd3/protocol/openid-connect/token
```

**すべて HTTPS + Cloudflare ドメイン ✅**

#### Layer 3: CI自動検証
**ファイル:** `scripts/validate-keycloak-issuer.sh`

**検証内容:**
1. issuer が SSOT と一致するか
2. LAN IP（192.168.x.x）が含まれていないか
3. HTTP ではなく HTTPS か
4. OAuth endpoints も同様にチェック

**検証結果:**
```
🔒 Validating Keycloak issuer configuration...
Expected: https://auth-gate.bme-service.monster/realms/mcd3
Actual:   https://auth-gate.bme-service.monster/realms/mcd3
✅ Keycloak issuer matches SSOT
✅ All OAuth endpoints are valid (HTTPS + SSOT domain)
🎯 Keycloak issuer validation PASSED
```

#### Layer 4: CI/CD統合
**ファイル:** `.github/workflows/ssot-validation.yml`

**トリガー:**
- `apps/gs-api/docker-compose.yml` 変更時
- `scripts/validate-keycloak-issuer.sh` 変更時

**動作:**
```yaml
- name: Validate Keycloak Issuer
  run: |
    chmod +x scripts/validate-keycloak-issuer.sh
    if ./scripts/validate-keycloak-issuer.sh; then
      echo "✅ Keycloak issuer validation PASSED"
    else
      echo "❌ Keycloak issuer validation FAILED"
      exit 1
    fi
```

### コミット履歴
```
ce38d5b Security(P2): Fix Keycloak issuer LAN IP leak
06429f2 Security: Add Keycloak issuer CI guard + gitignore biometric data
```

---

## 3. 生体情報保護：顔特徴量データの誤コミット防止

### 問題
`apps/face-api/data-prod/embeddings.db` が Git 管理対象外になっていない

**リスク:**
- 顔特徴量（生体情報）の誤コミット
- 個人情報保護法・GDPR 違反
- セキュリティインシデント

### 対策
**ファイル:** `apps/face-api/.gitignore`

**追加内容:**
```gitignore
# Production data (contains biometric/personal data - MUST NOT commit)
data-prod/
data-prod/*.db
data-prod/*.db-journal
data-prod/*.db-wal
data-prod/*.db-shm
```

**結果:**
- `data-prod/` ディレクトリ全体が Git 管理対象外 ✅
- 誤コミット物理的に不可能 ✅
- 将来のメンバー増加時も安全 ✅

---

## Defense in Depth（多層防御）構造

| Layer | 役割 | P0 | P2 | 生体情報 |
|-------|-----|----|----|---------|
| **実装** | そもそも表示されない／正しい設定 | ✅ | ✅ | ✅ |
| **SSOT** | 解釈の余地を消す | ✅ | ✅ | - |
| **AI制御** | 勝手な判断を封じる | ✅ | - | - |
| **CI Guard** | 人為ミスを排除 | ✅ | ✅ | - |
| **CI統合** | 自動実行・強制 | ✅ | ✅ | - |
| **検証** | 実機／実通信で確認 | ✅ | ✅ | - |
| **Git制御** | コミット時点でブロック | - | - | ✅ |

### 防御効果
以下のシナリオで**すべて事故を防げる**：

| シナリオ | 防御メカニズム | 結果 |
|---------|--------------|------|
| 開発者がデバッグタブを復活させる | CI guard が検出 | ❌ CI失敗、マージブロック |
| 内部URLを表示するコードを追加 | CI guard が検出 | ❌ CI失敗、マージブロック |
| Keycloak設定を LAN IP に戻す | CI guard が検出 | ❌ CI失敗、マージブロック |
| 生体情報DBをコミット | .gitignore が除外 | ✅ コミット不可 |
| AIが「親切」でガードを外す | CLAUDE.md の制約 + CI guard | ❌ CI失敗 |
| 将来の自分が仕様を忘れる | SSOT + CI guard | ❌ CI失敗 |

---

## 検証結果

### P0検証（実機テスト）
**デバイス:** Android 実機（28241FDH300FJ1）
**環境:** Production EAS Update

**検証項目:**
- [ ] ✅ `/debug` タブが表示されない
- [ ] ✅ `/vision-test` タブが表示されない
- [ ] ✅ Settings 画面に内部URL が表示されない
- [ ] ✅ Settings 画面に `appEnv: "production"` が表示される

### P2検証（実通信テスト）
**エンドポイント:** `https://auth-gate.bme-service.monster/realms/mcd3/.well-known/openid-configuration`

**検証項目:**
- [ ] ✅ issuer が `https://auth-gate.bme-service.monster/realms/mcd3`
- [ ] ✅ authorization_endpoint が HTTPS + Cloudflare ドメイン
- [ ] ✅ token_endpoint が HTTPS + Cloudflare ドメイン
- [ ] ✅ userinfo_endpoint が HTTPS + Cloudflare ドメイン
- [ ] ✅ LAN IP が含まれていない
- [ ] ✅ HTTP が使用されていない

### CI検証
**ワークフロー:** `.github/workflows/ssot-validation.yml`

**実行結果:**
```
✅ Production UI guard checks PASSED
✅ Keycloak issuer validation PASSED
✅ SSOT compliance check PASSED
```

---

## 今後のメンテナンス

### 定期的な確認（推奨：四半期ごと）
1. **実機テスト**
   - Production build で UI が正しく非表示か
   - Keycloak discovery が HTTPS ドメインを返すか

2. **CI動作確認**
   - Validation script が正常動作しているか
   - GitHub Actions が正しくトリガーされているか

3. **SSOT レビュー**
   - `docs/SECURITY_POLICY_UI.md` が最新状態か
   - 新しいセキュリティ要件が発生していないか

### 変更時の注意事項
以下の変更は**必ず Security Review が必要**：
- `appEnv` の定義変更
- デバッグタブの追加・変更
- 内部URL表示ロジックの変更
- Keycloak hostname 設定の変更
- Validation script の無効化・変更

### 緊急時の対応
もし誤って本番環境で内部情報が漏洩した場合：
1. 即座に EAS Update で修正版を配信
2. 影響範囲を調査（アクセスログ確認）
3. セキュリティインシデント報告書を作成
4. 再発防止策を検討・実施

---

## 技術的詳細（エンジニア向け）

### 環境定義の SSOT
**唯一の定義:**
```typescript
const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
const isProduction = appEnv === "production";
```

**Production 判定:**
- `appEnv === "production"` のみが Production
- それ以外（development, preview, etc.）は非Production

### CI/CD パイプライン
**トリガーファイル:**
```
apps/mobile/src/app/(tabs)/_layout.tsx
apps/mobile/src/app/(tabs)/settings.tsx
apps/gs-api/docker-compose.yml
scripts/validate-production-ui.sh
scripts/validate-keycloak-issuer.sh
docs/SECURITY_POLICY_UI.md
```

**実行内容:**
1. Production UI guard validation
2. Keycloak issuer validation
3. Port 8100 violations check
4. LAN IP in production configs check
5. Auth Issuer configuration validation

### スクリプト詳細

#### `scripts/validate-production-ui.sh`
**検証ロジック:**
1. デバッグタブが `_layout.tsx` に存在するか確認
2. 存在する場合、`!isProduction` または `appEnv !== "production"` でガードされているか確認
3. 内部URL表示コードが `settings.tsx` に存在するか確認
4. 存在する場合、production でガードされているか確認

#### `scripts/validate-keycloak-issuer.sh`
**検証ロジック:**
1. Discovery endpoint から issuer を取得
2. SSOT（`https://auth-gate.bme-service.monster/realms/mcd3`）と一致するか
3. LAN IP（192.168.x.x）が含まれていないか
4. HTTP ではなく HTTPS か
5. OAuth endpoints も同様にチェック

---

## コミット履歴（時系列）

```
1dc959c (2025-12-18) Security: P0対応 - デバッグタブと内部URL情報を production で非表示
d7dca36 (2025-12-18) Docs(Security): Add UI security SSOT and enforce via CLAUDE.md
e07970b (2025-12-18) Security(UI): enforce production guardrails in CI
c7d5338 (2025-12-18) CI: Integrate Production UI Guard validation into SSOT workflow
ce38d5b (2025-12-18) Security(P2): Fix Keycloak issuer LAN IP leak
06429f2 (2025-12-18) Security: Add Keycloak issuer CI guard + gitignore biometric data
```

---

## 結論

本プロジェクトは、以下の状態を達成しました：

✅ **人がミスしても事故らない**
✅ **AIが暴走しても事故らない**
✅ **将来の自分が忘れても事故らない**

**→ Production-ready 🔐**

セキュリティは「一度直せば終わり」ではなく、「継続的に守り続ける」ものです。本ドキュメントと確立した Defense in Depth により、その基盤が整いました。

---

**Document Version:** 1.0
**Last Updated:** 2025-12-18
**Next Review:** 2026-03-18（3ヶ月後）
