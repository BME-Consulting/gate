# E2E テスト ログ取得コマンド集

実機テスト時に使用するログ取得コマンドをまとめています。

---

## 事前準備

### Android デバイス接続確認
```bash
/tmp/platform-tools/adb devices
```

期待される出力:
```
List of devices attached
<device-id>    device
```

### Face API コンテナ稼働確認
```bash
docker ps --filter "name=face-api" --format "table {{.Names}}\t{{.Status}}"
```

期待される出力:
```
NAMES              STATUS
mc-gate-face-api   Up X minutes (healthy)
```

---

## Step 1: 作業員マスタ同期

### 実行前準備
```bash
# Mobile logcat をクリア（ノイズ除去）
/tmp/platform-tools/adb logcat -c

# リアルタイムログ監視開始（別ターミナル）
/tmp/platform-tools/adb logcat | grep -E "\[WORKERS\]|\[Workers\]|syncFromServer"
```

### 操作
1. アプリで「設定」→「サーバーから同期」ボタンをタップ

### ログ取得
```bash
# 同期完了後、ログを取得
/tmp/platform-tools/adb logcat -d | grep -E "\[WORKERS\]|\[Workers\]|syncFromServer" | tail -50 > /tmp/step1_worker_sync.log

# 内容確認
cat /tmp/step1_worker_sync.log
```

### 期待されるログ例
```
[WORKERS] syncFromServer typeof = function
[Workers] Fetching from server: https://api-gate.bme-service.monster/api/workers
[Workers] Fetched 5 workers from server
✅ Synced 5 workers from server
```

---

## Step 2: 顔登録

### 実行前準備
```bash
# Face API ログをクリア
docker logs mc-gate-face-api --tail 0 -f > /tmp/face_api_register.log &
FACE_LOG_PID=$!

# Mobile logcat をクリア
/tmp/platform-tools/adb logcat -c

# リアルタイムログ監視開始（別ターミナル）
/tmp/platform-tools/adb logcat | grep -E "\[FaceRegistration\]|\[FaceAPI\]"
```

### 操作
1. アプリで「顔登録」タブを開く
2. 作業員を選択（例: W001 山田太郎）
3. カメラで顔を撮影
4. 「登録」ボタンをタップ

### ログ取得
```bash
# 登録完了後、Mobile ログを取得
/tmp/platform-tools/adb logcat -d | grep -E "\[FaceRegistration\]|\[FaceAPI\]" | tail -50 > /tmp/step2_mobile_register.log

# Face API ログを停止して取得
kill $FACE_LOG_PID
docker logs mc-gate-face-api --tail 100 | grep -A 10 "POST /api/face/register" > /tmp/step2_face_api_register.log

# 内容確認
echo "=== Mobile Log ==="
cat /tmp/step2_mobile_register.log

echo ""
echo "=== Face API Log ==="
cat /tmp/step2_face_api_register.log
```

### 期待されるログ例

**Mobile側**:
```
[FaceRegistration] Selected worker: { personId: "W001", name: "山田太郎" }
[FaceAPI] POST /api/face/register - Status: 200
[FaceRegistration] Registration successful for W001
```

**Face API側**:
```
POST /api/face/register
Request: { "personId": "W001", "image": "..." }
Response: { "success": true, "personId": "W001" }
```

---

## Step 3: 顔認証

### 実行前準備
```bash
# Face API ログをクリア
docker logs mc-gate-face-api --tail 0 -f > /tmp/face_api_verify.log &
FACE_LOG_PID=$!

# Mobile logcat をクリア
/tmp/platform-tools/adb logcat -c

# リアルタイムログ監視開始（別ターミナル）
/tmp/platform-tools/adb logcat | grep -E "\[FaceAuth\]|\[FaceAPI\]"
```

### 操作
1. アプリで「認証」タブを開く
2. カメラで同じ顔を撮影
3. 認証実行

### ログ取得
```bash
# 認証完了後、Mobile ログを取得
/tmp/platform-tools/adb logcat -d | grep -E "\[FaceAuth\]|\[FaceAPI\]" | tail -50 > /tmp/step3_mobile_verify.log

# Face API ログを停止して取得
kill $FACE_LOG_PID
docker logs mc-gate-face-api --tail 100 | grep -A 10 "POST /api/face/verify" > /tmp/step3_face_api_verify.log

# 内容確認
echo "=== Mobile Log ==="
cat /tmp/step3_mobile_verify.log

echo ""
echo "=== Face API Log ==="
cat /tmp/step3_face_api_verify.log
```

### 期待されるログ例

**Mobile側**:
```
[FaceAuth] POST /api/face/verify - Status: 200
[FaceAuth] Recognized personId: "W001"
[FaceAuth] Looking up worker in local DB...
[FaceAuth] Worker found: { personId: "W001", name: "山田太郎", company: "株式会社サンプル建設" }
[FaceAuth] Authentication SUCCESS
```

**Face API側**:
```
POST /api/face/verify
Request: { "image": "..." }
Response: { "success": true, "personId": "W001", "confidence": 0.95 }
```

---

## スクリーンショット取得

### Android デバイスからスクリーンショット取得
```bash
# 同期完了画面
/tmp/platform-tools/adb shell screencap -p /sdcard/step1_sync_complete.png
/tmp/platform-tools/adb pull /sdcard/step1_sync_complete.png /tmp/

# 登録成功画面
/tmp/platform-tools/adb shell screencap -p /sdcard/step2_register_success.png
/tmp/platform-tools/adb pull /sdcard/step2_register_success.png /tmp/

# 認証成功画面
/tmp/platform-tools/adb shell screencap -p /sdcard/step3_auth_success.png
/tmp/platform-tools/adb pull /sdcard/step3_auth_success.png /tmp/
```

---

## まとめてログを取得（ワンライナー）

全ステップ完了後、すべてのログをまとめて確認:

```bash
echo "=== Step 1: Worker Sync ==="
cat /tmp/step1_worker_sync.log

echo ""
echo "=== Step 2: Face Register (Mobile) ==="
cat /tmp/step2_mobile_register.log

echo ""
echo "=== Step 2: Face Register (Face API) ==="
cat /tmp/step2_face_api_register.log

echo ""
echo "=== Step 3: Face Verify (Mobile) ==="
cat /tmp/step3_mobile_verify.log

echo ""
echo "=== Step 3: Face Verify (Face API) ==="
cat /tmp/step3_face_api_verify.log
```

---

## SSOT 文書への貼り付け

取得したログを `docs/SSOT_WORKER_SYNC_FACE_AUTH_E2E.md` の該当箇所に貼り付けてください。

**作成日**: 2025-12-25
