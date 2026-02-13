# Brute-Force Protection Architecture & Implementation Plan

**Author:** Senior Application Security Engineer  
**Date:** February 13, 2026  
**Target System:** Security Plus Practice App (Node.js/Express on Fly.io)  
**Current State:** Basic express-rate-limit middleware in place

---

## Executive Summary

This document provides a production-ready design for comprehensive brute-force protection with three defense layers:
1. **Per-IP rate limiting** with temporary bans
2. **Per-account lockout** to prevent credential stuffing
3. **Progressive escalation** with high-severity alerting

**Key Design Principles:**
- Fail securely (block on errors, not allow)
- Minimize false positives (shared IPs, legitimate traffic)
- Prevent attack abuse (can't weaponize lockouts against real users)
- Comprehensive logging and alerting
- Zero-trust: verify all inputs, trust no IPs automatically

---

## 1. Rate Limiting + Banning Rules

### 1.1 Per-IP Rule: Burst Attack Protection

**Purpose:** Stop distributed attacks and individual attackers trying many accounts.

```
Threshold: 10 authentication attempts within 30 seconds
Action: Temporary ban for 15 minutes (900 seconds)
Scope: All authentication endpoints from that IP
```

**Configuration:**
```javascript
const IP_BAN_CONFIG = {
  windowSeconds: 30,           // Rolling window
  maxAttempts: 10,             // Threshold
  banDurationSeconds: 900,     // 15 minutes
  trackingMethod: 'sliding',   // Sliding window (not fixed reset)
  countSuccesses: true,        // Count ALL attempts (not just failures)
};
```

**Rationale:**
- **30 seconds**: Short enough to catch burst attacks, long enough to avoid flagging slow legitimate users
- **10 attempts**: Allows for typos (2-3 tries per account) while catching automated tools
- **15 minutes**: Long enough to deter attackers, short enough to unblock mistaken users quickly
- **Count successes**: Prevents attackers from resetting counter with valid credentials they control

**Edge Cases:**
- Mobile carrier NAT, school networks → Use allowlist or increase threshold via ENV variable
- Load balancer health checks → Exclude `/health` endpoint from counting
- Admin emergency access → Allowlist specific admin IPs


### 1.2 Per-Account Rule: Credential Stuffing Protection

**Purpose:** Protect individual accounts from targeted attacks, even from distributed IPs.

```
Threshold: 5 failed login attempts within 5 minutes
Action: Temporary account lock for 10 minutes (600 seconds)
Scope: Authentication attempts for that username/email only
```

**Configuration:**
```javascript
const ACCOUNT_LOCK_CONFIG = {
  windowSeconds: 300,          // 5 minutes
  maxFailures: 5,              // Only count failures
  lockDurationSeconds: 600,    // 10 minutes
  trackingMethod: 'sliding',
  countSuccesses: false,       // Do NOT count successful logins
  requireVerification: true,   // Could require email verification to unlock early
};
```

**Rationale:**
- **5 failures**: Allows for legitimate forgotten password scenarios
- **Only failures**: Successful login proves legitimate user, should reset counter
- **5 minutes**: Catches automated credential stuffing that spaces out attempts
- **10 minutes lock**: Shorter than IP ban (account owner can recover faster)

**Critical Security Consideration:**
⚠️ **Lockout Abuse Prevention**: Attackers MUST NOT be able to weaponize this to DoS real users.

**Mitigation Strategies:**
1. **Require proof-of-account-existence**: Only lock accounts that actually exist (DON'T leak existence)
2. **Alternative auth path**: Provide "Account locked? Click here" → email verification flow
3. **Admin override**: Admin dashboard to manually unlock accounts
4. **Rate limit the lockout trigger**: Max 3 lockouts per IP per hour


### 1.3 Progressive Escalation: Persistent Attacker Detection

**Purpose:** Identify and severely restrict persistent attackers who repeatedly trigger bans.

```
Threshold: IP triggers ≥3 bans within 24 hours
Action: 
  - Increase ban duration exponentially
  - Send HIGH severity alert to Discord
  - Log for manual review
```

**Configuration:**
```javascript
const ESCALATION_CONFIG = {
  windowSeconds: 86400,        // 24 hours
  banTriggerThreshold: 3,      // 3 bans = escalation
  escalationMultiplier: 2,     // 2x, 4x, 8x duration
  maxBanDurationSeconds: 86400, // Cap at 24 hours
  alertSeverity: 'HIGH',
  considerManualReview: true,  // Flag for permanent ban consideration
};
```

**Escalation Logic:**
```
1st ban:  15 minutes
2nd ban:  30 minutes (2x)
3rd ban:  60 minutes (4x) + ALERT TRIGGERED
4th ban:  120 minutes (8x)
5th ban:  240 minutes (16x)
...
Nth ban:  min(exponential_backoff, 24 hours)
```

**Alert Trigger:**
When an IP reaches 3rd ban, send Discord notification:
```json
{
  "severity": "HIGH",
  "event": "PERSISTENT_ATTACKER_DETECTED",
  "ip_hash": "a1b2c3d4...",
  "ban_count_24h": 3,
  "total_attempts": 45,
  "current_ban_duration": "60 minutes",
  "action_required": "Review for permanent block"
}
```


### 1.4 Allowlist: Trusted Sources

**Purpose:** Exempt monitoring systems and verified admin IPs from rate limits.

**Configuration:**
```bash
# Environment variable
IP_ALLOWLIST=192.168.1.100,10.0.0.5,203.0.113.42
```

**Allowlist Rules:**
- **Strict matching**: Exact IP match only (no CIDR ranges unless explicitly needed)
- **Audit logging**: Log allowlist bypasses with `reason: "ALLOWLIST_EXEMPTION"`
- **Regular review**: Monthly audit of allowlisted IPs
- **No wildcards**: Never use `*` or broad ranges

**Security Warning:**
⚠️ Do NOT allowlist:
- VPN exit nodes
- Cloud provider IP ranges (AWS, Azure, GCP)
- "Office IP" without static IP verification
- Any IP that could be shared/compromised

**Recommended Allowlist Entries:**
- Internal monitoring service static IP
- Admin home IP (if static)
- Office static IP (if small team with dedicated IP)

---

## 2. Exact Behavior Requirements

### 2.1 What Counts as an "Attempt"?

**Track separately for different operation types:**

| Endpoint | Count Type | Reasoning |
|----------|-----------|-----------|
| `/api/auth/login` | Authentication | Primary attack vector |
| `/api/auth/register` | Authentication | Can be abused for spam |
| POST `/api/auth/forgot-password` | Enumeration | Count to prevent username enumeration |
| POST `/api/auth/reset-password` | Authentication | Password reset abuse |
| POST `/api/auth/verify-otp` | Authentication | OTP brute-force |
| GET `/api/auth/refresh-token` | Skip | Legitimate high-frequency endpoint |
| GET `/health` | Skip | Monitoring endpoint |

**Implementation:**
```javascript
// Separate counters for different categories
const TRACKED_ENDPOINTS = {
  LOGIN: ['/api/auth/login', '/login', '/auth/login'],
  REGISTER: ['/api/auth/register', '/register'],
  PASSWORD_RESET: ['/api/auth/forgot-password', '/api/auth/reset-password'],
  OTP: ['/api/auth/verify-otp', '/api/auth/verify-2fa'],
};

// Separate rate limits
const RATE_LIMITS = {
  LOGIN: { window: 30, max: 10 },
  REGISTER: { window: 300, max: 5 },     // 5 per 5 minutes (signup spam)
  PASSWORD_RESET: { window: 3600, max: 3 }, // 3 per hour (enumeration)
  OTP: { window: 60, max: 5 },           // 5 per minute (6-digit = 1M combos)
};
```

**Best Practice:** Use separate counters to avoid false positives (user tries to login 5 times, then legitimately registers).


### 2.2 Count Successes or Failures?

**Recommendation: Hybrid Approach**

| Rule Type | Count Successes? | Count Failures? | Rationale |
|-----------|------------------|-----------------|-----------|
| Per-IP Rate Limit | ✅ Yes | ✅ Yes | Prevents "spray and pray" with mixed valid/invalid creds |
| Per-Account Lock | ❌ No | ✅ Yes | Successful login = legitimate user, reset counter |
| Registration | ✅ Yes | ✅ Yes | All registration attempts (success = spam) |
| Password Reset | ✅ Yes | ✅ Yes | All attempts count (enumeration attack) |

**Logic:**
```javascript
// Per-IP: Count all attempts
function shouldCountForIpLimit(result) {
  return true; // Always count
}

// Per-Account: Only count failures
function shouldCountForAccountLock(result) {
  return result.success === false;
}

// On successful login: Clear per-account failure counter
function onSuccessfulLogin(username, ip) {
  accountFailureCounter.clear(username);
  // Do NOT clear IP counter (could be attacker with one valid cred)
}
```


### 2.3 Shared-IP Environments (Schools, Mobile Carrier NAT)

**Problem:** Hundreds of users behind one IP = high false positive risk.

**Detection Heuristics:**
1. **High unique username count**: If one IP tries >50 unique usernames in 1 hour → likely shared IP
2. **User-Agent diversity**: >20 unique UAs from same IP → likely shared
3. **Success rate**: If success rate >40% → likely legitimate shared environment

**Mitigation Strategies:**

**Option A: Increase Thresholds Dynamically**
```javascript
function getAdjustedIpThreshold(ip) {
  const uniqueUsernames = ipUsernameTracker.getUniqueCount(ip, 3600);
  const uniqueUserAgents = ipUaTracker.getUniqueCount(ip, 3600);
  
  if (uniqueUsernames > 50 || uniqueUserAgents > 20) {
    // Likely shared IP: Use 5x threshold
    return IP_BAN_CONFIG.maxAttempts * 5; // 50 instead of 10
  }
  return IP_BAN_CONFIG.maxAttempts;
}
```

**Option B: Switch to Per-(User+IP) Tracking**
```javascript
// For detected shared IPs, rate limit per (username, IP) tuple instead
if (isSharedIp(ip)) {
  return checkRateLimit(`${username}:${ip}`);
} else {
  return checkRateLimit(ip);
}
```

**Option C: CAPTCHAs for Shared IPs**
```javascript
if (isSharedIp(ip) && attemptCount > 5) {
  res.status(429).json({
    error: "Please complete CAPTCHA",
    captcha_required: true,
    captcha_token: generateCaptchaChallenge()
  });
}
```

**Recommended Approach:** Start with Option A (dynamic thresholds), add Option C (CAPTCHA) if abuse continues.


### 2.4 Preventing Lockout Abuse

**Attack Scenario:** Attacker intentionally triggers account lockouts to DoS legitimate users.

**Defense Layers:**

**Layer 1: Rate Limit Lockout Triggers**
```javascript
// Max 3 lockouts from same IP per hour
const LOCKOUT_TRIGGER_LIMIT = {
  windowSeconds: 3600,
  maxLockoutTriggers: 3,
  action: 'BAN_IP', // Ban the IP, not just the account
};
```

**Layer 2: Don't Leak Account Existence**
```javascript
// Always return same message, regardless of account existence
if (!userExists(username) || isAccountLocked(username)) {
  // DON'T say "Account locked" vs "Invalid credentials"
  return res.status(401).json({
    error: "Invalid credentials or account temporarily unavailable"
  });
}
```

**Layer 3: Alternative Unlock Path**
```javascript
// On lockout response, provide alternative:
res.status(429).json({
  error: "Too many failed attempts",
  locked_until: expiryTimestamp,
  alternative: {
    message: "Account owner? Verify your email to unlock immediately",
    action_url: "/api/auth/unlock-via-email"
  }
});
```

**Layer 4: Device Fingerprinting (Advanced)**
```javascript
// Track failed attempts per (IP + User-Agent + TLS fingerprint)
// Even if attacker rotates IPs, consistent fingerprint = same origin
const fingerprint = hashFingerprint(ip, ua, tlsSignature);
if (fingerprintFailureRate[fingerprint] > 50) {
  // Ban fingerprint, not just IP
}
```


### 2.5 HTTP Response When Blocked

**Status Codes:**
- `429 Too Many Requests` - Rate limit exceeded (temporary ban)
- `403 Forbidden` - Permanent ban or allowlist violation
- `401 Unauthorized` - Account locked (ambiguous on purpose)

**Response Schema:**

**For IP Ban:**
```json
{
  "error": "Too many requests from your network",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 900,
  "retry_after_human": "15 minutes",
  "reference_id": "ban_20260213_a1b2c3d4",
  "support": "If you believe this is an error, contact support with reference ID"
}
```

**For Account Lock:**
```json
{
  "error": "Invalid credentials or account temporarily unavailable",
  "error_code": "AUTH_FAILED",
  "hint": "Reset your password if you've forgotten it",
  "password_reset_url": "/api/auth/forgot-password"
}
```

**Security Note:** Never reveal:
- Exact time remaining on ban (prevents timing attacks)
- Whether username exists
- Specific reason for ban (which limit was hit)


### 2.6 Structured Logging Events

**All events must be logged in JSON format for SIEM/alerting:**

**IP Ban Event:**
```json
{
  "v": 2,
  "ts": "2026-02-13T10:30:45.123Z",
  "event": "IP_BAN_TRIGGERED",
  "severity": "MEDIUM",
  "ip": "203.0.113.42",
  "ip_hash": "a1b2c3d4e5f6",
  "reason": "RATE_LIMIT_EXCEEDED",
  "window_seconds": 30,
  "attempt_count": 12,
  "threshold": 10,
  "ban_duration_seconds": 900,
  "ban_expires_at": "2026-02-13T10:45:45.123Z",
  "ban_count_24h": 1,
  "unique_usernames_tried": 8,
  "unique_user_agents": 2
}
```

**Account Lock Event:**
```json
{
  "v": 2,
  "ts": "2026-02-13T10:30:45.123Z",
  "event": "ACCOUNT_LOCKED",
  "severity": "MEDIUM",
  "user_id": "user_12345",
  "username_hash": "z9y8x7w6v5u4",
  "ip_hash": "a1b2c3d4e5f6",
  "reason": "MAX_FAILURES_EXCEEDED",
  "failure_count": 6,
  "threshold": 5,
  "lock_duration_seconds": 600,
  "lock_expires_at": "2026-02-13T10:40:45.123Z",
  "attempted_ips": ["203.0.113.42", "198.51.100.5"]
}
```

**Escalation Alert Event:**
```json
{
  "v": 2,
  "ts": "2026-02-13T10:30:45.123Z",
  "event": "PERSISTENT_ATTACKER_DETECTED",
  "severity": "HIGH",
  "ip": "203.0.113.42",
  "ip_hash": "a1b2c3d4e5f6",
  "ban_count_24h": 3,
  "total_attempts_24h": 87,
  "unique_accounts_targeted": 42,
  "escalated_ban_duration_seconds": 3600,
  "action_required": "MANUAL_REVIEW",
  "geolocation": "Country: XY, City: Unknown"
}
```

**Success After Many Failures:**
```json
{
  "v": 2,
  "ts": "2026-02-13T10:30:45.123Z",
  "event": "AUTH_SUCCESS_AFTER_FAILURES",
  "severity": "LOW",
  "user_id": "user_12345",
  "ip_hash": "a1b2c3d4e5f6",
  "failed_attempts_before_success": 4,
  "time_since_first_attempt_seconds": 120,
  "note": "Legitimate user may have forgotten password"
}
```


### 2.7 Discord Notification Events

**When to send Discord alerts:**

| Event | Severity | Batching | Reason |
|-------|----------|----------|--------|
| IP Ban Triggered | LOW | Hourly digest | Common, don't spam |
| Account Locked | MEDIUM | Real-time (max 1/min) | Important but not urgent |
| Persistent Attacker (3+ bans) | HIGH | Real-time | Requires action |
| Success After Many Failures | LOW | Hourly digest | Could be legitimate |
| Allowlist Bypass Abuse | HIGH | Real-time | Config error or compromise |

**Batching Strategy:**
```javascript
// Prevent Discord spam
const discordRateLimiter = {
  HIGH: { maxPerMinute: 5, maxPerHour: 20 },
  MEDIUM: { maxPerMinute: 1, maxPerHour: 10 },
  LOW: { maxPerMinute: 0, maxPerHour: 1 }, // Batched hourly
};

// Batch low-severity events
function sendToDiscord(event) {
  if (event.severity === 'LOW') {
    lowSeverityQueue.push(event);
    if (Date.now() - lastBatchSent > 3600000) { // 1 hour
      sendBatchedAlerts(lowSeverityQueue);
      lowSeverityQueue = [];
    }
  } else {
    sendImmediateAlert(event);
  }
}
```

**Discord Message Format:**
```
🚨 **PERSISTENT ATTACKER DETECTED**

**IP:** `a1b2c3d4e5f6` (hashed)
**Bans (24h):** 3
**Total Attempts:** 87 across 42 accounts
**Current Ban:** 60 minutes
**Action:** Manual review recommended

[View Logs] [Ban Permanently] [Dismiss]
```

---

## 3. Storage & Implementation Approach

### 3.1 Architecture Decision: Single-Node vs Multi-Instance

**Your Current Setup:** Fly.io deployment (likely single instance, but could scale)

**Recommended Approach:**

#### Phase 1: In-Memory (Single-Node) ✅ START HERE
**Best for:** MVP, single-instance deployments, always-on 24/7 server

**Pros:**
- Zero dependencies (no Redis/DB required)
- Ultra-fast (microsecond lookups)
- Simple to implement and debug
- No network latency

**Cons:**
- Lost on restart (acceptable for temporary bans)
- Doesn't scale across multiple instances
- Memory leaks if not carefully bounded

**When to use:** Your current setup (single Fly.io instance, always-on)

#### Phase 2: Redis (Multi-Instance) → UPGRADE PATH
**Best for:** Horizontal scaling, multiple app instances, load balancing

**Pros:**
- Shared state across instances
- Persistent across restarts
- Built-in TTL (automatic expiry)
- Can use sorted sets for sliding windows

**Cons:**
- Adds dependency (Fly.io Redis)
- Network latency (1-5ms per call)
- Requires connection management

**When to upgrade:** When you add a 2nd app instance or need persistence


### 3.2 Sliding Window Implementation (Rolling Window)

**Problem:** Fixed windows create "double rate limit" vulnerability:
```
Fixed Window (broken):
  11:59:50 - 10 attempts ✓ allowed
  12:00:00 - [window resets]
  12:00:10 - 10 attempts ✓ allowed
  Result: 20 attempts in 20 seconds!
```

**Solution: Sliding Window**

```javascript
class SlidingWindowRateLimiter {
  constructor(windowSeconds, maxAttempts) {
    this.windowMs = windowSeconds * 1000;
    this.maxAttempts = maxAttempts;
    // Store: Map<key, Array<timestamp>>
    this.attempts = new Map();
  }

  check(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    if (!this.attempts.has(key)) {
      this.attempts.set(key, []);
    }

    // Remove expired attempts (older than window)
    const keyAttempts = this.attempts.get(key).filter(ts => ts > cutoff);
    this.attempts.set(key, keyAttempts);

    // Check if over limit
    if (keyAttempts.length >= this.maxAttempts) {
      return { allowed: false, remaining: 0, resetIn: Math.min(...keyAttempts) + this.windowMs - now };
    }

    // Record this attempt
    keyAttempts.push(now);
    return { allowed: true, remaining: this.maxAttempts - keyAttempts.length };
  }

  // Memory management: Remove old keys
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    for (const [key, attempts] of this.attempts.entries()) {
      const validAttempts = attempts.filter(ts => ts > cutoff);
      if (validAttempts.length === 0) {
        this.attempts.delete(key); // Free memory
      } else {
        this.attempts.set(key, validAttempts);
      }
    }
  }
}

// Run cleanup every 5 minutes to prevent memory leaks
setInterval(() => rateLimiter.cleanup(), 300000);
```


### 3.3 Ban State Storage

**Data Structure:**
```javascript
class BanManager {
  constructor() {
    // Map<ip, BanState>
    this.bans = new Map();
    
    // Map<ip, Array<banTimestamp>> for escalation tracking
    this.banHistory = new Map();
  }
}

// BanState structure
const BanState = {
  ip: "203.0.113.42",
  ip_hash: "a1b2c3d4e5f6",
  banned_at: "2026-02-13T10:30:45.123Z",
  expires_at: "2026-02-13T10:45:45.123Z",
  duration_seconds: 900,
  reason: "RATE_LIMIT_EXCEEDED",
  attempt_count: 12,
  ban_count_24h: 1,
};

// Methods
class BanManager {
  isBanned(ip) {
    const ban = this.bans.get(ip);
    if (!ban) return false;
    
    // Check if expired
    if (Date.now() > new Date(ban.expires_at).getTime()) {
      this.bans.delete(ip); // Auto-cleanup
      return false;
    }
    return true;
  }

  addBan(ip, duration, reason) {
    const now = Date.now();
    const expiresAt = now + (duration * 1000);
    
    // Track ban history for escalation
    if (!this.banHistory.has(ip)) {
      this.banHistory.set(ip, []);
    }
    this.banHistory.get(ip).push(now);
    
    // Calculate escalation
    const bansIn24h = this.getBanCount24h(ip);
    const escalatedDuration = this.calculateEscalation(duration, bansIn24h);
    
    this.bans.set(ip, {
      ip,
      ip_hash: hashIp(ip),
      banned_at: new Date(now).toISOString(),
      expires_at: new Date(now + escalatedDuration * 1000).toISOString(),
      duration_seconds: escalatedDuration,
      reason,
      ban_count_24h: bansIn24h,
    });

    // Alert if escalation triggered
    if (bansIn24h >= 3) {
      this.sendEscalationAlert(ip, bansIn24h, escalatedDuration);
    }

    return escalatedDuration;
  }

  calculateEscalation(baseDuration, banCount) {
    if (banCount < 3) return baseDuration;
    
    const multiplier = Math.pow(2, banCount - 2); // 2^(n-2)
    const escalated = baseDuration * multiplier;
    return Math.min(escalated, 86400); // Cap at 24 hours
  }

  getBanCount24h(ip) {
    const history = this.banHistory.get(ip) || [];
    const cutoff = Date.now() - 86400000; // 24 hours ago
    return history.filter(ts => ts > cutoff).length;
  }
}
```


### 3.4 Memory Leak Prevention

**Risks:**
- Unbounded Maps grow infinitely
- Old entries never cleaned up
- Memory exhausted → app crashes

**Mitigation Strategies:**

**1. Automatic Cleanup**
```javascript
class BoundedMap {
  constructor(maxSize = 10000, cleanupInterval = 300000) {
    this.map = new Map();
    this.maxSize = maxSize;
    
    // Auto-cleanup every 5 minutes
    setInterval(() => this.cleanup(), cleanupInterval);
  }

  cleanup() {
    // If over max size, remove oldest entries
    if (this.map.size > this.maxSize) {
      const keysToDelete = this.map.size - this.maxSize;
      let deleted = 0;
      
      for (const key of this.map.keys()) {
        if (deleted >= keysToDelete) break;
        this.map.delete(key);
        deleted++;
      }
      
      console.log(`Cleaned up ${deleted} old entries from rate limiter`);
    }
  }

  set(key, value) {
    this.map.set(key, value);
  }

  get(key) {
    return this.map.get(key);
  }
}
```

**2. LRU (Least Recently Used) Cache**
```javascript
// Use node-lru-cache for automatic eviction
const LRU = require('lru-cache');

const rateLimitCache = new LRU({
  max: 10000,           // Max 10k IPs tracked
  ttl: 1800000,         // 30 min TTL
  updateAgeOnGet: true, // Keep active IPs in cache
});
```

**3. Monitoring**
```javascript
// Expose metrics
setInterval(() => {
  const stats = {
    rate_limiter_keys: ipRateLimiter.attempts.size,
    ban_manager_keys: banManager.bans.size,
    account_locker_keys: accountLocker.locks.size,
    memory_usage_mb: process.memoryUsage().heapUsed / 1024 / 1024,
  };
  
  console.log('RATE_LIMIT_STATS', JSON.stringify(stats));
  
  // Alert if memory usage > 500MB
  if (stats.memory_usage_mb > 500) {
    sendAlert('HIGH', 'Rate limiter memory usage high', stats);
  }
}, 60000); // Every minute
```


### 3.5 Redis Upgrade Path (For Multi-Instance)

**When to upgrade:** You add a 2nd Fly.io instance or need ban persistence across restarts.

**Redis Data Structures:**

```redis
# Rate limiting: Sorted Set (score = timestamp)
ZADD ip:203.0.113.42:attempts 1707825045123 "attempt_1"
ZADD ip:203.0.113.42:attempts 1707825046789 "attempt_2"
ZREMRANGEBYSCORE ip:203.0.113.42:attempts -inf 1707825015123  # Remove old
ZCARD ip:203.0.113.42:attempts  # Count current attempts

# Bans: String with TTL
SETEX ban:203.0.113.42 900 "RATE_LIMIT_EXCEEDED"
EXISTS ban:203.0.113.42  # Check if banned

# Account locks: String with TTL
SETEX lock:user_12345 600 "MAX_FAILURES_EXCEEDED"

# Ban history: List (for escalation tracking)
LPUSH ban_history:203.0.113.42 1707825045123
EXPIRE ban_history:203.0.113.42 86400
LLEN ban_history:203.0.113.42  # Count bans in 24h
```

**Implementation:**
```javascript
class RedisRateLimiter {
  constructor(redis, windowSeconds, maxAttempts) {
    this.redis = redis;
    this.windowSeconds = windowSeconds;
    this.maxAttempts = maxAttempts;
  }

  async check(key) {
    const now = Date.now();
    const cutoff = now - (this.windowSeconds * 1000);
    const redisKey = `ratelimit:${key}`;

    // Add current attempt
    await this.redis.zadd(redisKey, now, `attempt_${now}`);
    
    // Remove old attempts
    await this.redis.zremrangebyscore(redisKey, '-inf', cutoff);
    
    // Set expiry on key
    await this.redis.expire(redisKey, this.windowSeconds * 2);
    
    // Count current attempts
    const count = await this.redis.zcard(redisKey);
    
    return {
      allowed: count <= this.maxAttempts,
      current: count,
      limit: this.maxAttempts,
    };
  }
}
```

**Migration Path:**
1. Add Redis to Fly.io: `fly redis create`
2. Update code to check `process.env.REDIS_URL`
3. If Redis available → use Redis, else → use in-memory
4. No downtime migration

---

## 4. Integration Points

### 4.1 Request Pipeline Placement

**Critical:** Rate limiting MUST happen early to protect expensive operations.

**Recommended Order:**
```
1. Parsing middleware (body-parser, express.json)
2. IP extraction middleware (trustProxy, x-forwarded-for)
3. Request ID injection
4. IP ban check ← EARLIEST POSSIBLE
5. Audit logging middleware
6. CORS headers
7. Route-specific rate limits
8. Authentication logic (JWT verification)
9. Authorization (role checks)
10. Business logic
```

**Implementation:**
```javascript
// server.js
app.set('trust proxy', 1); // Trust Fly.io proxy

// 1. Extract real IP early
app.use((req, res, next) => {
  req.clientIp = getClientIp(req);
  next();
});

// 2. Check IP bans (before any expensive work)
app.use(ipBanMiddleware);

// 3. Apply rate limiting to auth endpoints
app.use('/api/auth/*', authRateLimitMiddleware);

// 4. Then continue with normal flow
app.use(express.json());
app.use(cors());
// ... rest of middleware
```


### 4.2 Real Client IP Extraction (Proxy-Safe)

**Problem:** Behind Fly.io/proxies, `req.ip` is proxy IP, not client IP.

**Solution: Trust proxy headers (with validation)**

```javascript
function getClientIp(req) {
  // Fly.io provides this header
  if (req.headers['fly-client-ip']) {
    return req.headers['fly-client-ip'];
  }

  // Standard proxy header (comma-separated if multiple proxies)
  if (req.headers['x-forwarded-for']) {
    const ips = req.headers['x-forwarded-for'].split(',');
    return ips[0].trim(); // First IP = original client
  }

  // Cloudflare
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }

  // Fallback to socket IP
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// Validate IP format
function isValidIp(ip) {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    logSecurityEvent('INVALID_IP_FORMAT', { ip });
    return false;
  }
  
  // Block private IPs (shouldn't come from public internet)
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
    logSecurityEvent('PRIVATE_IP_DETECTED', { ip });
    return false; // Likely misconfigured proxy
  }
  
  return true;
}
```

**Security Note:**
⚠️ Only trust `x-forwarded-for` if behind a known proxy. Otherwise, attackers can spoof this header.

**Fly.io Configuration:**
```javascript
// Tell Express to trust Fly.io proxy
app.set('trust proxy', 1);

// Or be more specific (trust only Fly.io)
app.set('trust proxy', (ip) => {
  // Fly.io proxy IPs (check Fly.io docs for current ranges)
  return ip.startsWith('172.17.') || ip.startsWith('fdaa:');
});
```


### 4.3 Ban Scope: Auth Endpoints Only vs Entire Site

**Recommendation: Auth endpoints only** (minimize user impact)

**Implementation:**
```javascript
// Ban middleware (selective application)
function createBanMiddleware(banManager) {
  return (req, res, next) => {
    const ip = req.clientIp;
    
    if (banManager.isBanned(ip)) {
      const ban = banManager.getBan(ip);
      
      // Log ban attempt
      audit('IP_BAN_BLOCKED', req, 429, '', {
        reason: ban.reason,
        expires_at: ban.expires_at,
      });
      
      return res.status(429).json({
        error: "Too many requests from your network",
        retry_after: Math.ceil((new Date(ban.expires_at) - Date.now()) / 1000),
      });
    }
    
    next();
  };
}

// Apply ONLY to auth endpoints
const banMiddleware = createBanMiddleware(banManager);

app.use('/api/auth/login', banMiddleware);
app.use('/api/auth/register', banMiddleware);
app.use('/api/auth/forgot-password', banMiddleware);
app.use('/api/auth/reset-password', banMiddleware);

// Public pages: NO ban check
app.get('/', (req, res) => { /* ... */ });
app.get('/api/health', (req, res) => { /* ... */ });

// Authenticated endpoints: Ban check AFTER JWT verification
// (If they have valid JWT, they're already authenticated)
```

**Alternative: Full-site ban for severe offenders**
```javascript
// Apply global ban for persistent attackers (4+ bans)
app.use((req, res, next) => {
  const ip = req.clientIp;
  const banCount = banManager.getBanCount24h(ip);
  
  if (banCount >= 4) {
    // Full-site ban for persistent attackers
    return res.status(403).json({
      error: "Access denied",
      reference_id: generateReferenceId(),
    });
  }
  
  next();
});
```

---

## 5. Monitoring, Reporting & Testing

### 5.1 Metrics & Dashboards

**Add to existing HTML report generation:**

**Key Metrics:**
```javascript
const METRICS = {
  // Rate Limiting
  ip_bans_triggered_24h: 0,
  ip_bans_active_now: 0,
  account_locks_triggered_24h: 0,
  account_locks_active_now: 0,
  
  // Escalation
  persistent_attackers_detected_24h: 0,
  escalated_bans_active: 0,
  
  // Top Offenders
  top_banned_ips: [
    { ip_hash: 'a1b2c3...', ban_count: 5, attempt_count: 67 },
    // ...
  ],
  
  // False Positive Indicators
  successful_logins_after_near_limit: 0,
  shared_ip_detections: 0,
  
  // Performance
  avg_rate_limit_check_ms: 0.5,
  rate_limiter_memory_mb: 12.3,
};
```

**HTML Report Additions:**

```html
<!-- Add to report.html -->
<section id="brute-force-protection">
  <h2>🛡️ Brute-Force Protection</h2>
  
  <div class="metric-grid">
    <div class="metric">
      <span class="label">IP Bans (24h)</span>
      <span class="value">{{ ip_bans_triggered_24h }}</span>
    </div>
    <div class="metric">
      <span class="label">Active Bans</span>
      <span class="value">{{ ip_bans_active_now }}</span>
    </div>
    <div class="metric">
      <span class="label">Account Locks (24h)</span>
      <span class="value">{{ account_locks_triggered_24h }}</span>
    </div>
    <div class="metric">
      <span class="label">Persistent Attackers</span>
      <span class="value alert">{{ persistent_attackers_detected_24h }}</span>
    </div>
  </div>
  
  <h3>Top Banned IPs (Hashed)</h3>
  <table>
    <thead>
      <tr>
        <th>IP Hash</th>
        <th>Bans (24h)</th>
        <th>Total Attempts</th>
        <th>Current Status</th>
      </tr>
    </thead>
    <tbody>
      {{#each top_banned_ips}}
      <tr>
        <td><code>{{ ip_hash }}</code></td>
        <td>{{ ban_count }}</td>
        <td>{{ attempt_count }}</td>
        <td>{{ status }}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  
  <h3>Bans Over Time</h3>
  <canvas id="bansChart"></canvas>
</section>
```

**Chart.js Integration:**
```javascript
// Generate time-series chart
const banTimestamps = auditLogs
  .filter(log => log.event === 'IP_BAN_TRIGGERED')
  .map(log => log.ts);

new Chart(ctx, {
  type: 'line',
  data: {
    labels: hourlyBuckets,
    datasets: [{
      label: 'IP Bans',
      data: bansPerHour,
      borderColor: 'rgba(255, 99, 132, 1)',
    }, {
      label: 'Account Locks',
      data: locksPerHour,
      borderColor: 'rgba(255, 206, 86, 1)',
    }]
  }
});
```


### 5.2 Step-by-Step Test Plan

**Test Environment Setup:**
```bash
# Start test instance
NODE_ENV=test npm start

# Set aggressive limits for testing
export IP_RATE_WINDOW_SECONDS=10
export IP_RATE_MAX_ATTEMPTS=3
export ACCOUNT_LOCK_MAX_FAILURES=2
```

---

#### Test 1: IP Rate Limit Triggers Ban
**Objective:** Verify 10 attempts in 30 seconds → 15 min ban

**Steps:**
```bash
# 1. Make 10 rapid login attempts
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -w "\n%{http_code}\n"
  sleep 0.5
done

# Expected: First 9 → 401, 10th → 429
```

**Expected Results:**
- Attempts 1-9: `401 Unauthorized`
- Attempt 10: `429 Too Many Requests`
- Audit log: `IP_BAN_TRIGGERED` event
- Ban duration: 900 seconds

**Verify:**
```bash
# 11th attempt should also be 429
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"other@example.com","password":"wrong"}' \
  -w "\n%{http_code}\n"

# Expected: 429 (banned, even with different username)
```

---

#### Test 2: Ban Expiry Works
**Objective:** Verify ban expires after configured duration

**Steps:**
```bash
# 1. Trigger ban (from Test 1)
# 2. Wait 15 minutes (or 10 seconds if using test config)
sleep 16 # 16 seconds (buffer for test mode)

# 3. Attempt login again
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"correct_password"}'
```

**Expected Result:**
- After expiry: `200 OK` or `401 Unauthorized` (not 429)
- Ban removed from active bans

---

#### Test 3: Allowlist Exemption
**Objective:** Verify allowlisted IPs bypass rate limits

**Steps:**
```bash
# 1. Add your IP to allowlist
export IP_ALLOWLIST=127.0.0.1,::1

# 2. Restart server
npm restart

# 3. Make 20 rapid attempts (2x normal limit)
for i in {1..20}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
```

**Expected Result:**
- All 20 attempts: `401 Unauthorized` (NOT 429)
- No ban triggered
- Audit log: `ALLOWLIST_EXEMPTION` reason

---

#### Test 4: Account Lock (Separate from IP Ban)
**Objective:** Verify per-account locking works independently

**Steps:**
```bash
# 1. Use different IPs for each attempt (simulate distributed attack)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 203.0.113.$i" \
    -d '{"email":"victim@example.com","password":"wrong"}'
  sleep 1
done
```

**Expected Result:**
- Attempts 1-5: `401 Unauthorized` (different IPs, no IP ban)
- Attempt 6: `401 Unauthorized` with account lock indicator
- Next attempt from ANY IP: Same response (account locked)

**Verify:**
```bash
# Try from a different IP
curl -X POST http://localhost:3000/api/auth/login \
  -H "X-Forwarded-For: 192.0.2.99" \
  -d '{"email":"victim@example.com","password":"correct_password"}'

# Expected: Still 401 (account locked)
```

---

#### Test 5: Progressive Escalation
**Objective:** Verify repeated bans increase duration

**Steps:**
```bash
# 1. Trigger 1st ban (15 min)
./trigger_ban.sh

# 2. Wait for expiry
sleep 16

# 3. Trigger 2nd ban (should be 30 min)
./trigger_ban.sh

# 4. Check ban duration in logs
grep "IP_BAN_TRIGGERED" logs.json | jq '.ban_duration_seconds'
```

**Expected Results:**
- 1st ban: 900 seconds (15 min)
- 2nd ban: 1800 seconds (30 min)
- 3rd ban: 3600 seconds (60 min) + HIGH alert to Discord

---

#### Test 6: No Discord Spam (Batching)
**Objective:** Verify low-severity events are batched

**Steps:**
```bash
# 1. Trigger 10 IP bans from different IPs
for i in {1..10}; do
  trigger_ban_from_ip "203.0.113.$i"
done

# 2. Check Discord webhook calls
grep "discord_webhook" logs.json | wc -l
```

**Expected Result:**
- Discord called 0-1 times (batched, not 10 times)
- HIGH severity events: Sent immediately
- LOW severity events: Batched hourly

---

#### Test 7: False Positive Mitigation (Shared IP)
**Objective:** Verify shared IP detection increases thresholds

**Steps:**
```bash
# 1. Simulate 50 unique users from same IP
for i in {1..50}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "X-Forwarded-For: 198.51.100.42" \
    -H "User-Agent: Mozilla/5.0 (Device$i)" \
    -d "{\"email\":\"user$i@school.edu\",\"password\":\"wrong\"}"
  sleep 0.2
done
```

**Expected Result:**
- Shared IP detected (>50 unique usernames)
- Threshold increased from 10 → 50
- No ban triggered (legitimate traffic pattern)
- Log: `SHARED_IP_DETECTED` event

---

#### Test 8: Lockout Abuse Prevention
**Objective:** Verify attacker can't weaponize lockouts

**Steps:**
```bash
# 1. Trigger account lock for victim@example.com
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "X-Forwarded-For: 203.0.113.1" \
    -d '{"email":"victim@example.com","password":"wrong"}'
done

# 2. Try to trigger 3 more lockouts from same IP
for target in user1 user2 user3; do
  for i in {1..6}; do
    curl -X POST http://localhost:3000/api/auth/login \
      -H "X-Forwarded-For: 203.0.113.1" \
      -d "{\"email\":\"$target@example.com\",\"password\":\"wrong\"}"
  done
done
```

**Expected Result:**
- After 3 lockouts from same IP: IP banned (not just accounts)
- Audit log: `LOCKOUT_ABUSE_DETECTED`
- Response: `429 Too Many Requests` (IP level)

---

### 5.3 Automated Test Script

```javascript
// test/bruteForceProtection.test.js
const request = require('supertest');
const app = require('../server');

describe('Brute-Force Protection', () => {
  
  test('IP rate limit triggers ban after threshold', async () => {
    const attempts = [];
    
    // Make 10 attempts
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
      attempts.push(res.status);
    }
    
    // First 9 should be 401, 10th should be 429
    expect(attempts.slice(0, 9)).toEqual(Array(9).fill(401));
    expect(attempts[9]).toBe(429);
  });
  
  test('Ban expires after configured duration', async () => {
    // Trigger ban
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
    }
    
    // Should be banned
    let res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    expect(res.status).toBe(429);
    
    // Wait for expiry (mock time or use test config)
    await new Promise(resolve => setTimeout(resolve, 16000));
    
    // Should no longer be banned
    res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    expect(res.status).not.toBe(429);
  });
  
  test('Allowlist bypasses rate limits', async () => {
    // Add test IP to allowlist (mock env var)
    process.env.IP_ALLOWLIST = '127.0.0.1';
    
    const attempts = [];
    // Make 20 attempts (2x limit)
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
      attempts.push(res.status);
    }
    
    // None should be 429 (all should be 401)
    expect(attempts.every(status => status === 401)).toBe(true);
  });
  
  test('Account lock prevents login from all IPs', async () => {
    // Trigger account lock from multiple IPs
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `203.0.113.${i}`)
        .send({ email: 'victim@test.com', password: 'wrong' });
    }
    
    // Try from different IP
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '192.0.2.99')
      .send({ email: 'victim@test.com', password: 'correct' });
    
    // Should still be locked
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('unavailable');
  });
  
});
```

---

## 6. Security Pitfalls & False Positives

### 6.1 Common Security Pitfalls

#### Pitfall 1: Timing Attacks Leak Account Existence
**Problem:**
```javascript
// BAD: Different response times
if (!userExists(username)) {
  return res.status(401).json({ error: "User not found" }); // Fast
}
if (!passwordMatches(user, password)) {
  return res.status(401).json({ error: "Invalid password" }); // Slow (bcrypt)
}
```

**Solution:**
```javascript
// GOOD: Always run full password check
const user = await getUserByEmail(email);
const dummyHash = '$2b$10$...'; // Pre-generated bcrypt hash

if (!user) {
  // Still run bcrypt to maintain constant timing
  await bcrypt.compare(password, dummyHash);
  return res.status(401).json({ error: "Invalid credentials" });
}

const matches = await bcrypt.compare(password, user.password_hash);
if (!matches) {
  return res.status(401).json({ error: "Invalid credentials" });
}
```

#### Pitfall 2: Forgetting to Clear Success Counters
**Problem:** User fails 4 times, succeeds, then fails 2 more → Locked (should reset)

**Solution:**
```javascript
// On successful login
async function onSuccessfulLogin(username, ip) {
  await accountFailureCounter.clear(username);
  await progressiveDelayTracker.clear(ip);
  
  // Log success event
  auditLog('AUTH_SUCCESS', { username, ip });
}
```

#### Pitfall 3: Not Sanitizing IP Headers
**Problem:** Attacker spoofs `X-Forwarded-For` to bypass rate limits

**Solution:**
```javascript
// Only trust X-Forwarded-For if behind trusted proxy
if (process.env.TRUST_PROXY !== 'true') {
  // Ignore X-Forwarded-For, use socket IP only
  return req.connection.remoteAddress;
}
```

#### Pitfall 4: Leaking Ban Expiry Time
**Problem:** Attacker queries endpoint every second to learn exact expiry (timing oracle)

**Solution:**
```javascript
// Don't send exact time remaining
res.status(429).json({
  error: "Too many requests",
  retry_after: 900, // Always send max duration, not actual remaining
});
```


### 6.2 False Positive Scenarios

| Scenario | Risk Level | Mitigation |
|----------|------------|------------|
| Legitimate user forgot password | MEDIUM | Allow 5 failures before lock |
| Office/School shared IP | HIGH | Detect shared IPs, increase threshold |
| Mobile carrier NAT | HIGH | Same as above |
| VPN users (IP changes mid-session) | LOW | Track by (User + IP) not just IP |
| Pentester with permission | LOW | Add to allowlist temporarily |
| Password manager auto-fill bug | LOW | Count attempts over 30 sec window |

**Monitoring False Positives:**
```javascript
// Track "success after near-failure" events
function onAuthSuccess(username, ip) {
  const recentFailures = getFailureCountLast5Min(username, ip);
  
  if (recentFailures >= 3) {
    // User was close to being locked but succeeded
    auditLog('SUCCESS_AFTER_NEAR_FAILURE', {
      username_hash: hashUsername(username),
      ip_hash: hashIp(ip),
      failure_count_before_success: recentFailures,
      severity: 'LOW',
    });
  }
}
```

---

## 7. Fly.io Specific Considerations

### 7.1 Trust Proxy Configuration
```javascript
// server.js
if (process.env.FLY_APP_NAME) {
  // Running on Fly.io
  app.set('trust proxy', true);
  
  console.log('Fly.io detected: Trusting proxy headers');
}
```

### 7.2 Fly-Client-IP Header
```javascript
function getClientIp(req) {
  // Fly.io provides this header (most reliable)
  if (req.headers['fly-client-ip']) {
    return req.headers['fly-client-ip'];
  }
  
  // Fallback to standard headers
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
}
```

### 7.3 Fly.io Redis Integration
```bash
# Create Redis instance
fly redis create

# Connect URL: redis://default:<password>@<hostname>:6379
# Auto-set in FLY_REDIS_CACHE_URL env var
```

```javascript
// Detect and use Fly Redis if available
if (process.env.FLY_REDIS_CACHE_URL) {
  const redis = new Redis(process.env.FLY_REDIS_CACHE_URL);
  rateLimiter = new RedisRateLimiter(redis);
} else {
  rateLimiter = new InMemoryRateLimiter();
}
```

---

## 8. Prioritized Implementation Order

### Phase 1: Core Protection (Week 1) ⭐ HIGHEST PRIORITY

**Goal:** Stop 95% of attacks with minimal code

1. ✅ **Per-IP sliding window rate limiter**
   - File: `middleware/rateLimiter.js`
   - Config: 10 attempts / 30 seconds
   - Storage: In-memory Map
   - Integration: Apply to all `/api/auth/*` endpoints
   - **Time estimate:** 4 hours

2. ✅ **IP ban system with expiry**
   - File: `middleware/banManager.js`
   - Ban duration: 15 minutes
   - Auto-cleanup expired bans
   - **Time estimate:** 3 hours

3. ✅ **Audit logging for bans**
   - Extend existing auditService.js
   - Log: `IP_BAN_TRIGGERED`, `IP_BAN_BLOCKED`
   - JSON structured logs
   - **Time estimate:** 2 hours

4. ✅ **Basic Discord alerting**
   - Use existing notifier.py
   - Alert on: 1st ban (low priority)
   - **Time estimate:** 1 hour

**Deliverable:** Basic brute-force protection operational

---

### Phase 2: Account Protection (Week 2)

**Goal:** Prevent credential stuffing

5. ✅ **Per-account failure tracking**
   - File: `middleware/accountLocker.js`
   - Config: 5 failures / 5 minutes
   - Track by username + failure count
   - **Time estimate:** 4 hours

6. ✅ **Account lock mechanism**
   - Lock duration: 10 minutes
   - Clear on successful login
   - Don't leak account existence
   - **Time estimate:** 3 hours

7. ✅ **Alternative unlock path**
   - Email verification to unlock early
   - Admin manual unlock endpoint
   - **Time estimate:** 4 hours (requires email service)

**Deliverable:** Account-level protection active

---

### Phase 3: Escalation & Monitoring (Week 3)

**Goal:** Detect persistent attackers

8. ✅ **Ban history tracking**
   - Track bans per IP over 24 hours
   - Store in memory (or Redis if available)
   - **Time estimate:** 2 hours

9. ✅ **Progressive escalation**
   - Escalate ban duration exponentially
   - Cap at 24 hours
   - **Time estimate:** 3 hours

10. ✅ **HIGH severity Discord alerts**
    - Trigger on 3+ bans in 24h
    - Include IP hash, ban count, attempt count
    - Real-time alert (not batched)
    - **Time estimate:** 2 hours

11. ✅ **Metrics dashboard**
    - Add to existing report.html
    - Show: Active bans, locks, top offenders
    - Chart: Bans over time
    - **Time estimate:** 4 hours

**Deliverable:** Full monitoring and alerting

---

### Phase 4: Advanced Features (Week 4+)

**Goal:** Minimize false positives, handle edge cases

12. ⚠️ **Shared IP detection**
    - Heuristics: Unique usernames, user agents
    - Dynamically increase thresholds
    - **Time estimate:** 6 hours

13. ⚠️ **Allowlist management**
    - ENV variable support
    - Admin UI to add/remove
    - **Time estimate:** 3 hours

14. ⚠️ **Lockout abuse prevention**
    - Rate limit lockout triggers per IP
    - Alert on suspicious lockout patterns
    - **Time estimate:** 4 hours

15. ⚠️ **Redis migration (optional)**
    - Only if multi-instance needed
    - Maintains same API as in-memory
    - **Time estimate:** 6 hours

16. ⚠️ **CAPTCHA integration (optional)**
    - Trigger for shared IPs or after multiple failures
    - Use hCaptcha or reCAPTCHA
    - **Time estimate:** 8 hours

**Deliverable:** Production-hardened system

---

## 9. Configuration Reference

### Environment Variables

```bash
# Rate Limiting
IP_RATE_WINDOW_SECONDS=30           # Sliding window duration
IP_RATE_MAX_ATTEMPTS=10             # Max attempts before ban
IP_BAN_DURATION_SECONDS=900         # 15 minutes

ACCOUNT_LOCK_WINDOW_SECONDS=300     # 5 minutes
ACCOUNT_LOCK_MAX_FAILURES=5         # Failures before lock
ACCOUNT_LOCK_DURATION_SECONDS=600   # 10 minutes

# Escalation
ESCALATION_WINDOW_SECONDS=86400     # 24 hours
ESCALATION_BAN_THRESHOLD=3          # Bans before escalation
ESCALATION_MULTIPLIER=2             # Exponential backoff multiplier
MAX_BAN_DURATION_SECONDS=86400      # Cap at 24 hours

# Allowlist
IP_ALLOWLIST=192.168.1.100,10.0.0.5 # Comma-separated IPs

# Shared IP Detection
SHARED_IP_USERNAME_THRESHOLD=50     # Unique usernames to detect shared IP
SHARED_IP_MULTIPLIER=5              # Threshold multiplier for shared IPs

# Discord Notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_RATE_LIMIT_HIGH_PER_HOUR=20

# Logging
STDOUT_AUTH_EVENTS=true             # Enable structured logging
LOG_PLAINTEXT_USERNAMES=false       # Hash usernames in logs (privacy)

# Storage
REDIS_URL=redis://localhost:6379    # Optional: Use Redis for multi-instance
USE_REDIS=false                     # Toggle Redis vs in-memory

# Proxy
TRUST_PROXY=true                    # Trust X-Forwarded-For (Fly.io)
FLY_APP_NAME=security-plus-app      # Auto-detected on Fly.io
```

### Default Thresholds Summary

| Protection | Window | Threshold | Ban/Lock Duration |
|------------|--------|-----------|-------------------|
| IP Rate Limit | 30 sec | 10 attempts | 15 min |
| Account Lock | 5 min | 5 failures | 10 min |
| Escalation (2nd ban) | 24 hours | 2nd trigger | 30 min |
| Escalation (3rd ban) | 24 hours | 3rd trigger | 60 min + Alert |

---

## 10. Security Checklist

Before going to production, verify:

- [ ] `JWT_SECRET` is strong random value (not default)
- [ ] `AUTH_LOG_SALT` is set for IP/username hashing
- [ ] `TRUST_PROXY=true` if behind Fly.io/proxy
- [ ] `LOG_PLAINTEXT_USERNAMES=false` in production (privacy)
- [ ] Tested rate limits with automated script
- [ ] Verified ban expiry works correctly
- [ ] Allowlist contains only trusted IPs
- [ ] Discord webhook URL is valid
- [ ] Audit logs are being collected and rotated
- [ ] Memory usage monitored (no leaks)
- [ ] Tested with shared IP scenario
- [ ] Verified account lockout abuse prevention
- [ ] Timing attack mitigation in auth logic
- [ ] Error messages don't leak sensitive info
- [ ] Monitoring dashboard is accessible to admins
- [ ] Test coverage >80% for rate limiting logic

---

## 11. Incident Response Playbook

### Scenario 1: Massive Attack (1000+ IPs)
**Detection:** >100 bans/hour, Discord alerts flooding

**Response:**
1. Check if legitimate spike (product launch, marketing campaign)
2. If attack: Enable emergency mode
   ```bash
   # Reduce thresholds temporarily
   export IP_RATE_MAX_ATTEMPTS=3
   export IP_BAN_DURATION_SECONDS=3600
   export ESCALATION_BAN_THRESHOLD=1
   ```
3. Collect top 20 offending IP hashes
4. Consider temporary allowlist-only mode
5. After attack subsides: Restore normal thresholds

### Scenario 2: High False Positive Rate
**Detection:** >10 "success after near-failure" events/hour

**Response:**
1. Check if shared IP environment (school, office)
2. Identify IP pattern via logs
3. Add to allowlist OR increase thresholds for that IP range
4. Review threshold settings (may be too aggressive)

### Scenario 3: Attacker Bypassing Bans
**Detection:** Same IP hash keeps attacking despite bans

**Response:**
1. Verify ban logic is working (check expiry)
2. Check if IP is rotating (BGP hijacking, ToR)
3. Implement device fingerprinting (TLS, User-Agent)
4. Consider CAPTCHA requirement
5. Manual permanent ban if persistent

---

## Summary

This design provides **defense-in-depth** against brute-force attacks:

1. **Layer 1: IP Rate Limiting** - Stops burst attacks
2. **Layer 2: Account Locking** - Prevents credential stuffing
3. **Layer 3: Progressive Escalation** - Detects persistent attackers
4. **Layer 4: Allowlist** - Protects legitimate high-frequency users

**Key Strengths:**
- Minimal false positives (shared IP detection, success-based reset)
- Abuse-resistant (can't weaponize lockouts)
- Observable (comprehensive logging, alerting, dashboards)
- Scalable (in-memory → Redis upgrade path)
- Proxy-safe (Fly.io compatible)

**Next Steps:**
1. Implement Phase 1 (core protection) first
2. Test thoroughly with provided test plan
3. Monitor metrics for 1 week to tune thresholds
4. Roll out Phase 2-4 incrementally

**Questions? Security concerns?** Review Section 6 (Security Pitfalls) and run full test suite before production.
