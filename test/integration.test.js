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

// Run all tests
async function runTests() {
  console.log('\n🧪 Running Integration Tests...\n');
  console.log('=' .repeat(60));
  
  await testHealthCheck();
  await testRegistration();
  await testLogin();
  await testAuthRequired();
  await testStartExam();
  await testSubmitExam();
  await testExamHistory();
  await testOwnershipCheck();
  await testDeleteAttempt();
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
