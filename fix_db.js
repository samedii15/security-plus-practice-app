import { run } from './database/db.js';

console.log('Creating feedback table...');
await run(`CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  rating TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
)`);
await run(`CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id)`);
await run(`CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC)`);
console.log('Feedback table created successfully!');
process.exit(0);
