import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./database/comptia.db');

db.get(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN qtype IS NULL OR qtype = 'mcq' THEN 1 ELSE 0 END) as mcqs,
    SUM(CASE WHEN qtype = 'pbq' THEN 1 ELSE 0 END) as pbqs
  FROM questions
`, (err, row) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Total questions:', row.total);
    console.log('MCQs:', row.mcqs);
    console.log('PBQs:', row.pbqs);
  }
  db.close();
});
