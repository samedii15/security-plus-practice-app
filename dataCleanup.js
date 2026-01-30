// Data retention and cleanup utilities

import { db, run } from './database/db.js';

// Default retention periods (in days)
const RETENTION_PERIODS = {
  AUTH_LOGINS: 90,  // Keep login logs for 90 days
  AUDIT_LOGS: 180,  // Keep audit logs for 180 days
  DELETED_USERS: 30, // Permanently delete soft-deleted users after 30 days
  DELETED_ATTEMPTS: 30 // Permanently delete soft-deleted attempts after 30 days
};

/**
 * Clean up old auth login records
 */
export async function cleanupAuthLogins(retentionDays = RETENTION_PERIODS.AUTH_LOGINS) {
  try {
    const result = await run(
      `DELETE FROM auth_logins 
       WHERE created_at < datetime('now', '-' || ? || ' days')`,
      [retentionDays]
    );
    console.log(`Cleaned up ${result.changes || 0} old auth_logins records (older than ${retentionDays} days)`);
    return { deleted: result.changes || 0 };
  } catch (err) {
    console.error('Error cleaning up auth_logins:', err);
    throw err;
  }
}

/**
 * Clean up old audit logs
 */
export async function cleanupAuditLogs(retentionDays = RETENTION_PERIODS.AUDIT_LOGS) {
  try {
    const result = await run(
      `DELETE FROM audit_logs 
       WHERE created_at < datetime('now', '-' || ? || ' days')`,
      [retentionDays]
    );
    console.log(`Cleaned up ${result.changes || 0} old audit_logs records (older than ${retentionDays} days)`);
    return { deleted: result.changes || 0 };
  } catch (err) {
    console.error('Error cleaning up audit_logs:', err);
    throw err;
  }
}

/**
 * Permanently delete soft-deleted users after retention period
 */
export async function cleanupDeletedUsers(retentionDays = RETENTION_PERIODS.DELETED_USERS) {
  try {
    const result = await run(
      `DELETE FROM users 
       WHERE deleted_at IS NOT NULL 
       AND deleted_at < datetime('now', '-' || ? || ' days')`,
      [retentionDays]
    );
    console.log(`Permanently deleted ${result.changes || 0} soft-deleted users (deleted more than ${retentionDays} days ago)`);
    return { deleted: result.changes || 0 };
  } catch (err) {
    console.error('Error cleaning up deleted users:', err);
    throw err;
  }
}

/**
 * Permanently delete soft-deleted attempts after retention period
 */
export async function cleanupDeletedAttempts(retentionDays = RETENTION_PERIODS.DELETED_ATTEMPTS) {
  try {
    // First delete the answers
    await run(
      `DELETE FROM exam_attempt_answers 
       WHERE attempt_id IN (
         SELECT id FROM exam_attempts 
         WHERE deleted_at IS NOT NULL 
         AND deleted_at < datetime('now', '-' || ? || ' days')
       )`,
      [retentionDays]
    );
    
    // Then delete the attempts
    const result = await run(
      `DELETE FROM exam_attempts 
       WHERE deleted_at IS NOT NULL 
       AND deleted_at < datetime('now', '-' || ? || ' days')`,
      [retentionDays]
    );
    console.log(`Permanently deleted ${result.changes || 0} soft-deleted attempts (deleted more than ${retentionDays} days ago)`);
    return { deleted: result.changes || 0 };
  } catch (err) {
    console.error('Error cleaning up deleted attempts:', err);
    throw err;
  }
}

/**
 * Run all cleanup tasks
 */
export async function runAllCleanupTasks() {
  console.log('Starting data retention cleanup...');
  const results = {
    authLogins: await cleanupAuthLogins(),
    auditLogs: await cleanupAuditLogs(),
    deletedUsers: await cleanupDeletedUsers(),
    deletedAttempts: await cleanupDeletedAttempts(),
    timestamp: new Date().toISOString()
  };
  console.log('Data retention cleanup complete:', results);
  return results;
}

/**
 * Schedule daily cleanup (call this on server startup)
 */
export function scheduleCleanup() {
  const INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  
  // Run immediately on startup
  runAllCleanupTasks().catch(err => {
    console.error('Initial cleanup failed:', err);
  });
  
  // Then run daily
  setInterval(() => {
    runAllCleanupTasks().catch(err => {
      console.error('Scheduled cleanup failed:', err);
    });
  }, INTERVAL);
  
  console.log('Data retention cleanup scheduled (runs daily)');
}
