// Database migration script to add new columns
import { db } from '../database/db.js';

console.log('🔄 Running database migrations...\n');

const migrations = [
  {
    name: 'Add role column to users',
    sql: `ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`,
    check: `SELECT role FROM users LIMIT 1`
  },
  {
    name: 'Add paused_at to exams',
    sql: `ALTER TABLE exams ADD COLUMN paused_at DATETIME`,
    check: `SELECT paused_at FROM exams LIMIT 1`
  },
  {
    name: 'Add explanation_short to questions',
    sql: `ALTER TABLE questions ADD COLUMN explanation_short TEXT`,
    check: `SELECT explanation_short FROM questions LIMIT 1`
  },
  {
    name: 'Add explanation_long to questions',
    sql: `ALTER TABLE questions ADD COLUMN explanation_long TEXT`,
    check: `SELECT explanation_long FROM questions LIMIT 1`
  },
  {
    name: 'Add explanation_wrong to questions',
    sql: `ALTER TABLE questions ADD COLUMN explanation_wrong TEXT`,
    check: `SELECT explanation_wrong FROM questions LIMIT 1`
  },
  {
    name: 'Add qtype to questions',
    sql: `ALTER TABLE questions ADD COLUMN qtype TEXT`,
    check: `SELECT qtype FROM questions LIMIT 1`
  },
  {
    name: 'Add pbq_json to questions',
    sql: `ALTER TABLE questions ADD COLUMN pbq_json TEXT`,
    check: `SELECT pbq_json FROM questions LIMIT 1`
  }
];

async function runMigration(migration) {
  return new Promise((resolve) => {
    // First check if column exists
    db.get(migration.check, (checkErr) => {
      if (!checkErr) {
        console.log(`✓ ${migration.name} - already exists`);
        resolve();
      } else {
        // Column doesn't exist, add it
        db.run(migration.sql, (err) => {
          if (err) {
            console.log(`✗ ${migration.name} - failed: ${err.message}`);
          } else {
            console.log(`✓ ${migration.name} - added successfully`);
          }
          resolve();
        });
      }
    });
  });
}

async function createTables() {
  return new Promise((resolve) => {
    // Create bookmarked_questions table
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
      if (err) {
        console.log('✗ Create bookmarked_questions table - failed:', err.message);
      } else {
        console.log('✓ Create bookmarked_questions table - success');
      }
      
      // Create audit_logs table
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
      `, (err2) => {
        if (err2) {
          console.log('✗ Create audit_logs table - failed:', err2.message);
        } else {
          console.log('✓ Create audit_logs table - success');
        }
        resolve();
      });
    });
  });
}

async function main() {
  // Run column migrations
  for (const migration of migrations) {
    await runMigration(migration);
  }
  
  // Create new tables
  await createTables();
  
  console.log('\n✅ Database migrations complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
