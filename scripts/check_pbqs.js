import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "comptia.db");

async function main() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  const total = await db.get(`SELECT COUNT(*) AS n FROM questions`);
  const pbq = await db.get(`SELECT COUNT(*) AS n FROM questions WHERE qtype='pbq'`);
  const mcq = await db.get(`SELECT COUNT(*) AS n FROM questions WHERE qtype='mcq' OR qtype IS NULL`);

  console.log("Total questions:", total.n);
  console.log("PBQs:", pbq.n);
  console.log("MCQs:", mcq.n);

  const sample = await db.all(`SELECT id, question, qtype FROM questions WHERE qtype='pbq' LIMIT 3`);
  console.log("Sample PBQs:", sample);

  await db.close();
}

main().catch(console.error);
