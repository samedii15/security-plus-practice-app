import { run, get } from '../database/db.js';

async function up() {
  console.log('Adding is_read column to feedback table...');
  
  // Check if column already exists
  try {
    await get('SELECT is_read FROM feedback LIMIT 1');
    console.log('is_read column already exists');
    return;
  } catch (error) {
    // Column doesn't exist, add it
    await run(`
      ALTER TABLE feedback 
      ADD COLUMN is_read INTEGER DEFAULT 0
    `);
    
    console.log('is_read column added successfully');
  }
}

async function down() {
  // SQLite doesn't support dropping columns easily
  console.log('Cannot remove is_read column (SQLite limitation)');
}

export { up, down };