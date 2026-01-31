// Migration 001: Initial schema
// Creates all core tables for the CompTIA practice exam application

export const up = (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          deleted_at DATETIME DEFAULT NULL
        )
      `, (err) => {
        if (err) return reject(err);
      });

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
      `, (err) => {
        if (err) return reject(err);
      });

      // Exams table (legacy - kept for compatibility)
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
      `, (err) => {
        if (err) return reject(err);
      });

      // Exam questions (legacy)
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
      `, (err) => {
        if (err) return reject(err);
      });

      // Question usage tracking
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
      `, (err) => {
        if (err) return reject(err);
      });

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
      `, (err) => {
        if (err) return reject(err);
      });

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
      `, (err) => {
        if (err) return reject(err);
      });

      // Auth logins
      db.run(`
        CREATE TABLE IF NOT EXISTS auth_logins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          event TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // Exam attempts (PRIMARY SOURCE OF TRUTH)
      db.run(`
        CREATE TABLE IF NOT EXISTS exam_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          mode TEXT NOT NULL,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          submitted_at DATETIME,
          duration INTEGER,
          total_questions INTEGER NOT NULL,
          score_percent REAL,
          correct_count INTEGER,
          partial_count INTEGER,
          incorrect_count INTEGER,
          deleted_at DATETIME DEFAULT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // Exam attempt answers (PRIMARY SOURCE OF TRUTH)
      db.run(`
        CREATE TABLE IF NOT EXISTS exam_attempt_answers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attempt_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          question_number INTEGER NOT NULL,
          user_answer_json TEXT,
          is_correct BOOLEAN,
          is_partial BOOLEAN DEFAULT 0,
          points REAL DEFAULT 0,
          FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
          FOREIGN KEY (question_id) REFERENCES questions(id)
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // Study sessions
      db.run(`
        CREATE TABLE IF NOT EXISTS study_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          filters TEXT,
          question_count INTEGER DEFAULT 0,
          correct_count INTEGER DEFAULT 0,
          immediate_mode BOOLEAN DEFAULT 0,
          status TEXT DEFAULT 'active',
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // Study session questions
      db.run(`
        CREATE TABLE IF NOT EXISTS study_session_questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          question_number INTEGER NOT NULL,
          user_answer TEXT,
          is_correct BOOLEAN,
          answered_at DATETIME,
          FOREIGN KEY (session_id) REFERENCES study_sessions(id),
          FOREIGN KEY (question_id) REFERENCES questions(id),
          UNIQUE(session_id, question_number)
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

export const down = (db) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const tables = [
        'study_session_questions',
        'study_sessions',
        'exam_attempt_answers',
        'exam_attempts',
        'auth_logins',
        'audit_logs',
        'bookmarked_questions',
        'question_usage',
        'exam_questions',
        'exams',
        'questions',
        'users'
      ];
      
      tables.forEach((table, index) => {
        db.run(`DROP TABLE IF EXISTS ${table}`, (err) => {
          if (err) return reject(err);
          if (index === tables.length - 1) resolve();
        });
      });
    });
  });
};
