/**
 * Redis-Backed Brute-Force Protection
 * 
 * For multi-instance deployments, this module provides Redis-backed
 * implementations of rate limiting, IP banning, and account locking.
 * 
 * Usage:
 * 1. Set USE_REDIS=true in .env
 * 2. Set REDIS_URL=redis://localhost:6379 (or your Redis connection string)
 * 3. Deploy to Fly.io: fly redis create
 * 4. Attach to app: fly redis attach <redis-name>
 */

import Redis from 'ioredis';
import { logAudit } from './auditService.js';
import { sendAlert } from './discordNotifier.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Redis Connection
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX || 'bf:',
  
  // Per-IP Rate Limiting
  IP_RATE_WINDOW_SECONDS: parseInt(process.env.IP_RATE_WINDOW_SECONDS || '30'),
  IP_RATE_MAX_ATTEMPTS: parseInt(process.env.IP_RATE_MAX_ATTEMPTS || '10'),
  IP_BAN_DURATION_SECONDS: parseInt(process.env.IP_BAN_DURATION_SECONDS || '900'),
  
  // Per-Account Locking
  ACCOUNT_LOCK_WINDOW_SECONDS: parseInt(process.env.ACCOUNT_LOCK_WINDOW_SECONDS || '300'),
  ACCOUNT_LOCK_MAX_FAILURES: parseInt(process.env.ACCOUNT_LOCK_MAX_FAILURES || '5'),
  ACCOUNT_LOCK_DURATION_SECONDS: parseInt(process.env.ACCOUNT_LOCK_DURATION_SECONDS || '600'),
  
  // Progressive Escalation
  ESCALATION_WINDOW_SECONDS: parseInt(process.env.ESCALATION_WINDOW_SECONDS || '86400'),
  ESCALATION_BAN_THRESHOLD: parseInt(process.env.ESCALATION_BAN_THRESHOLD || '3'),
  ESCALATION_MULTIPLIER: parseInt(process.env.ESCALATION_MULTIPLIER || '2'),
  MAX_BAN_DURATION_SECONDS: parseInt(process.env.MAX_BAN_DURATION_SECONDS || '86400'),
  
  // Allowlist
  IP_ALLOWLIST: process.env.IP_ALLOWLIST ? process.env.IP_ALLOWLIST.split(',').map(ip => ip.trim()) : [],
};

// ============================================================================
// REDIS CLIENT
// ============================================================================

let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(CONFIG.REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`[Redis] Reconnecting... attempt ${times}, delay ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });

    redisClient.on('ready', () => {
      console.log('[Redis] Ready to accept commands');
    });
  }

  return redisClient;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

import crypto from 'crypto';

function getClientIp(req) {
  const flyClientIp = req.headers['fly-client-ip'];
  if (flyClientIp) return flyClientIp;
  
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function hashIp(ip) {
  const salt = process.env.AUTH_LOG_SALT || 'default-salt-change-in-production';
  return crypto.createHash('sha256').update(salt + ip).digest('hex');
}

// ============================================================================
// REDIS-BACKED RATE LIMITER
// ============================================================================

class RedisRateLimiter {
  constructor(redis, windowSeconds, maxAttempts) {
    this.redis = redis;
    this.windowSeconds = windowSeconds;
    this.maxAttempts = maxAttempts;
  }

  /**
   * Record an attempt using Redis ZADD (sorted set with timestamps)
   * Returns the current count within the window
   */
  async recordAttempt(key) {
    const redis = this.redis;
    const keyName = `${CONFIG.REDIS_KEY_PREFIX}rate:${key}`;
    const now = Date.now();
    const cutoff = now - (this.windowSeconds * 1000);

    // Remove old entries and add new one atomically
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(keyName, 0, cutoff);
    pipeline.zadd(keyName, now, now);
    pipeline.zcount(keyName, cutoff, '+inf');
    pipeline.expire(keyName, this.windowSeconds * 2); // Auto-expire

    const results = await pipeline.exec();
    const count = results[2][1]; // zcount result

    return count;
  }

  async getCount(key) {
    const keyName = `${CONFIG.REDIS_KEY_PREFIX}rate:${key}`;
    const now = Date.now();
    const cutoff = now - (this.windowSeconds * 1000);

    const count = await this.redis.zcount(keyName, cutoff, '+inf');
    return count;
  }

  async clear(key) {
    const keyName = `${CONFIG.REDIS_KEY_PREFIX}rate:${key}`;
    await this.redis.del(keyName);
  }
}

// ============================================================================
// REDIS-BACKED BAN MANAGER
// ============================================================================

class RedisBanManager {
  constructor(redis) {
    this.redis = redis;
  }

  async isBanned(ip) {
    const keyName = `${CONFIG.REDIS_KEY_PREFIX}ban:${hashIp(ip)}`;
    const ttl = await this.redis.ttl(keyName);
    return ttl > 0;
  }

  async getBan(ip) {
    const keyName = `${CONFIG.REDIS_KEY_PREFIX}ban:${hashIp(ip)}`;
    const data = await this.redis.get(keyName);
    
    if (!data) return null;
    
    return JSON.parse(data);
  }

  async addBan(ip, reason, attemptCount, req) {
    const ipHash = hashIp(ip);
    const now = Date.now();
    
    // Get 24h ban history
    const banCount24h = await this.getBanCount24h(ip);
    
    // Calculate escalation
    let escalatedDuration = CONFIG.IP_BAN_DURATION_SECONDS;
    let escalated = false;
    
    if (banCount24h >= CONFIG.ESCALATION_BAN_THRESHOLD) {
      const escalationLevel = banCount24h - CONFIG.ESCALATION_BAN_THRESHOLD + 1;
      escalatedDuration = Math.min(
        CONFIG.IP_BAN_DURATION_SECONDS * Math.pow(CONFIG.ESCALATION_MULTIPLIER, escalationLevel),
        CONFIG.MAX_BAN_DURATION_SECONDS
      );
      escalated = true;
    }
    
    const expiresAt = now + (escalatedDuration * 1000);
    const severity = banCount24h >= CONFIG.ESCALATION_BAN_THRESHOLD ? 'HIGH' : 'MEDIUM';
    
    const banState = {
      ip_hash: ipHash,
      reason,
      attemptCount,
      durationSeconds: escalatedDuration,
      expiresAt,
      banCount24h,
      escalated,
      severity,
      createdAt: now,
    };
    
    // Store ban with TTL
    const banKey = `${CONFIG.REDIS_KEY_PREFIX}ban:${ipHash}`;
    await this.redis.setex(banKey, escalatedDuration, JSON.stringify(banState));
    
    // Track in 24h history (sorted set)
    const historyKey = `${CONFIG.REDIS_KEY_PREFIX}history:${ipHash}`;
    await this.redis.zadd(historyKey, now, now);
    await this.redis.expire(historyKey, CONFIG.ESCALATION_WINDOW_SECONDS);
    
    // Log audit event
    logAudit('IP_BAN_TRIGGERED', null, {
      reason,
      window_seconds: CONFIG.IP_RATE_WINDOW_SECONDS,
      attempt_count: attemptCount,
      threshold: CONFIG.IP_RATE_MAX_ATTEMPTS,
      ban_duration_seconds: escalatedDuration,
      ban_expires_at: new Date(expiresAt).toISOString(),
      ban_count_24h: banCount24h,
      escalated,
      severity,
    }, req);
    
    // Send Discord alert
    await sendAlert({
      type: 'IP_BAN',
      severity: severity,
      ip_hash: ipHash,
      ban_duration_seconds: escalatedDuration,
      ban_count_24h: banCount24h,
      attempt_count: attemptCount,
      threshold: CONFIG.IP_RATE_MAX_ATTEMPTS,
      timestamp: new Date().toISOString(),
    }).catch(err => console.error('[Redis BF] Discord alert failed:', err.message));
    
    console.log(`[Redis BF] IP banned: ${ipHash} for ${escalatedDuration}s (${banCount24h} bans in 24h)`);
    
    // Send escalation alert if needed
    if (banCount24h >= CONFIG.ESCALATION_BAN_THRESHOLD) {
      await this.sendEscalationAlert(ip, banState, req);
    }
    
    return banState;
  }

  async getBanCount24h(ip) {
    const ipHash = hashIp(ip);
    const historyKey = `${CONFIG.REDIS_KEY_PREFIX}history:${ipHash}`;
    const cutoff = Date.now() - (CONFIG.ESCALATION_WINDOW_SECONDS * 1000);
    
    const count = await this.redis.zcount(historyKey, cutoff, '+inf');
    return count;
  }

  async sendEscalationAlert(ip, banState, req) {
    const alertData = {
      event: 'PERSISTENT_ATTACKER_DETECTED',
      severity: 'HIGH',
      ip_hash: banState.ip_hash,
      ban_count_24h: banState.banCount24h,
      current_ban_duration_seconds: banState.durationSeconds,
      total_attempts: banState.attemptCount,
      timestamp: new Date().toISOString(),
      action_required: 'Manual review recommended',
    };
    
    logAudit('PERSISTENT_ATTACKER_DETECTED', null, alertData, req);
    
    await sendAlert({
      type: 'PERSISTENT_ATTACKER',
      severity: 'HIGH',
      ip_hash: banState.ip_hash,
      ban_count_24h: banState.banCount24h,
      current_ban_duration_seconds: banState.durationSeconds,
      total_attempts: banState.attemptCount,
      timestamp: new Date().toISOString(),
      action_required: 'Manual review recommended',
    }).catch(err => console.error('[Redis BF] Discord alert failed:', err.message));
    
    console.log(`[Redis BF] 🚨 PERSISTENT ATTACKER: ${banState.ip_hash} (${banState.banCount24h} bans)`);
  }

  async getStats() {
    // Get all active bans
    const keys = await this.redis.keys(`${CONFIG.REDIS_KEY_PREFIX}ban:*`);
    const activeBans = [];
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        activeBans.push(JSON.parse(data));
      }
    }
    
    const escalatedBans = activeBans.filter(ban => ban.escalated);
    
    return {
      active_bans: activeBans.length,
      escalated_bans: escalatedBans.length,
      tracked_ban_history: keys.length,
    };
  }
}

// ============================================================================
// REDIS-BACKED ACCOUNT LOCKER
// ============================================================================

class RedisAccountLocker {
  constructor(redis) {
    this.redis = redis;
  }

  async isLocked(username) {
    const keyName = `${CONFIG.REDIS_KEY_PREFIX}lock:${username}`;
    const ttl = await this.redis.ttl(keyName);
    return ttl > 0;
  }

  async recordFailure(username, ip, req) {
    const failureKey = `${CONFIG.REDIS_KEY_PREFIX}failures:${username}`;
    const now = Date.now();
    const cutoff = now - (CONFIG.ACCOUNT_LOCK_WINDOW_SECONDS * 1000);
    
    // Add failure timestamp
    await this.redis.zadd(failureKey, now, `${now}:${ip}`);
    await this.redis.expire(failureKey, CONFIG.ACCOUNT_LOCK_WINDOW_SECONDS * 2);
    
    // Remove old entries
    await this.redis.zremrangebyscore(failureKey, 0, cutoff);
    
    // Count failures
    const failureCount = await this.redis.zcount(failureKey, cutoff, '+inf');
    
    if (failureCount >= CONFIG.ACCOUNT_LOCK_MAX_FAILURES) {
      return await this.lockAccount(username, ip, failureCount, req);
    }
    
    return { locked: false, failureCount };
  }

  async lockAccount(username, ip, failureCount, req) {
    const lockKey = `${CONFIG.REDIS_KEY_PREFIX}lock:${username}`;
    const now = Date.now();
    const expiresAt = now + (CONFIG.ACCOUNT_LOCK_DURATION_SECONDS * 1000);
    
    const lockState = {
      username,
      triggeredByIp: hashIp(ip),
      failureCount,
      expiresAt,
      createdAt: now,
    };
    
    await this.redis.setex(lockKey, CONFIG.ACCOUNT_LOCK_DURATION_SECONDS, JSON.stringify(lockState));
    
    // Track lockout trigger by IP
    const triggerKey = `${CONFIG.REDIS_KEY_PREFIX}triggers:${hashIp(ip)}`;
    await this.redis.zadd(triggerKey, now, now);
    await this.redis.expire(triggerKey, 3600);
    
    // Log audit event
    logAudit('ACCOUNT_LOCKED', null, {
      reason: 'MAX_FAILURES_EXCEEDED',
      failure_count: failureCount,
      threshold: CONFIG.ACCOUNT_LOCK_MAX_FAILURES,
      lock_duration_seconds: CONFIG.ACCOUNT_LOCK_DURATION_SECONDS,
      lock_expires_at: new Date(expiresAt).toISOString(),
    }, req);
    
    // Send Discord alert
    await sendAlert({
      type: 'ACCOUNT_LOCKED',
      severity: 'MEDIUM',
      username: username,
      failure_count: failureCount,
      threshold: CONFIG.ACCOUNT_LOCK_MAX_FAILURES,
      lock_duration_seconds: CONFIG.ACCOUNT_LOCK_DURATION_SECONDS,
      timestamp: new Date().toISOString(),
    }).catch(err => console.error('[Redis BF] Discord alert failed:', err.message));
    
    console.log(`[Redis BF] Account locked: ${username} (${failureCount} failures)`);
    
    return { locked: true, lockState };
  }

  async recordSuccess(username) {
    const failureKey = `${CONFIG.REDIS_KEY_PREFIX}failures:${username}`;
    await this.redis.del(failureKey);
  }

  async getStats() {
    const lockKeys = await this.redis.keys(`${CONFIG.REDIS_KEY_PREFIX}lock:*`);
    const failureKeys = await this.redis.keys(`${CONFIG.REDIS_KEY_PREFIX}failures:*`);
    
    return {
      active_locks: lockKeys.length,
      tracked_failures: failureKeys.length,
    };
  }
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

const redis = getRedisClient();
const ipRateLimiter = new RedisRateLimiter(redis, CONFIG.IP_RATE_WINDOW_SECONDS, CONFIG.IP_RATE_MAX_ATTEMPTS);
const banManager = new RedisBanManager(redis);
const accountLocker = new RedisAccountLocker(redis);

/**
 * IP Ban Middleware - Blocks banned IPs immediately
 */
export async function ipBanMiddleware(req, res, next) {
  try {
    const ip = getClientIp(req);
    
    // Check allowlist
    if (CONFIG.IP_ALLOWLIST.includes(ip)) {
      return next();
    }
    
    // Check if IP is banned
    const isBanned = await banManager.isBanned(ip);
    
    if (isBanned) {
      const ban = await banManager.getBan(ip);
      
      if (ban && ban.expiresAt > Date.now()) {
        const remainingSeconds = Math.ceil((ban.expiresAt - Date.now()) / 1000);
        
        logAudit('IP_BAN_BLOCKED', null, {
          ip_hash: ban.ip_hash,
          remaining_seconds: remainingSeconds,
          ban_reason: ban.reason,
        }, req);
        
        return res.status(429).json({
          error: 'Too many requests. Your IP has been temporarily banned.',
          retry_after_seconds: remainingSeconds,
        });
      }
    }
    
    next();
  } catch (err) {
    console.error('[Redis BF] ipBanMiddleware error:', err);
    // Fail open on Redis errors
    next();
  }
}

/**
 * Auth Rate Limit Middleware - Apply to login/register routes
 */
export async function authRateLimitMiddleware(req, res, next) {
  try {
    const ip = getClientIp(req);
    
    if (CONFIG.IP_ALLOWLIST.includes(ip)) {
      return next();
    }
    
    const count = await ipRateLimiter.recordAttempt(ip);
    
    if (count > CONFIG.IP_RATE_MAX_ATTEMPTS) {
      await banManager.addBan(ip, 'RATE_LIMIT_EXCEEDED', count, req);
      
      return res.status(429).json({
        error: 'Too many authentication attempts. Your IP has been banned.',
        retry_after_seconds: CONFIG.IP_BAN_DURATION_SECONDS,
      });
    }
    
    next();
  } catch (err) {
    console.error('[Redis BF] authRateLimitMiddleware error:', err);
    next();
  }
}

/**
 * Account Lock Middleware - Apply after rate limiting
 */
export async function accountLockMiddleware(req, res, next) {
  try {
    const { email, username } = req.body;
    const account = email || username;
    
    if (!account) {
      return next();
    }
    
    const isLocked = await accountLocker.isLocked(account);
    
    if (isLocked) {
      logAudit('ACCOUNT_LOCK_BLOCKED', null, {
        account,
      }, req);
      
      return res.status(423).json({
        error: 'Account temporarily locked due to too many failed attempts.',
        retry_after_seconds: CONFIG.ACCOUNT_LOCK_DURATION_SECONDS,
      });
    }
    
    next();
  } catch (err) {
    console.error('[Redis BF] accountLockMiddleware error:', err);
    next();
  }
}

/**
 * Record authentication failure
 */
export async function recordAuthFailure(username, req) {
  try {
    const ip = getClientIp(req);
    await accountLocker.recordFailure(username, ip, req);
  } catch (err) {
    console.error('[Redis BF] recordAuthFailure error:', err);
  }
}

/**
 * Record authentication success
 */
export async function recordAuthSuccess(username, req) {
  try {
    await accountLocker.recordSuccess(username);
  } catch (err) {
    console.error('[Redis BF] recordAuthSuccess error:', err);
  }
}

/**
 * Get brute-force protection statistics
 */
export async function getBruteForceStats() {
  try {
    const banStats = await banManager.getStats();
    const lockStats = await accountLocker.getStats();
    
    return {
      timestamp: new Date().toISOString(),
      backend: 'redis',
      redis_url: CONFIG.REDIS_URL.replace(/:[^:]*@/, ':***@'), // Hide password
      config: {
        ip_rate_window_seconds: CONFIG.IP_RATE_WINDOW_SECONDS,
        ip_rate_max_attempts: CONFIG.IP_RATE_MAX_ATTEMPTS,
        ip_ban_duration_seconds: CONFIG.IP_BAN_DURATION_SECONDS,
        account_lock_max_failures: CONFIG.ACCOUNT_LOCK_MAX_FAILURES,
        account_lock_duration_seconds: CONFIG.ACCOUNT_LOCK_DURATION_SECONDS,
      },
      ban_manager: banStats,
      account_locker: lockStats,
      shared_ip_detector: { tracked_ips: 0, shared_ips_detected: 0 }, // Not implemented in Redis version
    };
  } catch (err) {
    console.error('[Redis BF] getBruteForceStats error:', err);
    throw err;
  }
}

/**
 * Get top banned IPs
 */
export async function getTopBannedIps(limit = 10) {
  try {
    const keys = await redis.keys(`${CONFIG.REDIS_KEY_PREFIX}ban:*`);
    const bans = [];
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const ban = JSON.parse(data);
        const banCount24h = await banManager.getBanCount24h(key.replace(`${CONFIG.REDIS_KEY_PREFIX}ban:`, ''));
        
        bans.push({
          ip_hash: ban.ip_hash,
          ban_count_24h: banCount24h,
          attempt_count: ban.attemptCount,
          current_status: ban.expiresAt > Date.now() ? 'ACTIVE' : 'EXPIRED',
          expires_at: new Date(ban.expiresAt).toISOString(),
          duration_seconds: ban.durationSeconds,
        });
      }
    }
    
    return bans
      .sort((a, b) => b.ban_count_24h - a.ban_count_24h)
      .slice(0, limit);
  } catch (err) {
    console.error('[Redis BF] getTopBannedIps error:', err);
    return [];
  }
}

/**
 * Cleanup resources (for graceful shutdown)
 */
export async function destroy() {
  if (redisClient) {
    await redisClient.quit();
    console.log('[Redis] Connection closed');
  }
}
