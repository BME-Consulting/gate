# E2Eテスト実施クイックガイド

## 🎯 ゴール

認証タブのRuleEngine動作確認（ALLOW / WARN / BLOCK）

---

## ✅ 事前準備（5分）

### 1. Face API サーバー起動確認
```bash
curl http://192.168.1.4:8101/health
```
**期待**: `{"status":"ok",...}`

### 2. テストデータ確認
```bash
sqlite3 /volume2/Project/MCD3/TUMON/mc-gate/apps/face-api/workers.db \
  "SELECT person_id, name, ccus_registered, social_insurance FROM workers WHERE person_id LIKE 'E2E_%';"
```
**期待**: 3名（E2E_ALLOW, E2E_WARN, E2E_BLOCK）が表示される

### 3. adbログ監視開始
```bash
adb logcat *:S ReactNativeJS:V | grep -E "\[Auth\]|Active checkConfig"
```
別ターミナルで起動しておく

---

## 🧪 シナリオ1: ALLOW（正常入場）

### 設定確認
1. 設定タブ → 「CCUS技能者ID確認」**ON**
2. 設定タブ → 「社会保険確認」**ON**

### テスト実施
1. 顔登録タブ → `E2E_ALLOW` の顔を登録
2. 認証タブ → 顔認証実行

### ✅ 期待される結果
- **Alert**: 「入場登録完了」
- **メッセージ**: 「✅ 問題なく登録されました」
- **adbログ**: `"ccusIdCheck":true,"socialInsuranceCheck":true`
- **DBレコード**: `scan_events` に新規レコード追加、`rule_result.action = "allow"`

---

## 🧪 シナリオ2: WARN（警告付き入場）

### 設定確認
設定タブ → シナリオ1と同じ設定を継続

### テスト実施
1. 顔登録タブ → `E2E_WARN` の顔を登録
2. 認証タブ → 顔認証実行

### ✅ 期待される結果
- **Alert**: 「入場登録完了」（またはカスタムタイトル）
- **メッセージ**: 「⚠️ 注意: 社会保険未加入です」
- **adbログ**: `"socialInsuranceCheck":true`
- **DBレコード**: `scan_events` に新規レコード追加、`rule_result.action = "warn"`

---

## 🧪 シナリオ3: BLOCK（入場不可）

### 設定確認
設定タブ → 「CCUS技能者ID確認」**ON**（社保はON/OFF任意）

### テスト実施
1. 顔登録タブ → `E2E_BLOCK` の顔を登録
2. 認証タブ → 顔認証実行

### ✅ 期待される結果
- **Alert**: 「入場不可」
- **メッセージ**: 「CCUS技能者登録がありません」
- **adbログ**: `"ccusIdCheck":true`
- **DBレコード**: `scan_events` に**記録されない**（auth.tsx:258でリターン）

---

## 🧪 シナリオ4: 未登録顔（認識失敗）

### テスト実施
1. 認証タブ → 未登録の人の顔で認証（または顔登録していない自分）

### ✅ 期待される結果
- **Alert**: 「認識失敗」
- **メッセージ**: 「顔が検出されましたが、登録された作業員とマッチしませんでした」
- **信頼度**: 低い値（例: 12.3%）
- **DBレコード**: `scan_events` に**記録されない**

---

## 🧪 シナリオ5: オフライン時の挙動

### テスト実施
1. WiFi/モバイルデータを OFF
2. 認証タブ → 顔認証実行

### ✅ 期待される結果
- **Alert**: 「エラー」
- **メッセージ**: 「Face APIサーバーに接続できません」
- **DBレコード**: `scan_events` に**記録されない**

---

## 📊 ログ確認のポイント

### adbログで確認すべき行

#### シナリオ1の例
```
[Auth] Active checkConfig: {
  "ccusIdCheck": true,
  "socialInsuranceCheck": true,
  "residencyCheck": false,
  "ageCheck": false,
  "healthCheck": false,
  "soleProprietorCheck": false
}
```

#### Face APIログ（参考）
```bash
tail -f /tmp/face-api-8101-new.log
```
**期待**: `[Face Recognize] ✅ Matched: E2E_ALLOW` など

---

## ❌ 想定外の挙動が発生した場合

### チェック項目
1. **設定が正しいか**: adbログで `checkConfig` を確認
2. **テストデータが正しいか**: SQLiteで workers テーブルを確認
3. **Face APIが起動しているか**: `curl http://192.168.1.4:8101/health`
4. **ネットワークが繋がっているか**: WiFi/モバイルデータON

### ログ貼り付けテンプレート

テスト結果をレビューする際は、以下を貼り付けてください：

```
## シナリオX: タイトル

### 設定
- ccusIdCheck: true/false
- socialInsuranceCheck: true/false

### 実際の結果
- Alert: "..."
- メッセージ: "..."

### adbログ
```
[Auth] Active checkConfig: {...}
```

### 想定外の挙動
（あれば記載）
```

---

## 📋 テスト完了後の報告

すべてのシナリオが完了したら、以下を報告してください：

1. **各シナリオの結果**: 期待通り / 想定外の挙動
2. **adbログ**: 特に `checkConfig` の出力
3. **気づいた点**: UI/UX、パフォーマンス、その他

報告を受けたら、Option Bパッチ適用に進みます。

---

**作成日**: 2025-12-08
**作成者**: Claude (with user collaboration)
**所要時間**: 約20分（全シナリオ）
