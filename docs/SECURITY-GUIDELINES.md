# セキュリティガイドライン

**最終更新**: 2025-12-18
**状態**: 確定版（運用必須）

---

## 🚨 環境変数とログの取り扱い

### ❌ 絶対禁止事項

#### 1. `/proc/*/environ` の全量参照

**禁止理由**: すべての環境変数（API Key, Token, Secret, Password）が露出する

```bash
# ❌ NG: 全環境変数がログに出る
cat /proc/<pid>/environ | tr '\0' '\n'

# ❌ NG: フィルタなしの参照
tr '\0' '\n' < /proc/<pid>/environ
```

**影響範囲**:
- ターミナルログ
- CI/CD パイプライン出力
- コピー&ペースト事故
- スクリーンショット

**結論**: `/proc/*/environ` 参照は開発・検証・本番すべてで禁止

---

### ✅ 許可される検証方法

#### パターン1: 安全な変数のみ参照（ホワイトリスト方式）

```bash
# OK: 必要最小限の変数のみ
tr '\0' '\n' < /proc/<pid>/environ | grep -E "^(NODE_ENV|PORT|PWD|USER|HOME)="
```

#### パターン2: 機密情報の除外（ブラックリスト方式）

```bash
# OK: 機密情報を除外
tr '\0' '\n' < /proc/<pid>/environ \
  | egrep -v '(KEY|TOKEN|SECRET|PASSWORD|AUTH|OPENAI|ANTHROPIC|API_)' \
  | head -20
```

#### パターン3: アプリケーションログから確認

```bash
# 推奨: アプリケーションが意図的に出力した情報のみ
tail -50 /tmp/gs-api.log | grep "Environment:"
```

---

## 🔐 機密情報の管理原則

### 1. 環境変数の分類

| 分類 | 例 | 取り扱い |
|------|------|----------|
| **機密** | API_KEY, TOKEN, SECRET, PASSWORD | ログ出力禁止、.gitignore必須 |
| **準機密** | DATABASE_URL, REDIS_PASSWORD | マスキング推奨 |
| **公開可** | NODE_ENV, PORT, LOG_LEVEL | ログ出力可 |

### 2. ログ出力の原則

```bash
# ❌ NG: 機密情報をそのまま出力
console.log("API_KEY:", process.env.API_KEY);

# ✅ OK: マスキング
console.log("API_KEY:", process.env.API_KEY?.slice(0, 8) + "...");

# ✅ OK: 存在確認のみ
console.log("API_KEY:", process.env.API_KEY ? "set" : "not set");
```

### 3. `.env` ファイルの管理

```bash
# .gitignore に必須
.env
.env.local
.env.*.local
.env.production

# .env.example は OK（値はダミー）
API_KEY=your-api-key-here
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

---

## 🔄 API Key ローテーション手順

### ANTHROPIC_API_KEY のローテーション

```bash
# 1. Anthropic Console で新しい API key を生成
# https://console.anthropic.com/settings/keys

# 2. GS API の .env を更新
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api
vim .env
# ANTHROPIC_API_KEY=sk-ant-api03-NEW_KEY_HERE に変更

# 3. GS API プロセスを再起動
pkill -f "tsx watch src/index.ts" || true
nohup npm run dev > /tmp/gs-api.log 2>&1 &

# 4. 動作確認
sleep 2
ss -lntp | grep 7070
curl -sS http://127.0.0.1:7070/health

# 5. 旧キーを Anthropic Console で無効化
# https://console.anthropic.com/settings/keys
```

### Face API / GS API の API Key ローテーション

[`docs/EAS-BUILD-UPDATE-RULES.md`](./EAS-BUILD-UPDATE-RULES.md) の手順に従う。

---

## 📋 セキュリティチェックリスト（開発時）

### コミット前

- [ ] `.env` ファイルが `.gitignore` に含まれている
- [ ] コード内に API Key / Token のハードコードがない
- [ ] `console.log` で機密情報を出力していない
- [ ] `/proc/*/environ` 参照がない

### デプロイ前

- [ ] 本番用の API Key が別途生成されている
- [ ] 開発用 API Key と本番用 API Key が分離されている
- [ ] CI/CD パイプラインで機密情報がマスキングされている
- [ ] ログレベルが本番用（INFO 以上）に設定されている

### インシデント発生時

- [ ] 漏洩した可能性のある API Key を即座にローテーション
- [ ] 旧 API Key を無効化
- [ ] アクセスログで不正利用がないか確認
- [ ] 再発防止策をドキュメント化

---

## 🔗 関連ドキュメント

- [EAS Build & Update Rules](./EAS-BUILD-UPDATE-RULES.md)
- [SSOT Validation Workflow](../.github/workflows/ssot-validation.yml)

---

**最終確認日**: 2025-12-18
**確認者**: Claude (with user collaboration)
**状態**: 運用必須 ✅
