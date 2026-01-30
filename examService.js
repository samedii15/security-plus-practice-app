import { db } from './database/db.js';

// Domain weights based on CompTIA Security+ exam objectives
// These percentages reflect the actual exam distribution
const DOMAIN_WEIGHTS = {
  'Security Operations': 0.30,  // 30% - Largest domain
  'Threats, Vulnerabilities & Mitigations': 0.22,  // 22%
  'Threats and Vulnerabilities': 0.03,  // Combined with above
  'Security Architecture': 0.18,  // 18%
  'Security Program Management & Oversight': 0.20,  // 20%
  'General Security Concepts': 0.12,  // 12%
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

// Get user's recent performance to determine difficulty adaptation
function getUserRecentPerformance(userId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        AVG(CAST(eq.is_correct AS FLOAT)) * 100 as avg_accuracy,
        COUNT(*) as total_questions
      FROM exam_questions eq
      JOIN exams e ON eq.exam_id = e.id
      WHERE e.user_id = ? 
        AND e.submitted_at IS NOT NULL
        AND e.submitted_at > datetime('now', '-7 days')
    `;
    
    db.get(query, [userId], (err, row) => {
      if (err) return reject(err);
      resolve({
        accuracy: row?.avg_accuracy || 50,
        questionCount: row?.total_questions || 0
      });
    });
  });
}

// Get random questions for exam, avoiding recently used ones
async function selectRandomQuestions(userId, totalCount, retakeMissed = false) {
  const PBQ_COUNT = 5;
  const MCQ_COUNT = totalCount - PBQ_COUNT;

  // Get user's recent performance for adaptive difficulty
  const performance = await getUserRecentPerformance(userId);
  
  // Determine difficulty distribution based on performance
  let difficultyWeights = { Easy: 0.3, Medium: 0.5, Hard: 0.2 }; // Default
  
  if (performance.questionCount >= 50) { // Only adapt if enough data
    if (performance.accuracy > 80) {
      // High performer - more challenging questions
      difficultyWeights = { Easy: 0.1, Medium: 0.4, Hard: 0.5 };
    } else if (performance.accuracy < 65) {
      // Struggling - easier questions to build confidence
      difficultyWeights = { Easy: 0.5, Medium: 0.4, Hard: 0.1 };
    }
  }

  // Helper: get PBQs (random)
  const getPbqs = () => new Promise((resolve, reject) => {
    const pbqQuery = `
      SELECT q.*
      FROM questions q
      WHERE q.qtype = 'pbq'
      ORDER BY RANDOM()
      LIMIT ?
    `;
    db.all(pbqQuery, [PBQ_COUNT], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  // Helper: get MCQs with domain weighting
  const getMcqs = () => new Promise((resolve, reject) => {
    // First, get all available MCQs with their metadata
    const baseQuery = retakeMissed 
      ? `SELECT DISTINCT q.*, 
               qu.times_correct, 
               qu.times_used,
               qu.last_used_at,
               (qu.times_used - qu.times_correct) as times_incorrect
         FROM questions q
         LEFT JOIN question_usage qu ON q.id = qu.question_id AND qu.user_id = ?
         WHERE (q.qtype IS NULL OR q.qtype = 'mcq')`
      : `SELECT q.*, 
               qu.last_used_at,
               qu.times_used,
               qu.times_correct
         FROM questions q
         LEFT JOIN question_usage qu ON q.id = qu.question_id AND qu.user_id = ?
         WHERE (q.qtype IS NULL OR q.qtype = 'mcq')`;

    db.all(baseQuery, [userId], (err, allQuestions) => {
      if (err) return reject(err);
      if (!allQuestions || allQuestions.length === 0) return resolve([]);

      // Group questions by domain
      const questionsByDomain = {};
      allQuestions.forEach(q => {
        const domain = q.domain || 'General Security Concepts';
        if (!questionsByDomain[domain]) {
          questionsByDomain[domain] = [];
        }
        questionsByDomain[domain].push(q);
      });

      // Sort questions within each domain based on selection strategy
      Object.keys(questionsByDomain).forEach(domain => {
        questionsByDomain[domain].sort((a, b) => {
          if (retakeMissed) {
            // Prioritize incorrect questions
            const aIncorrect = (a.times_used || 0) - (a.times_correct || 0);
            const bIncorrect = (b.times_used || 0) - (b.times_correct || 0);
            if (aIncorrect !== bIncorrect) return bIncorrect - aIncorrect;
          } else {
            // Prioritize least recently used
            const aTime = a.last_used_at || 0;
            const bTime = b.last_used_at || 0;
            if (aTime !== bTime) return aTime - bTime;
          }
          return Math.random() - 0.5; // Random tiebreaker
        });
      });

      // Select questions based on domain weights AND difficulty adaptation
      const selected = [];
      const domains = Object.keys(questionsByDomain);
      
      // Calculate how many questions to pick from each domain
      const domainQuotas = {};
      let assignedCount = 0;
      
      domains.forEach(domain => {
        const weight = DOMAIN_WEIGHTS[domain] || 0.01;
        const quota = Math.round(MCQ_COUNT * weight);
        domainQuotas[domain] = Math.min(quota, questionsByDomain[domain].length);
        assignedCount += domainQuotas[domain];
      });

      // Adjust if we haven't assigned enough questions due to rounding
      while (assignedCount < MCQ_COUNT) {
        for (const domain of domains) {
          if (assignedCount >= MCQ_COUNT) break;
          if (domainQuotas[domain] < questionsByDomain[domain].length) {
            domainQuotas[domain]++;
            assignedCount++;
          }
        }
      }

      // Pick questions from each domain with difficulty adaptation
      domains.forEach(domain => {
        const quota = domainQuotas[domain];
        const available = questionsByDomain[domain];
        
        // Apply difficulty weighting
        const easyCount = Math.round(quota * difficultyWeights.Easy);
        const mediumCount = Math.round(quota * difficultyWeights.Medium);
        const hardCount = quota - easyCount - mediumCount;
        
        const byDifficulty = {
          Easy: available.filter(q => q.difficulty === 'Easy'),
          Medium: available.filter(q => q.difficulty === 'Medium'),
          Hard: available.filter(q => q.difficulty === 'Hard'),
          Unknown: available.filter(q => !q.difficulty || !['Easy', 'Medium', 'Hard'].includes(q.difficulty))
        };
        
        // Select from each difficulty tier
        selected.push(...byDifficulty.Easy.slice(0, easyCount));
        selected.push(...byDifficulty.Medium.slice(0, mediumCount));
        selected.push(...byDifficulty.Hard.slice(0, hardCount));
        
        // Fill remaining with any difficulty
        const remaining = available.filter(q => !selected.includes(q));
        selected.push(...remaining.slice(0, quota - selected.length));
      });

      // If we still don't have enough, fill with remaining questions
      if (selected.length < MCQ_COUNT) {
        const remaining = allQuestions.filter(q => !selected.includes(q));
        selected.push(...remaining.slice(0, MCQ_COUNT - selected.length));
      }

      // Shuffle the selected questions
      for (let i = selected.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selected[i], selected[j]] = [selected[j], selected[i]];
      }

      resolve(selected.slice(0, MCQ_COUNT));
    });
  });

  // Combine PBQs + MCQs and shuffle
  return Promise.all([getPbqs(), getMcqs()])
    .then(([pbqs, mcqs]) => {
      const combined = [...pbqs, ...mcqs];

      // shuffle combined list
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }

      return combined;
    });
}

// Start a new exam
async function startExam(userId, isRetakeMissed = false) {
  try {
    const questions = await selectRandomQuestions(userId, 90, isRetakeMissed);
    
    if (questions.length < 90) {
      throw { status: 400, message: 'Not enough questions available in the question bank' };
    }

    return new Promise((resolve, reject) => {
      // Create exam record
      db.run(
        'INSERT INTO exams (user_id, is_retake_missed) VALUES (?, ?)',
        [userId, isRetakeMissed ? 1 : 0],
        function(err) {
          if (err) return reject({ status: 500, message: 'Error creating exam' });
          
          const examId = this.lastID;
          
          // Insert exam questions
          const stmt = db.prepare(
            'INSERT INTO exam_questions (exam_id, question_id, question_number) VALUES (?, ?, ?)'
          );
          
          questions.forEach((q, index) => {
            stmt.run(examId, q.id, index + 1);
          });
          
          stmt.finalize((err) => {
            if (err) return reject({ status: 500, message: 'Error saving exam questions' });
            
            // Return questions without answers
            function stripPbqCorrectFields(pbqJson) {
              if (!pbqJson) return null;
              let obj;
              try { obj = JSON.parse(pbqJson); } catch { return null; }

              // Remove keys that reveal answers
              delete obj.correct;
              delete obj.correct_order;
              delete obj.correct_map;

              return obj;
            }

            const questionsForClient = questions.map((q, index) => {
              const qtype = q.qtype || "mcq";

              if (qtype === "pbq") {
                return {
                  questionNumber: index + 1,
                  id: q.id,
                  qtype: "pbq",
                  question: q.question,
                  pbq: stripPbqCorrectFields(q.pbq_json),
                  domain: q.domain,
                  difficulty: q.difficulty
                };
              }

              // MCQ (existing behavior)
              return {
                questionNumber: index + 1,
                id: q.id,
                qtype: "mcq",
                question: q.question,
                choices: {
                  A: q.choice_a,
                  B: q.choice_b,
                  C: q.choice_c,
                  D: q.choice_d
                },
                domain: q.domain,
                difficulty: q.difficulty
              };
            });
            
            resolve({
              examId,
              questions: questionsForClient,
              duration: 90, // minutes
              totalQuestions: 90
            });
          });
        }
      );
    });
  } catch (err) {
    throw err;
  }
}

// Submit exam answers
async function submitExam(examId, userId, answers, timeUsed) {
  return new Promise((resolve, reject) => {
    // Verify exam belongs to user
    db.get(
      'SELECT * FROM exams WHERE id = ? AND user_id = ?',
      [examId, userId],
      (err, exam) => {
        if (err) return reject({ status: 500, message: 'Database error' });
        if (!exam) return reject({ status: 404, message: 'Exam not found' });
        if (exam.submitted_at) return reject({ status: 400, message: 'Exam already submitted' });
        
        // Server-side time enforcement
        const startTime = new Date(exam.started_at).getTime();
        const now = new Date().getTime();
        const elapsedMinutes = (now - startTime) / (1000 * 60);
        const MAX_EXAM_TIME = 90; // minutes
        
        if (elapsedMinutes > MAX_EXAM_TIME + 1) { // 1 minute grace period
          return reject({ 
            status: 400, 
            message: `Exam time expired. Maximum time is ${MAX_EXAM_TIME} minutes.` 
          });
        }
        
        // Get exam questions with correct answers
        db.all(
          `SELECT eq.question_number, eq.question_id, q.answer, q.explanation, 
                  q.question, q.choice_a, q.choice_b, q.choice_c, q.choice_d, q.domain
           FROM exam_questions eq
           JOIN questions q ON eq.question_id = q.id
           WHERE eq.exam_id = ?
           ORDER BY eq.question_number`,
          [examId],
          (err, questions) => {
            if (err) return reject({ status: 500, message: 'Error fetching questions' });
            
            let correctCount = 0;
            let answeredCount = 0;
            const results = [];
            
            // Calculate score and build results
            questions.forEach(q => {
              const userAnswer = answers[q.question_number];
              const isAnswered = userAnswer && userAnswer !== null && userAnswer !== '';
              
              if (isAnswered) {
                answeredCount++;
                const isCorrect = userAnswer === q.answer;
                if (isCorrect) correctCount++;
                
                // Update exam_questions table
                db.run(
                  'UPDATE exam_questions SET user_answer = ?, is_correct = ? WHERE exam_id = ? AND question_number = ?',
                  [userAnswer, isCorrect ? 1 : 0, examId, q.question_number]
                );
                
                // Update question_usage tracking
                db.run(
                  `INSERT INTO question_usage (user_id, question_id, times_used, times_correct)
                   VALUES (?, ?, 1, ?)
                   ON CONFLICT(user_id, question_id) DO UPDATE SET
                     times_used = times_used + 1,
                     times_correct = times_correct + ?,
                     last_used_at = CURRENT_TIMESTAMP`,
                  [userId, q.question_id, isCorrect ? 1 : 0, isCorrect ? 1 : 0]
                );
                
                results.push({
                  questionNumber: q.question_number,
                  question: q.question,
                  choices: {
                    A: q.choice_a,
                    B: q.choice_b,
                    C: q.choice_c,
                    D: q.choice_d
                  },
                  userAnswer,
                  correctAnswer: q.answer,
                  isCorrect,
                  explanation: q.explanation,
                  domain: q.domain
                });
              }
            });
            
            const scorePercentage = answeredCount > 0 
              ? Math.round((correctCount / answeredCount) * 100)
              : 0;
            
            // Update exam record
            db.run(
              `UPDATE exams 
               SET submitted_at = CURRENT_TIMESTAMP, 
                   time_used = ?, 
                   score = ?, 
                   answered_count = ?
               WHERE id = ?`,
              [timeUsed, scorePercentage, answeredCount, examId],
              (err) => {
                if (err) return reject({ status: 500, message: 'Error updating exam' });
                
                // Calculate domain breakdown
                const domainStats = {};
                results.forEach(r => {
                  if (!domainStats[r.domain]) {
                    domainStats[r.domain] = { correct: 0, total: 0 };
                  }
                  domainStats[r.domain].total++;
                  if (r.isCorrect) domainStats[r.domain].correct++;
                });
                
                const domainBreakdown = Object.keys(domainStats).map(domain => ({
                  domain,
                  correct: domainStats[domain].correct,
                  total: domainStats[domain].total,
                  percentage: Math.round((domainStats[domain].correct / domainStats[domain].total) * 100)
                }));
                
                resolve({
                  examId,
                  score: scorePercentage,
                  correctCount,
                  answeredCount,
                  totalQuestions: 90,
                  timeUsed,
                  passed: scorePercentage >= 75, // Assuming 75% passing score
                  results,
                  domainBreakdown
                });
              }
            );
          }
        );
      }
    );
  });
}

// Get exam history
async function getExamHistory(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, started_at, submitted_at, time_used, score, 
              total_questions, answered_count, is_retake_missed
       FROM exams
       WHERE user_id = ? AND submitted_at IS NOT NULL
       ORDER BY submitted_at DESC`,
      [userId],
      (err, exams) => {
        if (err) return reject({ status: 500, message: 'Database error' });
        
        const history = exams.map(exam => ({
          examId: exam.id,
          startedAt: exam.started_at,
          submittedAt: exam.submitted_at,
          timeUsed: exam.time_used,
          score: exam.score,
          totalQuestions: exam.total_questions,
          answeredCount: exam.answered_count,
          passed: exam.score >= 75,
          isRetakeMissed: exam.is_retake_missed === 1
        }));
        
        resolve(history);
      }
    );
  });
}

// Get specific exam review
async function getExamReview(examId, userId) {
  return new Promise((resolve, reject) => {
    // Verify exam belongs to user and is submitted
    db.get(
      'SELECT * FROM exams WHERE id = ? AND user_id = ?',
      [examId, userId],
      (err, exam) => {
        if (err) return reject({ status: 500, message: 'Database error' });
        if (!exam) return reject({ status: 404, message: 'Exam not found' });
        if (!exam.submitted_at) return reject({ status: 400, message: 'Exam not yet submitted' });
        
        // Get all questions with answers
        db.all(
          `SELECT eq.question_number, eq.user_answer, eq.is_correct,
                  q.question, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
                  q.answer, q.explanation, q.domain
           FROM exam_questions eq
           JOIN questions q ON eq.question_id = q.id
           WHERE eq.exam_id = ?
           ORDER BY eq.question_number`,
          [examId],
          (err, questions) => {
            if (err) return reject({ status: 500, message: 'Error fetching questions' });
            
            const results = questions
              .filter(q => q.user_answer) // Only include answered questions
              .map(q => ({
                questionNumber: q.question_number,
                question: q.question,
                choices: {
                  A: q.choice_a,
                  B: q.choice_b,
                  C: q.choice_c,
                  D: q.choice_d
                },
                userAnswer: q.user_answer,
                correctAnswer: q.answer,
                isCorrect: q.is_correct === 1,
                explanation: q.explanation,
                domain: q.domain
              }));
            
            resolve({
              examId: exam.id,
              startedAt: exam.started_at,
              submittedAt: exam.submitted_at,
              timeUsed: exam.time_used,
              score: exam.score,
              totalQuestions: exam.total_questions,
              answeredCount: exam.answered_count,
              passed: exam.score >= 75,
              results
            });
          }
        );
      }
    );
  });
}

// Get domain distribution statistics for a generated exam (for debugging/transparency)
async function getDomainStats() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT domain, COUNT(*) as count
       FROM questions
       WHERE qtype IS NULL OR qtype = 'mcq'
       GROUP BY domain
       ORDER BY count DESC`,
      [],
      (err, rows) => {
        if (err) return reject({ status: 500, message: 'Database error' });
        
        const total = rows.reduce((sum, row) => sum + row.count, 0);
        const stats = rows.map(row => ({
          domain: row.domain,
          count: row.count,
          percentage: Math.round((row.count / total) * 100 * 10) / 10,
          targetWeight: Math.round((DOMAIN_WEIGHTS[row.domain] || 0.01) * 100 * 10) / 10
        }));
        
        resolve({
          total,
          domains: stats,
          weights: DOMAIN_WEIGHTS
        });
      }
    );
  });
}

export {
  startExam,
  submitExam,
  getExamHistory,
  getExamReview,
  getDomainStats
};
