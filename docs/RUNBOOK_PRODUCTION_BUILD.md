# Production APK Build & Verification Runbook

**Last Updated**: 2025-12-19
**Purpose**: Standard procedure for creating and verifying production APK builds
**Context**: When security-critical changes (e.g., hiding debug tabs) require native build updates

---

## When to Use This Runbook

Use this procedure when:
- Deploying security-critical environment changes (e.g., APP_ENV-dependent UI)
- EAS Updates alone are insufficient (old builds can't interpret new config)
- Need to ensure `appEnv === "production"` is enforced at native build level

**Key Rule**: When hiding debug tabs or changing production UI guards, **always create a new native build**.

---

## Prerequisites

- ✅ All code changes committed to git
- ✅ EXPO_TOKEN environment variable set
- ✅ adb tools available at `/tmp/platform-tools/adb`
- ✅ Android device connected and authorized

---

## Step 1: Create Production APK Build

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

export EXPO_TOKEN="<your-expo-token>"

npx eas-cli build --platform android --profile production-apk --non-interactive
```

**Expected Output**:
- Build ID: `<build-id>` (e.g., e7ef931c-1546-4149-95cc-e7fa50d04a32)
- APK URL: `https://expo.dev/artifacts/eas/<artifact-id>.apk`
- Status: ✔ Build finished

**Duration**: ~10-15 minutes

---

## Step 2: Download and Install APK

```bash
# Get APK download URL
export BUILD_ID="<build-id-from-step-1>"
export APK_URL=$(npx eas-cli build:view $BUILD_ID --json | jq -r '.artifacts.buildUrl')

# Download APK
curl -L -o /tmp/mc-gate-production.apk "$APK_URL"

# Install on device
/tmp/platform-tools/adb install -r /tmp/mc-gate-production.apk
```

**Expected Output**:
```
Performing Streamed Install
Success
```

---

## Step 3: Verify Build Version

```bash
/tmp/platform-tools/adb shell dumpsys package com.bmeconsulting.mcgate | grep -E "(versionCode|versionName)" | head -5
```

**Expected Output**:
```
versionCode=32 minSdk=26 targetSdk=36
versionName=1.0.31
```

(Version numbers should match latest build)

---

## Step 4: Verify Debug Tabs Are Hidden (Machine Verification)

```bash
# Launch app
/tmp/platform-tools/adb shell am start -n com.bmeconsulting.mcgate/.MainActivity

# Wait for app to load (10 seconds)
sleep 10

# Login (adjust coordinates if needed)
for i in {1..30}; do /tmp/platform-tools/adb shell input keyevent KEYCODE_DEL; done
/tmp/platform-tools/adb shell input text "admin"
/tmp/platform-tools/adb shell input tap 360 1571

# Wait for login to complete
sleep 3

# Dump UI hierarchy and check for debug tabs
/tmp/platform-tools/adb shell uiautomator dump /sdcard/ui_tabs.xml
/tmp/platform-tools/adb pull /sdcard/ui_tabs.xml /tmp/ui_tabs.xml

grep -nE "デバッグ|Debug|カメラテ|vision|Vision" /tmp/ui_tabs.xml || echo "✅ タブ文言はUI上に見当たりません"
```

**Expected Output**:
```
✅ タブ文言はUI上に見当たりません
```

**Success Criteria**: grep returns 0 matches (no debug-related text found in UI hierarchy)

---

## Step 5: Optional - Deploy EAS Update (for JS-only changes)

After confirming the new build works correctly, deploy an EAS Update to sync JS code:

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

export EXPO_TOKEN="<your-expo-token>"

npx eas-cli update --branch production --message "Sync with Build <build-id>"
```

**Note**: This step is only needed if there are JS-only changes to deploy. If the build already contains all necessary changes, skip this step.

---

## Troubleshooting

### Issue: Build version doesn't match expected version

**Cause**: Native `android/` directory overrides `app.config.js` version settings

**Solution**: Update version in both:
- `apps/mobile/app.config.js` (lines 114, 136)
- `apps/mobile/android/app/build.gradle` (if exists)

### Issue: Debug tabs still visible after installing new build

**Verification Steps**:
1. Check `APP_ENV` in build logs: should be `production`
2. Verify `appEnv` in app.config.js evaluation (lines 6-11)
3. Confirm `eas.json` production-apk profile has `APP_ENV=production` (line 100)

**If tabs are still visible**:
- Build may not have included production environment variables
- Check EAS build logs for environment variable loading
- Verify `apps/mobile/src/app/(tabs)/_layout.tsx` conditional rendering (lines 197-213)

---

## Checklist: Before Marking Complete

- [ ] Build created with `production-apk` profile
- [ ] APK downloaded and installed successfully
- [ ] `versionCode` matches expected version
- [ ] UIAutomator verification shows 0 debug tab matches
- [ ] App launches and functions normally
- [ ] Security policy verification passed (docs/SECURITY_POLICY_UI.md)

---

## Related Documentation

- [Security Policy (SSOT)](./SECURITY_POLICY_UI.md)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Update Guidelines](../apps/mobile/docs/eas-update-guidelines.md) (if exists)

---

## Audit Trail Template

When verification is complete, add entry to `docs/SECURITY_POLICY_UI.md` Section 7:

```markdown
### YYYY-MM-DD: Production APK Verification (PASSED/FAILED)
**Build ID**: <build-id>
**APK URL**: <apk-url>
**Environment**: APP_ENV=production (production-apk profile)
**Verification Method**: UIAutomator dump + grep (machine-verified)
**Result**: Debug tabs (debug, vision-test) NOT FOUND in UI hierarchy (0 matches)
```

---

**End of Runbook**
