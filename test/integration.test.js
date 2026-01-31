// Integration Tests for CompTIA Practice Exam App
// Tests the full lifecycle: register → login → exam → submit → review

import { strict as assert } from 'assert';
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Test user credentials
const generateTestEmail = () => `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      testResults.passed++;
      testResults.tests.push({ name, status: 'passed' });
    } catch (err) {
      console.error(`❌ ${name}`);
      console.error(`   Error: ${err.message}`);
      testResults.failed++;
      testResults.tests.push({ name, status: 'failed', error: err.message });
    }
  };
}

// Helper: Make API request
async function apiRequest(method, path, body = null, token = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`${response.status}: ${data.error || JSON.stringify(data)}`);
  }
  
  return { status: response.status, data };
}

// Test 1: Health check
const testHealthCheck = test('Health check responds with status', async () => {
  const { data } = await apiRequest('GET', '/api/health');
  assert(data.status === 'ok', 'Health check should return ok status');
  assert(typeof data.questionCount === 'number', 'Should return question count');
});

// Test 2: User registration
const testRegistration = test('User can register successfully', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data } = await apiRequest('POST', '/api/auth/register', { email, password });
  
  assert(data.token, 'Should return JWT token');
  assert(data.user.email === email, 'Should return user email');
  assert(data.user.role === 'user', 'Should have user role');
});

// Test 3: User login
const testLogin = test('User can login and receive token', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  // Register first
  await apiRequest('POST', '/api/auth/register', { email, password });
  
  // Now login
  const { data } = await apiRequest('POST', '/api/auth/login', { email, password });
  
  assert(data.token, 'Should return JWT token');
  assert(data.user.email === email, 'Should return correct user');
});

// Test 4: Protected endpoint requires token
const testAuthRequired = test('Protected endpoints require authentication', async () => {
  try {
    await apiRequest('POST', '/api/exams/start', {});
    assert.fail('Should have thrown error');
  } catch (err) {
    assert(err.message.includes('401'), 'Should return 401 unauthorized');
  }
});

// Test 5: Start exam
const testStartExam = test('User can start an exam', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data: auth } = await apiRequest('POST', '/api/auth/register', { email, password });
  const token = auth.token;
  
  const { data: exam } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, token);
  
  assert(exam.attemptId, 'Should return attempt ID');
  assert(Array.isArray(exam.questions), 'Should return questions array');
  assert(exam.questions.length > 0, 'Should have questions');
});

// Test 6: Submit exam
const testSubmitExam = test('User can submit an exam', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data: auth } = await apiRequest('POST', '/api/auth/register', { email, password });
  const token = auth.token;
  
  // Start exam
  const { data: exam } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, token);
  
  // Submit with random answers
  const answers = {};
  exam.questions.forEach(q => {
    if (q.qtype === 'mcq' || !q.qtype) {
      answers[q.questionNumber] = 'A'; // Just answer A for all
    }
  });
  
  const { data: result } = await apiRequest(
    'POST',
    `/api/exams/${exam.attemptId}/submit`,
    { answers, timeUsed: 30, attemptId: exam.attemptId },
    token
  );
  
  assert(typeof result.score === 'number', 'Should return score');
  assert(typeof result.correctAnswers === 'number', 'Should return correct count');
  assert(typeof result.totalQuestions === 'number', 'Should return total questions');
});

// Test 7: Exam history
const testExamHistory = test('User can view their exam history', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data: auth } = await apiRequest('POST', '/api/auth/register', { email, password });
  const token = auth.token;
  
  // Start and submit an exam
  const { data: exam } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, token);
  const answers = {};
  exam.questions.forEach(q => {
    if (q.qtype === 'mcq' || !q.qtype) {
      answers[q.questionNumber] = 'A';
    }
  });
  await apiRequest('POST', `/api/exams/${exam.attemptId}/submit`, { answers, timeUsed: 30, attemptId: exam.attemptId }, token);
  
  // Get history
  const { data: attempts } = await apiRequest('GET', '/api/me/attempts', null, token);
  
  assert(Array.isArray(attempts), 'Should return array of attempts');
  assert(attempts.length > 0, 'Should have at least one attempt');
});

// Test 8: Ownership check - cannot access other user's attempt
const testOwnershipCheck = test('User cannot access another user\'s attempt', async () => {
  const email1 = generateTestEmail();
  const email2 = generateTestEmail();
  const password = 'TestPass123!';
  
  // Create user 1 and start exam
  const { data: auth1 } = await apiRequest('POST', '/api/auth/register', { email: email1, password });
  const { data: exam1 } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, auth1.token);
  
  // Create user 2
  const { data: auth2 } = await apiRequest('POST', '/api/auth/register', { email: email2, password });
  
  // User 2 tries to access user 1's attempt
  try {
    await apiRequest('GET', `/api/me/attempts/${exam1.attemptId}`, null, auth2.token);
    assert.fail('Should have thrown error');
  } catch (err) {
    assert(err.message.includes('404'), 'Should return 404 not found');
  }
});

// Test 9: Delete attempt
const testDeleteAttempt = test('User can delete their own attempt', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data: auth } = await apiRequest('POST', '/api/auth/register', { email, password });
  const token = auth.token;
  
  // Start and submit exam
  const { data: exam } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, token);
  const answers = {};
  exam.questions.forEach(q => {
    if (q.qtype === 'mcq' || !q.qtype) {
      answers[q.questionNumber] = 'A';
    }
  });
  await apiRequest('POST', `/api/exams/${exam.attemptId}/submit`, { answers, timeUsed: 30, attemptId: exam.attemptId }, token);
  
  // Delete attempt
  await apiRequest('DELETE', `/api/me/attempts/${exam.attemptId}`, null, token);
  
  // Verify it's gone
  const { data: attempts } = await apiRequest('GET', '/api/me/attempts', null, token);
  const deletedAttempt = attempts.find(a => a.id === exam.attemptId);
  assert(!deletedAttempt, 'Deleted attempt should not appear in list');
});

// Test 10: Data export
const testDataExport = test('User can export their data', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data: auth } = await apiRequest('POST', '/api/auth/register', { email, password });
  const token = auth.token;
  
  const { data: exportData } = await apiRequest('GET', '/api/me/export', null, token);
  
  assert(exportData.user, 'Should include user data');
  assert(exportData.user.email === email, 'Should include correct email');
  assert(Array.isArray(exportData.attempts), 'Should include attempts array');
  assert(Array.isArray(exportData.loginHistory), 'Should include login history');
  assert(exportData.statistics, 'Should include statistics');
});

// Test 11: Full lifecycle - JWT token works across multiple requests
const testJWTLifecycle = test('JWT token issued on login works for multiple protected requests', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  // Register
  const { data: registerData } = await apiRequest('POST', '/api/auth/register', { email, password });
  const registerToken = registerData.token;
  assert(registerToken, 'Should receive token on registration');
  
  // Login
  const { data: loginData } = await apiRequest('POST', '/api/auth/login', { email, password });
  const loginToken = loginData.token;
  assert(loginToken, 'Should receive token on login');
  
  // Use token for multiple requests
  const { data: profile } = await apiRequest('GET', '/api/me', null, loginToken);
  assert(profile.email === email, 'Token should authenticate user');
  
  const { data: attempts } = await apiRequest('GET', '/api/me/attempts', null, loginToken);
  assert(Array.isArray(attempts), 'Token should work for multiple endpoints');
});

// Test 12: Exam creates exam_attempts row with correct data
const testExamAttemptsRow = test('Submit exam creates exam_attempts row with all required fields', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data: auth } = await apiRequest('POST', '/api/auth/register', { email, password });
  const token = auth.token;
  
  // Start exam
  const { data: exam } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, token);
  const attemptId = exam.attemptId;
  
  // Submit exam
  const answers = {};
  exam.questions.forEach(q => {
    if (q.qtype === 'mcq' || !q.qtype) {
      answers[q.questionNumber] = 'A';
    }
  });
  
  const { data: result } = await apiRequest(
    'POST',
    `/api/exams/${attemptId}/submit`,
    { answers, timeUsed: 45, attemptId },
    token
  );
  
  assert(result.score !== undefined, 'Should have score');
  assert(result.attemptId === attemptId, 'Should return correct attemptId');
  
  // Verify attempt is retrievable
  const { data: attempt } = await apiRequest('GET', `/api/me/attempts/${attemptId}`, null, token);
  assert(attempt.id === attemptId, 'Should retrieve attempt by ID');
  assert(attempt.score === result.score, 'Score should match');
  assert(attempt.timeUsed === 45, 'Time should be recorded');
});

// Test 13: Submit exam creates exam_attempt_answers rows
const testExamAnswersRows = test('Submit exam creates exam_attempt_answers rows for each question', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data: auth } = await apiRequest('POST', '/api/auth/register', { email, password });
  const token = auth.token;
  
  // Start exam
  const { data: exam } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, token);
  const totalQuestions = exam.questions.length;
  
  // Submit with answers for all questions
  const answers = {};
  exam.questions.forEach(q => {
    if (q.qtype === 'mcq' || !q.qtype) {
      answers[q.questionNumber] = 'B';
    }
  });
  
  await apiRequest(
    'POST',
    `/api/exams/${exam.attemptId}/submit`,
    { answers, timeUsed: 60, attemptId: exam.attemptId },
    token
  );
  
  // Get exam review to verify all answers were saved
  const { data: review } = await apiRequest('GET', `/api/exams/${exam.attemptId}/review`, null, token);
  
  assert(Array.isArray(review.questions), 'Should return questions with answers');
  assert(review.questions.length === totalQuestions, 'Should have answer for each question');
  
  // Verify each question has answer data
  review.questions.forEach(q => {
    assert(q.userAnswer !== undefined, `Question ${q.questionNumber} should have userAnswer`);
    assert(q.correctAnswer !== undefined, `Question ${q.questionNumber} should have correctAnswer`);
    assert(typeof q.isCorrect === 'boolean', `Question ${q.questionNumber} should have isCorrect flag`);
  });
});

// Test 14: User cannot access another user's exam in progress
const testCannotAccessOtherUserExam = test('User cannot access another user\'s exam in progress', async () => {
  const email1 = generateTestEmail();
  const email2 = generateTestEmail();
  const password = 'TestPass123!';
  
  // User 1 starts exam
  const { data: auth1 } = await apiRequest('POST', '/api/auth/register', { email: email1, password });
  const { data: exam1 } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, auth1.token);
  
  // User 2 tries to access user 1's exam
  const { data: auth2 } = await apiRequest('POST', '/api/auth/register', { email: email2, password });
  
  try {
    await apiRequest('GET', `/api/exams/${exam1.attemptId}`, null, auth2.token);
    assert.fail('Should not allow access to other user\'s exam');
  } catch (err) {
    assert(err.message.includes('404') || err.message.includes('403'), 'Should deny access');
  }
});

// Test 15: User deletes attempt - disappears from all user views
const testDeleteAttemptDisappears = test('Deleted attempt disappears from history and review', async () => {
  const email = generateTestEmail();
  const password = 'TestPass123!';
  
  const { data: auth } = await apiRequest('POST', '/api/auth/register', { email, password });
  const token = auth.token;
  
  // Create two exam attempts
  const { data: exam1 } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, token);
  const answers1 = {};
  exam1.questions.forEach(q => {
    if (q.qtype === 'mcq' || !q.qtype) answers1[q.questionNumber] = 'A';
  });
  await apiRequest('POST', `/api/exams/${exam1.attemptId}/submit`, { answers: answers1, timeUsed: 30, attemptId: exam1.attemptId }, token);
  
  const { data: exam2 } = await apiRequest('POST', '/api/exams/start', { isRetakeMissed: false }, token);
  const answers2 = {};
  exam2.questions.forEach(q => {
    if (q.qtype === 'mcq' || !q.qtype) answers2[q.questionNumber] = 'A';
  });
  await apiRequest('POST', `/api/exams/${exam2.attemptId}/submit`, { answers: answers2, timeUsed: 30, attemptId: exam2.attemptId }, token);
  
  // Verify both exist
  let { data: attempts } = await apiRequest('GET', '/api/me/attempts', null, token);
  assert(attempts.length >= 2, 'Should have at least 2 attempts');
  
  // Delete first attempt
  await apiRequest('DELETE', `/api/me/attempts/${exam1.attemptId}`, null, token);
  
  // Verify it's gone from history
  attempts = (await apiRequest('GET', '/api/me/attempts', null, token)).data;
  const foundDeleted = attempts.find(a => a.id === exam1.attemptId);
  assert(!foundDeleted, 'Deleted attempt should not appear in history');
  
  // Verify cannot access review
  try {
    await apiRequest('GET', `/api/exams/${exam1.attemptId}/review`, null, token);
    assert.fail('Should not be able to review deleted attempt');
  } catch (err) {
    assert(err.message.includes('404'), 'Should return 404 for deleted attempt');
  }
});

// Test 16: Invalid registration payloads are rejected
const testInvalidRegistration = test('Invalid registration payloads are rejected with clear errors', async () => {
  // Missing password
  try {
    await apiRequest('POST', '/api/auth/register', { email: 'test@example.com' });
    assert.fail('Should reject missing password');
  } catch (err) {
    assert(err.message.includes('400') || err.message.includes('required'), 'Should return validation error');
  }
  
  // Invalid email format
  try {
    await apiRequest('POST', '/api/auth/register', { email: 'not-an-email', password: 'TestPass123!' });
    assert.fail('Should reject invalid email');
  } catch (err) {
    assert(err.message.includes('400') || err.message.includes('email'), 'Should return email validation error');
  }
});

// Test 17: Invalid login payloads are rejected
const testInvalidLogin = test('Invalid login payloads are rejected with clear errors', async () => {
  // Missing credentials
  try {
    await apiRequest('POST', '/api/auth/login', {});
    assert.fail('Should reject empty credentials');
  } catch (err) {
    assert(err.message.includes('400') || err.message.includes('401'), 'Should return validation error');
  }
  
  // Wrong password
  const email = generateTestEmail();
  await apiRequest('POST', '/api/auth/register', { email, password: 'CorrectPass123!' });
  
  try {
    await apiRequest('POST', '/api/auth/login', { email, password: 'WrongPass123!' });
    assert.fail('Should reject wrong password');
  } catch (err) {
    assert(err.message.includes('401'), 'Should return 401 unauthorized');
  }
});

// Run all tests
async function runTests() {
  console.log('\n🧪 Running Integration Tests...\n');
  console.log('=' .repeat(60));
  
  // Core functionality tests
  await testHealthCheck();
  await testRegistration();
  await testLogin();
  await testAuthRequired();
  
  // Lifecycle tests
  await testJWTLifecycle();
  await testStartExam();
  await testSubmitExam();
  await testExamAttemptsRow();
  await testExamAnswersRows();
  await testExamHistory();
  
  // Security tests
  await testOwnershipCheck();
  await testCannotAccessOtherUserExam();
  await testDeleteAttempt();
  await testDeleteAttemptDisappears();
  
  // Validation tests
  await testInvalidRegistration();
  await testInvalidLogin();
  
  // Data export test
  await testDataExport();
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Results: ${testResults.passed} passed, ${testResults.failed} failed\n`);
  
  if (testResults.failed > 0) {
    console.log('Failed tests:');
    testResults.tests
      .filter(t => t.status === 'failed')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
}

export { runTests };
