import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'database', 'comptia.db');
const db = new sqlite3.Database(dbPath);

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error('Usage: node make_admin.js <email>');
  console.error('Example: node make_admin.js user@example.com');
  process.exit(1);
}

db.get('SELECT id, email, role FROM users WHERE email = ?', [email.toLowerCase()], (err, user) => {
  if (err) {
    console.error('Database error:', err);
    db.close();
    process.exit(1);
  }

  if (!user) {
    console.error(`User not found: ${email}`);
    db.close();
    process.exit(1);
  }

  if (user.role === 'admin') {
    console.log(`User ${email} is already an admin!`);
    db.close();
    process.exit(0);
  }

  db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id], (err) => {
    if (err) {
      console.error('Error updating user:', err);
      db.close();
      process.exit(1);
    }

    console.log(`✓ Success! User ${email} is now an admin.`);
    console.log('Please log out and log back in for changes to take effect.');
    db.close();
  });
});
