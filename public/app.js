// Application State
const state = {
  user: null,
  token: null,
  currentExam: null,
  currentQuestionIndex: 0,
  answers: {},
  markedForReview: new Set(),
  timerInterval: null,
  timeRemaining: 90 * 60, // 90 minutes in seconds
  examStartTime: null,
  theme: localStorage.getItem('theme') || 'dark'
};

// API Base URL
const API_URL = window.location.origin;

// Utility Functions
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

function showError(elementId, message) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.style.display = 'block';
  setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

function showSuccess(elementId, message) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.style.display = 'block';
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (state.token) {
    options.headers['Authorization'] = `Bearer ${state.token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Authentication Functions
async function handleRegister(e) {
  e.preventDefault();
  
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-password-confirm').value;

  if (password !== confirmPassword) {
    showError('register-error', 'Passwords do not match');
    return;
  }

  if (password.length < 8) {
    showError('register-error', 'Password must be at least 8 characters');
    return;
  }

  try {
    const data = await apiCall('/api/auth/register', 'POST', { email, password });
    
    // If registration returns a token, auto-login
    if (data && data.token) {
      state.token = data.token;
      state.user = { email: email };
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({ email: email }));
      document.getElementById('user-email').textContent = email;
      document.getElementById('logout-btn').style.display = 'inline-block';
      document.getElementById('register-form').reset();
      showScreen('dashboard-screen');
    } else {
      showSuccess('register-success', 'Registration successful! Please login.');
      document.getElementById('register-form').reset();
      setTimeout(() => {
        document.getElementById('show-login').click();
      }, 1500);
    }
  } catch (err) {
    console.error('Registration error:', err);
    showError('register-error', err.message || 'Registration failed. Please try again.');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showError('login-error', 'Please enter both email and password');
    return;
  }

  try {
    const data = await apiCall('/api/auth/login', 'POST', { email, password });
    
    if (!data || !data.token) {
      throw new Error('Invalid response from server');
    }
    
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    document.getElementById('user-email').textContent = data.user.email;
    document.getElementById('logout-btn').style.display = 'inline-block';
    document.getElementById('login-form').reset();
    
    showScreen('dashboard-screen');
  } catch (err) {
    console.error('Login error:', err);
    showError('login-error', err.message || 'Login failed. Please try again.');
  }
}

function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  document.getElementById('user-email').textContent = '';
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById('login-form').reset();
  
  showScreen('login-screen');
}

function checkAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (token && user) {
    state.token = token;
    state.user = JSON.parse(user);
    document.getElementById('user-email').textContent = state.user.email;
    document.getElementById('logout-btn').style.display = 'inline-block';
    showScreen('dashboard-screen');
  } else {
    showScreen('login-screen');
  }
}

// Exam Functions
async function startExam(isRetakeMissed = false) {
  try {
    const data = await apiCall(
      isRetakeMissed ? '/api/exams/retake-missed' : '/api/exams/start',
      'POST',
      { isRetakeMissed }
    );
    
    state.currentExam = data;
    state.currentQuestionIndex = 0;
    state.answers = {};
    state.markedForReview = new Set();
    state.timeRemaining = data.duration * 60;
    state.examStartTime = Date.now();
    
    initializeExam();
    showScreen('exam-screen');
    startTimer();
  } catch (err) {
    alert('Error starting exam: ' + err.message);
  }
}

function initializeExam() {
  // Create question grid
  const grid = document.getElementById('question-grid');
  grid.innerHTML = '';
  
  for (let i = 0; i < state.currentExam.questions.length; i++) {
    const btn = document.createElement('button');
    btn.className = 'grid-item';
    btn.textContent = i + 1;
    btn.onclick = () => navigateToQuestion(i);
    grid.appendChild(btn);
  }
  
  document.getElementById('timer-bar').style.display = 'block';
  displayQuestion();
}

function displayQuestion() {
  const question = state.currentExam.questions[state.currentQuestionIndex];
  const questionNum = state.currentQuestionIndex + 1;
  
  document.getElementById('current-question-num').textContent = questionNum;
  document.getElementById('question-text').textContent = question.question;
  
  const choicesContainer = document.getElementById('choices-container');
  choicesContainer.innerHTML = '';
  
  ['A', 'B', 'C', 'D'].forEach(choice => {
    const div = document.createElement('div');
    div.className = 'choice-option';
    
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer';
    radio.id = `choice-${choice}`;
    radio.value = choice;
    
    if (state.answers[questionNum] === choice) {
      radio.checked = true;
    }
    
    radio.onchange = () => {
      state.answers[questionNum] = choice;
      updateQuestionGrid();
    };
    
    const label = document.createElement('label');
    label.htmlFor = `choice-${choice}`;
    label.innerHTML = `<strong>${choice}.</strong> ${question.choices[choice]}`;
    
    div.appendChild(radio);
    div.appendChild(label);
    choicesContainer.appendChild(div);
  });
  
  // Update mark for review button
  const markBtn = document.getElementById('mark-review-btn');
  if (state.markedForReview.has(questionNum)) {
    markBtn.textContent = 'Unmark Review';
    markBtn.classList.add('marked');
  } else {
    markBtn.textContent = 'Mark for Review';
    markBtn.classList.remove('marked');
  }
  
  // Update navigation buttons
  document.getElementById('prev-btn').disabled = state.currentQuestionIndex === 0;
  document.getElementById('next-btn').disabled = 
    state.currentQuestionIndex === state.currentExam.questions.length - 1;
  
  updateQuestionGrid();
}

function updateQuestionGrid() {
  const gridItems = document.querySelectorAll('.grid-item');
  gridItems.forEach((item, index) => {
    const questionNum = index + 1;
    item.className = 'grid-item';
    
    if (index === state.currentQuestionIndex) {
      item.classList.add('current');
    }
    if (state.answers[questionNum]) {
      item.classList.add('answered');
    }
    if (state.markedForReview.has(questionNum)) {
      item.classList.add('marked');
    }
  });
}

function navigateToQuestion(index) {
  state.currentQuestionIndex = index;
  displayQuestion();
}

function handlePrevious() {
  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex--;
    displayQuestion();
  }
}

function handleNext() {
  if (state.currentQuestionIndex < state.currentExam.questions.length - 1) {
    state.currentQuestionIndex++;
    displayQuestion();
  }
}

function handleMarkReview() {
  const questionNum = state.currentQuestionIndex + 1;
  if (state.markedForReview.has(questionNum)) {
    state.markedForReview.delete(questionNum);
  } else {
    state.markedForReview.add(questionNum);
  }
  displayQuestion();
}

function handleClearAnswer() {
  const questionNum = state.currentQuestionIndex + 1;
  delete state.answers[questionNum];
  displayQuestion();
}

function startTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
  }
  
  state.timerInterval = setInterval(() => {
    state.timeRemaining--;
    
    if (state.timeRemaining <= 0) {
      clearInterval(state.timerInterval);
      alert('Time is up! Submitting exam...');
      submitExam();
      return;
    }
    
    const minutes = Math.floor(state.timeRemaining / 60);
    const seconds = state.timeRemaining % 60;
    document.getElementById('timer').textContent = 
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Warning color when less than 5 minutes
    if (state.timeRemaining < 300) {
      document.getElementById('timer').style.color = '#ff6b6b';
    }
  }, 1000);
}

async function submitExam() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
  }
  
  const answeredCount = Object.keys(state.answers).length;
  
  if (answeredCount < state.currentExam.questions.length) {
    const confirmed = confirm(
      `You have only answered ${answeredCount} out of 90 questions. ` +
      `Are you sure you want to submit?`
    );
    if (!confirmed) {
      startTimer(); // Resume timer if they cancel
      return;
    }
  }
  
  const timeUsed = Math.floor((Date.now() - state.examStartTime) / 1000);
  
  try {
    const results = await apiCall(
      `/api/exams/${state.currentExam.examId}/submit`,
      'POST',
      { answers: state.answers, timeUsed }
    );
    
    document.getElementById('timer-bar').style.display = 'none';
    displayResults(results);
    showScreen('results-screen');
  } catch (err) {
    alert('Error submitting exam: ' + err.message);
  }
}

function displayResults(results) {
  const summaryDiv = document.getElementById('score-summary');
  const passed = results.passed;
  
  summaryDiv.innerHTML = `
    <div class="score-card ${passed ? 'passed' : 'failed'}">
      <h3>${passed ? '✓ PASSED' : '✗ FAILED'}</h3>
      <div class="score-value">${results.score}%</div>
      <div class="score-details">
        <p><strong>${results.correctCount}</strong> correct out of <strong>${results.answeredCount}</strong> answered</p>
        <p><strong>${results.totalQuestions - results.answeredCount}</strong> questions not answered</p>
        <p>Time used: <strong>${Math.floor(results.timeUsed / 60)} minutes ${results.timeUsed % 60} seconds</strong></p>
      </div>
    </div>
  `;
  
  // Display domain breakdown
  const domainStatsDiv = document.getElementById('domain-stats');
  domainStatsDiv.innerHTML = results.domainBreakdown
    .sort((a, b) => b.percentage - a.percentage)
    .map(domain => `
      <div class="domain-stat">
        <div class="domain-name">${domain.domain}</div>
        <div class="domain-bar">
          <div class="domain-fill" style="width: ${domain.percentage}%"></div>
        </div>
        <div class="domain-score">${domain.correct}/${domain.total} (${domain.percentage}%)</div>
      </div>
    `).join('');
  
  // Store results for review
  state.currentResults = results;
}

function displayReview() {
  const reviewContainer = document.getElementById('review-container');
  const reviewQuestions = document.getElementById('review-questions');
  
  reviewContainer.style.display = 'block';
  reviewQuestions.innerHTML = state.currentResults.results.map(q => `
    <div class="review-question ${q.isCorrect ? 'correct' : 'incorrect'}">
      <div class="review-header">
        <h4>Question ${q.questionNumber}</h4>
        <span class="review-badge ${q.isCorrect ? 'correct' : 'incorrect'}">
          ${q.isCorrect ? '✓ Correct' : '✗ Incorrect'}
        </span>
      </div>
      <p class="review-question-text">${q.question}</p>
      <div class="review-choices">
        ${['A', 'B', 'C', 'D'].map(choice => {
          let className = 'review-choice';
          if (choice === q.correctAnswer) className += ' correct-answer';
          if (choice === q.userAnswer && !q.isCorrect) className += ' wrong-answer';
          
          return `
            <div class="${className}">
              <strong>${choice}.</strong> ${q.choices[choice]}
              ${choice === q.userAnswer ? ' <em>(Your answer)</em>' : ''}
              ${choice === q.correctAnswer ? ' <em>(Correct answer)</em>' : ''}
            </div>
          `;
        }).join('')}
      </div>
      <div class="review-explanation">
        <strong>Explanation:</strong> ${q.explanation}
      </div>
    </div>
  `).join('');
}

async function loadExamHistory() {
  try {
    const history = await apiCall('/api/exams/history');
    const historyList = document.getElementById('history-list');
    
    if (history.length === 0) {
      historyList.innerHTML = '<p class="no-history">No exam history yet. Take your first exam!</p>';
      return;
    }
    
    historyList.innerHTML = history.map(exam => `
      <div class="history-item">
        <div class="history-main">
          <h4>Exam #${exam.examId} ${exam.isRetakeMissed ? '(Retake Missed)' : ''}</h4>
          <div class="history-details">
            <p><strong>Date:</strong> ${new Date(exam.submittedAt).toLocaleString()}</p>
            <p><strong>Score:</strong> ${exam.score}% ${exam.passed ? '✓' : '✗'}</p>
            <p><strong>Answered:</strong> ${exam.answeredCount}/${exam.totalQuestions}</p>
            <p><strong>Time:</strong> ${Math.floor(exam.timeUsed / 60)} min ${exam.timeUsed % 60} sec</p>
          </div>
        </div>
        <button class="btn btn-secondary" onclick="viewExamReview(${exam.examId})">
          View Review
        </button>
      </div>
    `).join('');
  } catch (err) {
    alert('Error loading history: ' + err.message);
  }
}

async function viewExamReview(examId) {
  try {
    const review = await apiCall(`/api/exams/${examId}`);
    
    const summaryDiv = document.getElementById('review-summary');
    summaryDiv.innerHTML = `
      <div class="score-card ${review.passed ? 'passed' : 'failed'}">
        <h3>Exam #${review.examId} - ${review.passed ? 'PASSED' : 'FAILED'}</h3>
        <div class="score-value">${review.score}%</div>
        <div class="score-details">
          <p><strong>${review.answeredCount}</strong> questions answered</p>
          <p>Completed on: <strong>${new Date(review.submittedAt).toLocaleString()}</strong></p>
          <p>Time used: <strong>${Math.floor(review.timeUsed / 60)} min ${review.timeUsed % 60} sec</strong></p>
        </div>
      </div>
    `;
    
    const reviewDetailDiv = document.getElementById('review-detail-questions');
    reviewDetailDiv.innerHTML = review.results.map(q => `
      <div class="review-question ${q.isCorrect ? 'correct' : 'incorrect'}">
        <div class="review-header">
          <h4>Question ${q.questionNumber}</h4>
          <span class="review-badge ${q.isCorrect ? 'correct' : 'incorrect'}">
            ${q.isCorrect ? '✓ Correct' : '✗ Incorrect'}
          </span>
        </div>
        <p class="review-question-text">${q.question}</p>
        <div class="review-choices">
          ${['A', 'B', 'C', 'D'].map(choice => {
            let className = 'review-choice';
            if (choice === q.correctAnswer) className += ' correct-answer';
            if (choice === q.userAnswer && !q.isCorrect) className += ' wrong-answer';
            
            return `
              <div class="${className}">
                <strong>${choice}.</strong> ${q.choices[choice]}
                ${choice === q.userAnswer ? ' <em>(Your answer)</em>' : ''}
                ${choice === q.correctAnswer ? ' <em>(Correct answer)</em>' : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div class="review-explanation">
          <strong>Explanation:</strong> ${q.explanation}
        </div>
      </div>
    `).join('');
    
    showScreen('exam-review-screen');
  } catch (err) {
    alert('Error loading exam review: ' + err.message);
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Auth event listeners
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  
  document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    showScreen('register-screen');
  });
  
  document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    showScreen('login-screen');
  });
  
  // Dashboard event listeners
  document.getElementById('start-exam-btn').addEventListener('click', () => startExam(false));
  document.getElementById('view-analytics-btn').addEventListener('click', () => {
    window.location.href = 'analytics.html';
  });
  document.getElementById('retake-missed-btn').addEventListener('click', () => startExam(true));
  document.getElementById('view-history-btn').addEventListener('click', () => {
    loadExamHistory();
    showScreen('history-screen');
  });
  
  // Exam event listeners
  document.getElementById('prev-btn').addEventListener('click', handlePrevious);
  document.getElementById('next-btn').addEventListener('click', handleNext);
  document.getElementById('mark-review-btn').addEventListener('click', handleMarkReview);
  document.getElementById('clear-answer-btn').addEventListener('click', handleClearAnswer);
  document.getElementById('submit-exam-btn').addEventListener('click', submitExam);
  
  // Results event listeners
  document.getElementById('review-answers-btn').addEventListener('click', displayReview);
  document.getElementById('back-dashboard-btn').addEventListener('click', () => {
    showScreen('dashboard-screen');
  });
  
  // History event listeners
  document.getElementById('back-from-history-btn').addEventListener('click', () => {
    showScreen('dashboard-screen');
  });
  
  document.getElementById('back-from-review-btn').addEventListener('click', () => {
    showScreen('history-screen');
  });
  
  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
    applyTheme(state.theme); // Apply saved theme
  }
  
  // Check authentication on load
  checkAuth();
});

// Theme management
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', state.theme);
  applyTheme(state.theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeToggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }
}
