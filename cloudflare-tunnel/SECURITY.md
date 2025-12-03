# Cloudflare Tunnel - Security Guidelines

## Security Status Overview

### Current Security Measures

✅ **Implemented**:
- Credentials file has secure permissions (600)
- Token-based authentication active
- Container restart policy enabled
- Network isolation via Docker network
- HTTPS encryption via Cloudflare (when DNS configured)

⚠️ **Recommended** (not yet implemented):
- Cloudflare Access authentication
- Rate limiting rules
- IP allowlisting (if needed)
- DDoS protection rules
- Regular token rotation

## Critical Security Items

### 1. Credentials Management

#### Current State
```bash
# File: /volume2/Project/MCD3/TUMON/mc-gate/cloudflare-tunnel/cred.json
Permissions: 600 (owner read/write only)
Owner: BMELLC
```

#### Important Actions

**DO**:
- Keep credentials file permissions at 600
- Store tokens in environment variables for production
- Use Docker secrets or Kubernetes secrets in orchestrated environments
- Rotate tokens every 90 days

**DO NOT**:
- Commit credentials to version control
- Share tokens via insecure channels (email, Slack, etc.)
- Use the same token across multiple environments
- Store tokens in plaintext in application code

### 2. Version Control

#### Files to Exclude from Git

Add to `.gitignore`:
```gitignore
# Cloudflare Tunnel secrets
cloudflare-tunnel/cred.json
cloudflare-tunnel/.env
apps/gs-api/.env
apps/gs-api/.env.cloudflare
*.token
**/tunnel-credentials.json
```

#### Files Safe to Commit

These files contain no secrets:
- `cloudflare-tunnel/config.yml` (without credentials)
- `cloudflare-tunnel/README.md`
- `cloudflare-tunnel/QUICKSTART.md`
- `cloudflare-tunnel/SECURITY.md` (this file)
- `cloudflare-tunnel/.env.example` (template only)

### 3. Network Security

#### Current Setup

```yaml
networks:
  mc-gate-network:
    driver: bridge
```

**Services in Network**:
- PostgreSQL (mc-gate-postgres)
- Redis (mc-gate-redis)
- Keycloak (mc-gate-keycloak)
- GS API (mc-gate-gs-api)
- Cloudflare Tunnel (mc-gate-cloudflare-tunnel)

#### Security Benefits

1. **Isolated Network**: Services communicate only within `mc-gate-network`
2. **No Direct Port Exposure**: Services are not exposed to the internet directly
3. **Tunnel as Proxy**: Cloudflare Tunnel acts as a secure reverse proxy

#### Network Security Checklist

- [x] Services in isolated Docker network
- [x] No direct port binding to 0.0.0.0 (except localhost)
- [x] Tunnel container has no exposed ports
- [ ] **TODO**: Implement Cloudflare Access for additional authentication
- [ ] **TODO**: Configure IP allowlisting (if needed)

### 4. Service Exposure

#### Internal Services

| Service | Internal Address | Exposed via Tunnel |
|---------|-----------------|-------------------|
| PostgreSQL | postgres:5432 | ❌ Not exposed |
| Redis | redis:6379 | ❌ Not exposed |
| Keycloak DB | keycloak-db:5432 | ❌ Not exposed |
| GS API | 192.168.1.4:7070 | ✅ Via tunnel |
| Face API | 192.168.1.4:8100 | ✅ Via tunnel |
| Keycloak | 192.168.1.4:8081 | ✅ Via tunnel |

#### Security Recommendations

1. **GS API (Port 7070)**:
   - Requires API key authentication
   - Implement rate limiting in Cloudflare
   - Enable request logging
   - Set up alerts for unusual activity

2. **Face API (Port 8100)**:
   - Should require authentication tokens
   - Limit request body size (prevent abuse)
   - Monitor for unusual patterns
   - Consider IP allowlisting for known clients

3. **Keycloak (Port 8081)**:
   - Critical authentication service
   - Enable Cloudflare Access for admin console
   - Implement strong password policies
   - Enable MFA for admin accounts
   - Monitor failed login attempts

### 5. Cloudflare Security Features

#### Recommended Settings

##### A. Cloudflare Access (Zero Trust Authentication)

Add an Access Policy for admin endpoints:

```yaml
# Example policy
Policy: Admin Only
Application: mc-gate-admin
Include:
  - Email: admin@yourdomain.com
  - Email domain: yourdomain.com
Require:
  - Authenticator (MFA)
```

**Benefits**:
- Additional authentication layer before reaching services
- MFA support
- Session management
- Audit logs

##### B. Rate Limiting

Protect against abuse:

| Endpoint | Rate Limit |
|----------|-----------|
| `/api/*` | 100 requests/minute per IP |
| `/health` | 60 requests/minute per IP |
| `/auth/*` | 10 requests/minute per IP |

##### C. WAF (Web Application Firewall)

Enable managed rulesets:
- OWASP Core Ruleset
- Cloudflare Managed Ruleset
- Custom rules for known patterns

##### D. DDoS Protection

Cloudflare provides automatic DDoS protection:
- Layer 3/4 DDoS mitigation
- Layer 7 application-layer protection
- Challenge pages for suspicious traffic

### 6. Token Security

#### Current Token Information

```
Tunnel ID: 77c5c965-df5e-4d76-9738-aaa9ad316ec8
Account ID: d3d6d0aad946d1cd872691bd71f1848b
Token: eyJhIjoiZDNkNmQwYWFkOTQ2ZDFjZDg3MjY5MWJkNzFmMTg0OGIi... (REDACTED)
```

#### Token Rotation Schedule

**Recommended**: Every 90 days

**How to Rotate**:

1. Create new tunnel token in Cloudflare Dashboard
2. Update environment variable:
   ```bash
   export CLOUDFLARE_TUNNEL_TOKEN="new-token-here"
   ```
3. Recreate container:
   ```bash
   docker stop mc-gate-cloudflare-tunnel
   docker rm mc-gate-cloudflare-tunnel
   docker run -d \
     --name mc-gate-cloudflare-tunnel \
     --restart unless-stopped \
     cloudflare/cloudflared:latest \
     tunnel --no-autoupdate run \
     --token $CLOUDFLARE_TUNNEL_TOKEN
   ```
4. Verify connection:
   ```bash
   docker logs mc-gate-cloudflare-tunnel | grep "Registered tunnel connection"
   ```
5. Revoke old token in Cloudflare Dashboard

### 7. Monitoring and Alerts

#### What to Monitor

1. **Tunnel Health**:
   - Connection status
   - Number of active connections (should be 4)
   - Uptime percentage

2. **Traffic Patterns**:
   - Request volume per endpoint
   - Geographic distribution
   - Response times

3. **Security Events**:
   - Failed authentication attempts
   - Rate limit violations
   - WAF triggers
   - Unusual traffic patterns

#### Alerting Setup

**Via Cloudflare**:
- Set up notifications for tunnel disconnection
- Alert on high error rates (>5%)
- Notify on WAF rule triggers
- Alert on DDoS attacks

**Via Docker**:
```bash
# Monitor container health
*/5 * * * * docker ps | grep -q mc-gate-cloudflare-tunnel || \
  echo "Tunnel down" | mail -s "ALERT: Cloudflare Tunnel Down" admin@yourdomain.com
```

### 8. Incident Response

#### If Token is Compromised

1. **Immediate Actions** (within 5 minutes):
   - Revoke compromised token in Cloudflare Dashboard
   - Stop tunnel container: `docker stop mc-gate-cloudflare-tunnel`
   - Review access logs for unauthorized activity

2. **Short-term** (within 1 hour):
   - Generate new tunnel token
   - Update all systems with new token
   - Restart tunnel with new credentials
   - Enable Cloudflare Access if not already active

3. **Follow-up** (within 24 hours):
   - Audit all service logs
   - Review access patterns
   - Update security policies
   - Document incident and lessons learned

#### If Unusual Traffic Detected

1. Check Cloudflare Analytics for details
2. Enable "I'm Under Attack" mode if needed
3. Review and adjust rate limiting rules
4. Consider temporary IP allowlisting
5. Investigate affected services

### 9. Compliance

#### Data Protection

- **HTTPS**: All traffic encrypted via Cloudflare
- **TLS Version**: Minimum TLS 1.2 (recommended: TLS 1.3)
- **Certificate**: Managed by Cloudflare (automatic renewal)

#### Audit Trail

Enable logging:
- Cloudflare Access logs
- WAF events
- Rate limit events
- Tunnel connection logs

**Log Retention**: Minimum 90 days (configurable)

### 10. Best Practices Checklist

#### Initial Setup

- [x] Tunnel token stored securely
- [x] Credentials file has 600 permissions
- [x] Container restart policy enabled
- [x] Services isolated in Docker network
- [ ] **TODO**: Add to .gitignore
- [ ] **TODO**: Set up monitoring alerts
- [ ] **TODO**: Configure Cloudflare Access

#### Ongoing Maintenance

- [ ] Rotate tunnel token every 90 days
- [ ] Review access logs monthly
- [ ] Update cloudflared container monthly
- [ ] Test disaster recovery quarterly
- [ ] Audit security settings semi-annually

#### Before Production

- [ ] Enable Cloudflare Access for admin endpoints
- [ ] Configure rate limiting rules
- [ ] Set up WAF rules
- [ ] Enable bot protection
- [ ] Configure monitoring and alerts
- [ ] Document incident response procedures
- [ ] Conduct security review
- [ ] Penetration testing (recommended)

## Security Contacts

### Cloudflare Support

- Dashboard: https://dash.cloudflare.com/
- Support: https://support.cloudflare.com/
- Community: https://community.cloudflare.com/

### Emergency Procedures

1. **Suspected Breach**: Revoke token immediately
2. **Tunnel Down**: Check container logs, restart if needed
3. **DDoS Attack**: Enable "I'm Under Attack" mode in Cloudflare
4. **Service Abuse**: Review and adjust rate limits

## Additional Resources

- [Cloudflare Zero Trust Security](https://developers.cloudflare.com/cloudflare-one/)
- [Tunnel Security Best Practices](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/)
- [Access Policies](https://developers.cloudflare.com/cloudflare-one/policies/access/)
- [WAF Configuration](https://developers.cloudflare.com/waf/)

---

**Last Updated**: 2025-12-02
**Security Level**: Development (recommended: upgrade to Production)
**Next Review**: 2026-03-02 (90 days)
