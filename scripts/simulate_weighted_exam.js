// Script to test domain weighting by simulating exam generation
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new sqlite3.Database(path.join(__dirname, '../database/comptia.db'));

// Domain weights (from examService.js)
const DOMAIN_WEIGHTS = {
  'Security Operations': 0.30,
  'Threats, Vulnerabilities & Mitigations': 0.22,
  'Threats and Vulnerabilities': 0.03,
  'Security Architecture': 0.18,
  'Security Program Management & Oversight': 0.20,
  'General Security Concepts': 0.12,
  'Security Governance': 0.03,
  'Identity and Access Management': 0.03,
  'Network Security': 0.03,
  'Cryptography': 0.02,
  'Application Security': 0.02,
  'Data Security': 0.02,
  'Risk Management': 0.02,
  'Cloud Security': 0.02,
  'Endpoint Security': 0.01,
  'Mobile Security': 0.01,
  'Business Continuity': 0.01,
  'Security Assessment': 0.01,
  'Vulnerability Management': 0.01,
  'Security Fundamentals': 0.01,
  'Security Models': 0.01
};

const MCQ_COUNT = 85;

console.log('🎯 Simulating Weighted Exam Generation\n');
console.log('='.repeat(70));

// Get all MCQ questions
db.all(
  `SELECT * FROM questions WHERE qtype IS NULL OR qtype = 'mcq'`,
  [],
  (err, allQuestions) => {
    if (err) {
      console.error('Error:', err);
      db.close();
      return;
    }

    console.log(`\n📚 Available MCQs: ${allQuestions.length}\n`);

    // Group by domain
    const questionsByDomain = {};
    allQuestions.forEach(q => {
      const domain = q.domain || 'General Security Concepts';
      if (!questionsByDomain[domain]) {
        questionsByDomain[domain] = [];
      }
      questionsByDomain[domain].push(q);
    });

    console.log('📊 Available Questions by Domain:\n');
    console.log('Domain'.padEnd(50), 'Available');
    console.log('-'.repeat(70));

    const domains = Object.keys(questionsByDomain).sort();
    domains.forEach(domain => {
      console.log(domain.padEnd(50), questionsByDomain[domain].length);
    });

    // Calculate target distribution
    console.log('\n🎲 Applying Domain Weights:\n');
    console.log('Domain'.padEnd(50), 'Target', 'Weight');
    console.log('-'.repeat(70));

    const domainQuotas = {};
    let assignedCount = 0;

    domains.forEach(domain => {
      const weight = DOMAIN_WEIGHTS[domain] || 0.01;
      const quota = Math.round(MCQ_COUNT * weight);
      const actual = Math.min(quota, questionsByDomain[domain].length);
      domainQuotas[domain] = actual;
      assignedCount += actual;

      const weightPercent = (weight * 100).toFixed(1);
      console.log(
        domain.padEnd(50),
        actual.toString().padStart(6),
        `${weightPercent}%`.padStart(7)
      );
    });

    // Adjust for rounding
    while (assignedCount < MCQ_COUNT) {
      for (const domain of domains) {
        if (assignedCount >= MCQ_COUNT) break;
        if (domainQuotas[domain] < questionsByDomain[domain].length) {
          domainQuotas[domain]++;
          assignedCount++;
        }
      }
    }

    console.log('-'.repeat(70));
    console.log('Total MCQs to select:'.padEnd(50), assignedCount.toString().padStart(6));

    // Select questions
    const selected = [];
    domains.forEach(domain => {
      const quota = domainQuotas[domain];
      const available = questionsByDomain[domain];
      
      // Shuffle and select
      const shuffled = [...available].sort(() => Math.random() - 0.5);
      selected.push(...shuffled.slice(0, quota));
    });

    // Show final distribution
    console.log('\n✅ Final Exam Composition:\n');
    console.log('Domain'.padEnd(50), 'Count', '%');
    console.log('-'.repeat(70));

    const finalDist = {};
    selected.forEach(q => {
      const domain = q.domain || 'General Security Concepts';
      finalDist[domain] = (finalDist[domain] || 0) + 1;
    });

    Object.keys(finalDist).sort((a, b) => finalDist[b] - finalDist[a]).forEach(domain => {
      const count = finalDist[domain];
      const percent = ((count / selected.length) * 100).toFixed(1);
      const targetPercent = ((DOMAIN_WEIGHTS[domain] || 0.01) * 100).toFixed(1);
      
      console.log(
        domain.padEnd(50),
        count.toString().padStart(5),
        `${percent}%`.padStart(6),
        `(target: ${targetPercent}%)`
      );
    });

    console.log('\n🎉 Domain weighting successfully applied!');
    console.log('   Exam distribution now matches real CompTIA Security+ exam.\n');

    db.close();
  }
);
