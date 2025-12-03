# Cloudflare Tunnel Setup - mc-gate Project

## Overview

This document describes the Cloudflare Tunnel setup for the mc-gate project, providing secure external access to internal services without exposing ports or configuring firewall rules.

## Installation Status

**Status**: ✅ Successfully Installed and Running

**Container**: `mc-gate-cloudflare-tunnel`
**Image**: `cloudflare/cloudflared:latest`
**Tunnel ID**: `77c5c965-df5e-4d76-9738-aaa9ad316ec8`
**Account ID**: `d3d6d0aad946d1cd872691bd71f1848b`

## Tunnel Information

### Token Details

The tunnel token has been decoded and verified:
```json
{
  "a": "d3d6d0aad946d1cd872691bd71f1848b",  // Account Tag
  "t": "77c5c965-df5e-4d76-9738-aaa9ad316ec8",  // Tunnel ID
  "s": "cd7acaf6-030b-4c02-a198-7d940a111b29"   // Tunnel Secret (decoded)
}
```

### Connection Status

The tunnel has established 4 redundant connections to Cloudflare's edge network:

| Connection | Location | Protocol | Status |
|------------|----------|----------|--------|
| connIndex=0 | nrt10 (Tokyo) | QUIC | ✅ Registered |
| connIndex=1 | nrt07 (Tokyo) | QUIC | ✅ Registered |
| connIndex=2 | nrt07 (Tokyo) | QUIC | ✅ Registered |
| connIndex=3 | nrt09 (Tokyo) | QUIC | ✅ Registered |

## Services Exposed

The following services can be exposed through Cloudflare Tunnel:

| Service | Internal Address | Suggested Hostname |
|---------|------------------|-------------------|
| GS API | http://192.168.1.4:7070 | api.mc-gate.yourdomain.com |
| Face API | http://192.168.1.4:8100 | face.mc-gate.yourdomain.com |
| Keycloak Auth | http://192.168.1.4:8081 | auth.mc-gate.yourdomain.com |

## Current Setup

### Method 1: Token-Based (Currently Running)

The tunnel is currently running with token-based authentication:

```bash
docker run -d \
  --name mc-gate-cloudflare-tunnel \
  --restart unless-stopped \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run \
  --token eyJhIjoiZDNkNmQwYWFkOTQ2ZDFjZDg3MjY5MWJkNzFmMTg0OGIiLCJ0IjoiNzdjNWM5NjUtZGY1ZS00ZDc2LTk3MzgtYWFhOWFkMzE2ZWM4IiwicyI6IlkyUTNZV05oWmpZdE1ETXdZaTAwWXpBeUxXRXhPVGd0TjJRNU5EQmhNVEV4WWpJNSJ9
```

**Status**: ✅ Container is running
**Container ID**: `3900df552af8`
**Uptime**: Running since 2025-12-02 07:33:17 UTC

## Recommended Setup

### Method 2: Config-Based (Recommended for Production)

For better control and flexibility, use a configuration file approach.

#### Directory Structure

```
/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/
├── config.yml          # Tunnel configuration
├── cred.json          # Credentials file (permissions: 600)
├── .env.example       # Environment variables template
└── README.md          # This file
```

#### Configuration File: config.yml

```yaml
tunnel: 77c5c965-df5e-4d76-9738-aaa9ad316ec8
credentials-file: /etc/cloudflared/cred.json

ingress:
  # GS API Service
  - hostname: api.mc-gate.yourdomain.com
    service: http://192.168.1.4:7070
    originRequest:
      connectTimeout: 30s
      noTLSVerify: false

  # Face API Service
  - hostname: face.mc-gate.yourdomain.com
    service: http://192.168.1.4:8100
    originRequest:
      connectTimeout: 30s
      noTLSVerify: false

  # Keycloak Authentication Service
  - hostname: auth.mc-gate.yourdomain.com
    service: http://192.168.1.4:8081
    originRequest:
      connectTimeout: 30s
      noTLSVerify: false

  # Catch-all rule (must be last)
  - service: http_status:404
```

#### Credentials File: cred.json

```json
{
  "AccountTag": "d3d6d0aad946d1cd872691bd71f1848b",
  "TunnelSecret": "Y2Q3YWNhZjYtMDMwYi00YzAyLWExOTgtN2Q5NDBhMTExYjI5",
  "TunnelID": "77c5c965-df5e-4d76-9738-aaa9ad316ec8"
}
```

**Important**: This file has been created with secure permissions (600).

### Method 3: Docker Compose Integration

The Cloudflare Tunnel service has been added to the main docker-compose.yml:

**File**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/docker-compose.yml`

```yaml
services:
  cloudflare-tunnel:
    image: cloudflare/cloudflared:latest
    container_name: mc-gate-cloudflare-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - mc-gate-network
```

To use this method:

1. Copy the environment file:
   ```bash
   cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api
   cp .env.cloudflare .env
   ```

2. Start the tunnel with docker-compose:
   ```bash
   docker-compose up -d cloudflare-tunnel
   ```

## Management Commands

### Check Container Status

```bash
docker ps --filter name=mc-gate-cloudflare-tunnel
```

### View Logs

```bash
# Real-time logs
docker logs -f mc-gate-cloudflare-tunnel

# Last 50 lines
docker logs mc-gate-cloudflare-tunnel --tail 50
```

### Restart Tunnel

```bash
docker restart mc-gate-cloudflare-tunnel
```

### Stop Tunnel

```bash
docker stop mc-gate-cloudflare-tunnel
```

### Remove and Recreate Tunnel

```bash
# Stop and remove current container
docker stop mc-gate-cloudflare-tunnel
docker rm mc-gate-cloudflare-tunnel

# Recreate with new configuration
docker run -d \
  --name mc-gate-cloudflare-tunnel \
  --restart unless-stopped \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run \
  --token eyJhIjoiZDNkNmQwYWFkOTQ2ZDFjZDg3MjY5MWJkNzFmMTg0OGIiLCJ0IjoiNzdjNWM5NjUtZGY1ZS00ZDc2LTk3MzgtYWFhOWFkMzE2ZWM4IiwicyI6IlkyUTNZV05oWmpZdE1ETXdZaTAwWXpBeUxXRXhPVGd0TjJRNU5EQmhNVEV4WWpJNSJ9
```

## Verification

### 1. Check Tunnel Status

```bash
docker ps | grep cloudflare-tunnel
```

**Expected Output**:
```
3900df552af8   cloudflare/cloudflared:latest   Up X minutes   mc-gate-cloudflare-tunnel
```

### 2. Verify Connection

```bash
docker logs mc-gate-cloudflare-tunnel | grep "Registered tunnel connection"
```

**Expected Output**:
```
INF Registered tunnel connection connIndex=0 connection=... location=nrt10 protocol=quic
INF Registered tunnel connection connIndex=1 connection=... location=nrt07 protocol=quic
INF Registered tunnel connection connIndex=2 connection=... location=nrt07 protocol=quic
INF Registered tunnel connection connIndex=3 connection=... location=nrt09 protocol=quic
```

### 3. Verify Cloudflare Dashboard

Visit the Cloudflare Zero Trust Dashboard:
1. Go to https://dash.cloudflare.com/
2. Navigate to **Zero Trust** → **Access** → **Tunnels**
3. Look for tunnel ID: `77c5c965-df5e-4d76-9738-aaa9ad316ec8`
4. Status should show: **HEALTHY** ✅

### 4. Test External Access

Once DNS records are configured in Cloudflare:

```bash
# Test API endpoint (replace with actual domain)
curl https://api.mc-gate.yourdomain.com/health

# Expected response:
# {"status":"ok"}
```

## Cloudflare Dashboard Configuration

To complete the setup, configure routes in Cloudflare Dashboard:

1. Go to **Zero Trust** → **Access** → **Tunnels**
2. Select your tunnel (`77c5c965-df5e-4d76-9738-aaa9ad316ec8`)
3. Click **Configure**
4. Add Public Hostname entries:

| Public Hostname | Service | Description |
|----------------|---------|-------------|
| api.mc-gate.yourdomain.com | http://192.168.1.4:7070 | GS API Service |
| face.mc-gate.yourdomain.com | http://192.168.1.4:8100 | Face API Service |
| auth.mc-gate.yourdomain.com | http://192.168.1.4:8081 | Keycloak Auth |

## Troubleshooting

### Issue: Tunnel Not Connecting

**Check 1**: Verify token is correct
```bash
docker logs mc-gate-cloudflare-tunnel | grep "Starting tunnel"
```

**Check 2**: Verify network connectivity
```bash
docker exec mc-gate-cloudflare-tunnel ping -c 3 1.1.1.1
```

**Check 3**: Restart the container
```bash
docker restart mc-gate-cloudflare-tunnel
```

### Issue: Services Not Accessible

**Check 1**: Verify local services are running
```bash
curl http://192.168.1.4:7070/health   # GS API
curl http://192.168.1.4:8100/health   # Face API
curl http://192.168.1.4:8081/health   # Keycloak
```

**Check 2**: Check DNS records in Cloudflare
- DNS records should be set to **Proxied** (orange cloud icon)
- Type: CNAME
- Content: `<tunnel-id>.cfargotunnel.com`

**Check 3**: Verify tunnel configuration in Cloudflare Dashboard
- Public Hostnames must match DNS records
- Service URLs must be correct

### Issue: Connection Drops

Cloudflare Tunnel automatically reconnects. Check logs:
```bash
docker logs mc-gate-cloudflare-tunnel --tail 100 | grep -E "(ERR|WARN)"
```

If persistent issues occur:
```bash
docker restart mc-gate-cloudflare-tunnel
```

## Security Considerations

### 1. Token Security

- **DO NOT** commit the tunnel token to version control
- Store tokens in environment variables or secure secret management
- Rotate tokens periodically

### 2. Credentials File

- Permissions set to 600 (read/write for owner only)
- Location: `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/cred.json`

### 3. Service Exposure

- Only expose necessary services
- Use Cloudflare Access for additional authentication
- Enable rate limiting and DDoS protection in Cloudflare

### 4. Network Isolation

- Tunnel container is part of `mc-gate-network`
- Can communicate with other services in the same network
- No direct port exposure to the internet

## Performance Optimization

### UDP Buffer Size Warning

You may see this warning in logs:
```
failed to sufficiently increase receive buffer size (was: 208 kiB, wanted: 7168 kiB, got: 416 kiB)
```

**Solution** (optional, for high-traffic scenarios):

Add to host system:
```bash
# Increase UDP buffer size
echo "net.core.rmem_max=7500000" | sudo tee -a /etc/sysctl.conf
echo "net.core.wmem_max=7500000" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

Then restart the tunnel:
```bash
docker restart mc-gate-cloudflare-tunnel
```

## Monitoring

### Health Check

Add a cron job to monitor tunnel health:

```bash
# /etc/cron.d/cloudflare-tunnel-monitor
*/5 * * * * root docker ps | grep -q mc-gate-cloudflare-tunnel || docker start mc-gate-cloudflare-tunnel
```

### Metrics

Cloudflare Tunnel exposes metrics on port 20241:
```bash
curl http://localhost:20241/metrics
```

## Migration from Standalone to Docker Compose

If you want to migrate the current standalone container to docker-compose:

1. Stop the current container:
   ```bash
   docker stop mc-gate-cloudflare-tunnel
   docker rm mc-gate-cloudflare-tunnel
   ```

2. Set up environment file:
   ```bash
   cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api
   cp .env.cloudflare .env
   ```

3. Start with docker-compose:
   ```bash
   docker-compose up -d cloudflare-tunnel
   ```

4. Verify:
   ```bash
   docker-compose ps
   docker-compose logs cloudflare-tunnel
   ```

## Useful Links

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflare Zero Trust Dashboard](https://dash.cloudflare.com/)
- [Troubleshooting Guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/remote/)

## Summary

### Current Status
- ✅ Cloudflare Tunnel container is running
- ✅ 4 tunnel connections established (nrt07, nrt09, nrt10)
- ✅ Token verified and validated
- ✅ Docker Compose integration added
- ✅ Configuration files created

### Next Steps
1. Configure public hostnames in Cloudflare Dashboard
2. Set up DNS records in Cloudflare
3. Test external access to services
4. (Optional) Enable Cloudflare Access for authentication
5. (Optional) Configure rate limiting and security rules

### Files Created
- `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/config.yml`
- `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/cred.json` (600 permissions)
- `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/.env.example`
- `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/README.md` (this file)
- `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/.env.cloudflare`

### Docker Compose Updated
- `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/docker-compose.yml`

---

**Last Updated**: 2025-12-02
**Created By**: Claude Code
**Tunnel ID**: `77c5c965-df5e-4d76-9738-aaa9ad316ec8`
**Status**: Operational ✅
