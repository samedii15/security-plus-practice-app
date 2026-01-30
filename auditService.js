import { db } from './database/db.js';

/**
 * Audit Logging Service
 * Tracks security-relevant events for compliance and monitoring
 */

// Event types
export const EventTypes = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  REGISTER: 'REGISTER',
  EXAM_START: 'EXAM_START',
  EXAM_SUBMIT: 'EXAM_SUBMIT',
  EXAM_PAUSE: 'EXAM_PAUSE',
  EXAM_RESUME: 'EXAM_RESUME',
  ADMIN_ACCESS: 'ADMIN_ACCESS',
  ADMIN_ACTION: 'ADMIN_ACTION',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  BOOKMARK_ADD: 'BOOKMARK_ADD',
  BOOKMARK_REMOVE: 'BOOKMARK_REMOVE'
};

/**
 * Log an audit event
 * @param {string} eventType - Type of event (use EventTypes constants)
 * @param {number|null} userId - User ID (null for anonymous events)
 * @param {object} details - Additional event details
 * @param {object} req - Express request object (optional, for IP/UA tracking)
 */
export function logAudit(eventType, userId = null, details = {}, req = null) {
  const ip_address = req ? (req.ip || req.connection?.remoteAddress) : null;
  const user_agent = req ? req.get('user-agent') : null;
  const detailsJson = JSON.stringify(details);

  db.run(
    `INSERT INTO audit_logs (event_type, user_id, ip_address, user_agent, details) 
     VALUES (?, ?, ?, ?, ?)`,
    [eventType, userId, ip_address, user_agent, detailsJson],
    (err) => {
      if (err) {
        console.error('Audit log error:', err);
      }
    }
  );
}

/**
 * Get audit logs with filters
 * @param {object} options - Filter options
 * @returns {Promise<Array>}
 */
export function getAuditLogs(options = {}) {
  const {
    userId = null,
    eventType = null,
    startDate = null,
    endDate = null,
    limit = 100,
    offset = 0
  } = options;

  return new Promise((resolve, reject) => {
    let query = `
      SELECT 
        al.*,
        u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      query += ' AND al.user_id = ?';
      params.push(userId);
    }

    if (eventType) {
      query += ' AND al.event_type = ?';
      params.push(eventType);
    }

    if (startDate) {
      query += ' AND al.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND al.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      
      // Parse JSON details
      const logs = rows.map(row => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : {}
      }));
      
      resolve(logs);
    });
  });
}

/**
 * Get failed login attempts for a user (security monitoring)
 * @param {string} email - User email
 * @param {number} minutes - Time window in minutes
 * @returns {Promise<number>}
 */
export function getFailedLoginAttempts(email, minutes = 15) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE event_type = ?
        AND details LIKE ?
        AND created_at > datetime('now', '-' || ? || ' minutes')
    `;
    
    db.get(query, [EventTypes.LOGIN_FAILURE, `%${email}%`, minutes], (err, row) => {
      if (err) return reject(err);
      resolve(row?.count || 0);
    });
  });
}

/**
 * Get audit statistics
 * @param {number} days - Number of days to analyze
 * @returns {Promise<object>}
 */
export function getAuditStats(days = 7) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        event_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM audit_logs
      WHERE created_at > datetime('now', '-' || ? || ' days')
      GROUP BY event_type
      ORDER BY count DESC
    `;
    
    db.all(query, [days], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export default {
  logAudit,
  getAuditLogs,
  getFailedLoginAttempts,
  getAuditStats,
  EventTypes
};
