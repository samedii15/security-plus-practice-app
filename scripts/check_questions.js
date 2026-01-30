import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'database', 'comptia.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking questions in database...\n');

db.get('SELECT COUNT(*) as total FROM questions', [], (err, row) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  console.log(`Total questions: ${row.total}`);
  
  db.get("SELECT COUNT(*) as pbqs FROM questions WHERE qtype = 'pbq'", [], (err, row2) => {
    if (err) {
      console.error('Error:', err);
      db.close();
      return;
    }
    console.log(`PBQ questions: ${row2.pbqs}`);
    
    db.get("SELECT COUNT(*) as mcqs FROM questions WHERE qtype IS NULL OR qtype = 'mcq' OR qtype = ''", [], (err, row3) => {
      if (err) {
        console.error('Error:', err);
        db.close();
        return;
      }
      console.log(`MCQ questions: ${row3.mcqs}`);
      db.close();
    });
  });
});
