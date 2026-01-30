import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'database', 'comptia.db');
const db = new sqlite3.Database(dbPath);

console.log('All users in database:\n');

db.all('SELECT id, email, role, created_at FROM users WHERE deleted_at IS NULL', [], (err, users) => {
  if (err) {
    console.error('Database error:', err);
    db.close();
    process.exit(1);
  }

  if (users.length === 0) {
    console.log('No users found. Please register an account first.');
  } else {
    console.table(users);
    console.log('\nTo make a user admin, run:');
    console.log('node scripts/make_admin.js <email>');
  }

  db.close();
});
