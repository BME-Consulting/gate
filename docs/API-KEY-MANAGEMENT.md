# API Key Management Guide

## Overview

This document defines the API Key usage policy for mc-gate services across different environments.

## API Key Requirements by Service

| Service | Endpoint | API Key Required | Key Header | Notes |
|---------|----------|------------------|------------|-------|
| **GS API** | All /api/* endpoints | ✅ Required | `x-api-key` or `Authorization: ApiKey {key}` | Worker sync, events, stats |
| **GS API** | /health | ❌ Not required | - | Health check only |
| **Face API** | /api/face/register | ✅ Required | `x-api-key` | Face registration |
| **Face API** | /api/face/recognize | ✅ Required | `x-api-key` | Face recognition |
| **Face API** | /health | ❌ Not required | - | Health check only |
| **Auth (Keycloak)** | All endpoints | OAuth Token | `Authorization: Bearer {token}` | Uses JWT, not API Key |

## Environment-Specific API Keys

### Development Environment

**Purpose**: Local development and testing

**API Keys**:
```
API_FACE_API_KEY=development-api-key-12345
API_GS_API_KEY=development-api-key-12345
```

**Configuration**:
- eas.json → `build.development.env`
- apps/face-api/.env (local development only)
- apps/gs-api/.env (local development only)

**Notes**:
- Same key for both services (simplicity)
- **NEVER use in preview/production**
- Can be hardcoded in docker-compose.yml for local development

---

### Preview Environment

**Purpose**: Internal testing before production release

**API Keys**:
```
API_FACE_API_KEY=preview-api-key-please-rotate
API_GS_API_KEY=preview-api-key-please-rotate
```

**Configuration**:
- eas.json → `build.preview.env`
- apps/face-api/.env → `API_KEY=preview-api-key-please-rotate`
- apps/face-api/docker-compose.yml → `API_KEY=preview-api-key-please-rotate`
- apps/gs-api/.env → `API_KEY=preview-api-key-please-rotate`

**Notes**:
- Same key for both services (alignment with mobile app)
- **TODO**: Rotate this key periodically
- Used with HTTPS Tunnel URLs only

---

### Production Environment

**Purpose**: Live production deployment

**API Keys**:
```
API_FACE_API_KEY=production-api-key-please-rotate
API_GS_API_KEY=production-api-key-please-rotate
```

**Configuration**:
- eas.json → `build.production.env`
- Server .env files (not in git repository)

**Notes**:
- **MUST be rotated regularly** (monthly recommended)
- Different from development/preview keys
- Stored in secure environment variables, NOT in git

---

## API Key Validation Logic

### GS API (Node/Express)

**File**: `apps/gs-api/src/middleware/auth.ts`

**Logic**:
1. Check `x-api-key` header
2. Check `Authorization: ApiKey {key}` header
3. Compare with `process.env.API_KEY`
4. Development mode: Fallback to `development-api-key-12345` if API_KEY is not set
5. Production mode: Fail if API_KEY is not set

**Response**:
- ✅ Match → 200 OK, proceed to endpoint
- ❌ Mismatch → 403 FORBIDDEN `{"error":"FORBIDDEN","message":"Invalid API key"}`
- ❌ Production + Not Set → 500 INTERNAL_SERVER_ERROR

---

### Face API (Python/FastAPI)

**File**: `apps/face-api/app/middleware/auth.py`

**Logic**:
1. Check `x-api-key` header
2. Compare with `settings.api_key` (from environment variable)
3. No fallback mechanism

**Response**:
- ✅ Match → 200 OK, proceed to endpoint
- ❌ Mismatch → 401 UNAUTHORIZED `{"detail":"Invalid or missing API key"}`

---

## Common Issues and Solutions

### Issue 1: "APIキーが無効です" (GS API)

**Symptoms**:
- Worker sync fails with 403 error
- Mobile app shows "Invalid API key" message

**Root Cause**:
- App sends different API key than server expects
- Server `.env` file not updated after `eas.json` change

**Solution**:
1. Check mobile app environment (eas.json):
   ```bash
   jq '.build.preview.env.API_GS_API_KEY' apps/mobile/eas.json
   ```

2. Check server configuration:
   ```bash
   cat apps/gs-api/.env | grep API_KEY
   ```

3. Ensure they match:
   ```bash
   # If different, update server .env
   vim apps/gs-api/.env
   # Set: API_KEY=preview-api-key-please-rotate
   ```

4. Restart GS API:
   ```bash
   cd apps/gs-api
   docker compose restart
   ```

---

### Issue 2: Face Registration/Recognition Fails with 401

**Symptoms**:
- Face registration fails immediately
- Face recognition returns 401

**Root Cause**:
- Face API expects different key than mobile app sends

**Solution**:
1. Check mobile app Face API key:
   ```bash
   jq '.build.preview.env.API_FACE_API_KEY' apps/mobile/eas.json
   ```

2. Check Face API configuration:
   ```bash
   cat apps/face-api/.env | grep API_KEY
   ```

3. Ensure they match:
   ```bash
   # Update Face API .env
   vim apps/face-api/.env
   # Set: API_KEY=preview-api-key-please-rotate
   ```

4. Update docker-compose.yml:
   ```bash
   vim apps/face-api/docker-compose.yml
   # Set: - API_KEY=preview-api-key-please-rotate
   ```

5. Restart Face API:
   ```bash
   cd apps/face-api
   docker compose restart
   ```

---

### Issue 3: Keys Mismatch Between Services

**Symptoms**:
- GS API works, but Face API fails
- Inconsistent authentication behavior

**Root Cause**:
- GS API and Face API use different API keys
- eas.json uses same key for both, but servers don't

**Solution (Recommended)**:
**Use the same API key for both services** in each environment:

```bash
# Preview environment
# apps/gs-api/.env
API_KEY=preview-api-key-please-rotate

# apps/face-api/.env
API_KEY=preview-api-key-please-rotate

# eas.json
{
  "build": {
    "preview": {
      "env": {
        "API_FACE_API_KEY": "preview-api-key-please-rotate",
        "API_GS_API_KEY": "preview-api-key-please-rotate"
      }
    }
  }
}
```

**Restart both services**:
```bash
cd apps/gs-api && docker compose restart
cd apps/face-api && docker compose restart
```

---

## Security Best Practices

### 1. Never Commit Production Keys

**DO NOT** commit production API keys to git:
- ❌ Do not hardcode in source code
- ❌ Do not commit in `.env` files
- ✅ Use environment variables on production servers
- ✅ Use secrets management (e.g., Docker Secrets, Kubernetes Secrets)

### 2. Rotate Keys Regularly

**Recommended rotation schedule**:
- Development: Never (it's public anyway)
- Preview: Quarterly (every 3 months)
- Production: Monthly

**Rotation procedure**:
1. Generate new API key
2. Update server `.env` files
3. Restart services
4. Update `eas.json`
5. Create new EAS Build
6. Deploy EAS Update
7. Verify authentication works
8. Invalidate old key

### 3. Separate Keys Per Environment

**DO NOT** reuse keys across environments:
- ❌ Using development key in production
- ❌ Using preview key in production
- ✅ Each environment has its own unique key

### 4. Monitor API Key Usage

**Log suspicious activity**:
- Failed authentication attempts
- Unexpected source IPs
- Unusual request patterns

**GS API Example**:
```typescript
// apps/gs-api/src/middleware/auth.ts
if (requestApiKey !== apiKey) {
  console.warn(`[Auth] Invalid API key attempt from ${req.ip}`);
  return res.status(403).json({...});
}
```

---

## Verification Commands

### Check API Key Configuration

```bash
# Mobile app (preview environment)
jq '.build.preview.env | {FACE: .API_FACE_API_KEY, GS: .API_GS_API_KEY}' apps/mobile/eas.json

# GS API server
echo "GS API: $(cat apps/gs-api/.env | grep API_KEY)"

# Face API server
echo "Face API: $(cat apps/face-api/.env | grep API_KEY)"

# Docker compose (Face API)
grep API_KEY apps/face-api/docker-compose.yml
```

### Test API Key Authentication

```bash
# Test GS API with correct key
curl -H "x-api-key: preview-api-key-please-rotate" \
  https://api-gate.bme-service.monster/api/workers

# Test Face API with correct key
curl -H "x-api-key: preview-api-key-please-rotate" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"person_id":"test","image_data":"..."}' \
  https://face-gate.bme-service.monster/api/face/register

# Test with wrong key (should fail)
curl -H "x-api-key: wrong-key" \
  https://api-gate.bme-service.monster/api/workers
# Expected: 403 FORBIDDEN
```

---

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2025-12-18 | Initial documentation | Claude |
| 2025-12-18 | Unified Face API & GS API keys to `preview-api-key-please-rotate` | Claude |

---

**Last Updated**: 2025-12-18
**Maintainer**: Development Team
