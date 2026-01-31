const { Database } = require('sqlite3');

const db = new Database('/data/cyberacademy.db', (err) => {
  if (err) {
    console.error('Database connection error:', err);
    return;
  }
  console.log('Connected to database');
});

db.all('SELECT * FROM feedback', (err, rows) => {
  if (err) {
    console.error('Query error:', err);
  } else {
    console.log('Feedback table contents:');
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});