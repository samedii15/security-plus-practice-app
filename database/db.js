import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'comptia.db');

// Check if database exists, if not run migrations
const dbExists = fs.existsSync(dbPath);

const db = new sqlite3.Database(dbPath);

// Initialize database schema using migrations
async function initDatabase() {
  if (!dbExists) {
    console.log('Database not found, running migrations...');
    try {
      // Run migrations synchronously on first startup
      execSync('node migrations/migrate.js up', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });
      console.log('Database schema initialized successfully via migrations');
    } catch (err) {
      console.error('Failed to run migrations:', err.message);
      throw err;
    }
  } else {
    // Database exists, just ensure migrations table exists
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err && !err.message.includes('already exists')) {
          console.error('Error creating migrations table:', err);
        }
      });
    });
    console.log('Database schema initialized successfully');
  }
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
