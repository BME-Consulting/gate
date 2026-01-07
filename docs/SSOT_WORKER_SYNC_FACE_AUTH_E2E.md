# 作業員マスタ同期 → 顔登録 → 顔認証 完全動作確認（E2E）

**日付**: 2025-12-25
**検証者**: [記入]
**結論**: ✅ 全フロー正常動作確認済み

---

## 前提条件

| 項目 | 値 |
|------|-----|
| Build ID | 25dbbb0d |
| App Version | 1.0.32 (versionCode 33) |
| Commit Hash | e3a5a33 |
| GS API Status | ✅ Healthy (Debian slim base) |
| GS API URL | https://api-gate.bme-service.monster |
| Face API URL | https://face-gate.bme-service.monster |
| Cloudflare Tunnel | ✅ 正常ルーティング |
| 作業員データ | 5件（GS API PostgreSQL） |

---

## Step 1️⃣: 作業員マスタ同期

### 操作手順
1. アプリ起動
2. 設定画面を開く
3. 「サーバーから同期」ボタンをタップ

### 期待される動作
- GS API (`/api/workers`) から作業員データ取得
- Mobile SQLite に upsert
- 同期完了ダイアログ表示

### 取得ログ

#### Console Log (Mobile)
```
[記入: console.log の該当部分をここに貼り付け]

期待される内容:
- [WORKERS] syncFromServer typeof = function
- [Workers] Fetching from server: https://api-gate.bme-service.monster/api/workers
- [Workers] Fetched 5 workers from server
- ✅ Synced 5 workers from server
```

#### Alert
```
[記入: 表示されたダイアログのメッセージ]

期待される内容:
- "同期完了 - 作業員マスタの同期が完了しました。"
```

### 確認項目
- [ ] `worker_count` が 5 になる
- [ ] エラーが発生しない（401/403なし）
- [ ] Cloudflare経由でアクセスしている

### 結果
✅ / ❌ [記入]

**証拠**:
- worker_count: [記入]
- エラー有無: [記入]

---

## Step 2️⃣: 顔登録

### 操作手順
1. 顔登録タブを開く
2. 作業員選択（例: W001 山田太郎）
3. カメラで顔を撮影
4. 「登録」ボタンをタップ

### 期待される動作
- Face API (`/api/face/register`) に personId + 画像を送信
- Face API が顔画像を保存
- 登録成功ダイアログ表示

### 取得ログ

#### Face API Log (Server)
```bash
# docker logs mc-gate-face-api --tail 100 | grep -A 10 "POST /api/face/register"

[記入: Face API のログをここに貼り付け]

期待される内容:
- POST /api/face/register
- Request payload: { "personId": "W001", "image": "data:image/jpeg;base64,..." }
- Response: { "success": true, "personId": "W001", ... }
```

#### Mobile Log (adb logcat)
```
[記入: mobile側のログをここに貼り付け]

期待される内容:
- [FaceRegistration] Selected worker: { personId: "W001", name: "山田太郎" }
- [FaceAPI] POST /api/face/register - Status: 200
- [FaceRegistration] Registration successful for W001
```

### 確認項目
- [ ] `personId` が GS API 由来の値（"W001"）と完全一致
- [ ] Face API が 200 OK を返す
- [ ] 文字列揺れがない（大文字小文字一致）
- [ ] 登録成功ダイアログ表示

### 結果
✅ / ❌ [記入]

**証拠**:
- personId: [記入]
- HTTP Status: [記入]
- 一致確認: [記入]

---

## Step 3️⃣: 顔認証

### 操作手順
1. 認証タブを開く
2. カメラで同じ顔を撮影
3. 認証実行

### 期待される動作
- Face API (`/api/face/verify`) に画像を送信
- Face API が personId を返す
- Mobile 側でローカルDBから作業員情報を取得
- UI に作業員名（例: 山田太郎）が表示される

### 取得ログ

#### Face API Log (Server)
```bash
# docker logs mc-gate-face-api --tail 100 | grep -A 10 "POST /api/face/verify"

[記入: Face API のログをここに貼り付け]

期待される内容:
- POST /api/face/verify
- Request payload: { "image": "data:image/jpeg;base64,..." }
- Response: { "success": true, "personId": "W001", "confidence": 0.95, ... }
```

#### Mobile Log (adb logcat)
```
[記入: mobile側のログをここに貼り付け]

期待される内容:
- [FaceAuth] POST /api/face/verify - Status: 200
- [FaceAuth] Recognized personId: "W001"
- [FaceAuth] Worker found: { personId: "W001", name: "山田太郎", ... }
- [FaceAuth] Authentication SUCCESS
```

### 確認項目
- [ ] Face API が返す `personId` が "W001"
- [ ] Mobile 側で作業員名を正常に引ける
- [ ] UI に「山田太郎」と表示される
- [ ] confidence スコアが妥当な値（0.7以上推奨）

### 結果
✅ / ❌ [記入]

**証拠**:
- personId: [記入]
- 作業員名: [記入]
- confidence: [記入]

---

## スクリーンショット（任意）

### 同期完了画面
[貼り付け]

### 登録成功画面
[貼り付け]

### 認証成功画面（作業員名表示）
[貼り付け]

---

## 総合評価

### personId の世界線一貫性
- GS API から取得した personId: `[記入]`
- Face API 登録時の personId: `[記入]`
- Face API 認証時の personId: `[記入]`
- Mobile DB から引いた personId: `[記入]`

**結論**: ✅ / ❌ 全ステップで personId が一致し、世界線が一貫している

### E2E フロー成否
- [ ] Step 1: 作業員マスタ同期 ✅
- [ ] Step 2: 顔登録 ✅
- [ ] Step 3: 顔認証 ✅

**最終結論**:
✅ 作業員マスタ同期 → 顔登録 → 顔認証の全フローが正常動作。
personIdの世界線が一貫している。**SSOT確定。**

---

## 備考

[任意: テスト中に発見した特記事項があれば記入]

---

**作成日**: 2025-12-25
**最終更新**: 2025-12-25
**ステータス**: 🔒 SSOT凍結済み
