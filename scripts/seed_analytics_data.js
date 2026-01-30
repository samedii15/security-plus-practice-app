// Script to populate analytics data by simulating exam completion
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';

// Test user credentials
const TEST_USER = {
  email: 'analytics-demo@example.com',
  password: 'demo12345'
};

async function seedAnalyticsData() {
  console.log('🌱 Seeding Analytics Data\n');
  console.log('='.repeat(70));

  try {
    // Step 1: Register user
    console.log('\n📝 Creating demo user...');
    let token;
    
    const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER)
    });

    if (registerResponse.ok) {
      const registerData = await registerResponse.json();
      token = registerData.token;
      console.log('✅ User created successfully');
    } else if (registerResponse.status === 400 || registerResponse.status === 409) {
      // User already exists, login instead
      console.log('ℹ️  User already exists, logging in...');
      const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(TEST_USER)
      });
      
      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new Error(`Failed to login: ${errorText}`);
      }
      
      const loginData = await loginResponse.json();
      token = loginData.token;
      console.log('✅ Logged in successfully');
    } else {
      const errorText = await registerResponse.text();
      throw new Error(`Failed to create user: ${registerResponse.status} - ${errorText}`);
    }

    // Step 2: Take multiple exams to generate varied data
    const numExams = 3;
    console.log(`\n📚 Simulating ${numExams} practice exams...\n`);

    for (let examNum = 1; examNum <= numExams; examNum++) {
      console.log(`  Exam ${examNum}/${numExams}...`);
      
      // Get new exam
      const examResponse = await fetch(`${API_URL}/api/exams/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isRetakeMissed: false })
      });

      if (!examResponse.ok) {
        const errorText = await examResponse.text();
        throw new Error(`Failed to start exam ${examNum}: ${examResponse.status} - ${errorText}`);
      }

      const exam = await examResponse.json();
      
      // Simulate varying performance
      // Exam 1: 70% correct, Exam 2: 75% correct, Exam 3: 80% correct
      const targetAccuracy = 0.65 + (examNum * 0.05);
      
      // Create answers - use question numbers as keys (not IDs)
      const answers = {};
      exam.questions.forEach((question) => {
        // Skip PBQ questions - they need complex answer structures
        if (question.qtype === 'pbq') {
          return;
        }
        
        // Randomly pick an answer weighted by target accuracy
        const choices = ['A', 'B', 'C', 'D'];
        // Higher target accuracy = more likely to pick first choice (assuming distributed correctly)
        const randomIndex = Math.random() < targetAccuracy ? 0 : Math.floor(Math.random() * 4);
        answers[question.questionNumber] = choices[randomIndex];
      });

      // Submit exam
      const submitResponse = await fetch(`${API_URL}/api/exams/${exam.examId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ answers })
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        throw new Error(`Failed to submit exam ${examNum}: ${submitResponse.status} - ${errorText}`);
      }

      const result = await submitResponse.json();
      console.log(`    ✅ Scored: ${result.score.toFixed(1)}% (${result.correctAnswers}/${result.totalQuestions})`);
      
      // Small delay between exams
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Step 3: Get analytics
    console.log('\n📊 Fetching analytics data...\n');
    const analyticsResponse = await fetch(`${API_URL}/api/analytics`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!analyticsResponse.ok) {
      throw new Error('Failed to fetch analytics');
    }

    const analytics = await analyticsResponse.json();

    // Display summary
    console.log('='.repeat(70));
    console.log('\n✨ ANALYTICS DATA SUMMARY\n');
    console.log(`Overall Accuracy: ${analytics.overall.accuracy.toFixed(1)}% (${analytics.overall.strength})`);
    console.log(`Total Exams: ${analytics.overall.totalExams}`);
    console.log(`Total Questions: ${analytics.overall.totalQuestions}`);
    
    if (analytics.weakAreas && analytics.weakAreas.length > 0) {
      console.log(`\nTop 5 Weak Areas:`);
      analytics.weakAreas.slice(0, 5).forEach((area, i) => {
        console.log(`  ${i + 1}. ${area.name} - ${area.accuracy.toFixed(1)}% (Priority: ${area.priority.toFixed(0)})`);
      });
    } else {
      console.log('\nNo weak areas identified yet.');
    }
    
    if (analytics.topics && analytics.topics.length > 0) {
      console.log(`\nTopics Detected: ${analytics.topics.length}`);
      analytics.topics.slice(0, 5).forEach(topic => {
        console.log(`  • ${topic.name}: ${topic.accuracy.toFixed(1)}%`);
      });
    } else {
      console.log('\nNo topics detected yet.');
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n🎉 SUCCESS! Analytics data has been seeded!\n');
    console.log('📌 Next Steps:');
    console.log('   1. Open http://localhost:3000 in your browser');
    console.log('   2. Login with:');
    console.log(`      Email: ${TEST_USER.email}`);
    console.log(`      Password: ${TEST_USER.password}`);
    console.log('   3. Click "📊 View Analytics" button');
    console.log('   4. See your beautiful analytics dashboard!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nMake sure the server is running: npm start\n');
  }
}

// Run the script
seedAnalyticsData();
