# Brute-Force Protection - Quick Start Guide

**Implementation Status:** ✅ Phase 1 Complete (Core Protection)

## What's Been Implemented

✅ **Per-IP Rate Limiting** with sliding window (30 seconds, 10 attempts)  
✅ **IP Banning System** with automatic expiry (15 minutes)  
✅ **Per-Account Locking** to prevent credential stuffing (5 failures in 5 min)  
✅ **Progressive Escalation** with exponential backoff (2x, 4x, 8x ban duration)  
✅ **Shared IP Detection** with dynamic thresholds (5x multiplier)  
✅ **Lockout Abuse Prevention** (max 3 lockouts per IP per hour)  
✅ **Allowlist Support** for trusted IPs  
✅ **Comprehensive Audit Logging** with structured JSON output  
✅ **Admin Stats Endpoint** for monitoring  
✅ **Memory Management** with automatic cleanup  

---

## Quick Start (5 Minutes)

### 1. Configure Environment Variables

Copy the example configuration:

```bash
cd security-plus-practice-app
cp .env.example .env
```

**Minimum required changes in `.env`:**

```bash
# REQUIRED: Change these in production
JWT_SECRET=<generate-with-openssl-rand-base64-64>
AUTH_LOG_SALT=<generate-with-openssl-rand-base64-32>

# Enable structured logging
STDOUT_AUTH_EVENTS=true

# Trust proxy (required for Fly.io)
TRUST_PROXY=true
```

### 2. Start the Server

```bash
npm install  # If not already done
npm start
```

You should see:
```
[BruteForce] Protection initialized with config: { ... }
Server running on port 3000
```

### 3. Verify It's Working

**Test 1: Health Check (should always work)**
```bash
curl http://localhost:3000/api/health
```

**Test 2: Trigger IP Ban (10 rapid attempts)**
```bash
for i in {1..12}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n\n"
  sleep 0.5
done
```

Expected result:
- Attempts 1-10: `Status: 401` (authentication failed)
- Attempts 11-12: `Status: 429` (rate limit exceeded - banned!)

---

## Configuration Guide

### Production Settings (Recommended)

```bash
# Rate Limiting
IP_RATE_WINDOW_SECONDS=30
IP_RATE_MAX_ATTEMPTS=10
IP_BAN_DURATION_SECONDS=900        # 15 minutes

# Account Locking
ACCOUNT_LOCK_MAX_FAILURES=5
ACCOUNT_LOCK_DURATION_SECONDS=600  # 10 minutes

# Escalation
ESCALATION_BAN_THRESHOLD=3         # Alert on 3rd ban in 24h
ESCALATION_MULTIPLIER=2            # 2x, 4x, 8x duration

# Logging
STDOUT_AUTH_EVENTS=true
LOG_PLAINTEXT_USERNAMES=false      # Privacy: hash usernames
```

### Testing Settings (Aggressive)

```bash
# Rate Limiting
IP_RATE_WINDOW_SECONDS=10
IP_RATE_MAX_ATTEMPTS=3
IP_BAN_DURATION_SECONDS=15         # 15 seconds

# Account Locking  
ACCOUNT_LOCK_MAX_FAILURES=2
ACCOUNT_LOCK_DURATION_SECONDS=10   # 10 seconds
```

### High-Security Settings

```bash
IP_RATE_MAX_ATTEMPTS=5             # Stricter limit
ACCOUNT_LOCK_MAX_FAILURES=3        # Lock sooner
IP_BAN_DURATION_SECONDS=1800       # 30 minutes
ESCALATION_BAN_THRESHOLD=2         # Alert on 2nd ban
```

---

## Testing the Implementation

### Automated Test Suite

Run the comprehensive test suite:

```bash
# 1. Start server with test configuration
export IP_RATE_WINDOW_SECONDS=10
export IP_RATE_MAX_ATTEMPTS=3
export ACCOUNT_LOCK_MAX_FAILURES=2
export IP_BAN_DURATION_SECONDS=15
npm start

# 2. In another terminal, run tests
cd security-plus-practice-app
node test/bruteForceProtection.test.js
```

The test suite covers:
- ✅ IP rate limit triggers ban
- ✅ Ban expires after configured duration
- ✅ Account lock works independently from IP ban
- ✅ Allowlist exemption
- ✅ Successful login resets failure counter
- ✅ Stats endpoint authentication
- ✅ Health endpoint not rate limited
- ✅ Lockout abuse detection

### Manual Testing

**Test IP Ban:**
```bash
# Trigger ban
for i in {1..12}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"victim@test.com","password":"wrong"}'
done

# Verify ban is active
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"another@test.com","password":"wrong"}'
# Expected: 429 Too Many Requests
```

**Test Account Lock (Distributed Attack):**
```bash
# Attack same account from "different IPs"
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 203.0.113.$i" \
    -d '{"email":"victim@test.com","password":"wrong"}'
  sleep 1
done

# Try from new IP - still locked
curl -X POST http://localhost:3000/api/auth/login \
  -H "X-Forwarded-For: 192.0.2.99" \
  -d '{"email":"victim@test.com","password":"wrong"}'
# Expected: 401 with "temporarily unavailable" message
```

---

## Monitoring & Dashboards

### View Stats (Admin Only)

Get real-time brute-force protection stats:

```bash
# 1. Login as admin to get JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}'

# 2. Get stats (replace TOKEN with your JWT)
curl http://localhost:3000/api/admin/brute-force-stats \
  -H "Authorization: Bearer <TOKEN>"
```

**Response includes:**
```json
{
  "timestamp": "2026-02-13T10:30:00.000Z",
  "config": {
    "ip_rate_window_seconds": 30,
    "ip_rate_max_attempts": 10,
    ...
  },
  "ip_rate_limiter": {
    "tracked_keys": 142,
    "window_seconds": 30,
    "max_attempts": 10
  },
  "ban_manager": {
    "active_bans": 5,
    "escalated_bans": 1
  },
  "account_locker": {
    "active_locks": 2,
    "tracked_failures": 87
  },
  "shared_ip_detector": {
    "tracked_ips": 142,
    "shared_ips_detected": 3
  },
  "top_banned_ips": [
    {
      "ip_hash": "a1b2c3d4e5f6",
      "ban_count_24h": 4,
      "attempt_count": 67,
      "current_status": "ACTIVE"
    }
  ],
  "memory_usage_mb": 12.3
}
```

### Log Monitoring

All brute-force events are logged to stdout as structured JSON:

```bash
# Watch logs in real-time
npm start | grep -E "IP_BAN|ACCOUNT_LOCK|PERSISTENT_ATTACKER"

# Or on Fly.io
fly logs | grep -E "IP_BAN|ACCOUNT_LOCK"
```

**Log Event Types:**
- `IP_BAN_TRIGGERED` - IP banned for exceeding rate limit
- `IP_BAN_BLOCKED` - Request blocked due to active ban
- `ACCOUNT_LOCKED` - Account locked due to failures
- `ACCOUNT_LOCK_BLOCKED` - Login blocked due to account lock
- `PERSISTENT_ATTACKER_DETECTED` - High-severity alert (3+ bans)
- `LOCKOUT_ABUSE_DETECTED` - IP triggering too many lockouts
- `AUTH_SUCCESS_AFTER_FAILURES` - User succeeded after 3+ failures

---

## Security Best Practices

### ✅ DO

- **Generate strong secrets** for `JWT_SECRET` and `AUTH_LOG_SALT`
- **Enable `STDOUT_AUTH_EVENTS=true`** for monitoring
- **Set `LOG_PLAINTEXT_USERNAMES=false`** in production (privacy)
- **Set `TRUST_PROXY=true`** when behind Fly.io/load balancer
- **Monitor logs** for `PERSISTENT_ATTACKER_DETECTED` events
- **Regularly review ban stats** via admin dashboard
- **Test with aggressive limits** before production
- **Use allowlist sparingly** (only trusted static IPs)

### ❌ DON'T

- **Don't use default secrets** (`dev-only-change-in-production`)
- **Don't allowlist VPNs** or cloud provider IP ranges
- **Don't log plaintext usernames** in production
- **Don't disable `TRUST_PROXY`** on Fly.io (breaks IP extraction)
- **Don't set thresholds too low** (causes false positives)
- **Don't ignore** `PERSISTENT_ATTACKER_DETECTED` alerts

---

## Troubleshooting

### Issue: False Positives (Legitimate Users Banned)

**Symptoms:** Users complain they can't login, logs show many bans

**Diagnosis:**
```bash
# Check if shared IP environment
curl http://localhost:3000/api/admin/brute-force-stats \
  -H "Authorization: Bearer <TOKEN>" | jq '.shared_ip_detector'
```

**Solutions:**
1. **Increase thresholds** for shared IP environments:
   ```bash
   IP_RATE_MAX_ATTEMPTS=20
   ACCOUNT_LOCK_MAX_FAILURES=8
   SHARED_IP_MULTIPLIER=10
   ```

2. **Allowlist** known legitimate IPs:
   ```bash
   IP_ALLOWLIST=192.168.1.100,10.0.0.5
   ```

3. **Check logs** for success-after-failures patterns:
   ```bash
   grep "AUTH_SUCCESS_AFTER_FAILURES" logs.json
   ```

### Issue: Attacker Bypassing Bans

**Symptoms:** Same attacker keeps trying despite bans

**Diagnosis:**
```bash
# Check if IP is rotating
grep "IP_BAN_TRIGGERED" logs.json | jq '.ip_hash' | sort | uniq -c
```

**Solutions:**
1. **Enable escalation** (should be default):
   ```bash
   ESCALATION_BAN_THRESHOLD=2  # Lower threshold
   ```

2. **Increase ban duration**:
   ```bash
   IP_BAN_DURATION_SECONDS=1800  # 30 minutes
   MAX_BAN_DURATION_SECONDS=86400  # 24 hours max
   ```

3. **Consider permanent ban** (manual):
   - Review `PERSISTENT_ATTACKER_DETECTED` alerts
   - Add IP to infrastructure-level firewall

### Issue: Memory Usage Growing

**Symptoms:** Server memory increases over time

**Diagnosis:**
```bash
# Check tracked entries
curl http://localhost:3000/api/admin/brute-force-stats \
  -H "Authorization: Bearer <TOKEN>" | jq '{tracked_keys, memory_usage_mb}'
```

**Solutions:**
1. **Reduce max tracked IPs**:
   ```bash
   MAX_TRACKED_IPS=5000  # Default: 10000
   ```

2. **Increase cleanup frequency**:
   ```bash
   CLEANUP_INTERVAL_MS=180000  # 3 minutes (default: 5 min)
   ```

3. **Migrate to Redis** (for multi-instance):
   ```bash
   USE_REDIS=true
   REDIS_URL=redis://localhost:6379
   ```

### Issue: Legitimate User Locked Out

**Symptoms:** User reports "account temporarily unavailable"

**Solutions:**
1. **Wait for lock expiry** (default: 10 minutes)

2. **Verify via email** (future feature):
   - User clicks "Unlock via email"
   - Receives unlock link

3. **Admin manual unlock** (future feature):
   - Admin dashboard → Find user → Unlock

4. **Password reset**:
   - User resets password
   - Clears failure counters

---

## Next Steps

### Phase 2: Discord Alerting (1-2 hours)

- Integrate with existing `notifier.py`
- Send high-severity alerts to Discord
- Batch low-severity alerts (hourly digest)

### Phase 3: Enhanced Monitoring (2-3 hours)

- Add charts to admin dashboard
- Bans over time histogram
- Top banned IP hashes table
- Real-time active bans widget

### Phase 4: Redis Migration (if needed)

- Only required for multi-instance deployments
- Shared state across load balancer
- Persistent bans across restarts

### Phase 5: Advanced Features

- CAPTCHA for shared IPs / high failure rates
- Device fingerprinting (TLS, canvas)
- Email verification for unlock
- Admin manual unlock UI

---

## Support & Documentation

- **Full Design Doc:** `BRUTE_FORCE_PROTECTION_DESIGN.md`
- **Configuration Reference:** `.env.example`
- **Test Suite:** `test/bruteForceProtection.test.js`
- **Source Code:** `bruteForceProtection.js`

---

## Summary

✅ **Production-ready** brute-force protection is now active  
✅ **Zero dependencies** (in-memory, scales to 10k IPs)  
✅ **Comprehensive logging** for SIEM integration  
✅ **False-positive mitigation** with shared IP detection  
✅ **Admin monitoring** via stats API  
✅ **Tested** with automated test suite  

**Your website is now protected against:**
- Brute-force login attacks
- Credential stuffing
- Account enumeration
- Distributed attacks
- Lockout abuse

**Monitor alerts for:**
- `PERSISTENT_ATTACKER_DETECTED` (HIGH severity)
- Unusual ban rate spikes
- Memory usage growth

**Next action:** Deploy with production config, monitor for 24 hours, tune thresholds as needed.
