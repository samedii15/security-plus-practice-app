// Migration runner for database schema management
// Usage: node migrations/migrate.js [up|down|status]

import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'database', 'comptia.db');
const db = new sqlite3.Database(dbPath);

// Create migrations table to track applied migrations
function createMigrationsTable() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Get list of applied migrations
function getAppliedMigrations() {
  return new Promise((resolve, reject) => {
    db.all('SELECT name FROM migrations ORDER BY name', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.name));
    });
  });
}

// Record migration as applied
function recordMigration(name) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO migrations (name) VALUES (?)', [name], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Remove migration record
function removeMigration(name) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM migrations WHERE name = ?', [name], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Get all migration files
async function getMigrationFiles() {
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js') && f !== 'migrate.js')
    .sort();
  
  return files;
}

// Run migrations up
async function migrateUp() {
  await createMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = await getMigrationFiles();
  
  let migrationCount = 0;
  
  for (const file of files) {
    const name = file.replace('.js', '');
    
    if (applied.includes(name)) {
      console.log(`⏭️  Skipping ${name} (already applied)`);
      continue;
    }
    
    console.log(`⬆️  Running migration: ${name}`);
    
    try {
      const migration = await import(`./${file}`);
      await migration.up(db);
      await recordMigration(name);
      console.log(`✅ Successfully applied ${name}`);
      migrationCount++;
    } catch (err) {
      console.error(`❌ Failed to apply ${name}:`, err.message);
      throw err;
    }
  }
  
  if (migrationCount === 0) {
    console.log('✅ Database is already up to date');
  } else {
    console.log(`\n✅ Applied ${migrationCount} migration(s)`);
  }
}

// Run migrations down
async function migrateDown() {
  await createMigrationsTable();
  const applied = await getAppliedMigrations();
  
  if (applied.length === 0) {
    console.log('No migrations to roll back');
    return;
  }
  
  const lastMigration = applied[applied.length - 1];
  const file = `${lastMigration}.js`;
  
  console.log(`⬇️  Rolling back migration: ${lastMigration}`);
  
  try {
    const migration = await import(`./${file}`);
    await migration.down(db);
    await removeMigration(lastMigration);
    console.log(`✅ Successfully rolled back ${lastMigration}`);
  } catch (err) {
    console.error(`❌ Failed to roll back ${lastMigration}:`, err.message);
    throw err;
  }
}

// Show migration status
async function showStatus() {
  await createMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = await getMigrationFiles();
  
  console.log('\n📊 Migration Status:\n');
  console.log('Applied migrations:');
  
  if (applied.length === 0) {
    console.log('  (none)');
  } else {
    applied.forEach(name => {
      console.log(`  ✅ ${name}`);
    });
  }
  
  const pending = files
    .map(f => f.replace('.js', ''))
    .filter(name => !applied.includes(name));
  
  if (pending.length > 0) {
    console.log('\nPending migrations:');
    pending.forEach(name => {
      console.log(`  ⏳ ${name}`);
    });
  } else {
    console.log('\n✅ All migrations applied');
  }
  
  console.log('');
}

// Main
async function main() {
  const command = process.argv[2] || 'up';
  
  try {
    switch (command) {
      case 'up':
        await migrateUp();
        break;
      case 'down':
        await migrateDown();
        break;
      case 'status':
        await showStatus();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Usage: node migrate.js [up|down|status]');
        process.exit(1);
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
