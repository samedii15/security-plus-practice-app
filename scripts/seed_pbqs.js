/**
 * Seed PBQs into SQLite.
 * Usage: node scripts/seed_pbqs.js
 *
 * Expects:
 * - database/comptia.db
 * - questions table with columns:
 *   id (INTEGER PK), question, choice_a, choice_b, choice_c, choice_d, answer, explanation, domain, difficulty
 * Plus you should add:
 *   qtype TEXT DEFAULT 'mcq'
 *   pbq_json TEXT
 */
import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const DB_PATH = path.join(process.cwd(), "database", "comptia.db");
const PBQ_PATH = path.join(process.cwd(), "pbqs_100.json");

async function main() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  // Ensure columns exist (safe if already added)
  // SQLite doesn't support IF NOT EXISTS for ADD COLUMN in older versions, so we try/catch.
  try { await db.exec(`ALTER TABLE questions ADD COLUMN qtype TEXT NOT NULL DEFAULT 'mcq';`); } catch {}
  try { await db.exec(`ALTER TABLE questions ADD COLUMN pbq_json TEXT;`); } catch {}

  const pbqs = JSON.parse(fs.readFileSync(PBQ_PATH, "utf-8"));

  const insert = await db.prepare(`
    INSERT INTO questions (question, choice_a, choice_b, choice_c, choice_d, answer, explanation, domain, difficulty, qtype, pbq_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let added = 0;
  for (const p of pbqs) {
    const q = p.question;
    const explanation = p.explanation || "";
    const domain = p.domain || "Security Operations";
    const difficulty = p.difficulty || "Medium";
    const pbqJson = JSON.stringify(p.pbq_json);

    // For PBQs we don't use A-D; keep non-null placeholders
    await insert.run(
      q,
      "", "", "", "",
      "", // answer not used for PBQ grading
      explanation,
      domain,
      difficulty,
      "pbq",
      pbqJson
    );
    added++;
  }

  await insert.finalize();
  await db.close();
  console.log(`Seeded ${added} PBQ questions into ${DB_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
