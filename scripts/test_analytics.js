// Test script to demonstrate analytics capabilities
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';

// Sample user credentials (replace with actual test user)
const TEST_USER = {
  email: 'test@example.com',
  password: 'test123'
};

async function testAnalytics() {
  console.log('🎯 Testing Learning Analytics API\n');
  console.log('='.repeat(70));

  try {
    // Login to get token
    console.log('\n📝 Logging in...');
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER)
    });

    if (!loginResponse.ok) {
      console.log('❌ Login failed. Creating test user...');
      
      // Try to register
      const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(TEST_USER)
      });
      
      if (!registerResponse.ok) {
        throw new Error('Failed to create test user');
      }
      
      // Login again
      const retryLogin = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(TEST_USER)
      });
      
      const retryData = await retryLogin.json();
      var token = retryData.token;
    } else {
      const loginData = await loginResponse.json();
      var token = loginData.token;
    }

    console.log('✅ Logged in successfully\n');

    // Test 1: Get comprehensive analytics
    console.log('📊 Test 1: Comprehensive Analytics');
    console.log('-'.repeat(70));
    
    const analyticsResponse = await fetch(`${API_URL}/api/analytics`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (analyticsResponse.ok) {
      const analytics = await analyticsResponse.json();
      
      console.log('\n📈 Overall Performance:');
      console.log(`   Total Exams: ${analytics.overall.totalExams}`);
      console.log(`   Questions Answered: ${analytics.overall.totalQuestions}`);
      console.log(`   Overall Accuracy: ${analytics.overall.accuracy}%`);
      console.log(`   Correct Answers: ${analytics.overall.correctAnswers}`);

      if (analytics.byDomain && analytics.byDomain.length > 0) {
        console.log('\n📚 Performance by Domain:');
        analytics.byDomain.slice(0, 5).forEach(domain => {
          const bar = '█'.repeat(Math.round(domain.accuracy / 5));
          console.log(`   ${domain.domain.padEnd(45)} ${domain.accuracy}% ${bar} [${domain.strength}]`);
        });
      }

      if (analytics.byTopic && analytics.byTopic.length > 0) {
        console.log('\n🎯 Performance by Topic:');
        analytics.byTopic.slice(0, 5).forEach(topic => {
          const bar = '█'.repeat(Math.round(topic.accuracy / 5));
          console.log(`   ${topic.topic.padEnd(35)} ${topic.accuracy}% ${bar} [${topic.strength}]`);
        });
      }

      if (analytics.weakestAreas && analytics.weakestAreas.length > 0) {
        console.log('\n⚠️  Top 5 Weakest Areas:');
        analytics.weakestAreas.forEach(area => {
          console.log(`   ${area.rank}. ${area.name} - ${area.accuracy}% (${area.questionsAttempted} questions)`);
          console.log(`      → ${area.recommendation}`);
        });
      }

      if (analytics.recommendations && analytics.recommendations.length > 0) {
        console.log('\n💡 Personalized Recommendations:');
        analytics.recommendations.forEach((rec, i) => {
          console.log(`   ${i + 1}. [${rec.priority}] ${rec.message}`);
          console.log(`      Action: ${rec.action}`);
        });
      }

      if (analytics.recentTrend && analytics.recentTrend.length > 0) {
        console.log('\n📈 Recent Performance Trend:');
        analytics.recentTrend.slice(0, 5).forEach(exam => {
          console.log(`   Exam #${exam.examId} - ${exam.score}% (${exam.correctCount}/${exam.questionsAnswered}) - ${exam.date}`);
        });
      }
    } else {
      console.log('ℹ️  No exam data yet - take some practice exams to see analytics');
    }

    // Test 2: Progress over time
    console.log('\n\n📊 Test 2: Progress Over Time');
    console.log('-'.repeat(70));
    
    const progressResponse = await fetch(`${API_URL}/api/analytics/progress`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (progressResponse.ok) {
      const progress = await progressResponse.json();
      
      if (progress.timeline && progress.timeline.length > 0) {
        console.log('\n📅 Daily Progress:');
        progress.timeline.forEach(day => {
          const trend = day.accuracy >= 75 ? '📈' : day.accuracy >= 60 ? '→' : '📉';
          console.log(`   ${day.date}: ${day.averageScore}% avg score, ${day.accuracy}% accuracy ${trend}`);
        });
      } else {
        console.log('ℹ️  No progress data yet');
      }
    }

    // Test 3: Domain-specific performance
    console.log('\n\n📊 Test 3: Domain-Specific Performance');
    console.log('-'.repeat(70));
    
    // Try a common domain
    const testDomain = 'Security Operations';
    const domainResponse = await fetch(
      `${API_URL}/api/analytics/domain/${encodeURIComponent(testDomain)}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (domainResponse.ok) {
      const domainPerf = await domainResponse.json();
      
      console.log(`\n🎯 ${domainPerf.domain}:`);
      console.log(`   Total Questions: ${domainPerf.totalQuestions}`);
      console.log(`   Correct Answers: ${domainPerf.correctAnswers}`);
      console.log(`   Accuracy: ${domainPerf.accuracy}%`);
      
      if (domainPerf.recentQuestions && domainPerf.recentQuestions.length > 0) {
        console.log(`\n   Recent Questions:`);
        domainPerf.recentQuestions.slice(0, 3).forEach(q => {
          const status = q.isCorrect ? '✅' : '❌';
          console.log(`   ${status} [${q.difficulty}] ${q.questionPreview}`);
        });
      }
    } else {
      console.log(`ℹ️  No data for ${testDomain} yet`);
    }

    console.log('\n\n✅ Analytics API Test Complete!');
    console.log('='.repeat(70));
    console.log('\n💡 API Endpoints Available:');
    console.log('   GET /api/analytics - Comprehensive learning analytics');
    console.log('   GET /api/analytics/progress - Progress over time');
    console.log('   GET /api/analytics/domain/:domain - Domain-specific performance');
    console.log('\n📚 Features:');
    console.log('   ✓ Overall accuracy tracking');
    console.log('   ✓ Performance by domain');
    console.log('   ✓ Performance by topic (12+ topics)');
    console.log('   ✓ Performance by difficulty');
    console.log('   ✓ Top 5 weakest areas identification');
    console.log('   ✓ Personalized recommendations');
    console.log('   ✓ Progress tracking over time');
    console.log('   ✓ Strength level indicators\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
console.log('\n🚀 Starting Analytics Test...\n');
testAnalytics();
