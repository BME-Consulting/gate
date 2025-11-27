# Test Scripts

## Face Detection E2E Test

自動化された顔検出機能のEnd-to-Endテストスクリプト。

### 機能

このテストスクリプトは以下を自動的に実行します:

1. **アプリ起動** - アプリを強制停止して再起動
2. **モックログイン** - 空の入力でログインボタンをタップ
3. **画面遷移** - Face Registrationタブに自動遷移
4. **カメラ初期化確認** - logcatでカメラの初期化を確認
5. **顔検出確認** - 顔検出コールバックが呼ばれることを確認
6. **UI更新確認** - スクリーンショットを撮影して手動検証用に保存

### 使い方

```bash
# テストを実行
./scripts/test-face-detection.sh
```

### 前提条件

- Android デバイスが adb 経由で接続されていること
- アプリ (`com.bme_llc.mcgate`) がインストール済みであること
- `/tmp/platform-tools/adb` が利用可能であること

### テスト結果

テストが完了すると、以下のディレクトリに結果が保存されます:

```
/tmp/face-detection-test/
├── screenshots/          # 各ステップのスクリーンショット
│   ├── 01_app_launched.png
│   ├── 02_after_login.png
│   ├── 03_face_registration_tab.png
│   ├── 04_camera_initialized.png
│   ├── 05_face_detection.png
│   └── 06_ui_state.png
├── face_detection_logs.txt  # 顔検出関連のログ
└── test-results.log          # テスト結果サマリー
```

### 出力例

```
================================================
  Face Detection E2E Test Suite
================================================

================================================
  Setting up test environment
================================================
[TEST 1] Checking ADB connection
✓ PASS: ADB device connected
[TEST 2] Checking app installation
✓ PASS: App installed: com.bme_llc.mcgate

================================================
  Test 1: App Launch
================================================
[TEST 3] Starting app
ℹ INFO: Waiting 10s for UI update...
ℹ INFO: Screenshot saved: /tmp/face-detection-test/screenshots/01_app_launched.png
✓ PASS: App launched successfully

...

================================================
  Test Summary
================================================

Total Tests:  12
Passed:       12
Failed:       0

═══════════════════════════════════════
  ALL TESTS PASSED ✓
═══════════════════════════════════════

Test Results: /tmp/face-detection-test/test-results.log
Screenshots:  /tmp/face-detection-test/screenshots
```

### カスタマイズ

スクリプト内の以下の定数を変更することで、動作をカスタマイズできます:

```bash
# UI coordinates (画面サイズに応じて調整)
LOGIN_BUTTON_X=360
LOGIN_BUTTON_Y=1051
FACE_REG_TAB_X=540
FACE_REG_TAB_Y=1500

# Timeouts (タイムアウト値を調整)
TIMEOUT_APP_START=10
TIMEOUT_LOGIN=5
TIMEOUT_TAB_SWITCH=3
TIMEOUT_CAMERA_INIT=5
TIMEOUT_FACE_DETECTION=10
```

### トラブルシューティング

#### テストが失敗する場合

1. **adb接続を確認**
   ```bash
   /tmp/platform-tools/adb devices
   ```

2. **アプリのインストールを確認**
   ```bash
   /tmp/platform-tools/adb shell pm list packages | grep mcgate
   ```

3. **画面座標を確認**
   - スクリーンショットを見て、タップ位置が正しいか確認
   - 必要に応じて座標を調整

4. **ログを確認**
   ```bash
   cat /tmp/face-detection-test/test-results.log
   cat /tmp/face-detection-test/face_detection_logs.txt
   ```

#### 顔検出が失敗する場合

- テスト実行中にカメラの前に顔を向ける
- 照明が十分か確認
- カメラの権限が許可されているか確認

### CI/CD統合

GitHub Actionsなどで自動実行する場合:

```yaml
- name: Run Face Detection E2E Test
  run: |
    # デバイスをUSB接続またはネットワーク経由で接続
    ./scripts/test-face-detection.sh
```

**注意**: 顔検出テストは実際の顔が必要なため、CI環境では自動化が難しい場合があります。その場合は、カメラ初期化までのテストを分離して実行することを推奨します。
