# Pattern 2 Manual Verification Checklist

**Purpose**: Verify API failure/network error UX improvements (Pattern 2)

**Target**: BULK_FETCH timeout reduction (90s → 10s) and retry button functionality

**Scope**: Worker sync feature only (`apps/mobile/src/hooks/useWorkers.ts:193`)

---

## Preconditions

- ✅ App installed and logged in
- ✅ Settings screen accessible
- ✅ "作業員マスタ管理" section visible with "サーバーから同期" button
- ✅ **必須**: Updates診断情報を記録（Settings > アプリ情報セクション）
  - Runtime Version: _________________
  - Update ID: _________________
  - 配信チャンネル: _________________
  - 起動モード: 埋め込み / OTA Update

**重要**: テスト前に必ず診断情報を記録してください。これにより、テスト失敗時に原因を特定できます。

---

## Test A: Airplane Mode (Network Disconnect)

### Steps

1. Open Settings screen
2. Scroll to "作業員マスタ管理" section
3. Enable Airplane mode on device
4. Tap "サーバーから同期" button
5. Observe timeout behavior
6. Tap "再試行" (Retry) button if visible

### Expected Results

- [ ] Alert dialog appears within <10 seconds
- [ ] Error message type: `NETWORK_ERROR`
- [ ] Message text: "ネットワークに接続できません。機内モードや回線状況を確認してください。"
- [ ] Alert has 2 buttons: "閉じる" (Close) and "再試行" (Retry)
- [ ] Tapping "再試行" triggers another sync attempt
- [ ] No crash observed

### Actual Results (fill in by operator)

- Timeout observed: _______ seconds
- Message type: _________________
- Message text: _________________
- Retry button functional: Yes / No
- Crash: Yes / No
- Notes: _________________

---

## Test B: API Server Stop (Server Unavailable)

### Steps

1. Stop API server (gs-api on port 7070)
   ```bash
   # On server:
   docker-compose stop gs-api
   # or
   lsof -ti:7070 | xargs kill -9
   ```
2. Open Settings screen on app
3. Scroll to "作業員マスタ管理" section
4. Tap "サーバーから同期" button
5. Observe timeout behavior
6. Tap "再試行" (Retry) button if visible

### Expected Results

- [ ] Alert dialog appears within <10 seconds
- [ ] Error message type: `TIMEOUT` or `NETWORK_ERROR`
- [ ] Message text includes timeout indication
- [ ] Alert has 2 buttons: "閉じる" (Close) and "再試行" (Retry)
- [ ] Tapping "再試行" triggers another sync attempt
- [ ] No crash observed

### Actual Results (fill in by operator)

- Timeout observed: _______ seconds
- Message type: _________________
- Message text: _________________
- Retry button functional: Yes / No
- Crash: Yes / No
- Notes: _________________

---

## Test C: API Server 5xx Error (Server Error)

### Steps

1. Configure API server to return 500 Internal Server Error
2. Open Settings screen on app
3. Scroll to "作業員マスタ管理" section
4. Tap "サーバーから同期" button
5. Observe error handling
6. Tap "再試行" (Retry) button if visible

### Expected Results

- [ ] Alert dialog appears immediately
- [ ] Error message type: `SERVER_ERROR`
- [ ] Message text: "サーバー側で障害が発生している可能性があります。時間をおいて再試行してください。"
- [ ] Alert has 2 buttons: "閉じる" (Close) and "再試行" (Retry)
- [ ] Tapping "再試行" triggers another sync attempt
- [ ] No crash observed

### Actual Results (fill in by operator)

- Response time: _______ seconds
- Message type: _________________
- Message text: _________________
- Retry button functional: Yes / No
- Crash: Yes / No
- Notes: _________________

---

## Evidence Collection

### Screenshots (optional but recommended)

- [ ] Airplane mode Alert screenshot
- [ ] Server stop Alert screenshot
- [ ] 5xx error Alert screenshot
- [ ] Retry button tap result screenshot

### adb logcat (optional)

```bash
# Capture logs during test
/tmp/platform-tools/adb logcat -s ReactNativeJS:* > /tmp/pattern2-test.log
```

---

## Pass/Fail Criteria

**PASS**: All of the following are true:
- Timeout observed <10s in Test A and Test B
- Retry button functional in all tests
- No crashes in any test
- Error messages are user-friendly (not technical jargon)

**FAIL**: Any of the following are true:
- Timeout ≥10s in any test
- Retry button not functional
- Crash occurs
- Error message is technical (e.g., "Network request failed", "502 Bad Gateway")

---

## Troubleshooting: If Tests FAIL

### エラー: "同期機能が利用できません" が表示される

**原因**: `syncFromServer` 関数がundefinedのため、アプリの更新が正しく反映されていない。

**診断手順**:
1. Settings > アプリ情報 で診断情報を確認
2. 起動モードが「埋め込み」か「OTA Update」かをチェック
3. EAS Dashboard で Update Group ID を確認:
   ```bash
   npx eas-cli update:list --branch preview --limit 1
   ```
4. Runtime Version と Update ID を突合

**修正手順**:
1. アプリを完全終了して再起動
2. 起動モードが「OTA Update」になるまで待つ（自動ダウンロード）
3. 改善しない場合: EAS Update を再配信
   ```bash
   cd apps/mobile
   npx eas-cli update --branch preview --message "Fix: ensure syncFromServer is available"
   ```
4. アプリを再起動して診断情報を再確認
5. それでも改善しない場合: 新しいBuildを作成

**証拠記録**:
- 診断情報のスクリーンショット
- エラーダイアログのスクリーンショット
- adb logcat の該当部分（`grep "SYNC FUNCTION MISSING"`）

### エラー: 再試行ボタンがない（予期しないエラーのみ表示）

**原因**: エラーハンドリングが実装されているが、古いコードが動作している可能性。

**修正手順**:
- 上記「同期機能が利用できません」と同じ手順を実行

---

## Implementation References

- **Timeout constant**: `packages/core/src/constants/timeout.ts:12`
  ```typescript
  BULK_FETCH: 10000, // 10秒（UX改善: 90秒→10秒に短縮）
  ```

- **Worker sync implementation**: `apps/mobile/src/hooks/useWorkers.ts:193`
  ```typescript
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT.BULK_FETCH);
  ```

- **Retry button implementation**: `apps/mobile/src/app/(tabs)/settings.tsx:422-444`
  ```typescript
  Alert.alert(
    "同期失敗",
    error.toUserMessage(),
    [
      { text: "閉じる", style: "cancel" },
      { text: "再試行", onPress: () => handleWorkerSync() }
    ]
  );
  ```

- **User-friendly error messages**: `packages/api-client/src/client.ts`
  ```typescript
  toUserMessage(): string {
    switch (this.kind) {
      case "TIMEOUT":
        return "通信がタイムアウトしました。電波状況を確認して再試行してください。";
      case "NETWORK_ERROR":
        return "ネットワークに接続できません。機内モードや回線状況を確認してください。";
      case "SERVER_ERROR":
        return "サーバー側で障害が発生している可能性があります。時間をおいて再試行してください。";
      // ...
    }
  }
  ```

---

## Sign-off

**Tester**: _________________
**Date**: _________________
**Result**: PASS / FAIL
**Notes**: _________________

---

**SSOT**: This checklist is the authoritative source for Pattern 2 manual verification.
**Location**: `scripts/verify-ux-pattern2.md`
**Last Updated**: 2025-12-22
