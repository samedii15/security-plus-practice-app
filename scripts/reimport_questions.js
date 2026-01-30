import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'database', 'comptia.db');
const questionsPath = path.join(__dirname, '..', 'questions.json');

const db = new sqlite3.Database(dbPath);

console.log('Reading questions.json...');
const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
console.log(`Found ${questionsData.length} questions in JSON file\n`);

db.serialize(() => {
  // Delete existing questions
  db.run('DELETE FROM questions', (err) => {
    if (err) {
      console.error('Error deleting old questions:', err);
      db.close();
      process.exit(1);
    }
    
    console.log('Deleted old questions from database');
    console.log('Importing all questions...\n');
    
    const stmt = db.prepare(`
      INSERT INTO questions (question, choice_a, choice_b, choice_c, choice_d, answer, explanation, 
                             explanation_short, explanation_long, explanation_wrong, domain, difficulty, qtype, pbq_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let imported = 0;
    questionsData.forEach(q => {
      try {
        stmt.run(
          q.question,
          q.choices?.A || '',
          q.choices?.B || '',
          q.choices?.C || '',
          q.choices?.D || '',
          q.answer || '',
          q.explanation || '',
          q.explanation_short || null,
          q.explanation_long || null,
          q.explanation_wrong || null,
          q.domain || 'General',
          q.difficulty || 'medium',
          q.qtype || 'mcq',
          q.pbq_json ? JSON.stringify(q.pbq_json) : null
        );
        imported++;
      } catch (error) {
        console.error(`Error importing question ${q.id}:`, error);
      }
    });
    
    stmt.finalize(() => {
      console.log(`\n✓ Successfully imported ${imported} questions!`);
      
      db.get('SELECT COUNT(*) as count FROM questions', (err, row) => {
        if (!err) {
          console.log(`Total questions in database: ${row.count}`);
        }
        db.close();
      });
    });
  });
});
