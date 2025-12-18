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
