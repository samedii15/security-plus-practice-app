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
  theme: localStorage.getItem('theme') || 'dark',
  mode: 'exam', // 'exam' or 'study'
  studySession: null,
  immediateFeedback: false,
  currentFeedback: null
};

// Exam state persistence
function saveExamState() {
  if (!state.currentExam) return;
  
  const examState = {
    currentExam: state.currentExam,
    currentQuestionIndex: state.currentQuestionIndex,
    answers: state.answers,
    markedForReview: Array.from(state.markedForReview),
    timeRemaining: state.timeRemaining,
    examStartTime: state.examStartTime
  };
  
  localStorage.setItem('examState', JSON.stringify(examState));
}

function loadExamState() {
  const saved = localStorage.getItem('examState');
  if (!saved) return false;
  
  try {
    const examState = JSON.parse(saved);
    
    // Check if exam is still valid (not expired)
    if (examState.examStartTime) {
      const elapsed = Math.floor((Date.now() - examState.examStartTime) / 1000);
      const maxTime = 90 * 60 + 60; // 91 minutes grace period
      
      if (elapsed > maxTime) {
        clearExamState();
        return false;
      }
      
      // Restore state
      state.currentExam = examState.currentExam;
      state.currentQuestionIndex = examState.currentQuestionIndex;
      state.answers = examState.answers;
      state.markedForReview = new Set(examState.markedForReview);
      state.timeRemaining = Math.max(0, examState.timeRemaining - Math.floor(elapsed / 10)); // Slight penalty for refresh
      state.examStartTime = examState.examStartTime;
      
      return true;
    }
  } catch (e) {
    console.error('Failed to load exam state:', e);
    clearExamState();
  }
  
  return false;
}

function clearExamState() {
  localStorage.removeItem('examState');
}

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

function showLoading(message = 'Loading...') {
  // Remove any existing loading overlay
  const existing = document.getElementById('loading-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div class="loading-text">${message}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.remove();
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

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

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
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
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

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

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
    
    // Show admin link if user is admin
    if (data.user.role === 'admin') {
      document.getElementById('admin-link').style.display = 'inline-block';
    }
    
    showScreen('dashboard-screen');
  } catch (err) {
    console.error('Login error:', err);
    showError('login-error', err.message || 'Login failed. Please try again.');
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
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
  
  showScreen('landing-screen');
  document.getElementById('back-to-dashboard-btn').style.display = 'none';
}

function checkAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (token && user) {
    state.token = token;
    state.user = JSON.parse(user);
    document.getElementById('user-email').textContent = state.user.email;
    document.getElementById('logout-btn').style.display = 'inline-block';
    
    // Show admin link if user is admin
    if (state.user.role === 'admin') {
      const adminLink = document.getElementById('admin-link');
      if (adminLink) {
        adminLink.style.display = 'inline-block';
      }
    }
    
    // Try to restore exam state if exists
    if (loadExamState()) {
      initializeExam();
      showScreen('exam-screen');
      document.getElementById('back-to-dashboard-btn').style.display = 'inline-block';
      startTimer();
      
      // Show notification
      const notification = document.createElement('div');
      notification.style.cssText = 'position:fixed;top:80px;right:20px;background:var(--accent-secondary);color:white;padding:1rem;border-radius:8px;z-index:10000;';
      notification.textContent = '✓ Exam resumed from last session';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    } else {
      showScreen('dashboard-screen');
      document.getElementById('back-to-dashboard-btn').style.display = 'none';
    }
  } else {
    showScreen('landing-screen');
    document.getElementById('back-to-dashboard-btn').style.display = 'none';
  }
}

// Exam Functions
async function startExam(isRetakeMissed = false) {
  showLoading('Starting exam...');
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
    
    saveExamState(); // Save initial state
    initializeExam();
    hideLoading();
    showScreen('exam-screen');
    document.getElementById('back-to-dashboard-btn').style.display = 'inline-block';
    startTimer();
  } catch (err) {
    hideLoading();
    showError('dashboard-error', 'Error starting exam: ' + err.message);
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
  const qtype = question.qtype || 'mcq';
  
  document.getElementById('current-question-num').textContent = questionNum;
  document.getElementById('question-text').textContent = question.question;
  
  const choicesContainer = document.getElementById('choices-container');
  choicesContainer.innerHTML = '';
  
  // Handle different question types
  if (qtype === 'pbq') {
    // Render PBQ interface
    const pbqData = question.pbq;
    const userAnswer = state.answers[questionNum];
    
    if (pbqData && pbqData.type === 'multi_select') {
      renderMultiSelectPBQ(pbqData, userAnswer, questionNum);
    } else if (pbqData && pbqData.type === 'ordering') {
      renderOrderingPBQ(pbqData, userAnswer, questionNum);
    } else if (pbqData && pbqData.type === 'matching') {
      renderMatchingPBQ(pbqData, userAnswer, questionNum);
    } else {
      choicesContainer.innerHTML = '<p class="error">Unsupported PBQ type</p>';
    }
  } else {
    // Render MCQ interface
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
        
        // Submit answer immediately in study mode with immediate feedback
        if (state.mode === 'study' && state.immediateFeedback && !state.currentFeedback) {
          submitStudyAnswer(choice);
        }
      };
      
      const label = document.createElement('label');
      label.htmlFor = `choice-${choice}`;
      label.innerHTML = `<strong>${choice}.</strong> ${question.choices[choice]}`;
      
      div.appendChild(radio);
      div.appendChild(label);
      choicesContainer.appendChild(div);
    });
  }
  
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
  
  const isLastQuestion = state.currentQuestionIndex === state.currentExam.questions.length - 1;
  
  if (state.mode === 'study') {
    // Show exit button in study mode
    document.getElementById('exit-study-btn').style.display = 'inline-block';
    document.getElementById('mark-review-btn').style.display = 'none';
    
    // Show finish button on last question
    if (isLastQuestion) {
      document.getElementById('next-btn').style.display = 'none';
      document.getElementById('finish-study-btn').style.display = 'inline-block';
    } else {
      document.getElementById('next-btn').style.display = 'inline-block';
      document.getElementById('finish-study-btn').style.display = 'none';
    }
    
    // Update total questions display
    document.getElementById('total-questions').textContent = state.currentExam.questions.length;
  } else {
    // Exam mode - hide study buttons
    document.getElementById('exit-study-btn').style.display = 'none';
    document.getElementById('mark-review-btn').style.display = 'inline-block';
    document.getElementById('finish-study-btn').style.display = 'none';
    document.getElementById('next-btn').style.display = 'inline-block';
    document.getElementById('next-btn').disabled = isLastQuestion;
    document.getElementById('total-questions').textContent = '90';
  }
  
  updateQuestionGrid();
}

// PBQ rendering functions
function renderMultiSelectPBQ(pbqData, userAnswer, questionNum) {
  const selected = userAnswer?.selected || [];
  const container = document.getElementById('choices-container');
  
  container.innerHTML = `
    <div class="pbq-container pbq-multi-select">
      <div class="pbq-header">
        <span class="pbq-badge">Performance-Based Question</span>
      </div>
      <p class="pbq-prompt">${pbqData.prompt || 'Select all that apply:'}</p>
      <p class="pbq-helper-text">💡 Select all that apply - multiple answers are correct</p>
      <h4 class="pbq-section-title">Available Options</h4>
      <div class="pbq-options" id="pbq-options"></div>
    </div>
  `;
  
  const optionsDiv = document.getElementById('pbq-options');
  pbqData.options.forEach((option, index) => {
    const div = document.createElement('div');
    div.className = 'pbq-option';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pbq-option-${index}`;
    checkbox.value = index;
    checkbox.checked = selected.includes(index);
    checkbox.onchange = () => {
      const current = state.answers[questionNum] || { type: 'multi_select', selected: [] };
      const selectedArr = current.selected || [];
      
      if (checkbox.checked) {
        if (!selectedArr.includes(index)) {
          selectedArr.push(index);
        }
      } else {
        const idx = selectedArr.indexOf(index);
        if (idx > -1) selectedArr.splice(idx, 1);
      }
      
      state.answers[questionNum] = { type: 'multi_select', selected: selectedArr };
      updateQuestionGrid();
    };
    
    const label = document.createElement('label');
    label.htmlFor = `pbq-option-${index}`;
    label.textContent = option;
    
    div.appendChild(checkbox);
    div.appendChild(label);
    optionsDiv.appendChild(div);
  });
}

function renderOrderingPBQ(pbqData, userAnswer, questionNum) {
  const items = pbqData.items || pbqData.options || [];
  const order = userAnswer?.order || items.map((_, i) => i);
  const container = document.getElementById('choices-container');
  
  container.innerHTML = `
    <div class="pbq-container pbq-ordering">
      <div class="pbq-header">
        <span class="pbq-badge">Performance-Based Question</span>
      </div>
      <p class="pbq-prompt">${pbqData.prompt || 'Arrange items in the correct order:'}</p>
      <p class="pbq-helper-text">💡 Drag and drop to arrange items in correct order (top = first)</p>
      <h4 class="pbq-section-title">Your Ordering</h4>
      <div class="pbq-ordering-list" id="pbq-ordering-list"></div>
    </div>
  `;
  
  const list = document.getElementById('pbq-ordering-list');
  order.forEach((itemIndex, position) => {
    const div = document.createElement('div');
    div.className = 'pbq-ordering-item';
    div.draggable = true;
    div.dataset.index = itemIndex;
    div.innerHTML = `
      <span class="drag-handle">☰</span>
      <span class="item-number">${position + 1}.</span>
      <span class="item-text">${items[itemIndex]}</span>
    `;
    list.appendChild(div);
  });
  
  // Initialize drag and drop
  initOrderingDragDrop(list, questionNum);
}

function renderMatchingPBQ(pbqData, userAnswer, questionNum) {
  const left = pbqData.left || [];
  const right = pbqData.right || [];
  const map = userAnswer?.map || {};
  const container = document.getElementById('choices-container');
  
  container.innerHTML = `
    <div class="pbq-container pbq-matching">
      <div class="pbq-header">
        <span class="pbq-badge">Performance-Based Question</span>
      </div>
      <p class="pbq-prompt">${pbqData.prompt || 'Match items on the left with items on the right:'}</p>
      <p class="pbq-helper-text">💡 Match each item on the left with the correct item on the right</p>
      <div class="pbq-matching-grid" id="pbq-matching-grid"></div>
    </div>
  `;
  
  const grid = document.getElementById('pbq-matching-grid');
  grid.innerHTML = '<div class="pbq-matching-left"></div><div class="pbq-matching-middle"></div><div class="pbq-matching-right"></div>';
  
  const leftDiv = grid.querySelector('.pbq-matching-left');
  const middleDiv = grid.querySelector('.pbq-matching-middle');
  const rightDiv = grid.querySelector('.pbq-matching-right');
  
  left.forEach((item, index) => {
    leftDiv.innerHTML += `<div class="pbq-matching-item"><strong>${index + 1}.</strong> ${item}</div>`;
    
    const select = document.createElement('select');
    select.className = 'pbq-matching-select';
    select.innerHTML = '<option value="">-- Select --</option>';
    right.forEach((rightItem, rightIndex) => {
      const option = document.createElement('option');
      option.value = rightIndex;
      option.textContent = String.fromCharCode(65 + rightIndex);
      if (map[index] == rightIndex) option.selected = true;
      select.appendChild(option);
    });
    
    select.onchange = () => {
      const current = state.answers[questionNum] || { type: 'matching', map: {} };
      if (select.value === '') {
        delete current.map[index];
      } else {
        current.map[index] = parseInt(select.value);
      }
      state.answers[questionNum] = current;
      updateQuestionGrid();
    };
    
    middleDiv.appendChild(select);
  });
  
  right.forEach((item, index) => {
    rightDiv.innerHTML += `<div class="pbq-matching-item"><strong>${String.fromCharCode(65 + index)}.</strong> ${item}</div>`;
  });
}

function initOrderingDragDrop(list, questionNum) {
  let draggedItem = null;
  
  list.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('pbq-ordering-item')) {
      draggedItem = e.target;
      e.target.style.opacity = '0.5';
    }
  });
  
  list.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('pbq-ordering-item')) {
      e.target.style.opacity = '1';
      
      // Update answer
      const items = list.querySelectorAll('.pbq-ordering-item');
      const order = Array.from(items).map(item => parseInt(item.dataset.index));
      state.answers[questionNum] = { type: 'ordering', order };
      updateQuestionGrid();
    }
  });
  
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(list, e.clientY);
    if (afterElement == null) {
      list.appendChild(draggedItem);
    } else {
      list.insertBefore(draggedItem, afterElement);
    }
  });
  
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.pbq-ordering-item:not([style*="opacity: 0.5"])')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
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
  
  saveExamState(); // Save state on any update
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
  const questionNum = state.currentQuestionIndex + 1;
  
  // Warn if question is unanswered
  if (!state.answers[questionNum] && state.mode === 'exam') {
    const confirmed = confirm('You haven\'t answered this question yet. Do you want to proceed anyway?');
    if (!confirmed) {
      return;
    }
  }
  
  // In study mode with immediate feedback, check if answer was submitted
  if (state.mode === 'study' && state.immediateFeedback && state.currentFeedback) {
    // Clear feedback for next question
    state.currentFeedback = null;
  }
  
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
  
  const submitBtn = document.getElementById('submit-exam-btn');
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  document.getElementById('back-to-dashboard-btn').style.display = 'none';
  
  showLoading('Submitting exam...');
  const timeUsed = Math.floor((Date.now() - state.examStartTime) / 1000);
  
  try {
    const results = await apiCall(
      `/api/exams/${state.currentExam.examId}/submit`,
      'POST',
      { 
        answers: state.answers, 
        timeUsed,
        attemptId: state.currentExam.attemptId 
      }
    );
    
    clearExamState(); // Clear saved state after successful submit
    document.getElementById('timer-bar').style.display = 'none';
    hideLoading();
    displayResults(results);
    showScreen('results-screen');
  } catch (err) {
    hideLoading();
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    showError('exam-error', 'Error submitting exam: ' + err.message);
    startTimer(); // Resume timer on error
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
  reviewQuestions.innerHTML = state.currentResults.results.map(q => {
    if (q.qtype === 'pbq') {
      return renderPBQReviewItem(q);
    } else {
      return renderMCQReviewItem(q);
    }
  }).join('');
}

function renderMCQReviewItem(q) {
  return `
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
      ${q.domain ? `<div class="review-domain"><strong>Domain:</strong> ${q.domain}</div>` : ''}
    </div>
  `;
}

function renderPBQReviewItem(q) {
  let correctData = null;
  try {
    correctData = typeof q.correctAnswer === 'string' ? JSON.parse(q.correctAnswer) : q.correctAnswer;
  } catch (e) {
    correctData = q.correctAnswer;
  }
  
  let comparisonHTML = '';
  
  if (correctData && correctData.type === 'multi_select') {
    comparisonHTML = renderMultiSelectReview(correctData, q.userAnswer);
  } else if (correctData && correctData.type === 'ordering') {
    comparisonHTML = renderOrderingReview(correctData, q.userAnswer);
  } else if (correctData && correctData.type === 'matching') {
    comparisonHTML = renderMatchingReview(correctData, q.userAnswer);
  } else {
    comparisonHTML = '<p>Unable to display PBQ comparison</p>';
  }
  
  return `
    <div class="review-question pbq-review ${q.isCorrect ? 'correct' : 'incorrect'}">
      <div class="review-header">
        <h4>Question ${q.questionNumber} (PBQ)</h4>
        <span class="review-badge ${q.isCorrect ? 'correct' : 'incorrect'}">
          ${q.isCorrect ? '✓ Correct' : '✗ Incorrect'}
        </span>
      </div>
      <p class="review-question-text">${q.question}</p>
      ${comparisonHTML}
      <div class="review-explanation">
        <strong>Explanation:</strong> ${q.explanation}
      </div>
      ${q.domain ? `<div class="review-domain"><strong>Domain:</strong> ${q.domain}</div>` : ''}
    </div>
  `;
}

function renderMultiSelectReview(correctData, userAnswer) {
  const userSelected = userAnswer?.selected || [];
  const correctIndices = correctData.correct || [];
  const options = correctData.options || [];
  
  let html = '<div class="pbq-review-multi-select"><div class="pbq-review-columns">';
  html += '<div class="pbq-review-column"><p><strong>Your selections:</strong></p><ul>';
  
  if (userSelected.length === 0) {
    html += '<li class="not-answered">No selections made</li>';
  } else {
    userSelected.forEach(idx => {
      const isCorrectChoice = correctIndices.includes(idx);
      html += `<li class="${isCorrectChoice ? 'correct-choice' : 'wrong-choice'}">${options[idx]}</li>`;
    });
  }
  
  html += '</ul></div><div class="pbq-review-column"><p><strong>Correct answer:</strong></p><ul>';
  correctIndices.forEach(idx => {
    html += `<li class="correct-choice">${options[idx]}</li>`;
  });
  html += '</ul></div></div></div>';
  
  return html;
}

function renderOrderingReview(correctData, userAnswer) {
  const userOrder = userAnswer?.order || [];
  const correctOrder = correctData.correct_order || [];
  const items = correctData.items || correctData.options || [];
  
  let html = '<div class="pbq-review-ordering"><div class="pbq-review-columns">';
  html += '<div class="pbq-review-column"><p><strong>Your order:</strong></p><ol>';
  
  if (userOrder.length === 0) {
    html += '<li class="not-answered">Not answered</li>';
  } else {
    userOrder.forEach((idx, pos) => {
      const isCorrectPos = correctOrder[pos] === idx;
      html += `<li class="${isCorrectPos ? 'correct-pos' : 'wrong-pos'}">${items[idx]}</li>`;
    });
  }
  
  html += '</ol></div><div class="pbq-review-column"><p><strong>Correct order:</strong></p><ol>';
  correctOrder.forEach(idx => {
    html += `<li class="correct-choice">${items[idx]}</li>`;
  });
  html += '</ol></div></div></div>';
  
  return html;
}

function renderMatchingReview(correctData, userAnswer) {
  const userMap = userAnswer?.map || {};
  const correctMap = correctData.correct_map || {};
  const left = correctData.left || [];
  const right = correctData.right || [];
  
  let html = '<div class="pbq-review-matching"><table class="matching-table">';
  html += '<thead><tr><th>Item</th><th>Your Match</th><th>Correct Match</th></tr></thead><tbody>';
  
  left.forEach((leftItem, leftIdx) => {
    const userRightIdx = userMap[leftIdx];
    const correctRightIdx = correctMap[leftIdx];
    const isCorrectMatch = userRightIdx == correctRightIdx;
    
    html += `<tr class="${isCorrectMatch ? 'correct-row' : 'wrong-row'}">`;
    html += `<td><strong>${leftIdx + 1}.</strong> ${leftItem}</td>`;
    html += `<td>${userRightIdx !== undefined ? `<strong>${String.fromCharCode(65 + userRightIdx)}.</strong> ${right[userRightIdx]}` : '<em>Not answered</em>'}</td>`;
    html += `<td><strong>${String.fromCharCode(65 + correctRightIdx)}.</strong> ${right[correctRightIdx]}</td>`;
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  return html;
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
    reviewDetailDiv.innerHTML = review.results.map(q => {
      if (q.qtype === 'pbq') {
        return renderPBQReviewItem(q);
      } else {
        return renderMCQReviewItem(q);
      }
    }).join('');
    
    showScreen('exam-review-screen');
  } catch (err) {
    alert('Error loading exam review: ' + err.message);
  }
}

// ===== STUDY MODE FUNCTIONS =====

async function loadDomains() {
  try {
    const data = await apiCall('/api/study/domains');
    const select = document.getElementById('study-domains');
    select.innerHTML = '<option value="">All Domains</option>';
    data.forEach(domain => {
      const option = document.createElement('option');
      option.value = domain.domain; // Backend returns 'domain' field, not 'name'
      option.textContent = `${domain.domain} (${domain.count} questions)`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load domains:', error);
  }
}

async function startStudySession() {
  const questionCount = parseInt(document.getElementById('study-question-count').value);
  const domainSelect = document.getElementById('study-domains');
  const selectedDomains = Array.from(domainSelect.selectedOptions)
    .map(opt => opt.value)
    .filter(v => v !== '');
  const difficulty = document.getElementById('study-difficulty').value;
  const type = document.getElementById('study-type').value;
  const onlyMissed = document.getElementById('study-only-missed').checked;
  const immediateMode = document.getElementById('study-immediate-feedback').checked;

  try {
    const options = {
      questionCount,
      immediateMode
    };

    if (selectedDomains.length > 0) options.domains = selectedDomains;
    if (difficulty) options.difficulty = difficulty;
    if (type) options.type = type;
    if (onlyMissed) options.onlyMissed = true;

    const data = await apiCall('/api/study/start', 'POST', options);
    
    state.mode = 'study';
    state.studySession = data;
    state.currentExam = { questions: data.questions };
    state.currentQuestionIndex = 0;
    state.answers = {};
    state.markedForReview = new Set();
    state.immediateFeedback = immediateMode;
    state.currentFeedback = null;

    showScreen('exam-screen');
    initializeExam();
    displayQuestion();
    
    // Hide timer for study mode
    document.getElementById('timer-bar').style.display = 'none';
    
  } catch (error) {
    alert('Failed to start study session: ' + error.message);
  }
}

function toggleMode(mode) {
  const examBtn = document.getElementById('exam-mode-btn');
  const studyBtn = document.getElementById('study-mode-btn');
  const examActions = document.getElementById('exam-mode-actions');
  const studyOptions = document.getElementById('study-mode-options');
  const infoTitle = document.getElementById('mode-info-title');
  const infoList = document.getElementById('mode-info-list');

  if (mode === 'exam') {
    examBtn.classList.add('active');
    studyBtn.classList.remove('active');
    examActions.style.display = 'flex';
    studyOptions.style.display = 'none';
    infoTitle.textContent = 'Exam Information';
    infoList.innerHTML = `
      <li>90 questions per exam</li>
      <li>90 minutes time limit</li>
      <li>Passing score: 75%</li>
      <li>Questions are randomly selected from the question bank</li>
      <li>You can mark questions for review and navigate between them</li>
    `;
  } else {
    examBtn.classList.remove('active');
    studyBtn.classList.add('active');
    examActions.style.display = 'none';
    studyOptions.style.display = 'block';
    infoTitle.textContent = 'Study Mode Benefits';
    infoList.innerHTML = `
      <li>Practice without time pressure</li>
      <li>Filter by domain, difficulty, and question type</li>
      <li>Get immediate feedback on your answers</li>
      <li>Focus on questions you got wrong previously</li>
      <li>Customize the number of questions</li>
    `;
    loadDomains();
  }
}

async function submitStudyAnswer(answer) {
  if (!state.immediateFeedback || !state.studySession) return;

  try {
    const currentQ = state.currentExam.questions[state.currentQuestionIndex];
    const data = await apiCall(
      `/api/study/${state.studySession.id}/answer`,
      'POST',
      {
        questionNumber: state.currentQuestionIndex + 1,
        answer: answer
      }
    );

    state.currentFeedback = data;
    displayImmediateFeedback(data);
    
  } catch (error) {
    console.error('Failed to submit study answer:', error);
  }
}

function displayImmediateFeedback(feedback) {
  const container = document.getElementById('choices-container');
  
  // Create feedback box
  const feedbackBox = document.createElement('div');
  feedbackBox.className = `feedback-box ${feedback.isCorrect ? 'correct' : 'incorrect'}`;
  feedbackBox.innerHTML = `
    <div class="feedback-header">
      <span class="feedback-icon">${feedback.isCorrect ? '✓' : '✗'}</span>
      <span class="feedback-title">${feedback.isCorrect ? 'Correct!' : 'Incorrect'}</span>
    </div>
    <div class="feedback-content">
      <p><strong>Correct Answer:</strong> ${formatCorrectAnswer(feedback.correctAnswer, feedback.question)}</p>
      ${feedback.question.explanation ? `<p><strong>Explanation:</strong> ${feedback.question.explanation}</p>` : ''}
    </div>
  `;
  
  container.appendChild(feedbackBox);
  
  // Disable further input
  const inputs = container.querySelectorAll('input, select');
  inputs.forEach(input => input.disabled = true);
}

function finishStudySession() {
  if (state.mode === 'study') {
    const answered = Object.keys(state.answers).length;
    const total = state.currentExam.questions.length;
    
    if (confirm(`You've answered ${answered} of ${total} questions. Are you sure you want to finish this study session?`)) {
      state.mode = 'exam';
      state.studySession = null;
      state.currentExam = null;
      state.currentFeedback = null;
      state.answers = {};
      showScreen('dashboard-screen');
    }
  }
}

function formatCorrectAnswer(answer, question) {
  const qtype = question.qtype || 'mcq';
  
  if (qtype === 'mcq') {
    // answer is like "A", question.choices is {A: "text", B: "text", ...}
    if (typeof answer === 'string' && question.choices && question.choices[answer]) {
      return `${answer}) ${question.choices[answer]}`;
    }
    return answer;
  } else if (qtype === 'pbq') {
    // Handle PBQ correct answers
    if (typeof answer === 'object') {
      if (answer.type === 'multi_select' && Array.isArray(answer.correct)) {
        return answer.correct.map(idx => `• ${answer.options[idx]}`).join('<br>');
      } else if (answer.type === 'ordering' && Array.isArray(answer.correct_order)) {
        return answer.correct_order.map((item, i) => `${i + 1}. ${item}`).join('<br>');
      } else if (answer.type === 'matching' && answer.correct_map) {
        return Object.entries(answer.correct_map).map(([key, value]) => `${key} → ${value}`).join('<br>');
      }
    }
    return JSON.stringify(answer);
  }
  return JSON.stringify(answer);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Landing page event listeners
  document.getElementById('landing-start-btn').addEventListener('click', () => {
    showScreen('login-screen');
  });
  
  document.getElementById('landing-login-btn').addEventListener('click', () => {
    showScreen('login-screen');
  });
  
  // Auth event listeners
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  
  // Back to Dashboard button
  document.getElementById('back-to-dashboard-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to go back to dashboard? Your current progress will be saved.')) {
      // Stop timer if running
      if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
      }
      // Save and clear exam state
      clearExamState();
      // Clear current exam/study state
      state.currentExam = null;
      state.currentQuestionIndex = 0;
      state.answers = {};
      state.markedForReview = new Set();
      // Show dashboard
      showScreen('dashboard-screen');
      document.getElementById('timer-bar').style.display = 'none';
      document.getElementById('back-to-dashboard-btn').style.display = 'none';
    }
  });
  
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
  
  // Study mode event listeners
  document.getElementById('exam-mode-btn').addEventListener('click', () => toggleMode('exam'));
  document.getElementById('study-mode-btn').addEventListener('click', () => toggleMode('study'));
  document.getElementById('start-study-btn').addEventListener('click', startStudySession);
  
  // Exam event listeners
  document.getElementById('prev-btn').addEventListener('click', handlePrevious);
  document.getElementById('next-btn').addEventListener('click', handleNext);
  document.getElementById('mark-review-btn').addEventListener('click', handleMarkReview);
  document.getElementById('clear-answer-btn').addEventListener('click', handleClearAnswer);
  document.getElementById('submit-exam-btn').addEventListener('click', () => {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }
    openSubmitModal();
  });
  document.getElementById('exit-study-btn').addEventListener('click', finishStudySession);
  document.getElementById('finish-study-btn').addEventListener('click', finishStudySession);
  
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
  
  // Feedback modal
  document.getElementById('feedback-btn').addEventListener('click', openFeedbackModal);
  document.querySelector('#feedback-modal .modal-close').addEventListener('click', closeFeedbackModal);
  document.getElementById('feedback-cancel').addEventListener('click', closeFeedbackModal);
  document.getElementById('feedback-submit').addEventListener('click', submitFeedback);
  
  // Character counter for feedback
  const feedbackText = document.getElementById('feedback-text');
  if (feedbackText) {
    feedbackText.addEventListener('input', updateCharCount);
  }
  
  // Submit confirmation modal
  document.getElementById('submit-cancel').addEventListener('click', closeSubmitModal);
  document.getElementById('submit-confirm').addEventListener('click', confirmSubmit);
  
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
// Feedback system
function openFeedbackModal() {
  if (!state.user) {
    alert('Please log in to submit feedback');
    return;
  }
  document.getElementById('feedback-modal').classList.add('active');
  document.getElementById('feedback-text').focus();
  updateCharCount(); // Initialize counter
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal').classList.remove('active');
  document.getElementById('feedback-text').value = '';
  document.querySelectorAll('input[name="rating"]').forEach(r => r.checked = false);
  document.getElementById('feedback-error').style.display = 'none';
  document.getElementById('feedback-success').style.display = 'none';
  updateCharCount();
}

function updateCharCount() {
  const textarea = document.getElementById('feedback-text');
  const counter = document.getElementById('char-count');
  if (textarea && counter) {
    counter.textContent = textarea.value.length;
  }
}

async function submitFeedback() {
  const message = document.getElementById('feedback-text').value.trim();
  const ratingInput = document.querySelector('input[name="rating"]:checked');
  const rating = ratingInput ? ratingInput.value : null;
  
  if (!message) {
    showError('feedback-error', 'Please enter your feedback');
    return;
  }
  
  const submitBtn = document.getElementById('feedback-submit');
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  
  try {
    await apiCall('/api/feedback', 'POST', { message, rating });
    showSuccess('feedback-success', 'Thank you for your feedback!');
    setTimeout(() => {
      closeFeedbackModal();
    }, 1500);
  } catch (err) {
    showError('feedback-error', err.message || 'Failed to submit feedback');
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
}

// Submit confirmation modal
function openSubmitModal() {
  const answeredCount = Object.keys(state.answers).length;
  const unansweredCount = state.currentExam.questions.length - answeredCount;
  const minutes = Math.floor(state.timeRemaining / 60);
  const seconds = state.timeRemaining % 60;
  
  let info = `<p><strong>Time remaining:</strong> ${minutes}:${seconds.toString().padStart(2, '0')}</p>`;
  info += `<p><strong>Answered:</strong> ${answeredCount} / ${state.currentExam.questions.length}</p>`;
  
  if (unansweredCount > 0) {
    info += `<p class="warning-text" style="color: var(--accent-danger); font-weight: 600;"><strong>⚠️ Unanswered questions: ${unansweredCount}</strong></p>`;
  }
  
  info += `<p style="margin-top: 1rem;">Are you sure you want to submit?</p>`;
  
  document.getElementById('submit-modal-info').innerHTML = info;
  document.getElementById('submit-modal').classList.add('active');
}

function closeSubmitModal() {
  document.getElementById('submit-modal').classList.remove('active');
}

async function confirmSubmit() {
  closeSubmitModal();
  await submitExam();
}