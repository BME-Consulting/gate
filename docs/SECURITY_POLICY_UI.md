# UI Security Policy (SSOT)
**Last Updated**: 2025-12-18
**Status**: FINAL (Must follow)
**Scope**: mc-gate mobile app (Expo Router)

---

## 1. Purpose
This document defines the non-negotiable UI security rules for environment-based feature visibility.
These rules prevent accidental exposure of internal tools and infrastructure details to production users.

---

## 2. Environment Definitions (SSOT)
The environment is defined by Expo extra config:

- `appEnv === "production"` → Production
- otherwise → Non-production (development / preview / internal)

**Production** is the only environment where internal UI and internal configuration MUST be hidden.

---

## 3. Debug / Internal Tabs
### 3.1 Tabs covered
- `/debug`
- `/vision-test`

### 3.2 Rule
- Non-production: Tabs MAY be visible.
- Production: Tabs MUST NOT be rendered (no tab button, no navigation entry).

### 3.3 Rationale
Debug UI is an attack surface (data leakage, feature discovery, unintended privileged actions).
Hiding is permanent by default; re-enabling requires security review.

---

## 4. Internal Configuration Visibility (Settings Screen)
### 4.1 Items that MUST be hidden in production
- API URLs (Face API / GS API)
- Auth issuer / realm / audience / client id
- Any internal infra identifiers (LAN IPs, ports, tunnel mapping hints)

### 4.2 Rule
- Non-production: May display for troubleshooting.
- Production: Must not display.

### 4.3 Rationale
Internal endpoints and auth metadata increase attacker capability and violate security/ops policies.

---

## 5. Implementation Requirements
- Implemented via environment-based conditional rendering in UI layer.
- Must not rely solely on "developer discipline".
- CI/SSOT checks should prevent LAN IP / HTTP endpoints in preview/production configs.

---

## 6. Change Control
Any change to these rules requires:
- Security review approval
- Documentation update (this file)
- Explicit commit message including "SECURITY REVIEW"

---

## 7. Verification History (Audit Trail)

### 2025-12-19: Production APK Verification (PASSED)
**Build ID**: e7ef931c-1546-4149-95cc-e7fa50d04a32
**APK URL**: https://expo.dev/artifacts/eas/uD9oPJok4XTw4xBQm7gfc5.apk
**Environment**: APP_ENV=production (production-apk profile)
**Verification Method**: UIAutomator dump + grep (machine-verified)
**Result**: Debug tabs (debug, vision-test) NOT FOUND in UI hierarchy (0 matches)

**Command**:
```bash
/tmp/platform-tools/adb shell uiautomator dump /sdcard/ui_tabs.xml
/tmp/platform-tools/adb pull /sdcard/ui_tabs.xml /tmp/ui_tabs.xml
grep -nE "デバッグ|Debug|カメラテ|vision|Vision" /tmp/ui_tabs.xml
# Output: ✅ タブ文言はUI上に見当たりません
```

**Root Cause Identified**: Old builds (versionCode <32) could not properly interpret `appEnv` from EAS Updates alone. Deploying Updates to old builds resulted in "OTA Update" mode instead of "production" mode, causing debug tabs to remain visible.

**Resolution**: Install fresh production APK build with `APP_ENV=production` baked into native layer. This ensures `appEnv === "production"` is enforced at build time, not just runtime.

**Key Lesson**: When deploying security-critical environment changes (like hiding debug tabs), always create a new native build. EAS Updates alone are insufficient if the receiving build's native generation doesn't support the new configuration structure.
