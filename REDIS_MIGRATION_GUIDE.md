# Redis Migration Guide

## Phase 4: Scaling to Multiple Instances

This guide explains how to migrate from in-memory brute-force protection to Redis-backed protection for multi-instance deployments.

## Why Redis?

**In-Memory (Default)**:
- ✅ Simple, no external dependencies
- ✅ Fast (local memory access)
- ✅ Perfect for single-instance deployments
- ❌ Data lost on restart
- ❌ Not shared across multiple app instances

**Redis-Backed (Phase 4)**:
- ✅ Shared state across multiple instances
- ✅ Persistent (survives restarts)
- ✅ Atomic operations (no race conditions)
- ✅ Auto-expiry with TTL
- ❌ Additional latency (~1-5ms)
- ❌ Requires Redis server

## When to Migrate

Migrate to Redis when:
- Scaling horizontally (2+ app instances)
- Deploying to Fly.io with autoscaling
- Need persistent ban state across restarts
- High-availability requirements

Stay with in-memory when:
- Running single instance
- Development/testing environment
- Low traffic (<1000 req/min)

---

## Migration Steps

### 1. Install Redis Dependency

```bash
npm install ioredis
```

Already included in `package.json` if you cloned this repo.

### 2. Set Up Redis

#### Option A: Fly.io (Production)

```bash
# Create Redis instance
fly redis create my-app-redis

# Attach to your app (sets REDIS_URL automatically)
fly redis attach my-app-redis

# Verify connection
fly ssh console
echo $REDIS_URL
```

#### Option B: Local Development

```bash
# Using Docker
docker run -d -p 6379:6379 --name redis redis:alpine

# Or install Redis locally
# macOS: brew install redis && redis-server
# Ubuntu: sudo apt install redis-server
# Windows: https://redis.io/download
```

### 3. Enable Redis in Environment

```bash
# Update .env
USE_REDIS=true
REDIS_URL=redis://localhost:6379  # Or auto-set by Fly.io
```

### 4. Update Server Imports

**Current (in-memory):**
```javascript
import {
  ipBanMiddleware,
  authRateLimitMiddleware,
  accountLockMiddleware,
  getBruteForceStats,
  getTopBannedIps
} from "./bruteForceProtection.js";
```

**After Redis migration:**
```javascript
const USE_REDIS = process.env.USE_REDIS === 'true';
const bfModule = USE_REDIS 
  ? await import('./bruteForceProtectionRedis.js')
  : await import('./bruteForceProtection.js');

const {
  ipBanMiddleware,
  authRateLimitMiddleware,
  accountLockMiddleware,
  getBruteForceStats,
  getTopBannedIps
} = bfModule;
```

### 5. Test Redis Connection

```bash
# Start server
npm start

# Should see in logs:
# [Redis] Connected successfully
# [Redis] Ready to accept commands
```

### 6. Deploy to Fly.io with Scaling

```toml
# fly.toml
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

# Scale to 2 instances minimum
[[services]]
  http_checks = []
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"
  script_checks = []
  
  [services.concurrency]
    hard_limit = 250
    soft_limit = 200
    type = "connections"

# Autoscaling rules
[http_service.concurrency]
  type = "connections"
  hard_limit = 1000
  soft_limit = 800

[[vm]]
  size = "shared-cpu-1x"
  memory = 256
```

Deploy with scaling:
```bash
# Scale to 2 instances
fly scale count 2

# Or enable autoscaling
fly autoscale set min=2 max=10

# Deploy
fly deploy
```

---

## Data Structure in Redis

### 1. Rate Limiting
**Key**: `bf:rate:<ip_hash>`  
**Type**: Sorted Set (ZSET)  
**Value**: Timestamps of attempts  
**TTL**: 2x window duration (auto-cleanup)

```redis
ZADD bf:rate:abc123... 1708012345678 1708012345678
ZCOUNT bf:rate:abc123... 1708012315678 +inf
```

### 2. IP Bans
**Key**: `bf:ban:<ip_hash>`  
**Type**: String (JSON)  
**TTL**: Ban duration (auto-expire)

```json
{
  "ip_hash": "abc123...",
  "reason": "RATE_LIMIT_EXCEEDED",
  "attemptCount": 12,
  "durationSeconds": 900,
  "expiresAt": 1708013245678,
  "banCount24h": 2,
  "escalated": false,
  "severity": "MEDIUM"
}
```

### 3. Ban History (24h tracking)
**Key**: `bf:history:<ip_hash>`  
**Type**: Sorted Set  
**TTL**: 24 hours

```redis
ZADD bf:history:abc123... 1708012345678 1708012345678
```

### 4. Account Locks
**Key**: `bf:lock:<username>`  
**Type**: String (JSON)  
**TTL**: Lock duration

```json
{
  "username": "user@example.com",
  "triggeredByIp": "def456...",
  "failureCount": 5,
  "expiresAt": 1708012945678,
  "createdAt": 1708012345678
}
```

### 5. Auth Failures
**Key**: `bf:failures:<username>`  
**Type**: Sorted Set  
**Value**: `timestamp:ip_hash`  
**TTL**: 2x window duration

```redis
ZADD bf:failures:user@example.com 1708012345678 "1708012345678:abc123..."
```

---

## Performance Comparison

### In-Memory
- **Latency**: 0.1-0.5ms (local memory)
- **Throughput**: 50,000+ ops/sec
- **Memory**: 10-50 MB (10k tracked IPs)

### Redis (Local)
- **Latency**: 1-2ms (local Redis)
- **Throughput**: 10,000+ ops/sec
- **Memory**: 20-100 MB (Redis overhead)

### Redis (Fly.io)
- **Latency**: 2-5ms (network hop)
- **Throughput**: 5,000+ ops/sec
- **Memory**: Same as local

**Recommendation**: Redis adds negligible overhead (<5ms) for the benefit of multi-instance coordination.

---

## Monitoring Redis

### Check Connection
```bash
fly redis connect
# Or locally:
redis-cli ping
```

### Inspect Keys
```bash
redis-cli
> KEYS bf:*
> GET bf:ban:abc123...
> ZRANGE bf:rate:abc123... 0 -1 WITHSCORES
> TTL bf:ban:abc123...
```

### Monitor Operations
```bash
redis-cli monitor
```

### Check Memory Usage
```bash
redis-cli INFO memory
```

---

## Rollback to In-Memory

If Redis causes issues, instantly rollback:

```bash
# Update .env
USE_REDIS=false

# Restart app
fly deploy
```

No code changes needed - the app dynamically loads the correct module.

---

## Cost Estimate (Fly.io)

**Redis Upstash (Managed)**:
- 100 MB: $0/month (free tier)
- 1 GB: $3/month
- 10 GB: $30/month

**App Scaling**:
- 1 instance: In-memory (free Redis)
- 2-5 instances: Redis recommended ($0-3/month)
- 10+ instances: Redis required ($3-10/month)

**Example**:
- 3 app instances × $5/mo = $15/mo
- Redis 1GB = $3/mo
- **Total**: $18/mo for high-availability setup

---

## Troubleshooting

### Redis Connection Errors

**Problem**: `[Redis] Connection error: ECONNREFUSED`

**Solution**:
```bash
# Check Redis is running
docker ps | grep redis
# Or
redis-cli ping

# Check REDIS_URL
echo $REDIS_URL

# Test connection
redis-cli -u $REDIS_URL ping
```

### Slow Response Times

**Problem**: API latency increased after Redis migration

**Solution**:
1. Check Redis latency: `redis-cli --latency`
2. Ensure Redis is in same region as app
3. Enable Redis pipelining (already implemented)
4. Increase Redis memory: `fly redis update --plan performance`

### Memory Leaks

**Problem**: Redis memory growing indefinitely

**Solution**:
```bash
# Check key count
redis-cli DBSIZE

# Check TTLs are set
redis-cli KEYS bf:* | xargs -I{} redis-cli TTL {}

# Manually clean old keys (emergency)
redis-cli KEYS "bf:rate:*" | xargs redis-cli DEL
```

All keys have automatic TTL expiry, so this shouldn't happen.

### Bans Not Syncing

**Problem**: Ban on one instance doesn't affect other instances

**Solution**:
1. Verify `USE_REDIS=true` on all instances
2. Check all instances use same `REDIS_URL`
3. Test: `redis-cli KEYS bf:ban:*` (should show bans)
4. Check Redis key prefix matches: `bf:`

---

## Best Practices

### 1. Graceful Degradation
```javascript
// Redis errors don't crash the app
try {
  await banManager.isBanned(ip);
} catch (err) {
  console.error('[Redis BF] Error:', err);
  // Fail open - allow request
  return next();
}
```

### 2. Connection Pooling
```javascript
// ioredis automatically pools connections
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});
```

### 3. Atomic Operations
```javascript
// Use pipelining for multiple operations
const pipeline = redis.pipeline();
pipeline.zremrangebyscore(key, 0, cutoff);
pipeline.zadd(key, now, now);
pipeline.zcount(key, cutoff, '+inf');
const results = await pipeline.exec();
```

### 4. TTL Everything
```javascript
// All Redis keys have automatic expiry
await redis.setex(key, ttlSeconds, value);
await redis.expire(key, ttlSeconds);
```

---

## Testing

### Unit Tests (Mock Redis)
```javascript
import { jest } from '@jest/globals';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    setex: jest.fn(),
    zadd: jest.fn(),
    // ...
  }));
});
```

### Integration Tests (Real Redis)
```bash
# Start test Redis
docker run -d -p 6380:6379 --name redis-test redis:alpine

# Run tests
REDIS_URL=redis://localhost:6380 npm test

# Cleanup
docker stop redis-test && docker rm redis-test
```

### Load Tests
```bash
# Install k6
brew install k6  # or: https://k6.io/docs/get-started/installation/

# Run load test
k6 run loadtest.js
```

Example `loadtest.js`:
```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up
    { duration: '1m', target: 100 },  // Sustained load
    { duration: '30s', target: 0 },   // Ramp down
  ],
};

export default function () {
  const res = http.post('http://localhost:3000/api/auth/login', {
    email: 'test@example.com',
    password: 'wrong',
  });
  
  check(res, { 'status 401 or 429': (r) => r.status === 401 || r.status === 429 });
}
```

Expected results:
- 95% requests < 50ms (in-memory) or < 60ms (Redis)
- 100% requests within rate limits handled correctly
- Ban state consistent across all virtual users

---

## Migration Checklist

- [ ] Redis installed/deployed
- [ ] `USE_REDIS=true` in .env
- [ ] `REDIS_URL` configured
- [ ] Server imports updated (dynamic module loading)
- [ ] npm install (ioredis added)
- [ ] Test locally: npm start
- [ ] Verify Redis connection in logs
- [ ] Test ban functionality: curl POST /api/auth/login (12 times)
- [ ] Check Redis: `redis-cli KEYS bf:ban:*`
- [ ] Deploy to Fly.io: fly deploy
- [ ] Scale instances: fly scale count 2
- [ ] Monitor logs: fly logs
- [ ] Test cross-instance bans
- [ ] Set up monitoring alerts
- [ ] Document REDIS_URL in team wiki
- [ ] Update runbook for Redis outages

**Result**: Multi-instance brute-force protection with shared state! 🚀

---

## Support

Questions? Check:
1. Fly.io Redis docs: https://fly.io/docs/reference/redis/
2. ioredis docs: https://github.com/redis/ioredis
3. Redis commands: https://redis.io/commands/

Need help? Open an issue or contact your team lead.
