# Cloudflare Tunnel - Quick Start Guide

## Current Status

✅ **Cloudflare Tunnel is INSTALLED and RUNNING**

- **Container Name**: `mc-gate-cloudflare-tunnel`
- **Container ID**: `3900df552af8`
- **Status**: Running
- **Active Connections**: 4 (Tokyo: nrt07, nrt09, nrt10)
- **Tunnel ID**: `77c5c965-df5e-4d76-9738-aaa9ad316ec8`

## Quick Commands

### Check Status
```bash
docker ps | grep cloudflare-tunnel
```

### View Logs
```bash
docker logs -f mc-gate-cloudflare-tunnel
```

### Restart
```bash
docker restart mc-gate-cloudflare-tunnel
```

### Stop
```bash
docker stop mc-gate-cloudflare-tunnel
```

## Next Steps to Enable External Access

### Step 1: Access Cloudflare Dashboard

1. Go to: https://dash.cloudflare.com/
2. Navigate to: **Zero Trust** → **Access** → **Tunnels**
3. Find your tunnel: `77c5c965-df5e-4d76-9738-aaa9ad316ec8`
4. Status should show: **HEALTHY** ✅

### Step 2: Configure Public Hostnames

Click on your tunnel and add these public hostnames:

| Public Hostname | Service | Port |
|----------------|---------|------|
| `api.mc-gate.yourdomain.com` | `http://192.168.1.4` | 7070 |
| `face.mc-gate.yourdomain.com` | `http://192.168.1.4` | 8100 |
| `auth.mc-gate.yourdomain.com` | `http://192.168.1.4` | 8081 |

**Important**: Replace `yourdomain.com` with your actual domain name.

### Step 3: Verify DNS Records

After adding public hostnames, Cloudflare automatically creates DNS records:

1. Go to your domain in Cloudflare Dashboard
2. Click **DNS** tab
3. Verify these CNAME records exist:
   - `api.mc-gate` → `77c5c965-df5e-4d76-9738-aaa9ad316ec8.cfargotunnel.com`
   - `face.mc-gate` → `77c5c965-df5e-4d76-9738-aaa9ad316ec8.cfargotunnel.com`
   - `auth.mc-gate` → `77c5c965-df5e-4d76-9738-aaa9ad316ec8.cfargotunnel.com`

4. Ensure **Proxy status** is enabled (orange cloud icon)

### Step 4: Test External Access

Wait 2-3 minutes for DNS propagation, then test:

```bash
# Test API endpoint
curl https://api.mc-gate.yourdomain.com/health

# Test Face API
curl https://face.mc-gate.yourdomain.com/health

# Test Keycloak
curl https://auth.mc-gate.yourdomain.com/health
```

## Services Exposed

| Service | Internal URL | External URL (after DNS setup) |
|---------|-------------|--------------------------------|
| GS API | http://192.168.1.4:7070 | https://api.mc-gate.yourdomain.com |
| Face API | http://192.168.1.4:8100 | https://face.mc-gate.yourdomain.com |
| Keycloak | http://192.168.1.4:8081 | https://auth.mc-gate.yourdomain.com |

## Important Notes

### Security

- All traffic is automatically encrypted via HTTPS by Cloudflare
- No need to open firewall ports or configure port forwarding
- Internal services remain protected on the local network
- Credentials file has secure permissions (600)

### Token Management

The tunnel token is stored in:
- Docker container (running)
- `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/.env.example`
- `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/.env.cloudflare`

**DO NOT** commit these files to version control!

### Performance

- 4 redundant connections to Cloudflare's edge network
- Automatic failover and load balancing
- Low latency routing via QUIC protocol
- No additional configuration needed

## Troubleshooting

### Tunnel Not Showing in Dashboard?

Wait 2-3 minutes and refresh. The tunnel should appear as **HEALTHY**.

### Can't Access Services Externally?

1. Verify services are running locally:
   ```bash
   curl http://192.168.1.4:7070/health
   curl http://192.168.1.4:8100/health
   curl http://192.168.1.4:8081/health
   ```

2. Check tunnel logs for errors:
   ```bash
   docker logs mc-gate-cloudflare-tunnel | grep ERR
   ```

3. Verify DNS records are created in Cloudflare Dashboard

### Services Working Locally but Not Externally?

- Ensure public hostnames are configured in Cloudflare Dashboard
- Check that DNS records are proxied (orange cloud)
- Wait 2-3 minutes for DNS propagation
- Try accessing via HTTPS (not HTTP)

## Docker Compose Alternative

To manage the tunnel with docker-compose:

1. Copy environment file:
   ```bash
   cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api
   cp .env.cloudflare .env
   ```

2. Start tunnel:
   ```bash
   docker-compose up -d cloudflare-tunnel
   ```

3. Check status:
   ```bash
   docker-compose ps cloudflare-tunnel
   docker-compose logs cloudflare-tunnel
   ```

## Files Reference

| File | Purpose | Location |
|------|---------|----------|
| `README.md` | Full documentation | `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/` |
| `QUICKSTART.md` | This file | `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/` |
| `config.yml` | Tunnel configuration | `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/` |
| `cred.json` | Credentials (secure) | `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/` |
| `.env.cloudflare` | Environment template | `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/` |
| `docker-compose.yml` | Docker Compose config | `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/` |

## Need Help?

- Check the full README: `/volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/README.md`
- View logs: `docker logs -f mc-gate-cloudflare-tunnel`
- Cloudflare Docs: https://developers.cloudflare.com/cloudflare-one/

---

**Installation Date**: 2025-12-02
**Status**: Operational ✅
**Tunnel ID**: `77c5c965-df5e-4d76-9738-aaa9ad316ec8`
