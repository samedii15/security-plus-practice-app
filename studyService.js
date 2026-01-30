import { db } from './database/db.js';
import { scorePBQ } from './pbqScoring.js';

/**
 * Start a custom study session
 * @param {number} userId - User ID
 * @param {Object} options - Study session options
 * @param {Array<string>} options.domains - Selected domains (empty = all)
 * @param {Array<string>} options.tags - Selected tags (empty = all)
 * @param {string} options.difficulty - Difficulty filter ('Easy', 'Medium', 'Hard', 'All')
 * @param {string} options.type - Question type ('mcq', 'pbq', 'all')
 * @param {boolean} options.onlyMissed - Only show previously missed questions
 * @param {boolean} options.onlyBookmarked - Only show bookmarked questions
 * @param {number} options.questionCount - Number of questions (default: 20)
 * @param {boolean} options.immediateMode - Show answers immediately after each question
 */
export async function startStudySession(userId, options = {}) {
  const {
    domains = [],
    tags = [],
    difficulty = 'All',
    type = 'all',
    onlyMissed = false,
    onlyBookmarked = false,
    questionCount = 20,
    immediateMode = true
  } = options;

  return new Promise((resolve, reject) => {
    // Build query based on filters
    let query = `
      SELECT DISTINCT q.* 
      FROM questions q
    `;
    
    const conditions = [];
    const params = [];
    
    // Add joins for filtered queries
    if (onlyMissed) {
      query += ` 
        INNER JOIN question_usage qu ON q.id = qu.question_id 
      `;
      conditions.push('qu.user_id = ?');
      conditions.push('qu.times_used > qu.times_correct');
      params.push(userId);
    }
    
    if (onlyBookmarked) {
      query += `
        INNER JOIN bookmarked_questions bq ON q.id = bq.question_id
      `;
      conditions.push('bq.user_id = ?');
      params.push(userId);
    }
    
    // Type filter
    if (type && type !== 'all' && type !== '') {
      if (type === 'multiple_choice') {
        // MCQ questions have qtype = NULL or 'mcq'
        conditions.push('(q.qtype IS NULL OR q.qtype = ?)');
        params.push('mcq');
      } else if (type === 'multi_select' || type === 'ordering' || type === 'matching') {
        // PBQ types stored as 'pbq' in qtype column
        conditions.push('q.qtype = ?');
        params.push('pbq');
      }
    }
    
    // Domain filter
    if (domains.length > 0) {
      conditions.push(`q.domain IN (${domains.map(() => '?').join(',')})`);
      params.push(...domains);
    }
    
    // Difficulty filter
    if (difficulty !== 'All') {
      conditions.push('q.difficulty = ?');
      params.push(difficulty);
    }
    
    // Add WHERE clause if needed
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Randomize and limit
    query += ` ORDER BY RANDOM() LIMIT ?`;
    params.push(questionCount);
    
    db.all(query, params, (err, questions) => {
      if (err) {
        console.error('Study session error:', err);
        return reject({ status: 500, message: 'Error creating study session' });
      }
      
      if (!questions || questions.length === 0) {
        return reject({ status: 404, message: 'No questions found matching your criteria' });
      }
      
      // Create a study session record
      db.run(
        `INSERT INTO study_sessions (user_id, question_count, immediate_mode, filters)
         VALUES (?, ?, ?, ?)`,
        [
          userId,
          questions.length,
          immediateMode ? 1 : 0,
          JSON.stringify(options)
        ],
        function(err) {
          if (err) {
            console.error('Error creating study session:', err);
            return reject({ status: 500, message: 'Error saving study session' });
          }
          
          const sessionId = this.lastID;
          
          // Insert study session questions
          const stmt = db.prepare(
            'INSERT INTO study_session_questions (session_id, question_id, question_number) VALUES (?, ?, ?)'
          );
          
          questions.forEach((q, index) => {
            stmt.run(sessionId, q.id, index + 1);
          });
          
          stmt.finalize((err) => {
            if (err) {
              return reject({ status: 500, message: 'Error saving study questions' });
            }
            
            // Strip correct answers for client
            const questionsForClient = questions.map((q, index) => {
              const qtype = q.qtype || 'mcq';
              
              if (qtype === 'pbq') {
                let pbqData = null;
                try {
                  pbqData = JSON.parse(q.pbq_json);
                  // Remove correct answers
                  delete pbqData.correct;
                  delete pbqData.correct_order;
                  delete pbqData.correct_map;
                } catch (e) {
                  pbqData = null;
                }
                
                return {
                  questionNumber: index + 1,
                  id: q.id,
                  qtype: 'pbq',
                  question: q.question,
                  pbq: pbqData,
                  domain: q.domain,
                  difficulty: q.difficulty
                };
              }
              
              return {
                questionNumber: index + 1,
                id: q.id,
                qtype: 'mcq',
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
              id: sessionId,
              questions: questionsForClient,
              immediateMode,
              totalQuestions: questions.length,
              filters: options
            });
          });
        }
      );
    });
  });
}

/**
 * Submit answer for a study session question
 * @param {number} sessionId - Study session ID
 * @param {number} userId - User ID
 * @param {number} questionNumber - Question number
 * @param {*} answer - User's answer
 */
export async function submitStudyAnswer(sessionId, userId, questionNumber, answer) {
  return new Promise((resolve, reject) => {
    // Verify session belongs to user
    db.get(
      'SELECT * FROM study_sessions WHERE id = ? AND user_id = ?',
      [sessionId, userId],
      (err, session) => {
        if (err) return reject({ status: 500, message: 'Database error' });
        if (!session) return reject({ status: 404, message: 'Study session not found' });
        
        // Get question details
        db.get(
          `SELECT ssq.*, q.* 
           FROM study_session_questions ssq
           JOIN questions q ON ssq.question_id = q.id
           WHERE ssq.session_id = ? AND ssq.question_number = ?`,
          [sessionId, questionNumber],
          (err, question) => {
            if (err) return reject({ status: 500, message: 'Error fetching question' });
            if (!question) return reject({ status: 404, message: 'Question not found' });
            
            const qtype = question.qtype || 'mcq';
            let isCorrect = false;
            let userAnswerStr = answer;
            
            // Score based on question type
            if (qtype === 'pbq') {
              let pbqData = null;
              try {
                pbqData = JSON.parse(question.pbq_json);
              } catch (e) {
                console.error('Failed to parse PBQ JSON:', e);
              }
              
              if (pbqData && typeof answer === 'object') {
                isCorrect = scorePBQ(answer, pbqData);
              }
              userAnswerStr = JSON.stringify(answer);
            } else {
              isCorrect = answer === question.answer;
            }
            
            // Update study session question
            db.run(
              'UPDATE study_session_questions SET user_answer = ?, is_correct = ?, answered_at = CURRENT_TIMESTAMP WHERE session_id = ? AND question_number = ?',
              [userAnswerStr, isCorrect ? 1 : 0, sessionId, questionNumber],
              (err) => {
                if (err) return reject({ status: 500, message: 'Error saving answer' });
                
                // Update question usage tracking
                db.run(
                  `INSERT INTO question_usage (user_id, question_id, times_used, times_correct)
                   VALUES (?, ?, 1, ?)
                   ON CONFLICT(user_id, question_id) DO UPDATE SET
                     times_used = times_used + 1,
                     times_correct = times_correct + ?,
                     last_used_at = CURRENT_TIMESTAMP`,
                  [userId, question.id, isCorrect ? 1 : 0, isCorrect ? 1 : 0]
                );
                
                // Build result with correct answer and explanation
                const result = {
                  questionNumber,
                  isCorrect,
                  correctAnswer: question.answer,
                  question: {
                    id: question.id,
                    qtype: qtype,
                    question: question.question,
                    explanation: question.explanation,
                    domain: question.domain,
                    difficulty: question.difficulty
                  }
                };
                
                if (qtype === 'mcq') {
                  result.question.choices = {
                    A: question.choice_a,
                    B: question.choice_b,
                    C: question.choice_c,
                    D: question.choice_d
                  };
                } else if (qtype === 'pbq') {
                  try {
                    result.correctAnswer = JSON.parse(question.pbq_json);
                  } catch (e) {
                    result.correctAnswer = question.pbq_json;
                  }
                }
                
                resolve(result);
              }
            );
          }
        );
      }
    );
  });
}

/**
 * Get all available domains for filtering
 */
export async function getAvailableDomains() {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT DISTINCT domain, COUNT(*) as count FROM questions GROUP BY domain ORDER BY domain',
      [],
      (err, domains) => {
        if (err) return reject({ status: 500, message: 'Database error' });
        resolve(domains || []);
      }
    );
  });
}

/**
 * Get study session history
 */
export async function getStudyHistory(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
        ss.id,
        ss.created_at,
        ss.question_count,
        ss.immediate_mode,
        COUNT(ssq.id) as answered_count,
        SUM(CASE WHEN ssq.is_correct = 1 THEN 1 ELSE 0 END) as correct_count
       FROM study_sessions ss
       LEFT JOIN study_session_questions ssq ON ss.id = ssq.session_id
       WHERE ss.user_id = ?
       GROUP BY ss.id
       ORDER BY ss.created_at DESC
       LIMIT 20`,
      [userId],
      (err, sessions) => {
        if (err) return reject({ status: 500, message: 'Database error' });
        resolve(sessions || []);
      }
    );
  });
}
