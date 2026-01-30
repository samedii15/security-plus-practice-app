# CompTIA Security+ Practice Exam Web Application

A production-ready, full-stack web application for CompTIA Security+ exam practice with comprehensive security features, user management, analytics, and performance-based questions (PBQs).

## 🎯 Features

### 🔐 Security & Authentication
- **JWT Authentication**: Secure token-based authentication with bcrypt password hashing
- **Role-Based Access Control**: User and admin roles with protected endpoints
- **Rate Limiting**: Auth endpoints (10 req/15min) and API endpoints (100 req/15min)
- **Ownership Verification**: Users can only access their own data
- **Soft Deletes**: Data recovery with automatic cleanup after 30 days
- **GDPR Compliance**: Full data export capability
- **Security Headers**: Helmet.js with Content Security Policy
- **Audit Logging**: Track all authentication and admin actions

### 📝 Exam Features
- **90-Question Timed Exams**: Realistic exam simulation with 90-minute timer
- **1,140+ Questions**: Comprehensive question bank covering all Security+ domains
- **Multiple Question Types**:
  - Multiple Choice Questions (MCQs)
  - Performance-Based Questions (PBQs): Multi-select, Ordering, Matching
- **Smart Randomization**: Domain-weighted question selection matching real exam distribution
- **Adaptive Difficulty**: Question difficulty adjusts based on performance
- **Question Navigation**: Jump between questions with visual grid
- **Mark for Review**: Flag questions to revisit
- **Auto-Submit**: Exam submits automatically when time expires
- **Retake Missed Questions**: Focus on previously incorrect answers

### 📊 Analytics & Tracking
- **Comprehensive Performance Analytics**:
  - Overall accuracy with strength indicators
  - Performance by domain (21 domains)
  - Performance by topic (12+ topics)
  - Performance by difficulty level
- **Weak Area Identification**: Top 5 areas needing improvement
- **Personalized Recommendations**: AI-driven study suggestions
- **Progress Over Time**: Track improvement across exams
- **Exam History**: Complete history with detailed reviews
- **Question Usage Tracking**: Avoid repetition, track missed questions
- **Bookmarking**: Save questions for later review

### 🎓 Study Mode
- **Custom Study Sessions**: Filter by domain, difficulty, or question type
- **Immediate Feedback Mode**: See correct answers after each question
- **Targeted Practice**: Focus on weak areas or specific domains
- **Flexible Question Count**: 1-100 questions per session

### 👥 User Management
- **User Dashboard**: View attempts, scores, and progress
- **Attempt Management**: View detailed breakdowns, delete attempts
- **Data Export**: Download complete history (GDPR compliant)
- **Account Deletion**: Soft delete with data cleanup

### 🛡️ Admin Features
- **User Management**: View, manage, and delete user accounts
- **Attempt Oversight**: View and manage all exam attempts
- **Audit Logs**: Track system events and admin actions
- **Data Cleanup**: Manual trigger for data retention cleanup
- **System Health**: Monitor database connectivity and metrics

### 🏥 Production Ready
- **Health Checks**: DB connectivity and system metrics
- **Request Logging**: Request ID, duration, and status tracking
- **Data Retention**: Auto-cleanup of old logs (90d login, 180d audit)
- **Integration Tests**: Complete lifecycle testing
- **Error Handling**: Comprehensive error handling throughout
- **Environment Configuration**: .env support with validation

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)

## 🚀 Installation & Setup

### 1. Clone or Download the Project

Navigate to the project directory:
```bash
cd comptia
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- express (web server)
- sqlite3 (database)
- bcryptjs (password hashing)
- jsonwebtoken (authentication)
- dotenv (environment variables)
- cors (cross-origin support)
- helmet (security headers)

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and set your JWT secret:
```env
JWT_SECRET=your-secure-random-secret-key-here
PORT=3000
NODE_ENV=development
```

**Important**: Change `JWT_SECRET` to a strong random string in production!

### 4. Start the Server

```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

The server will:
1. Initialize the SQLite database (`comptia.db`)
2. Import questions from `questions.json` on first run
3. Start listening on `http://localhost:3000`

### 5. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## 📱 Usage Guide

### First Time User

1. **Register**: Click "Register here" on the login screen
   - Enter your email and password (minimum 8 characters)
   - Confirm password
   - Click "Register"

2. **Login**: After registration, login with your credentials

3. **Dashboard**: You'll see three options:
   - **Start New Exam**: Begin a fresh 90-question exam
   - **Retake Missed Questions**: Practice questions you previously answered incorrectly
   - **View Exam History**: Review all your past attempts

### Taking an Exam

1. **Navigation**: 
   - Use "Next" and "Previous" buttons
   - Or click any question number in the grid on the left

2. **Answering Questions**:
   - Select one of the four options (A, B, C, D)
   - Your answer is automatically saved

3. **Question Management**:
   - **Mark for Review**: Flag questions to revisit
   - **Clear Answer**: Remove your selected answer

4. **Monitor Progress**:
   - Grid shows color-coded status (answered, marked, current)
   - Timer shows remaining time (turns red under 5 minutes)

5. **Submit Exam**:
   - Click "Submit Exam" when ready
   - Or wait for auto-submit when time expires
   - Confirm if you have unanswered questions

### Viewing Results

After submission, you'll see:
- **Overall Score**: Percentage and pass/fail status (75% passing)
- **Statistics**: Correct answers out of answered questions
- **Domain Breakdown**: Performance by Security+ domain
- **Review Answers**: Detailed question-by-question review with explanations

### Exam History

- View all past exam attempts
- See date, score, time used, and pass/fail status
- Click "View Review" to see complete question review for any exam

## 🗂️ Project Structure

```
comptia/
├── server.js              # Express server & API routes
├── auth.js                # Authentication logic (register, login, JWT)
├── examService.js         # Exam business logic (start, submit, history)
├── questions.json         # Question bank (120 questions)
├── package.json           # Dependencies
├── .env                   # Environment variables (create from .env.example)
├── .gitignore            # Git ignore rules
├── README.md             # This file
├── database/
│   ├── db.js             # Database initialization & schema
│   └── comptia.db        # SQLite database (auto-created)
└── public/
    ├── index.html        # Frontend HTML
    ├── app.js            # Frontend JavaScript
    └── styles.css        # Dark theme CSS
```

## 🔌 API Endpoints

### Health Check
- `GET /api/health` - Check server status and question count

### Authentication
- `POST /api/auth/register` - Register new user
  ```json
  Body: { "email": "user@example.com", "password": "password123" }
  ```

- `POST /api/auth/login` - Login user
  ```json
  Body: { "email": "user@example.com", "password": "password123" }
  Response: { "token": "jwt-token", "user": {...} }
  ```

### Exams (Require Authentication)
- `POST /api/exams/start` - Start new exam
  ```json
  Body: { "isRetakeMissed": false }
  Response: { "examId": 1, "questions": [...], "duration": 90 }
  ```

- `POST /api/exams/:id/submit` - Submit exam answers
  ```json
  Body: { "answers": { "1": "A", "2": "B", ... }, "timeUsed": 3456 }
  Response: { "score": 85, "correctCount": 76, "results": [...] }
  ```

- `GET /api/exams/history` - Get user's exam history
  ```json
  Response: [{ "examId": 1, "score": 85, "submittedAt": "...", ... }]
  ```

- `GET /api/exams/:id` - Get specific exam review
  ```json
  Response: { "examId": 1, "score": 85, "results": [...] }
  ```

- `POST /api/exams/retake-missed` - Start retake-missed exam
  ```json
  Response: { "examId": 2, "questions": [...] }
  ```

### Analytics (Require Authentication)
- `GET /api/analytics` - Get comprehensive analytics
- `GET /api/analytics/progress` - Get progress over time
- `GET /api/analytics/domain/:domain` - Get domain-specific performance

### Study Mode (Require Authentication)
- `POST /api/study/start` - Start custom study session
  ```json
  Body: { 
    "domains": ["Security Operations"], 
    "difficulty": "Hard",
    "questionCount": 20,
    "immediateMode": true
  }
  ```
- `POST /api/study/:sessionId/answer` - Submit study answer
- `GET /api/study/domains` - Get available domains
- `GET /api/study/history` - Get study session history

### User Self-Service (Require Authentication)
- `GET /api/me/attempts` - Get user's own attempts
- `GET /api/me/attempts/:id` - Get specific attempt details
- `DELETE /api/me/attempts/:id` - Delete user's attempt
- `DELETE /api/me/account` - Delete user's account (soft delete)
- `GET /api/me/export` - Export all user data (GDPR)

### Bookmarks (Require Authentication)
- `GET /api/bookmarks` - Get user's bookmarked questions
- `POST /api/bookmarks/:questionId` - Bookmark a question
- `DELETE /api/bookmarks/:questionId` - Remove bookmark

### Admin (Require Admin Role)
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get user details
- `DELETE /api/admin/users/:id` - Soft delete user
- `DELETE /api/admin/attempts/:id` - Soft delete attempt
- `GET /api/admin/audit-logs` - View audit logs
- `POST /api/admin/cleanup` - Manually trigger data cleanup

### System
- `GET /api/health` - System health check with DB connectivity
  ```json
  Response: {
    "status": "ok",
    "database": "connected",
    "questionCount": 1140,
    "userCount": 42,
    "attemptCount": 156,
    "uptime": 3600
  }
  ```

## 🗄️ Database Schema

### Tables

**users**
- `id` - Primary key
- `email` - Unique, not null
- `password_hash` - Bcrypt hashed password
- `created_at` - Timestamp

**questions**
- `id` - Primary key
- `question` - Question text
- `choice_a, choice_b, choice_c, choice_d` - Answer options
- `answer` - Correct answer (A/B/C/D)
- `explanation` - Why the answer is correct
- `domain` - Security+ domain
- `difficulty` - Easy/Medium/Hard

**exams**
- `id` - Primary key
- `user_id` - Foreign key to users
- `started_at` - Timestamp
- `submitted_at` - Timestamp
- `time_used` - Seconds
- `score` - Percentage
- `total_questions` - Always 90
- `answered_count` - Number answered
- `is_retake_missed` - Boolean flag

**exam_questions**
- `id` - Primary key
- `exam_id` - Foreign key to exams
- `question_id` - Foreign key to questions
- `question_number` - 1-90
- `user_answer` - A/B/C/D or null
- `is_correct` - Boolean
- `marked_for_review` - Boolean

**question_usage**
- `id` - Primary key
- `user_id` - Foreign key to users
- `question_id` - Foreign key to questions
- `last_used_at` - Timestamp
- `times_used` - Counter
- `times_correct` - Counter

## 🎨 UI Features

### Dark Theme
- Modern dark color scheme optimized for extended study sessions
- Smooth animations and transitions
- Clear visual hierarchy
- Responsive design for mobile, tablet, and desktop

### Visual Feedback
- **Blue**: Current question
- **Green**: Answered questions
- **Yellow**: Marked for review
- **Red**: Timer warning (< 5 minutes)

## 🔒 Security Considerations

### Implemented
- ✅ Password hashing with bcrypt (10 salt rounds)
- ✅ JWT token authentication with expiration
- ✅ Parameterized SQL queries (no SQL injection)
- ✅ Helmet.js security headers (CSP)
- ✅ CORS configured
- ✅ Answers not exposed during exam
- ✅ Input validation

### Production Recommendations
- Set strong `JWT_SECRET` in `.env`
- Use HTTPS in production
- Implement rate limiting on auth routes
- Add session timeout
- Enable database backups
- Monitor for suspicious activity

## 📝 Question Bank

The included `questions.json` contains **120 questions** covering:
- Application Security
- Cryptography
- Threats and Vulnerabilities
- Identity and Access Management
- Network Security
- Security Operations
- Cloud Security
- Business Continuity
- Risk Management
- Security Governance
- And more...

### Adding More Questions

Edit `questions.json` following this format:
```json
{
  "id": 121,
  "question": "What is the purpose of...",
  "choices": {
    "A": "Option A text",
    "B": "Option B text",
    "C": "Option C text",
    "D": "Option D text"
  },
  "answer": "B",
  "explanation": "Option B is correct because...",
  "domain": "Security Domain",
  "difficulty": "medium"
}
```

Restart the server to import new questions.

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Change port in .env
PORT=3001
```

### Database Issues
```bash
# Delete database to reset
rm comptia.db
# Restart server to recreate
npm start
```

### Questions Not Loading
- Ensure `questions.json` is in the root directory
- Check server console for import messages
- Verify JSON syntax is valid

### Login Issues
- Clear browser localStorage
- Check that `.env` has JWT_SECRET set
- Verify password meets 8-character minimum

## 🚀 Deployment

### Environment Setup
1. Set `NODE_ENV=production` in `.env`
2. Use a strong random `JWT_SECRET`
3. Configure proper CORS origins
4. Set up HTTPS/SSL certificates

### Hosting Options
- **VPS**: DigitalOcean, AWS EC2, Linode
- **PaaS**: Heroku, Railway, Render
- **Traditional**: Any Node.js hosting provider

### Database Persistence
- SQLite file (`comptia.db`) must be persisted
- Set up regular backups
- Consider migrating to PostgreSQL/MySQL for scale

## 📄 License

This project is for educational purposes only. CompTIA and Security+ are trademarks of CompTIA, Inc.

## 🤝 Contributing

To add more questions or improve the application:
1. Edit `questions.json` for new questions
2. Modify CSS in `public/styles.css` for UI changes
3. Update `public/app.js` for frontend logic
4. Update `server.js` or service files for backend changes

## 📧 Support

For issues or questions:
1. Check the Troubleshooting section
2. Review server console logs
3. Check browser console for frontend errors
4. Verify all dependencies are installed

---

**Happy Studying! Good luck with your CompTIA Security+ certification! 🎓🔒**
