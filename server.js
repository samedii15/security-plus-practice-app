import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { db, initDatabase, all, get, run } from "./database/db.js";
import { register, login, verifyToken, verifyAdmin } from "./auth.js";
import { startExam, submitExam, getExamHistory, getExamReview, getDomainStats } from "./examService.js";
import { getUserAnalytics, getDomainPerformance, getProgressOverTime } from "./analyticsService.js";

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

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
initDatabase();

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  db.get('SELECT COUNT(*) as count FROM questions', (err, row) => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    res.json({ ok: true, questions: row.count });
  });
});

// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await register(email, password, req);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password, req);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Exam endpoints (protected)
app.post('/api/exams/start', verifyToken, async (req, res) => {
  try {
    const { isRetakeMissed } = req.body;
    const result = await startExam(req.user.id, isRetakeMissed);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/exams/:id/submit', verifyToken, async (req, res) => {
  try {
    const examId = parseInt(req.params.id);
    const { answers, timeUsed } = req.body;
    const result = await submitExam(examId, req.user.id, answers, timeUsed);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/exams/history', verifyToken, async (req, res) => {
  try {
    const history = await getExamHistory(req.user.id);
    res.json(history);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/exams/:id', verifyToken, async (req, res) => {
  try {
    const examId = parseInt(req.params.id);
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

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`CompTIA Security+ Exam Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
