#!/bin/bash
# =============================================================================
# SSOT Health Check - mc-gate Project
# =============================================================================
# Purpose: Validate Single Source of Truth (SSOT) consistency
# SSOT Definition:
#   - Cloudflare Tunnel Dashboard is the ONLY source of truth
#   - All other configs (Docker, App, eas.json) must reference it
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
SUCCESS=0

# Helper functions
error() {
    echo -e "${RED}❌ ERROR: $1${NC}"
    ERRORS=$((ERRORS + 1))
}

warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
    SUCCESS=$((SUCCESS + 1))
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =============================================================================
# Check 1: SSOT Definition (Manual Verification Required)
# =============================================================================
section "1. SSOT Definition (Cloudflare Tunnel Dashboard)"

info "These are the ONLY correct values (SSOT):"
echo ""
echo "  Face API:  face-gate.bme-service.monster → 127.0.0.1:8101"
echo "  GS API:    api-gate.bme-service.monster  → 127.0.0.1:7070"
echo "  Auth API:  auth-gate.bme-service.monster → 127.0.0.1:8081"
echo ""
info "Please verify these match your Cloudflare Tunnel Dashboard"
success "SSOT definition confirmed"

# =============================================================================
# Check 2: Cloudflare Tunnel Config File
# =============================================================================
section "2. Cloudflare Tunnel Configuration File"

TUNNEL_CONFIG="cloudflare-tunnel/config.yml"

if [ ! -f "$TUNNEL_CONFIG" ]; then
    error "Cloudflare Tunnel config not found: $TUNNEL_CONFIG"
else
    # Check Face API (8101)
    if grep -q "face-gate.bme-service.monster" "$TUNNEL_CONFIG" && \
       grep -q "192.168.1.4:8101" "$TUNNEL_CONFIG"; then
        success "Face API tunnel: face-gate → :8101"
    else
        error "Face API tunnel misconfigured (expected :8101)"
    fi

    # Check GS API (7070)
    if grep -q "api-gate.bme-service.monster" "$TUNNEL_CONFIG" && \
       grep -q "192.168.1.4:7070" "$TUNNEL_CONFIG"; then
        success "GS API tunnel: api-gate → :7070"
    else
        error "GS API tunnel misconfigured (expected :7070)"
    fi

    # Check Auth API (8081)
    if grep -q "auth-gate.bme-service.monster" "$TUNNEL_CONFIG" && \
       grep -q "192.168.1.4:8081" "$TUNNEL_CONFIG"; then
        success "Auth API tunnel: auth-gate → :8081"
    else
        error "Auth API tunnel misconfigured (expected :8081)"
    fi
fi

# =============================================================================
# Check 3: Face API Dockerfile
# =============================================================================
section "3. Face API Dockerfile (CRITICAL)"

FACE_DOCKERFILE="apps/face-api/Dockerfile"

if [ ! -f "$FACE_DOCKERFILE" ]; then
    error "Face API Dockerfile not found: $FACE_DOCKERFILE"
else
    # Check EXPOSE
    EXPOSE_PORT=$(grep -oP '^EXPOSE \K\d+' "$FACE_DOCKERFILE" || echo "")
    if [ "$EXPOSE_PORT" == "8101" ]; then
        success "Face API EXPOSE: 8101 (correct)"
    else
        error "Face API EXPOSE: $EXPOSE_PORT (MUST be 8101)"
    fi

    # Check CMD for hardcoded 8100
    if grep -E 'CMD.*--port[= ]8100' "$FACE_DOCKERFILE" > /dev/null 2>&1; then
        error "Face API CMD contains hardcoded port 8100 (MUST be 8101 or \${PORT:-8101})"
    else
        # Check for correct pattern
        if grep -E 'CMD.*\$\{PORT:-8101\}|CMD.*--port 8101' "$FACE_DOCKERFILE" > /dev/null 2>&1; then
            success "Face API CMD: Uses port 8101 or \${PORT:-8101}"
        else
            warning "Face API CMD: Cannot verify port configuration"
        fi
    fi
fi

# =============================================================================
# Check 4: Docker Containers (Runtime)
# =============================================================================
section "4. Docker Container Port Mappings"

if ! command -v docker &> /dev/null; then
    warning "Docker not available - skipping container checks"
else
    # Check Face API container
    FACE_PORTS=$(docker ps --filter "name=face" --format "{{.Ports}}" 2>/dev/null || echo "")
    if [ -n "$FACE_PORTS" ]; then
        if echo "$FACE_PORTS" | grep -q "8101"; then
            success "Face API container: Port 8101 mapped"
        else
            error "Face API container: Port 8101 NOT mapped (found: $FACE_PORTS)"
        fi
    else
        warning "Face API container not running"
    fi

    # Check GS API container
    GS_PORTS=$(docker ps --filter "name=gs-api" --format "{{.Ports}}" 2>/dev/null || echo "")
    if [ -n "$GS_PORTS" ]; then
        if echo "$GS_PORTS" | grep -q "7070"; then
            success "GS API container: Port 7070 mapped"
        else
            error "GS API container: Port 7070 NOT mapped (found: $GS_PORTS)"
        fi
    else
        warning "GS API container not running"
    fi
fi

# =============================================================================
# Check 5: Active Listeners
# =============================================================================
section "5. Active Port Listeners"

if ! command -v ss &> /dev/null; then
    warning "ss command not available - skipping listener checks"
else
    # Check Face API (8101)
    if ss -lntp 2>/dev/null | grep -q ":8101"; then
        success "Port 8101: LISTENING"
    else
        error "Port 8101: NOT listening (Face API down?)"
    fi

    # Check GS API (7070)
    if ss -lntp 2>/dev/null | grep -q ":7070"; then
        success "Port 7070: LISTENING"
    else
        error "Port 7070: NOT listening (GS API down?)"
    fi

    # Check Auth (8081)
    if ss -lntp 2>/dev/null | grep -q ":8081"; then
        success "Port 8081: LISTENING"
    else
        warning "Port 8081: NOT listening (Keycloak down?)"
    fi
fi

# =============================================================================
# Check 6: Endpoint Health (via Cloudflare Tunnel)
# =============================================================================
section "6. Endpoint Health (via Cloudflare Tunnel)"

# Check Face API
FACE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://face-gate.bme-service.monster/health 2>/dev/null || echo "000")
if [ "$FACE_STATUS" == "200" ]; then
    success "Face API health: 200 OK"
elif [ "$FACE_STATUS" == "502" ]; then
    error "Face API health: 502 Bad Gateway (Backend down? Check port 8101)"
else
    error "Face API health: $FACE_STATUS (Tunnel down?)"
fi

# Check GS API
GS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api-gate.bme-service.monster/health 2>/dev/null || echo "000")
if [ "$GS_STATUS" == "200" ]; then
    success "GS API health: 200 OK"
elif [ "$GS_STATUS" == "502" ]; then
    error "GS API health: 502 Bad Gateway (Backend down? Check port 7070)"
else
    error "GS API health: $GS_STATUS (Tunnel down?)"
fi

# Check Auth API
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://auth-gate.bme-service.monster/health 2>/dev/null || echo "000")
if [ "$AUTH_STATUS" == "200" ] || [ "$AUTH_STATUS" == "404" ]; then
    success "Auth API reachable: $AUTH_STATUS"
elif [ "$AUTH_STATUS" == "502" ]; then
    error "Auth API: 502 Bad Gateway (Keycloak down? Check port 8081)"
else
    warning "Auth API: $AUTH_STATUS (May not have /health endpoint)"
fi

# =============================================================================
# Check 7: Mobile App Config (eas.json)
# =============================================================================
section "7. Mobile App Config (eas.json)"

EAS_JSON="apps/mobile/eas.json"

if [ ! -f "$EAS_JSON" ]; then
    error "eas.json not found: $EAS_JSON"
else
    # Check preview profile
    if grep -A 20 '"preview"' "$EAS_JSON" | grep -E '"API_(FACE_API|BASE_GS)".*"https://(face-gate|api-gate)\.bme-service\.monster"' > /dev/null 2>&1; then
        success "eas.json preview: Uses HTTPS Tunnel URLs"
    else
        # Check for LAN IP violation
        if grep -A 20 '"preview"' "$EAS_JSON" | grep -E '"API_(FACE_API|BASE_GS)".*"http://192\.168\.' > /dev/null 2>&1; then
            error "eas.json preview: SSOT VIOLATION - Uses LAN IP (MUST use Tunnel)"
        else
            warning "eas.json preview: Cannot verify URLs"
        fi
    fi

    # Check for port 8100 violation
    if grep -q ':8100' "$EAS_JSON"; then
        error "eas.json: Contains port 8100 (MUST be 8101)"
    fi
fi

# =============================================================================
# Check 8: App Config (app.config.js/ts) - Static Analysis
# =============================================================================
section "8. Mobile App Config (app.config.*)"

APP_CONFIG_JS="apps/mobile/app.config.js"
APP_CONFIG_TS="apps/mobile/app.config.ts"

if [ -f "$APP_CONFIG_JS" ]; then
    APP_CONFIG="$APP_CONFIG_JS"
elif [ -f "$APP_CONFIG_TS" ]; then
    APP_CONFIG="$APP_CONFIG_TS"
else
    warning "app.config.js/ts not found"
    APP_CONFIG=""
fi

if [ -n "$APP_CONFIG" ]; then
    # Check for LAN IP hardcoding
    if grep -E '(192\.168\.|localhost|127\.0\.0\.1)' "$APP_CONFIG" | grep -v 'development' > /dev/null 2>&1; then
        warning "app.config: Contains LAN IPs (ensure they're development-only)"
    else
        success "app.config: No suspicious hardcoded IPs"
    fi

    # Check for port 8100
    if grep -q ':8100' "$APP_CONFIG"; then
        error "app.config: Contains port 8100 (MUST be 8101)"
    fi
fi

# =============================================================================
# Check 9: GS API .env
# =============================================================================
section "9. GS API Environment (.env)"

GS_ENV="apps/gs-api/.env"

if [ ! -f "$GS_ENV" ]; then
    warning "GS API .env not found: $GS_ENV"
else
    # Check API_KEY consistency (should match eas.json preview)
    if [ -f "$EAS_JSON" ]; then
        EAS_API_KEY=$(grep -oP '"API_GS_API_KEY":\s*"\K[^"]+' "$EAS_JSON" | head -1 || echo "")
        ENV_API_KEY=$(grep -oP '^API_KEY=\K.+' "$GS_ENV" || echo "")

        if [ -n "$EAS_API_KEY" ] && [ -n "$ENV_API_KEY" ]; then
            if [ "$EAS_API_KEY" == "$ENV_API_KEY" ]; then
                success "GS API Key: Matches eas.json preview"
            else
                error "GS API Key: Mismatch between .env and eas.json"
                info "  .env:      $ENV_API_KEY"
                info "  eas.json:  $EAS_API_KEY"
            fi
        fi
    fi
fi

# =============================================================================
# Summary
# =============================================================================
section "Summary"

echo ""
echo "Results:"
echo -e "  ${GREEN}✅ Success: $SUCCESS${NC}"
echo -e "  ${YELLOW}⚠️  Warnings: $WARNINGS${NC}"
echo -e "  ${RED}❌ Errors: $ERRORS${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  SSOT INTEGRITY CHECK FAILED                                   ║${NC}"
    echo -e "${RED}║  Fix the errors above before committing or deploying          ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  SSOT INTEGRITY CHECK PASSED WITH WARNINGS                     ║${NC}"
    echo -e "${YELLOW}║  Review warnings before proceeding                            ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  SSOT INTEGRITY CHECK PASSED                                   ║${NC}"
    echo -e "${GREEN}║  All systems aligned with Single Source of Truth              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
