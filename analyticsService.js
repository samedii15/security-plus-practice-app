import { db } from './database/db.js';

// Get comprehensive learning analytics for a user
async function getUserAnalytics(userId) {
  return new Promise((resolve, reject) => {
    // Get overall stats
    db.get(
      `SELECT 
        COUNT(DISTINCT eq.exam_id) as total_exams,
        SUM(CASE WHEN eq.is_correct = 1 THEN 1 ELSE 0 END) as total_correct,
        COUNT(eq.id) as total_answered,
        ROUND(AVG(CASE WHEN eq.is_correct = 1 THEN 100.0 ELSE 0.0 END), 1) as overall_accuracy
       FROM exam_questions eq
       JOIN exams e ON eq.exam_id = e.id
       WHERE e.user_id = ? AND e.submitted_at IS NOT NULL AND eq.user_answer IS NOT NULL`,
      [userId],
      (err, overallStats) => {
        if (err) return reject({ status: 500, message: 'Database error' });

        // Get domain-level accuracy
        db.all(
          `SELECT 
            q.domain,
            COUNT(eq.id) as total_questions,
            SUM(CASE WHEN eq.is_correct = 1 THEN 1 ELSE 0 END) as correct_answers,
            ROUND(AVG(CASE WHEN eq.is_correct = 1 THEN 100.0 ELSE 0.0 END), 1) as accuracy,
            ROUND(AVG(CASE WHEN eq.is_correct = 0 THEN 100.0 ELSE 0.0 END), 1) as error_rate
           FROM exam_questions eq
           JOIN exams e ON eq.exam_id = e.id
           JOIN questions q ON eq.question_id = q.id
           WHERE e.user_id = ? AND e.submitted_at IS NOT NULL AND eq.user_answer IS NOT NULL
           GROUP BY q.domain
           ORDER BY accuracy ASC, total_questions DESC`,
          [userId],
          (err, domainStats) => {
            if (err) return reject({ status: 500, message: 'Error fetching domain stats' });

            // Get difficulty-level performance
            db.all(
              `SELECT 
                q.difficulty,
                COUNT(eq.id) as total_questions,
                SUM(CASE WHEN eq.is_correct = 1 THEN 1 ELSE 0 END) as correct_answers,
                ROUND(AVG(CASE WHEN eq.is_correct = 1 THEN 100.0 ELSE 0.0 END), 1) as accuracy
               FROM exam_questions eq
               JOIN exams e ON eq.exam_id = e.id
               JOIN questions q ON eq.question_id = q.id
               WHERE e.user_id = ? AND e.submitted_at IS NOT NULL AND eq.user_answer IS NOT NULL
               GROUP BY q.difficulty
               ORDER BY accuracy ASC`,
              [userId],
              (err, difficultyStats) => {
                if (err) return reject({ status: 500, message: 'Error fetching difficulty stats' });

                // Get topic-level accuracy (extracted from question content keywords)
                db.all(
                  `SELECT 
                    q.id,
                    q.question,
                    q.domain,
                    eq.is_correct
                   FROM exam_questions eq
                   JOIN exams e ON eq.exam_id = e.id
                   JOIN questions q ON eq.question_id = q.id
                   WHERE e.user_id = ? AND e.submitted_at IS NOT NULL AND eq.user_answer IS NOT NULL`,
                  [userId],
                  (err, allQuestions) => {
                    if (err) return reject({ status: 500, message: 'Error fetching questions' });

                    // Extract topics from questions
                    const topicStats = analyzeTopics(allQuestions);

                    // Get recent performance trend
                    db.all(
                      `SELECT 
                        e.id,
                        e.submitted_at,
                        e.score,
                        COUNT(eq.id) as questions_answered,
                        SUM(CASE WHEN eq.is_correct = 1 THEN 1 ELSE 0 END) as correct_count
                       FROM exams e
                       LEFT JOIN exam_questions eq ON e.id = eq.exam_id AND eq.user_answer IS NOT NULL
                       WHERE e.user_id = ? AND e.submitted_at IS NOT NULL
                       GROUP BY e.id
                       ORDER BY e.submitted_at DESC
                       LIMIT 10`,
                      [userId],
                      (err, recentExams) => {
                        if (err) return reject({ status: 500, message: 'Error fetching recent exams' });

                        // Identify top 5 weakest areas
                        const weakAreas = identifyWeakAreas(domainStats, topicStats);

                        // Calculate improvement areas
                        const recommendations = generateRecommendations(
                          domainStats,
                          topicStats,
                          difficultyStats,
                          overallStats
                        );

                        resolve({
                          overall: {
                            totalExams: overallStats.total_exams || 0,
                            totalQuestions: overallStats.total_answered || 0,
                            correctAnswers: overallStats.total_correct || 0,
                            accuracy: overallStats.overall_accuracy || 0,
                            questionsPerExam: overallStats.total_exams > 0 
                              ? Math.round(overallStats.total_answered / overallStats.total_exams)
                              : 0
                          },
                          byDomain: domainStats.map(d => ({
                            domain: d.domain,
                            totalQuestions: d.total_questions,
                            correctAnswers: d.correct_answers,
                            accuracy: d.accuracy,
                            errorRate: d.error_rate,
                            strength: getStrengthLevel(d.accuracy)
                          })),
                          byDifficulty: difficultyStats.map(d => ({
                            difficulty: d.difficulty,
                            totalQuestions: d.total_questions,
                            correctAnswers: d.correct_answers,
                            accuracy: d.accuracy,
                            strength: getStrengthLevel(d.accuracy)
                          })),
                          byTopic: topicStats,
                          weakestAreas: weakAreas,
                          recommendations: recommendations,
                          recentTrend: recentExams.map(e => ({
                            examId: e.id,
                            date: e.submitted_at,
                            score: e.score,
                            questionsAnswered: e.questions_answered,
                            correctCount: e.correct_count
                          }))
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  });
}

// Analyze topics from question content
function analyzeTopics(questions) {
  const topics = {
    'Cryptography': /\b(encrypt|decrypt|hash|cipher|AES|RSA|TLS|SSL|certificate|PKI|key exchange|crypto)\b/i,
    'Identity & Access Management': /\b(IAM|authentication|authorization|SSO|SAML|OAuth|MFA|RBAC|access control|privilege|identity)\b/i,
    'Incident Response': /\b(incident|breach|forensic|malware|response|containment|eradication|recovery|IR|SIEM|alert)\b/i,
    'Cloud Security': /\b(cloud|AWS|Azure|SaaS|PaaS|IaaS|container|serverless|multi-tenant)\b/i,
    'Network Security': /\b(firewall|IDS|IPS|VPN|DMZ|network|segmentation|VLAN|router|switch|NAC)\b/i,
    'Vulnerability Management': /\b(vulnerability|patch|CVE|scan|assessment|pentest|remediation)\b/i,
    'Threats & Attacks': /\b(phishing|ransomware|malware|DDoS|XSS|SQL injection|attack|exploit|threat actor)\b/i,
    'Compliance & Governance': /\b(compliance|HIPAA|PCI DSS|GDPR|policy|governance|audit|regulation)\b/i,
    'Risk Management': /\b(risk|assessment|mitigation|BIA|business impact|RTO|RPO|disaster recovery)\b/i,
    'Application Security': /\b(application|web app|API|OWASP|injection|XSS|CSRF|input validation|WAF)\b/i,
    'Endpoint Security': /\b(endpoint|antivirus|EDR|host|workstation|laptop|mobile|BYOD)\b/i,
    'Data Security': /\b(data loss|DLP|encryption|backup|data classification|sensitive data)\b/i
  };

  const topicStats = {};
  
  Object.keys(topics).forEach(topic => {
    topicStats[topic] = {
      total: 0,
      correct: 0,
      accuracy: 0
    };
  });

  questions.forEach(q => {
    const questionText = q.question.toLowerCase();
    
    Object.keys(topics).forEach(topic => {
      if (topics[topic].test(questionText)) {
        topicStats[topic].total++;
        if (q.is_correct === 1) {
          topicStats[topic].correct++;
        }
      }
    });
  });

  // Calculate accuracy and filter out topics with no questions
  const result = [];
  Object.keys(topicStats).forEach(topic => {
    if (topicStats[topic].total > 0) {
      const accuracy = Math.round((topicStats[topic].correct / topicStats[topic].total) * 100);
      result.push({
        topic,
        totalQuestions: topicStats[topic].total,
        correctAnswers: topicStats[topic].correct,
        accuracy,
        strength: getStrengthLevel(accuracy)
      });
    }
  });

  return result.sort((a, b) => a.accuracy - b.accuracy);
}

// Identify top 5 weakest areas
function identifyWeakAreas(domainStats, topicStats) {
  const weakAreas = [];

  // Add weak domains (accuracy < 70%)
  domainStats.forEach(d => {
    if (d.accuracy < 70 && d.total_questions >= 5) {
      weakAreas.push({
        type: 'domain',
        name: d.domain,
        accuracy: d.accuracy,
        questionsAttempted: d.total_questions,
        priority: calculatePriority(d.accuracy, d.total_questions),
        recommendation: `Focus on ${d.domain} - Current accuracy: ${d.accuracy}%`
      });
    }
  });

  // Add weak topics (accuracy < 70%)
  topicStats.forEach(t => {
    if (t.accuracy < 70 && t.totalQuestions >= 3) {
      weakAreas.push({
        type: 'topic',
        name: t.topic,
        accuracy: t.accuracy,
        questionsAttempted: t.totalQuestions,
        priority: calculatePriority(t.accuracy, t.totalQuestions),
        recommendation: `Study ${t.topic} concepts - Current accuracy: ${t.accuracy}%`
      });
    }
  });

  // Sort by priority and return top 5
  return weakAreas
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((area, index) => ({
      rank: index + 1,
      ...area
    }));
}

// Calculate priority score for weak areas
function calculatePriority(accuracy, questionsAttempted) {
  // Lower accuracy = higher priority
  // More questions attempted = higher confidence in the metric
  const accuracyScore = (100 - accuracy) * 2; // 0-200
  const volumeScore = Math.min(questionsAttempted * 2, 50); // 0-50
  return accuracyScore + volumeScore;
}

// Get strength level label
function getStrengthLevel(accuracy) {
  if (accuracy >= 90) return 'Excellent';
  if (accuracy >= 80) return 'Strong';
  if (accuracy >= 70) return 'Good';
  if (accuracy >= 60) return 'Fair';
  if (accuracy >= 50) return 'Weak';
  return 'Needs Work';
}

// Generate personalized recommendations
function generateRecommendations(domainStats, topicStats, difficultyStats, overallStats) {
  const recommendations = [];

  // Overall performance recommendations
  if (overallStats.overall_accuracy < 70) {
    recommendations.push({
      category: 'Overall',
      priority: 'High',
      message: 'Focus on fundamentals - overall accuracy is below passing threshold (75%)',
      action: 'Review core security concepts before attempting more practice exams'
    });
  } else if (overallStats.overall_accuracy >= 85) {
    recommendations.push({
      category: 'Overall',
      priority: 'Low',
      message: 'Excellent progress! You\'re performing well overall',
      action: 'Focus on weak areas and maintain performance in strong areas'
    });
  }

  // Domain-specific recommendations
  const weakDomains = domainStats.filter(d => d.accuracy < 70 && d.total_questions >= 5);
  if (weakDomains.length > 0) {
    weakDomains.slice(0, 2).forEach(d => {
      recommendations.push({
        category: 'Domain',
        priority: 'High',
        message: `${d.domain} needs improvement (${d.accuracy}% accuracy)`,
        action: `Review ${d.domain} study materials and practice questions`
      });
    });
  }

  // Topic-specific recommendations
  const weakTopics = topicStats.filter(t => t.accuracy < 70 && t.totalQuestions >= 3);
  if (weakTopics.length > 0) {
    weakTopics.slice(0, 2).forEach(t => {
      recommendations.push({
        category: 'Topic',
        priority: 'High',
        message: `${t.topic} is a weak area (${t.accuracy}% accuracy)`,
        action: `Focus study time on ${t.topic} concepts and practice`
      });
    });
  }

  // Difficulty-based recommendations
  const hardQuestions = difficultyStats.find(d => d.difficulty && d.difficulty.toLowerCase() === 'hard');
  if (hardQuestions && hardQuestions.accuracy < 60) {
    recommendations.push({
      category: 'Difficulty',
      priority: 'Medium',
      message: `Hard questions are challenging (${hardQuestions.accuracy}% accuracy)`,
      action: 'Work through harder scenarios after mastering fundamentals'
    });
  }

  // Study strategy recommendations
  if (overallStats.total_exams < 3) {
    recommendations.push({
      category: 'Strategy',
      priority: 'Medium',
      message: 'Take more practice exams to identify patterns',
      action: 'Complete at least 5-7 full practice exams before the real test'
    });
  }

  return recommendations;
}

// Get detailed performance by domain
async function getDomainPerformance(userId, domain) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
        q.id,
        q.question,
        q.difficulty,
        eq.user_answer,
        eq.is_correct,
        e.submitted_at
       FROM exam_questions eq
       JOIN exams e ON eq.exam_id = e.id
       JOIN questions q ON eq.question_id = q.id
       WHERE e.user_id = ? AND q.domain = ? AND e.submitted_at IS NOT NULL AND eq.user_answer IS NOT NULL
       ORDER BY e.submitted_at DESC`,
      [userId, domain],
      (err, questions) => {
        if (err) return reject({ status: 500, message: 'Database error' });

        const stats = {
          domain,
          totalQuestions: questions.length,
          correctAnswers: questions.filter(q => q.is_correct === 1).length,
          accuracy: questions.length > 0 
            ? Math.round((questions.filter(q => q.is_correct === 1).length / questions.length) * 100)
            : 0,
          recentQuestions: questions.slice(0, 20).map(q => ({
            questionId: q.id,
            questionPreview: q.question.substring(0, 100) + '...',
            difficulty: q.difficulty,
            isCorrect: q.is_correct === 1,
            attemptedAt: q.submitted_at
          }))
        };

        resolve(stats);
      }
    );
  });
}

// Get progress over time
async function getProgressOverTime(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
        DATE(e.submitted_at) as exam_date,
        AVG(e.score) as avg_score,
        COUNT(e.id) as exam_count,
        SUM(eq.is_correct) as total_correct,
        COUNT(eq.id) as total_questions
       FROM exams e
       LEFT JOIN exam_questions eq ON e.id = eq.exam_id AND eq.user_answer IS NOT NULL
       WHERE e.user_id = ? AND e.submitted_at IS NOT NULL
       GROUP BY DATE(e.submitted_at)
       ORDER BY exam_date ASC`,
      [userId],
      (err, rows) => {
        if (err) return reject({ status: 500, message: 'Database error' });

        resolve({
          timeline: rows.map(r => ({
            date: r.exam_date,
            averageScore: Math.round(r.avg_score),
            examsCompleted: r.exam_count,
            accuracy: r.total_questions > 0 
              ? Math.round((r.total_correct / r.total_questions) * 100)
              : 0
          }))
        });
      }
    );
  });
}

export {
  getUserAnalytics,
  getDomainPerformance,
  getProgressOverTime
};
