import dotenv from "dotenv";
dotenv.config();

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is not set');
  console.error('Please set JWT_SECRET in your .env file or environment variables');
  console.error('Generate a secure secret: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { db, initDatabase, all, get, run } from "./database/db.js";
import { register, login, verifyToken, verifyAdmin } from "./auth.js";
import { 
  ipBanMiddleware, 
  authRateLimitMiddleware, 
  accountLockMiddleware,
  getBruteForceStats,
  getTopBannedIps,
  unbanIp
} from "./bruteForceProtection.js";
import { sendTestAlert } from "./discordNotifier.js";
import { startExam, submitExam, getExamHistory, getExamReview, getDomainStats } from "./examService.js";
import { getUserAnalytics, getDomainPerformance, getProgressOverTime } from "./analyticsService.js";
import { startStudySession, submitStudyAnswer, getAvailableDomains, getStudyHistory } from "./studyService.js";
import { scheduleCleanup, runAllCleanupTasks } from "./dataCleanup.js";
import {
  validateRegistration,
  validateLogin,
  validateStartExam,
  validateSubmitExam,
  validateStartStudy,
  validateDeleteUser,
  validateIdParam,
  validationErrorHandler
} from "./validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy when behind Fly.io or other reverse proxies
app.set('trust proxy', 1);

// Helper: Ensure consistent JSON storage
function toJsonString(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
}

// BRUTE-FORCE PROTECTION: Apply IP ban check ONLY to auth/API routes (not admin dashboard)
// This allows analysts to access the dashboard even if their IP was banned
app.use((req, res, next) => {
  // Exempt admin/monitoring routes from IP ban
  const exemptPaths = [
    '/admin',
    '/admin.html',
    '/admin-brute-force.html',
    '/admin-users.html',
    '/admin-feedback.html',
    '/api/admin',
    '/styles.css',
    '/app.js',
    '/admin.js'
  ];
  
  // Check if path is exempt (admin/monitoring)
  const isExempt = exemptPaths.some(path => req.path.startsWith(path));
  
  if (isExempt) {
    // Allow admin access - skip ban check
    return next();
  }
  
  // For non-exempt paths, apply IP ban middleware
  return ipBanMiddleware(req, res, next);
});

// Request logging middleware (before other middleware)
app.use((req, res, next) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  req.requestId = requestId;
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  
  next();
});

// Middleware (Old express-rate-limit removed, using custom brute-force protection)
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
initDatabase();

// Schedule daily data cleanup
scheduleCleanup();

// Import questions from JSON file
function importQuestions() {
  const questionsPath = path.join(__dirname, 'questions.json');
  
  if (!fs.existsSync(questionsPath)) {
    console.error('questions.json not found!');
    return;
  }

  const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  
  db.get('SELECT COUNT(*) as count FROM questions', (err, row) => {
    if (err) {
      console.error('Error checking questions table:', err);
      return;
    }
    
    if (row.count === 0) {
      console.log('Importing questions into database...');
      const stmt = db.prepare(`
        INSERT INTO questions (id, question, choice_a, choice_b, choice_c, choice_d, answer, explanation, domain, difficulty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      questionsData.forEach(q => {
        stmt.run(
          q.id,
          q.question,
          q.choices.A,
          q.choices.B,
          q.choices.C,
          q.choices.D,
          q.answer,
          q.explanation,
          q.domain || 'General',
          q.difficulty || 'medium'
        );
      });
      
      stmt.finalize(() => {
        console.log(`Successfully imported ${questionsData.length} questions`);
      });
    } else {
      console.log(`Questions already imported (${row.count} questions in database)`);
    }
  });
}

// Import questions on startup
setTimeout(importQuestions, 1000);

// Health check endpoint with DB connectivity
app.get('/api/health', async (req, res) => {
  try {
    const questionCount = await get('SELECT COUNT(*) as count FROM questions');
    const userCount = await get('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL');
    const attemptCount = await get('SELECT COUNT(*) as count FROM exam_attempts WHERE deleted_at IS NULL');
    
    res.json({ 
      status: 'ok',
      database: 'connected',
      questionCount: questionCount.count,
      userCount: userCount.count,
      attemptCount: attemptCount.count,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Authentication endpoints
app.post('/api/auth/register', authRateLimitMiddleware, validateRegistration, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await register(email, password, req);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/auth/login', authRateLimitMiddleware, accountLockMiddleware, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password, req);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Exam endpoints (protected)
app.post('/api/exams/start', verifyToken, validateStartExam, async (req, res) => {
  try {
    const { isRetakeMissed } = req.body;
    const result = await startExam(req.user.id, isRetakeMissed);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/exams/:id/submit', verifyToken, validateIdParam('id'), validateSubmitExam, async (req, res) => {
  try {
    const examId = req.params.id; // Already validated and converted to number
    const { answers, timeUsed, attemptId } = req.body;
    const result = await submitExam(examId, req.user.id, answers, timeUsed, attemptId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/exams/history', verifyToken, async (req, res) => {
  try {
    // Only return non-deleted attempts for this user
    const history = await getExamHistory(req.user.id);
    res.json(history);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/exams/:id', verifyToken, async (req, res) => {
  try {
    const examId = parseInt(req.params.id);
    // Verify ownership and not deleted
    const exam = await get('SELECT user_id, deleted_at FROM exams WHERE id = ?', [examId]);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    if (exam.deleted_at) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    if (exam.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const review = await getExamReview(examId, req.user.id);
    res.json(review);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/exams/retake-missed', verifyToken, async (req, res) => {
  try {
    const result = await startExam(req.user.id, true);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Get domain statistics (shows how questions are weighted)
app.get('/api/exams/domain-stats', verifyToken, async (req, res) => {
  try {
    const stats = await getDomainStats();
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ===== ANALYTICS ENDPOINTS =====

// Get comprehensive user analytics
app.get('/api/analytics', verifyToken, async (req, res) => {
  try {
    const analytics = await getUserAnalytics(req.user.id);
    res.json(analytics);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Get detailed performance for a specific domain
app.get('/api/analytics/domain/:domain', verifyToken, async (req, res) => {
  try {
    const domain = decodeURIComponent(req.params.domain);
    const performance = await getDomainPerformance(req.user.id, domain);
    res.json(performance);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Get progress over time
app.get('/api/analytics/progress', verifyToken, async (req, res) => {
  try {
    const progress = await getProgressOverTime(req.user.id);
    res.json(progress);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ===== STUDY MODE ENDPOINTS =====

// Start a study session with custom filters
app.post('/api/study/start', verifyToken, validateStartStudy, async (req, res) => {
  try {
    const result = await startStudySession(req.user.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Submit an answer in a study session
app.post('/api/study/:sessionId/answer', verifyToken, async (req, res) => {
  try {
    const { questionNumber, answer } = req.body;
    const result = await submitStudyAnswer(
      parseInt(req.params.sessionId),
      req.user.id,
      questionNumber,
      answer
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Get available domains for filtering
app.get('/api/study/domains', verifyToken, async (req, res) => {
  try {
    const domains = await getAvailableDomains();
    res.json(domains);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Get study history for user
app.get('/api/study/history', verifyToken, async (req, res) => {
  try {
    const history = await getStudyHistory(req.user.id);
    res.json(history);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---- Admin auth middleware ----
function adminOnly(req, res, next) {
  const token = req.header("x-admin-token");
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: "admin_token_not_set" });
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: "admin_unauthorized" });
  next();
}

app.get("/api/admin/summary", adminOnly, async (req, res) => {
  try {
    const tables = await all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const names = new Set(tables.map(t => t.name));

    // find users table
    const userTableCandidates = ["users", "accounts", "user", "account"];
    const USERS_T = userTableCandidates.find(t => names.has(t)) || null;

    // question count
    const qCountRow = await all(`SELECT COUNT(*) AS n FROM questions`);
    const questionCount = qCountRow?.[0]?.n ?? 0;

    // recent exams (schema: started_at, submitted_at, score, answered_count)
    let recentExams = [];
    if (USERS_T) {
      // detect email/username column name
      const userCols = await all(`PRAGMA table_info(${USERS_T})`);
      const userColNames = new Set(userCols.map(c => c.name));
      const emailCol = userColNames.has("email") ? "email" : (userColNames.has("username") ? "username" : null);
      const createdCol = userColNames.has("created_at") ? "created_at"
        : (userColNames.has("createdAt") ? "createdAt"
        : (userColNames.has("created") ? "created" : null));

      // users list
      const users = emailCol ? await all(`
        SELECT id, ${emailCol} AS email ${createdCol ? `, ${createdCol} AS created_at` : ""}
        FROM ${USERS_T}
        ORDER BY ${createdCol ? createdCol : "id"} DESC
      `) : [];

      // user stats from your exams schema
      const userStats = emailCol ? await all(`
        SELECT
          u.id AS user_id,
          u.${emailCol} AS email,
          COUNT(e.id) AS attempts,
          MAX(e.score) AS best_score,
          ROUND(MAX(e.score * 100.0 / e.total_questions), 1) AS best_pct,
          ROUND(AVG(e.score * 100.0 / e.total_questions), 1) AS avg_pct,
          MAX(e.submitted_at) AS last_attempt_at
        FROM ${USERS_T} u
        LEFT JOIN exams e ON e.user_id = u.id AND e.submitted_at IS NOT NULL
        GROUP BY u.id
        ORDER BY attempts DESC, best_score DESC
      `) : [];

      // recent exams with email
      recentExams = emailCol ? await all(`
        SELECT
          e.id AS exam_id,
          u.${emailCol} AS email,
          e.user_id,
          e.started_at,
          e.submitted_at,
          e.time_used,
          e.score,
          e.total_questions,
          e.answered_count,
          e.is_retake_missed
        FROM exams e
        LEFT JOIN ${USERS_T} u ON u.id = e.user_id
        ORDER BY e.started_at DESC
        LIMIT 200
      `) : await all(`
        SELECT
          id AS exam_id,
          user_id,
          started_at,
          submitted_at,
          time_used,
          score,
          total_questions,
          answered_count,
          is_retake_missed
        FROM exams
        ORDER BY started_at DESC
        LIMIT 200
      `);

      return res.json({
        ok: true,
        tables: Array.from(names),
        usersTable: USERS_T,
        questionCount,
        users,
        userStats,
        recentExams
      });
    }

    // no users table found → still return exams + questions count
    recentExams = await all(`
      SELECT
        id AS exam_id,
        user_id,
        started_at,
        submitted_at,
        time_used,
        score,
        total_questions,
        answered_count,
        is_retake_missed
      FROM exams
      ORDER BY started_at DESC
      LIMIT 200
    `);

    res.json({
      ok: true,
      tables: Array.from(names),
      usersTable: null,
      questionCount,
      users: [],
      userStats: [],
      recentExams
    });

  } catch (err) {
    console.error("admin summary error:", err);
    res.status(500).json({ ok: false, error: "admin_summary_failed", details: String(err.message || err) });
  }
});

app.get("/api/admin/schema", adminOnly, async (req, res) => {
  try {
    const tables = await all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const result = {};
    for (const t of tables) {
      const cols = await all(`PRAGMA table_info(${t.name})`);
      result[t.name] = cols.map(c => ({ name: c.name, type: c.type }));
    }
    res.json({ ok: true, schema: result });
  } catch (err) {
    console.error("schema error:", err);
    res.status(500).json({ ok: false, error: "schema_failed", details: String(err.message || err) });
  }
});

// Pause exam
app.post('/api/exams/:id/pause', verifyToken, async (req, res) => {
  try {
    const examId = parseInt(req.params.id);
    const now = new Date().toISOString();
    
    db.run(
      'UPDATE exams SET paused_at = ? WHERE id = ? AND user_id = ? AND submitted_at IS NULL',
      [now, examId, req.user.id],
      function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Exam not found or already submitted' });
        res.json({ success: true, pausedAt: now });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resume exam
app.post('/api/exams/:id/resume', verifyToken, async (req, res) => {
  try {
    const examId = parseInt(req.params.id);
    
    db.run(
      'UPDATE exams SET paused_at = NULL WHERE id = ? AND user_id = ? AND submitted_at IS NULL',
      [examId, req.user.id],
      function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Exam not found or already submitted' });
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bookmark question
app.post('/api/bookmarks', verifyToken, async (req, res) => {
  try {
    const { questionId, notes } = req.body;
    
    db.run(
      'INSERT OR REPLACE INTO bookmarked_questions (user_id, question_id, notes) VALUES (?, ?, ?)',
      [req.user.id, questionId, notes || null],
      function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true, id: this.lastID });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user bookmarks
app.get('/api/bookmarks', verifyToken, async (req, res) => {
  try {
    db.all(
      `SELECT b.*, q.question, q.domain, q.difficulty
       FROM bookmarked_questions b
       JOIN questions q ON b.question_id = q.id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove bookmark
app.delete('/api/bookmarks/:questionId', verifyToken, async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId);
    
    db.run(
      'DELETE FROM bookmarked_questions WHERE user_id = ? AND question_id = ?',
      [req.user.id, questionId],
      function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== USER SELF-SERVICE ENDPOINTS =====

// Export user data (GDPR-style)
app.get('/api/me/export', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user profile (without password)
    const user = await get(
      'SELECT id, email, role, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get all non-deleted attempts
    const attempts = await all(
      `SELECT id, mode, started_at, submitted_at, duration, total_questions,
              score_percent, correct_count, partial_count, incorrect_count
       FROM exam_attempts
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY started_at DESC`,
      [userId]
    );
    
    // Get answers for all attempts
    const attemptIds = attempts.map(a => a.id);
    let answers = [];
    if (attemptIds.length > 0) {
      const placeholders = attemptIds.map(() => '?').join(',');
      answers = await all(
        `SELECT eaa.attempt_id, eaa.question_number, eaa.user_answer_json,
                eaa.is_correct, eaa.points, q.question, q.domain
         FROM exam_attempt_answers eaa
         JOIN questions q ON eaa.question_id = q.id
         WHERE eaa.attempt_id IN (${placeholders})
         ORDER BY eaa.attempt_id, eaa.question_number`,
        attemptIds
      );
    }
    
    // Get login history (last 50)
    const logins = await all(
      `SELECT event, ip_address, created_at
       FROM auth_logins
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    
    // Get bookmarks
    const bookmarks = await all(
      `SELECT bq.question_id, bq.notes, bq.created_at, q.question, q.domain
       FROM bookmarked_questions bq
       JOIN questions q ON bq.question_id = q.id
       WHERE bq.user_id = ?
       ORDER BY bq.created_at DESC`,
      [userId]
    );
    
    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        memberSince: user.created_at
      },
      attempts: attempts.map(attempt => ({
        ...attempt,
        answers: answers.filter(a => a.attempt_id === attempt.id)
      })),
      loginHistory: logins,
      bookmarks: bookmarks,
      statistics: {
        totalAttempts: attempts.length,
        totalQuestionsAnswered: answers.length,
        averageScore: attempts.length > 0 
          ? (attempts.reduce((sum, a) => sum + (a.score_percent || 0), 0) / attempts.length).toFixed(2)
          : 0
      }
    };
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="comptia-data-export-${user.id}-${Date.now()}.json"`);
    res.json(exportData);
    
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Get user's own attempts
app.get('/api/me/attempts', verifyToken, async (req, res) => {
  try {
    const attempts = await all(
      `SELECT id, mode, started_at, submitted_at, duration, total_questions, 
              score_percent, correct_count, partial_count, incorrect_count
       FROM exam_attempts
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY started_at DESC`,
      [req.user.id]
    );
    res.json(attempts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific attempt details with answers
app.get('/api/me/attempts/:id', verifyToken, async (req, res) => {
  try {
    const attemptId = parseInt(req.params.id);
    
    // Verify ownership
    const attempt = await get(
      'SELECT * FROM exam_attempts WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [attemptId, req.user.id]
    );
    
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    
    // Get answers
    const answers = await all(
      `SELECT eaa.*, q.question, q.domain, q.qtype, q.answer, q.explanation,
              q.choice_a, q.choice_b, q.choice_c, q.choice_d
       FROM exam_attempt_answers eaa
       JOIN questions q ON eaa.question_id = q.id
       WHERE eaa.attempt_id = ?
       ORDER BY eaa.question_number`,
      [attemptId]
    );
    
    res.json({
      attempt,
      answers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft delete user's own attempt
app.delete('/api/me/attempts/:id', verifyToken, async (req, res) => {
  try {
    const attemptId = parseInt(req.params.id);
    
    // Verify ownership
    const attempt = await get(
      'SELECT id FROM exam_attempts WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [attemptId, req.user.id]
    );
    
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    
    // Soft delete
    await run(
      'UPDATE exam_attempts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [attemptId]
    );
    
    res.json({ message: 'Attempt deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft delete user's own account
app.delete('/api/me/account', verifyToken, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password required to delete account' });
    }
    
    // Verify password
    const user = await get(
      'SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const bcrypt = (await import('bcryptjs')).default;
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Soft delete user
    await run(
      'UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.user.id]
    );
    
    // Also soft delete all user's attempts
    await run(
      'UPDATE exam_attempts SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [req.user.id]
    );
    
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get audit logs (protected with verifyAdmin)
app.get('/api/admin/audit-logs', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { getAuditLogs } = await import('./auditService.js');
    const logs = await getAuditLogs({
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get brute-force protection stats
app.get('/api/admin/brute-force-stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const stats = getBruteForceStats();
    const topBannedIps = await getTopBannedIps(20);
    
    // Flatten stats for easier dashboard consumption
    res.json({
      timestamp: stats.timestamp,
      active_bans: stats.ban_manager.active_bans,
      escalated_bans: stats.ban_manager.escalated_bans,
      active_account_locks: stats.account_locker.active_locks,
      tracked_ips: stats.shared_ip_detector.tracked_ips,
      shared_ips_detected: stats.shared_ip_detector.shared_ips_detected,
      tracked_failures: stats.account_locker.tracked_failures,
      tracked_ban_history: stats.ban_manager.tracked_ban_history,
      memory_usage_mb: stats.memory_usage_mb,
      config: stats.config,
      top_banned_ips: topBannedIps.map(ban => ({
        ...ban,
        duration_seconds: Math.round((new Date(ban.expires_at) - Date.now()) / 1000)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Manually unban an IP
app.post('/api/admin/unban-ip', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { ip_hash } = req.body;
    
    if (!ip_hash) {
      return res.status(400).json({ error: 'ip_hash is required' });
    }
    
    const unbanned = unbanIp(ip_hash);
    
    if (unbanned) {
      res.json({ 
        success: true, 
        message: 'IP unbanned successfully',
        ip_hash 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'IP ban not found' 
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Test Discord webhook
app.post('/api/admin/discord-test', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { severity } = req.body;
    const testSeverity = ['LOW', 'MEDIUM', 'HIGH'].includes(severity) ? severity : 'MEDIUM';
    
    const success = await sendTestAlert(testSeverity);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Test ${testSeverity} alert sent successfully to Discord` 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send Discord alert. Check DISCORD_WEBHOOK_URL in .env' 
      });
    }
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Admin: Manually trigger data cleanup
app.post('/api/admin/cleanup', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const results = await runAllCleanupTasks();
    res.json({
      message: 'Data cleanup completed successfully',
      results
    });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed: ' + err.message });
  }
});

// ===== ADMIN USER MANAGEMENT ENDPOINTS =====

// Get all users (admin only)
app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await all(
      `SELECT id, email, role, created_at, deleted_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific user details (admin only)
app.get('/api/admin/users/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    const user = await get(
      `SELECT id, email, role, created_at, deleted_at
       FROM users
       WHERE id = ?`,
      [userId]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's attempts
    const attempts = await all(
      `SELECT id, mode, started_at, submitted_at, duration, total_questions,
              score_percent, correct_count, partial_count, incorrect_count, deleted_at
       FROM exam_attempts
       WHERE user_id = ?
       ORDER BY started_at DESC`,
      [userId]
    );
    
    // Get user's login history
    const logins = await all(
      `SELECT id, event, ip_address, user_agent, created_at
       FROM auth_logins
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );
    
    res.json({
      user,
      attempts,
      logins
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft delete user (admin only)
app.delete('/api/admin/users/:id', verifyToken, verifyAdmin, validateIdParam('id'), async (req, res) => {
  try {
    const userId = req.params.id; // Already validated and converted to number
    
    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const user = await get(
      'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Soft delete user
    await run(
      'UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
    
    // Soft delete all user's attempts
    await run(
      'UPDATE exam_attempts SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [userId]
    );
    
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft delete attempt (admin only)
app.delete('/api/admin/attempts/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const attemptId = parseInt(req.params.id);
    
    const attempt = await get(
      'SELECT id FROM exam_attempts WHERE id = ? AND deleted_at IS NULL',
      [attemptId]
    );
    
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    
    // Soft delete
    await run(
      'UPDATE exam_attempts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [attemptId]
    );
    
    res.json({ message: 'Attempt deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Feedback endpoints
app.post('/api/feedback', verifyToken, async (req, res) => {
  try {
    const { message, rating } = req.body;
    
    // Reject empty or whitespace-only messages
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Feedback message cannot be empty' });
    }
    
    // Limit to 1000 characters
    if (message.length > 1000) {
      return res.status(400).json({ error: 'Feedback message is too long (max 1000 characters)' });
    }
    
    // Check for recent submissions (prevent spam)
    const recentFeedback = await get(
      'SELECT created_at FROM feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    
    if (recentFeedback) {
      const lastSubmit = new Date(recentFeedback.created_at);
      const now = new Date();
      const diffMinutes = (now - lastSubmit) / (1000 * 60);
      
      if (diffMinutes < 5) {
        return res.status(429).json({ 
          error: `Please wait ${Math.ceil(5 - diffMinutes)} more minute(s) before submitting again` 
        });
      }
    }
    
    await run(
      'INSERT INTO feedback (user_id, message, rating, is_read, created_at) VALUES (?, ?, ?, 0, datetime("now"))',
      [req.user.id, message.trim(), rating || null]
    );
    
    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (err) {
    console.error('Error submitting feedback:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

app.get('/api/feedback', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const feedback = await all(`
      SELECT 
        f.id,
        f.message,
        f.rating,
        f.is_read,
        f.created_at,
        u.email as user_email
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ORDER BY f.is_read ASC, f.created_at DESC
    `);
    
    res.json(feedback);
  } catch (err) {
    console.error('Error fetching feedback:', err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// Mark feedback as read (admin only)
app.patch('/api/feedback/:id/read', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id);
    const { is_read } = req.body;
    
    if (isNaN(feedbackId)) {
      return res.status(400).json({ error: 'Invalid feedback ID' });
    }
    
    await run(
      'UPDATE feedback SET is_read = ? WHERE id = ?',
      [is_read ? 1 : 0, feedbackId]
    );
    
    res.json({ message: 'Feedback status updated' });
  } catch (err) {
    console.error('Error updating feedback:', err);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

// Delete feedback (admin only)
app.delete('/api/feedback/:id', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id);
    
    if (isNaN(feedbackId)) {
      return res.status(400).json({ error: 'Invalid feedback ID' });
    }
    
    await run('DELETE FROM feedback WHERE id = ?', [feedbackId]);
    
    res.json({ message: 'Feedback deleted successfully' });
  } catch (err) {
    console.error('Error deleting feedback:', err);
    res.status(500).json({ error: 'Failed to delete feedback' });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Validation error handling middleware
app.use(validationErrorHandler);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`CyberAcademy Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
