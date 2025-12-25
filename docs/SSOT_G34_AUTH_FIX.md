# SSOT: G-3-4 Init Error AUTH Fix

## Issue
**G-3-4 Init Error AUTH** - アプリ起動時に認証エラーでクラッシュ

## Root Cause
`apps/mobile/src/app/_layout.tsx:178-191` で「トークンなし」を誤ってエラーとして扱っていた

```typescript
// バグ：正常な初期状態をエラーとして処理
if (!hasTokens && isRestoringSession) {
  throw new Error("[G-3-4] Init Error: AUTH");
}
```

## Fix (Commit: 2758986)
「トークンなし」= 「ログインが必要」として正しく処理

```typescript
if (!hasTokens) {
  // No tokens = login required (正常な初期状態)
  console.log("[G-3-4] Step 2: No tokens - treating as login-required");
  setIsRestoringSession(false);
  setInitialRoute("(tabs)/auth");
  setIsReady(true);
  return;  // エラーを投げない
}
```

## Evidence

### 自動検証結果 (2025-12-25)
```
tokensFalse=1 (expect >= 1) ✅
noTokensMsg=1 (expect >= 1) ✅
g34Auth=0 (expect == 0) ✅

✅ SSOT VALIDATION PASSED
```

### ビルド情報
- **Build ID**: b40dceb6-065e-44da-aab2-520ef656848f
- **Commit**: 2758986
- **APK URL**: https://expo.dev/artifacts/eas/oeyAyADbZTdqKhvMcoWDnH.apk
- **Status**: FINISHED
- **検証ログ**: `/tmp/ssot_logcat_step2.log`

## Rollback条件

AUTHエラーが再発した場合の確認ポイント：

1. **ログキー確認**
   ```bash
   adb logcat | grep "\[G-3-4\]"
   ```

2. **期待されるログ**
   - `[G-3-4] Step 1: Checking SecureStore tokens`
   - `[G-3-4] Step 2: No tokens - treating as login-required`
   - `[AUTH:SSOT] No session restored` (エラーではない)

3. **NGパターン**
   - `[G-3-4] Init Error: AUTH` が出たら即座にロールバック

## 再発防止

1. `_layout.tsx:191` に以下のコメントを残す
   ```typescript
   // SSOT: 絶対にthrowしない。トークンなし=ログイン必要(正常)
   ```

2. 新規インストール時の動作テスト必須
3. ログアウト後の再起動テスト必須

## Status
**CLOSED** - 2025-12-25

---
*二度と蒸し返さない*