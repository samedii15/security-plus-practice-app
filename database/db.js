import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'comptia.db');
const db = new sqlite3.Database(dbPath);

// Initialize database schema
function initDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Questions table
    db.run(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        question TEXT NOT NULL,
        choice_a TEXT NOT NULL,
        choice_b TEXT NOT NULL,
        choice_c TEXT NOT NULL,
        choice_d TEXT NOT NULL,
        answer TEXT NOT NULL,
        explanation TEXT NOT NULL,
        explanation_short TEXT,
        explanation_long TEXT,
        explanation_wrong TEXT,
        domain TEXT,
        difficulty TEXT,
        qtype TEXT,
        pbq_json TEXT
      )
    `);

    // Exams table
    db.run(`
      CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        submitted_at DATETIME,
        paused_at DATETIME,
        time_used INTEGER,
        score INTEGER,
        total_questions INTEGER DEFAULT 90,
        answered_count INTEGER DEFAULT 0,
        is_retake_missed BOOLEAN DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Exam questions (tracks which questions were in each exam)
    db.run(`
      CREATE TABLE IF NOT EXISTS exam_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        question_number INTEGER NOT NULL,
        user_answer TEXT,
        is_correct BOOLEAN,
        marked_for_review BOOLEAN DEFAULT 0,
        FOREIGN KEY (exam_id) REFERENCES exams(id),
        FOREIGN KEY (question_id) REFERENCES questions(id)
      )
    `);

    // Question usage tracking (to prevent repeats)
    db.run(`
      CREATE TABLE IF NOT EXISTS question_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        times_used INTEGER DEFAULT 1,
        times_correct INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (question_id) REFERENCES questions(id),
        UNIQUE(user_id, question_id)
      )
    `);

    // Bookmarked questions
    db.run(`
      CREATE TABLE IF NOT EXISTS bookmarked_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (question_id) REFERENCES questions(id),
        UNIQUE(user_id, question_id)
      )
    `);

    // Audit logs
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id INTEGER,
        ip_address TEXT,
        user_agent TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    console.log('Database schema initialized successfully');
  });
}

// Promise wrappers for async/await usage
export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

export { db, initDatabase };
