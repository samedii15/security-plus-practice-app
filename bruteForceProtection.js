/**
 * Brute-Force Protection Middleware
 * Implements comprehensive rate limiting, IP banning, and account locking
 * with progressive escalation and shared IP detection.
 */

import { logAudit } from './auditService.js';
import { sendAlert } from './discordNotifier.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Per-IP Rate Limiting
  IP_RATE_WINDOW_SECONDS: parseInt(process.env.IP_RATE_WINDOW_SECONDS || '30'),
  IP_RATE_MAX_ATTEMPTS: parseInt(process.env.IP_RATE_MAX_ATTEMPTS || '10'),
  IP_BAN_DURATION_SECONDS: parseInt(process.env.IP_BAN_DURATION_SECONDS || '900'), // 15 min
  
  // Per-Account Locking
  ACCOUNT_LOCK_WINDOW_SECONDS: parseInt(process.env.ACCOUNT_LOCK_WINDOW_SECONDS || '300'), // 5 min
  ACCOUNT_LOCK_MAX_FAILURES: parseInt(process.env.ACCOUNT_LOCK_MAX_FAILURES || '5'),
  ACCOUNT_LOCK_DURATION_SECONDS: parseInt(process.env.ACCOUNT_LOCK_DURATION_SECONDS || '600'), // 10 min
  
  // Progressive Escalation
  ESCALATION_WINDOW_SECONDS: parseInt(process.env.ESCALATION_WINDOW_SECONDS || '86400'), // 24 hours
  ESCALATION_BAN_THRESHOLD: parseInt(process.env.ESCALATION_BAN_THRESHOLD || '3'),
  ESCALATION_MULTIPLIER: parseInt(process.env.ESCALATION_MULTIPLIER || '2'),
  MAX_BAN_DURATION_SECONDS: parseInt(process.env.MAX_BAN_DURATION_SECONDS || '86400'), // 24 hours
  
  // Shared IP Detection
  SHARED_IP_USERNAME_THRESHOLD: parseInt(process.env.SHARED_IP_USERNAME_THRESHOLD || '50'),
  SHARED_IP_MULTIPLIER: parseInt(process.env.SHARED_IP_MULTIPLIER || '5'),
  
  // Lockout Abuse Prevention
  LOCKOUT_TRIGGER_LIMIT_PER_HOUR: parseInt(process.env.LOCKOUT_TRIGGER_LIMIT_PER_HOUR || '3'),
  
  // Allowlist
  IP_ALLOWLIST: process.env.IP_ALLOWLIST ? process.env.IP_ALLOWLIST.split(',').map(ip => ip.trim()) : [],
  
  // Memory Management
  MAX_TRACKED_IPS: parseInt(process.env.MAX_TRACKED_IPS || '10000'),
  CLEANUP_INTERVAL_MS: parseInt(process.env.CLEANUP_INTERVAL_MS || '300000'), // 5 min
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract real client IP from request (proxy-aware)
 */
export function getClientIp(req) {
  // Fly.io provides this header (most reliable)
  if (req.headers['fly-client-ip']) {
    return req.headers['fly-client-ip'];
  }
  
  // Standard proxy header (first IP = original client)
  if (req.headers['x-forwarded-for']) {
    const ips = req.headers['x-forwarded-for'].split(',');
    return ips[0].trim();
  }
  
  // Cloudflare
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  
  // Fallback to socket IP
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Hash IP for privacy-safe logging
 */
import crypto from 'crypto';

function hashIp(ip) {
  const salt = process.env.AUTH_LOG_SALT || 'dev-only-change-in-production';
  return crypto.createHash('sha256')
    .update(ip + salt)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Check if IP is in allowlist
 */
function isAllowlisted(ip) {
  return CONFIG.IP_ALLOWLIST.includes(ip);
}

// ============================================================================
// SLIDING WINDOW RATE LIMITER
// ============================================================================

class SlidingWindowRateLimiter {
  constructor(windowSeconds, maxAttempts) {
    this.windowMs = windowSeconds * 1000;
    this.maxAttempts = maxAttempts;
    this.attempts = new Map(); // Map<key, Array<timestamp>>
    
    // Periodic cleanup to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), CONFIG.CLEANUP_INTERVAL_MS);
  }
  
  /**
   * Check if key is rate limited
   * @returns {Object} { allowed: boolean, current: number, remaining: number, resetIn: number }
   */
  check(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    
    if (!this.attempts.has(key)) {
      this.attempts.set(key, []);
    }
    
    // Remove expired attempts (sliding window)
    const keyAttempts = this.attempts.get(key).filter(ts => ts > cutoff);
    this.attempts.set(key, keyAttempts);
    
    // Check if over limit
    const allowed = keyAttempts.length < this.maxAttempts;
    const remaining = Math.max(0, this.maxAttempts - keyAttempts.length - 1);
    
    // Calculate reset time (when oldest attempt expires)
    let resetIn = 0;
    if (keyAttempts.length > 0) {
      const oldestAttempt = Math.min(...keyAttempts);
      resetIn = Math.max(0, oldestAttempt + this.windowMs - now);
    }
    
    return {
      allowed,
      current: keyAttempts.length,
      remaining,
      resetIn: Math.ceil(resetIn / 1000), // seconds
    };
  }
  
  /**
   * Record an attempt
   */
  record(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    
    if (!this.attempts.has(key)) {
      this.attempts.set(key, []);
    }
    
    const keyAttempts = this.attempts.get(key).filter(ts => ts > cutoff);
    keyAttempts.push(now);
    this.attempts.set(key, keyAttempts);
    
    return keyAttempts.length;
  }
  
  /**
   * Get current attempt count
   */
  getCount(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    
    if (!this.attempts.has(key)) {
      return 0;
    }
    
    const keyAttempts = this.attempts.get(key).filter(ts => ts > cutoff);
    return keyAttempts.length;
  }
  
  /**
   * Clear attempts for a key
   */
  clear(key) {
    this.attempts.delete(key);
  }
  
  /**
   * Cleanup expired entries to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    
    let cleaned = 0;
    for (const [key, attempts] of this.attempts.entries()) {
      const validAttempts = attempts.filter(ts => ts > cutoff);
      
      if (validAttempts.length === 0) {
        this.attempts.delete(key);
        cleaned++;
      } else {
        this.attempts.set(key, validAttempts);
      }
    }
    
    // Enforce max size (LRU-style eviction)
    if (this.attempts.size > CONFIG.MAX_TRACKED_IPS) {
      const toDelete = this.attempts.size - CONFIG.MAX_TRACKED_IPS;
      let deleted = 0;
      
      for (const key of this.attempts.keys()) {
        if (deleted >= toDelete) break;
        this.attempts.delete(key);
        deleted++;
      }
      
      console.log(`[BruteForce] Evicted ${deleted} old entries (max size: ${CONFIG.MAX_TRACKED_IPS})`);
    }
    
    if (cleaned > 0) {
      console.log(`[BruteForce] Cleaned up ${cleaned} expired rate limit entries`);
    }
  }
  
  /**
   * Get stats for monitoring
   */
  getStats() {
    return {
      tracked_keys: this.attempts.size,
      window_seconds: this.windowMs / 1000,
      max_attempts: this.maxAttempts,
    };
  }
  
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// ============================================================================
// BAN MANAGER
// ============================================================================

class BanManager {
  constructor() {
    this.bans = new Map(); // Map<ip, BanState>
    this.banHistory = new Map(); // Map<ip, Array<timestamp>>
    
    // Periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), CONFIG.CLEANUP_INTERVAL_MS);
  }
  
  /**
   * Check if IP is currently banned
   */
  isBanned(ip) {
    const ban = this.bans.get(ip);
    if (!ban) return false;
    
    // Check if expired
    if (Date.now() > ban.expiresAt) {
      this.bans.delete(ip);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get ban details
   */
  getBan(ip) {
    return this.bans.get(ip) || null;
  }
  
  /**
   * Add a ban with escalation
   */
  async addBan(ip, reason, attemptCount, req = null) {
    const now = Date.now();
    
    // Track ban history for escalation
    if (!this.banHistory.has(ip)) {
      this.banHistory.set(ip, []);
    }
    
    const history = this.banHistory.get(ip);
    history.push(now);
    
    // Clean old history (beyond escalation window)
    const escalationCutoff = now - (CONFIG.ESCALATION_WINDOW_SECONDS * 1000);
    const recentBans = history.filter(ts => ts > escalationCutoff);
    this.banHistory.set(ip, recentBans);
    
    // Calculate escalated duration
    const banCount24h = recentBans.length;
    const baseDuration = CONFIG.IP_BAN_DURATION_SECONDS;
    const escalatedDuration = this.calculateEscalation(baseDuration, banCount24h);
    
    const expiresAt = now + (escalatedDuration * 1000);
    
    const banState = {
      ip,
      ip_hash: hashIp(ip),
      bannedAt: now,
      expiresAt,
      durationSeconds: escalatedDuration,
      reason,
      attemptCount,
      banCount24h,
      escalated: banCount24h >= CONFIG.ESCALATION_BAN_THRESHOLD,
    };
    
    this.bans.set(ip, banState);
    
    // Log ban event
    const severity = banCount24h >= CONFIG.ESCALATION_BAN_THRESHOLD ? 'HIGH' : 'MEDIUM';
    
    const auditDetails = {
      reason,
      window_seconds: CONFIG.IP_RATE_WINDOW_SECONDS,
      attempt_count: attemptCount,
      threshold: CONFIG.IP_RATE_MAX_ATTEMPTS,
      ban_duration_seconds: escalatedDuration,
      ban_expires_at: new Date(expiresAt).toISOString(),
      ban_count_24h: banCount24h,
      escalated: banState.escalated,
      severity,
    };
    
    logAudit('IP_BAN_TRIGGERED', null, auditDetails, req);
    
    // Send Discord alert for IP ban
    await sendAlert({
      type: 'IP_BAN',
      severity: severity,
      ip_hash: banState.ip_hash,
      ban_duration_seconds: escalatedDuration,
      ban_count_24h: banCount24h,
      attempt_count: attemptCount,
      threshold: CONFIG.IP_RATE_MAX_ATTEMPTS,
      timestamp: new Date().toISOString(),
    }).catch(err => console.error('[BruteForce] Discord alert failed:', err.message));
    
    console.log(`[BruteForce] IP banned: ${hashIp(ip)} for ${escalatedDuration}s (${banCount24h} bans in 24h)`);
    
    // Send alert if escalation threshold reached
    if (banCount24h >= CONFIG.ESCALATION_BAN_THRESHOLD) {
      await this.sendEscalationAlert(ip, banState, req);
    }
    
    return banState;
  }
  
  /**
   * Calculate escalated ban duration
   */
  calculateEscalation(baseDuration, banCount) {
    if (banCount < CONFIG.ESCALATION_BAN_THRESHOLD) {
      return baseDuration;
    }
    
    // Progressive backoff: 2x, 4x, 8x, etc.
    const multiplier = Math.pow(CONFIG.ESCALATION_MULTIPLIER, banCount - 1);
    const escalated = baseDuration * multiplier;
    
    // Cap at maximum
    return Math.min(escalated, CONFIG.MAX_BAN_DURATION_SECONDS);
  }
  
  /**
   * Get ban count in last 24 hours
   */
  getBanCount24h(ip) {
    const history = this.banHistory.get(ip) || [];
    const cutoff = Date.now() - (CONFIG.ESCALATION_WINDOW_SECONDS * 1000);
    return history.filter(ts => ts > cutoff).length;
  }
  
  /**
   * Send high-severity alert for persistent attackers
   */
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
    
    // Send HIGH severity Discord alert for persistent attacker
    await sendAlert({
      type: 'PERSISTENT_ATTACKER',
      severity: 'HIGH',
      ip_hash: banState.ip_hash,
      ban_count_24h: banState.banCount24h,
      current_ban_duration_seconds: banState.durationSeconds,
      total_attempts: banState.attemptCount,
      timestamp: new Date().toISOString(),
      action_required: 'Manual review recommended',
    }).catch(err => console.error('[BruteForce] Discord alert failed:', err.message));
    
    console.log(`[BruteForce] 🚨 PERSISTENT ATTACKER: ${banState.ip_hash} (${banState.banCount24h} bans)`);
  }
  
  /**
   * Cleanup expired bans
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [ip, ban] of this.bans.entries()) {
      if (now > ban.expiresAt) {
        this.bans.delete(ip);
        cleaned++;
      }
    }
    
    // Clean old ban history
    const historyCutoff = now - (CONFIG.ESCALATION_WINDOW_SECONDS * 1000);
    for (const [ip, history] of this.banHistory.entries()) {
      const recentBans = history.filter(ts => ts > historyCutoff);
      
      if (recentBans.length === 0) {
        this.banHistory.delete(ip);
      } else {
        this.banHistory.set(ip, recentBans);
      }
    }
    
    if (cleaned > 0) {
      console.log(`[BruteForce] Cleaned up ${cleaned} expired bans`);
    }
  }
  
  /**
   * Get stats for monitoring
   */
  getStats() {
    const now = Date.now();
    const activeBans = Array.from(this.bans.values()).filter(ban => ban.expiresAt > now);
    const escalatedBans = activeBans.filter(ban => ban.escalated);
    
    return {
      active_bans: activeBans.length,
      escalated_bans: escalatedBans.length,
      tracked_ban_history: this.banHistory.size,
    };
  }
  
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// ============================================================================
// ACCOUNT LOCKER
// ============================================================================

class AccountLocker {
  constructor() {
    this.failures = new Map(); // Map<username, Array<{timestamp, ip}>>
    this.locks = new Map(); // Map<username, LockState>
    this.lockoutTriggers = new Map(); // Map<ip, Array<timestamp>>
    
    this.cleanupInterval = setInterval(() => this.cleanup(), CONFIG.CLEANUP_INTERVAL_MS);
  }
  
  /**
   * Record a failed login attempt
   */
  recordFailure(username, ip) {
    const now = Date.now();
    const cutoff = now - (CONFIG.ACCOUNT_LOCK_WINDOW_SECONDS * 1000);
    
    if (!this.failures.has(username)) {
      this.failures.set(username, []);
    }
    
    const userFailures = this.failures.get(username).filter(f => f.timestamp > cutoff);
    userFailures.push({ timestamp: now, ip });
    this.failures.set(username, userFailures);
    
    return userFailures.length;
  }
  
  /**
   * Check if account is locked
   */
  isLocked(username) {
    const lock = this.locks.get(username);
    if (!lock) return false;
    
    // Check if expired
    if (Date.now() > lock.expiresAt) {
      this.locks.delete(username);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get lock details
   */
  getLock(username) {
    return this.locks.get(username) || null;
  }
  
  /**
   * Lock an account
   */
  async lockAccount(username, ip, failureCount, req = null) {
    const now = Date.now();
    const expiresAt = now + (CONFIG.ACCOUNT_LOCK_DURATION_SECONDS * 1000);
    
    const userFailures = this.failures.get(username) || [];
    const attemptedIps = [...new Set(userFailures.map(f => f.ip))];
    
    const lockState = {
      username,
      lockedAt: now,
      expiresAt,
      durationSeconds: CONFIG.ACCOUNT_LOCK_DURATION_SECONDS,
      failureCount,
      attemptedIps,
      triggerIp: ip,
    };
    
    this.locks.set(username, lockState);
    
    // Track lockout triggers from this IP (abuse prevention)
    if (!this.lockoutTriggers.has(ip)) {
      this.lockoutTriggers.set(ip, []);
    }
    const triggers = this.lockoutTriggers.get(ip).filter(
      ts => ts > now - 3600000 // Last hour
    );
    triggers.push(now);
    this.lockoutTriggers.set(ip, triggers);
    
    // Log lock event
    const auditDetails = {
      reason: 'MAX_FAILURES_EXCEEDED',
      failure_count: failureCount,
      threshold: CONFIG.ACCOUNT_LOCK_MAX_FAILURES,
      lock_duration_seconds: CONFIG.ACCOUNT_LOCK_DURATION_SECONDS,
      lock_expires_at: new Date(expiresAt).toISOString(),
      attempted_ips_count: attemptedIps.length,
      lockout_triggers_from_ip_last_hour: triggers.length,
    };
    
    logAudit('ACCOUNT_LOCKED', null, auditDetails, req);
    
    // Send Discord alert for account lock
    await sendAlert({
      type: 'ACCOUNT_LOCKED',
      severity: 'MEDIUM',
      username: username,
      failure_count: failureCount,
      threshold: CONFIG.ACCOUNT_LOCK_MAX_FAILURES,
      lock_duration_seconds: CONFIG.ACCOUNT_LOCK_DURATION_SECONDS,
      attempted_ips_count: attemptedIps.length,
      timestamp: new Date().toISOString(),
    }).catch(err => console.error('[BruteForce] Discord alert failed:', err.message));
    
    console.log(`[BruteForce] Account locked: ${username} (${failureCount} failures)`);
    
    // Check for lockout abuse
    if (triggers.length > CONFIG.LOCKOUT_TRIGGER_PER_HOUR) {
      return { lockState, abuseDetected: true };
    }
    
    return { lockState, abuseDetected: false };
  }
  
  /**
   * Check if IP is triggering too many lockouts (abuse detection)
   */
  isLockoutAbuser(ip) {
    const triggers = this.lockoutTriggers.get(ip) || [];
    const now = Date.now();
    const recentTriggers = triggers.filter(ts => ts > now - 3600000); // Last hour
    
    return recentTriggers.length > CONFIG.LOCKOUT_TRIGGER_LIMIT_PER_HOUR;
  }
  
  /**
   * Clear failures for username (on successful login)
   */
  clearFailures(username) {
    this.failures.delete(username);
    this.locks.delete(username);
  }
  
  /**
   * Cleanup expired locks and old failures
   */
  cleanup() {
    const now = Date.now();
    
    // Clean expired locks
    let cleaned = 0;
    for (const [username, lock] of this.locks.entries()) {
      if (now > lock.expiresAt) {
        this.locks.delete(username);
        cleaned++;
      }
    }
    
    // Clean old failures
    const failureCutoff = now - (CONFIG.ACCOUNT_LOCK_WINDOW_SECONDS * 1000);
    for (const [username, failures] of this.failures.entries()) {
      const recentFailures = failures.filter(f => f.timestamp > failureCutoff);
      
      if (recentFailures.length === 0) {
        this.failures.delete(username);
      } else {
        this.failures.set(username, recentFailures);
      }
    }
    
    // Clean old lockout triggers
    const triggerCutoff = now - 3600000; // 1 hour
    for (const [ip, triggers] of this.lockoutTriggers.entries()) {
      const recentTriggers = triggers.filter(ts => ts > triggerCutoff);
      
      if (recentTriggers.length === 0) {
        this.lockoutTriggers.delete(ip);
      } else {
        this.lockoutTriggers.set(ip, recentTriggers);
      }
    }
    
    if (cleaned > 0) {
      console.log(`[BruteForce] Cleaned up ${cleaned} expired account locks`);
    }
  }
  
  /**
   * Get stats for monitoring
   */
  getStats() {
    const now = Date.now();
    const activeLocks = Array.from(this.locks.values()).filter(lock => lock.expiresAt > now);
    
    return {
      active_locks: activeLocks.length,
      tracked_failures: this.failures.size,
      tracked_lockout_triggers: this.lockoutTriggers.size,
    };
  }
  
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// ============================================================================
// SHARED IP DETECTOR
// ============================================================================

class SharedIpDetector {
  constructor() {
    this.ipUsernames = new Map(); // Map<ip, Set<username>>
    this.ipUserAgents = new Map(); // Map<ip, Set<userAgent>>
    this.sharedIps = new Set();
    
    this.cleanupInterval = setInterval(() => this.cleanup(), CONFIG.CLEANUP_INTERVAL_MS * 2);
  }
  
  /**
   * Track username and user-agent for IP
   */
  track(ip, username, userAgent) {
    // Track usernames
    if (!this.ipUsernames.has(ip)) {
      this.ipUsernames.set(ip, new Set());
    }
    this.ipUsernames.get(ip).add(username);
    
    // Track user agents
    if (userAgent) {
      if (!this.ipUserAgents.has(ip)) {
        this.ipUserAgents.set(ip, new Set());
      }
      this.ipUserAgents.get(ip).add(userAgent);
    }
    
    // Check if should be marked as shared
    this.checkIfShared(ip);
  }
  
  /**
   * Check if IP meets shared criteria
   */
  checkIfShared(ip) {
    const uniqueUsernames = this.ipUsernames.get(ip)?.size || 0;
    const uniqueUserAgents = this.ipUserAgents.get(ip)?.size || 0;
    
    const wasShared = this.sharedIps.has(ip);
    const isShared = uniqueUsernames >= CONFIG.SHARED_IP_USERNAME_THRESHOLD ||
                     uniqueUserAgents >= 20;
    
    if (isShared && !wasShared) {
      this.sharedIps.add(ip);
      console.log(`[BruteForce] Shared IP detected: ${uniqueUsernames} unique users, ${uniqueUserAgents} unique UAs`);
    }
  }
  
  /**
   * Check if IP is shared
   */
  isShared(ip) {
    return this.sharedIps.has(ip);
  }
  
  /**
   * Get adjusted threshold for IP
   */
  getAdjustedThreshold(ip, baseThreshold) {
    if (this.isShared(ip)) {
      return baseThreshold * CONFIG.SHARED_IP_MULTIPLIER;
    }
    return baseThreshold;
  }
  
  /**
   * Cleanup old tracking data
   */
  cleanup() {
    // Simple size-based eviction
    if (this.ipUsernames.size > CONFIG.MAX_TRACKED_IPS) {
      const toDelete = this.ipUsernames.size - CONFIG.MAX_TRACKED_IPS;
      let deleted = 0;
      
      for (const key of this.ipUsernames.keys()) {
        if (deleted >= toDelete) break;
        this.ipUsernames.delete(key);
        this.ipUserAgents.delete(key);
        this.sharedIps.delete(key);
        deleted++;
      }
    }
  }
  
  getStats() {
    return {
      tracked_ips: this.ipUsernames.size,
      shared_ips_detected: this.sharedIps.size,
    };
  }
  
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// ============================================================================
// GLOBAL INSTANCES
// ============================================================================

const ipRateLimiter = new SlidingWindowRateLimiter(
  CONFIG.IP_RATE_WINDOW_SECONDS,
  CONFIG.IP_RATE_MAX_ATTEMPTS
);

const banManager = new BanManager();
const accountLocker = new AccountLocker();
const sharedIpDetector = new SharedIpDetector();

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

/**
 * IP Ban Check Middleware
 * Apply this EARLY in the middleware chain to all auth endpoints
 */
export function ipBanMiddleware(req, res, next) {
  const ip = getClientIp(req);
  
  // Check allowlist first
  if (isAllowlisted(ip)) {
    logAudit('ALLOWLIST_BYPASS', null, { reason: 'IP_ALLOWLISTED' }, req);
    return next();
  }
  
  // Check if IP is banned
  if (banManager.isBanned(ip)) {
    const ban = banManager.getBan(ip);
    const remainingSeconds = Math.ceil((ban.expiresAt - Date.now()) / 1000);
    
    logAudit('IP_BAN_BLOCKED', null, {
      reason: ban.reason,
      remaining_seconds: remainingSeconds,
      ban_count_24h: ban.banCount24h,
    }, req);
    
    return res.status(429).json({
      error: 'Too many requests from your network',
      error_code: 'RATE_LIMIT_EXCEEDED',
      retry_after: CONFIG.IP_BAN_DURATION_SECONDS, // Don't leak exact time
      retry_after_human: `${Math.ceil(CONFIG.IP_BAN_DURATION_SECONDS / 60)} minutes`,
      reference_id: `ban_${Date.now()}_${ban.ip_hash}`,
    });
  }
  
  // Check if IP is lockout abuser
  if (accountLocker.isLockoutAbuser(ip)) {
    logAudit('LOCKOUT_ABUSE_DETECTED', null, { 
      reason: 'EXCESSIVE_LOCKOUT_TRIGGERS',
      triggers_last_hour: accountLocker.lockoutTriggers.get(ip)?.length || 0,
    }, req);
    
    // Ban the IP for lockout abuse
    banManager.addBan(ip, 'LOCKOUT_ABUSE', 0, req);
    
    return res.status(429).json({
      error: 'Too many requests from your network',
      error_code: 'RATE_LIMIT_EXCEEDED',
      retry_after: CONFIG.IP_BAN_DURATION_SECONDS,
    });
  }
  
  next();
}

/**
 * Rate Limiting Middleware for Auth Endpoints
 * Tracks attempts and triggers bans
 */
export function authRateLimitMiddleware(req, res, next) {
  const ip = getClientIp(req);
  
  // Skip if allowlisted
  if (isAllowlisted(ip)) {
    return next();
  }
  
  // Get adjusted threshold for shared IPs
  const adjustedThreshold = sharedIpDetector.getAdjustedThreshold(
    ip,
    CONFIG.IP_RATE_MAX_ATTEMPTS
  );
  
  // Check rate limit
  const attemptCount = ipRateLimiter.record(ip);
  
  if (attemptCount > adjustedThreshold) {
    // Trigger ban
    banManager.addBan(ip, 'RATE_LIMIT_EXCEEDED', attemptCount, req);
    
    return res.status(429).json({
      error: 'Too many requests from your network',
      error_code: 'RATE_LIMIT_EXCEEDED',
      retry_after: CONFIG.IP_BAN_DURATION_SECONDS,
      retry_after_human: `${Math.ceil(CONFIG.IP_BAN_DURATION_SECONDS / 60)} minutes`,
    });
  }
  
  // Track for shared IP detection
  const username = req.body?.email || req.body?.username;
  const userAgent = req.headers['user-agent'];
  if (username) {
    sharedIpDetector.track(ip, username, userAgent);
  }
  
  next();
}

/**
 * Account Lock Check Middleware
 * Check if account is locked before auth logic
 */
export function accountLockMiddleware(req, res, next) {
  const username = req.body?.email || req.body?.username;
  
  if (!username) {
    return next();
  }
  
  if (accountLocker.isLocked(username)) {
    const lock = accountLocker.getLock(username);
    
    logAudit('ACCOUNT_LOCK_BLOCKED', null, {
      reason: 'ACCOUNT_TEMPORARILY_LOCKED',
      remaining_seconds: Math.ceil((lock.expiresAt - Date.now()) / 1000),
    }, req);
    
    // Don't reveal if account exists or is locked (constant response)
    return res.status(401).json({
      error: 'Invalid credentials or account temporarily unavailable',
      error_code: 'AUTH_FAILED',
      hint: 'Reset your password if you\'ve forgotten it',
    });
  }
  
  next();
}

/**
 * Record Auth Failure
 * Call this from auth logic when login fails
 */
export async function recordAuthFailure(username, req) {
  const ip = getClientIp(req);
  
  if (!username) return;
  
  const failureCount = accountLocker.recordFailure(username, ip);
  
  logAudit('AUTH_FAILURE_RECORDED', null, {
    failure_count: failureCount,
    threshold: CONFIG.ACCOUNT_LOCK_MAX_FAILURES,
  }, req);
  
  // Check if should lock account
  if (failureCount >= CONFIG.ACCOUNT_LOCK_MAX_FAILURES) {
    const result = await accountLocker.lockAccount(username, ip, failureCount, req);
    
    // If lockout abuse detected, ban the IP
    if (result.abuseDetected) {
      await banManager.addBan(ip, 'LOCKOUT_ABUSE', failureCount, req);
    }
  }
}

/**
 * Record Auth Success
 * Call this from auth logic when login succeeds
 */
export function recordAuthSuccess(username, req) {
  const ip = getClientIp(req);
  
  if (!username) return;
  
  // Check if there were recent failures
  const recentFailures = accountLocker.failures.get(username)?.length || 0;
  
  if (recentFailures >= 3) {
    logAudit('AUTH_SUCCESS_AFTER_FAILURES', null, {
      failure_count_before_success: recentFailures,
      severity: 'LOW',
      note: 'User succeeded after multiple failures - likely legitimate',
    }, req);
  }
  
  // Clear failure counters
  accountLocker.clearFailures(username);
  
  // IP rate limiter stays (don't clear IP counter on success)
}

// ============================================================================
// MONITORING & STATS
// ============================================================================

/**
 * Get comprehensive stats for monitoring dashboard
 */
export function getBruteForceStats() {
  return {
    timestamp: new Date().toISOString(),
    config: {
      ip_rate_window_seconds: CONFIG.IP_RATE_WINDOW_SECONDS,
      ip_rate_max_attempts: CONFIG.IP_RATE_MAX_ATTEMPTS,
      ip_ban_duration_seconds: CONFIG.IP_BAN_DURATION_SECONDS,
      account_lock_max_failures: CONFIG.ACCOUNT_LOCK_MAX_FAILURES,
      account_lock_duration_seconds: CONFIG.ACCOUNT_LOCK_DURATION_SECONDS,
    },
    ip_rate_limiter: ipRateLimiter.getStats(),
    ban_manager: banManager.getStats(),
    account_locker: accountLocker.getStats(),
    shared_ip_detector: sharedIpDetector.getStats(),
    memory_usage_mb: process.memoryUsage().heapUsed / 1024 / 1024,
  };
}

/**
 * Manually unban an IP by its hash
 * @param {string} ipHash - Hashed IP address
 * @returns {boolean} - True if IP was unbanned, false if not found
 */
export function unbanIp(ipHash) {
  // Find the IP entry by its hash
  for (const [ip, ban] of banManager.bans.entries()) {
    if (ban.ip_hash === ipHash) {
      banManager.bans.delete(ip);
      console.log(`[BruteForce] Manually unbanned IP: ${ipHash}`);
      logAudit('IP_MANUALLY_UNBANNED', null, {
        ip_hash: ipHash,
        unbanned_at: new Date().toISOString(),
      });
      return true;
    }
  }
  return false;
}

/**
 * Get top banned IPs (hashed for privacy)
 */
export async function getTopBannedIps(limit = 10) {
  const bans = Array.from(banManager.bans.entries())
    .map(([ip, ban]) => ({
      ip_hash: ban.ip_hash,
      ban_count_24h: ban.banCount24h,
      attempt_count: ban.attemptCount,
      current_status: ban.expiresAt > Date.now() ? 'ACTIVE' : 'EXPIRED',
      expires_at: new Date(ban.expiresAt).toISOString(),
    }))
    .sort((a, b) => b.ban_count_24h - a.ban_count_24h)
    .slice(0, limit);
  
  return bans;
}

/**
 * Cleanup all resources (for graceful shutdown)
 */
export function destroy() {
  ipRateLimiter.destroy();
  banManager.destroy();
  accountLocker.destroy();
  sharedIpDetector.destroy();
  console.log('[BruteForce] All protection systems shut down');
}

// Graceful shutdown
process.on('SIGTERM', destroy);
process.on('SIGINT', destroy);

// Log startup
console.log('[BruteForce] Protection initialized with config:', CONFIG);
