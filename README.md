# CompTIA Security+ Practice Exam Web Application

A full-stack web application for CompTIA Security+ exam practice with user authentication, timed exams, randomized questions, and comprehensive result tracking.

## 🎯 Features

### Core Functionality
- **User Authentication**: Secure registration and login with JWT tokens and bcrypt password hashing
- **90-Question Timed Exams**: Each exam consists of exactly 90 questions with a 90-minute timer
- **Question Bank**: 120 comprehensive Security+ questions covering all major domains
- **Smart Randomization**: Questions are randomly selected while avoiding recent repeats
- **Progress Tracking**: Track which questions have been used and which were answered incorrectly
- **Retake Missed Questions**: Create new exams prioritizing previously missed questions

### Exam Features
- **Question Navigation**: Jump between any question using the visual navigator grid
- **Mark for Review**: Flag questions to revisit before submitting
- **Clear Answers**: Remove selected answers before final submission
- **Auto-Submit**: Exam automatically submits when time expires
- **Visual Feedback**: Color-coded grid showing answered, marked, and current questions

### Results & Analytics
- **Score Calculation**: Based only on answered questions with pass/fail indication (75% passing)
- **Domain Breakdown**: Performance analysis by Security+ domain
- **Answer Review**: Detailed review showing your answers, correct answers, and explanations
- **Exam History**: View all previous attempts with date, score, and time used
- **Historical Review**: Access complete question-by-question review of any past exam

### Security Features
- **No Answer Leakage**: Correct answers are never sent to frontend during active exams
- **JWT Authentication**: Secure API endpoints with token-based auth
- **Password Requirements**: Minimum 8 characters enforced
- **SQL Injection Protection**: Parameterized queries throughout
- **CSP Headers**: Content Security Policy via Helmet.js

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
