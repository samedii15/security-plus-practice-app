# Architecture Documentation

## System Overview

CompTIA Security+ Practice Exam is a full-stack web application providing realistic exam simulation with Performance-Based Questions (PBQs), study modes, analytics, and admin features. Built with a focus on security, data integrity, and maintainability.

**Tech Stack:**
- **Backend:** Node.js (v18+) with Express.js
- **Database:** SQLite3 with migration-based schema management
- **Authentication:** JWT + bcrypt with role-based access control
- **Security:** Helmet.js (CSP), express-rate-limit, audit logging
- **Testing:** Custom integration test suite
- **Frontend:** Vanilla JavaScript SPA with ES6+ modules

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │
│  │  Exam UI   │  │  Study UI  │  │ Analytics  │  │  Admin   │ │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘ │
│         │                │                │              │      │
│         └────────────────┴────────────────┴──────────────┘      │
│                          │                                      │
│                    REST API (JSON)                              │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                    MIDDLEWARE LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Rate Limiter │→ │  Validation  │→ │ JWT Verify   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  CORS/Helmet │  │ Audit Logger │  │ Req Logging  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                     SERVICE LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │examService.js│  │studyService  │  │analyticsServ │         │
│  │              │  │              │  │              │         │
│  │ • startExam  │  │ • startStudy │  │ • getAnalyti │         │
│  │ • submitExam │  │ • submitAns  │  │ • getDomain  │         │
│  │ • getReview  │  │ • getHistory │  │ • getProgres │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   auth.js    │  │ auditServ.js │  │dataCleanup.js│         │
│  │              │  │              │  │              │         │
│  │ • register   │  │ • logEvent   │  │ • cleanup    │         │
│  │ • login      │  │ • logAuth    │  │ • scheduleJob│         │
│  │ • verifyToken│  │              │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                     DATA LAYER                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    SQLite Database                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │    │
│  │  │ exam_attempts│→ │exam_attempt_ │  │ questions  │  │    │
│  │  │  (PRIMARY)   │  │   answers    │  │            │  │    │
│  │  └──────────────┘  └──────────────┘  └────────────┘  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │    │
│  │  │    users     │  │ auth_logins  │  │audit_logs  │  │    │
│  │  └──────────────┘  └──────────────┘  └────────────┘  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │    │
│  │  │study_sessions│  │question_usage│  │ bookmarks  │  │    │
│  │  └──────────────┘  └──────────────┘  └────────────┘  │    │
│  │  ┌──────────────┐                                     │    │
│  │  │exams (legacy)│ ← Compatibility only               │    │
│  │  └──────────────┘                                     │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model Overview

### Primary Tables (Source of Truth)

**exam_attempts** - Single source of truth for all exam attempts
```sql
id              PRIMARY KEY
user_id         REFERENCES users(id)
mode            TEXT (exam/study/retake)
started_at      DATETIME
submitted_at    DATETIME (NULL if in progress)
duration        INTEGER (seconds)
total_questions INTEGER
score_percent   REAL
correct_count   INTEGER
partial_count   INTEGER (for PBQs)
incorrect_count INTEGER
deleted_at      DATETIME (soft delete)
```

**exam_attempt_answers** - Individual question responses
```sql
id               PRIMARY KEY
attempt_id       REFERENCES exam_attempts(id)
question_id      REFERENCES questions(id)
question_number  INTEGER
user_answer_json TEXT (stores complex PBQ answers)
is_correct       BOOLEAN
is_partial       BOOLEAN (PBQs can be partially correct)
points           REAL (0.0 to 1.0 for PBQs)
```

**questions** - Question bank with PBQ support
```sql
id                PRIMARY KEY
question          TEXT
choice_a/b/c/d    TEXT
answer            TEXT
explanation       TEXT
domain            TEXT (5 CompTIA domains)
difficulty        TEXT (easy/medium/hard)
qtype             TEXT (mcq/pbq)
pbq_json          TEXT (stores PBQ configuration)
```

**users** - User accounts with RBAC
```sql
id            PRIMARY KEY
email         TEXT UNIQUE
password_hash TEXT (bcrypt)
role          TEXT (user/admin)
created_at    DATETIME
deleted_at    DATETIME (soft delete)
```

### Security & Audit Tables

**auth_logins** - Login event tracking (90-day retention)
```sql
id          PRIMARY KEY
user_id     REFERENCES users(id)
event       TEXT (login_success/login_failure)
ip_address  TEXT
user_agent  TEXT
created_at  DATETIME
```

**audit_logs** - Admin action audit trail (180-day retention)
```sql
id          PRIMARY KEY
event_type  TEXT (user_deleted/data_exported/cleanup_run)
user_id     REFERENCES users(id)
ip_address  TEXT
details     TEXT (JSON)
created_at  DATETIME
```

### Legacy Tables (Maintained for Compatibility)

**exams** - Old exam format, still created for backwards compatibility but NOT used for analytics or review

---

## PBQ (Performance-Based Question) Scoring

### Design Philosophy

PBQs simulate real-world security scenarios (configuring firewalls, analyzing logs, etc.) and require complex multi-part answers. Unlike MCQs (binary correct/incorrect), PBQs use **partial credit scoring**.

### PBQ Structure

```javascript
{
  "id": 1001,
  "qtype": "pbq",
  "question": "Configure the firewall rules...",
  "pbq_json": {
    "type": "firewall_config",
    "expectedAnswer": {
      "rule1": { "port": "443", "protocol": "TCP", "action": "ALLOW" },
      "rule2": { "port": "22", "protocol": "TCP", "action": "DENY" }
    },
    "scoring": {
      "totalPoints": 1.0,
      "partialCredit": true,
      "minPoints": 0.0
    }
  }
}
```

### Scoring Algorithm (pbqScoring.js)

1. **Exact Match (1.0 points)** - All fields correct
2. **Partial Match (0.5 points)** - Some fields correct
3. **No Match (0.0 points)** - No correct fields

```javascript
function scorePBQ(questionConfig, userAnswer) {
  const expected = questionConfig.expectedAnswer;
  const totalFields = Object.keys(expected).length;
  let correctFields = 0;
  
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (deepEqual(userAnswer[key], expectedValue)) {
      correctFields++;
    }
  }
  
  const ratio = correctFields / totalFields;
  
  if (ratio === 1.0) return { isCorrect: true, isPartial: false, points: 1.0 };
  if (ratio >= 0.5) return { isCorrect: false, isPartial: true, points: 0.5 };
  return { isCorrect: false, isPartial: false, points: 0.0 };
}
```

### Score Calculation

Final exam score: `(sum of all points) / total_questions * 100`

Example:
- 80 MCQs (1 point each) = 80 possible points
- 10 PBQs (1 point each) = 10 possible points
- Total = 90 possible points

If user gets:
- 70 MCQs correct (70 points)
- 5 PBQs perfect (5 points)
- 3 PBQs partial (1.5 points)
- 2 PBQs wrong (0 points)

**Final Score: (76.5 / 90) * 100 = 85%**

### Why This Matters

1. **Realism:** CompTIA Security+ includes ~10-15% PBQs worth more than MCQs
2. **Fairness:** Partial credit rewards understanding even if execution is imperfect
3. **Feedback:** Users see exactly which PBQ components they got right/wrong

---

## Security Architecture

### Threat Model

**Primary Threats:**
1. Unauthorized data access (user A viewing user B's exams)
2. Answer leakage (viewing correct answers before submission)
3. Credential stuffing / brute force attacks
4. Data exfiltration by compromised accounts
5. SQL injection attacks

### Security Controls

#### 1. Authentication & Authorization

**JWT-Based Auth:**
```javascript
// Token issued on login/register
const token = jwt.sign(
  { id: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
```

**RBAC Middleware:**
```javascript
verifyToken(req, res, next)  // All protected routes
verifyAdmin(req, res, next)   // Admin-only routes
```

**Ownership Verification:**
```javascript
// Every user-specific query includes ownership check
const exam = await get(
  'SELECT * FROM exam_attempts WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
  [attemptId, req.user.id]
);
if (!exam) return res.status(404).json({ error: 'Not found' });
```

#### 2. Rate Limiting

**Auth Endpoints:** 10 requests / 15 minutes (prevents brute force)
```javascript
authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10 });
```

**API Endpoints:** 100 requests / 15 minutes (prevents abuse)
```javascript
apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 100 });
```

**Admin Bypass:** Admins are exempt from auth rate limits

#### 3. Answer Leakage Prevention

**Problem:** If correct answers are sent to frontend before submission, users can cheat.

**Solution:**
- Questions sent to client **without** `answer` field
- Correct answers only revealed **after** submission
- Server-side answer validation only
- Review endpoint requires `submitted_at IS NOT NULL`

```javascript
// startExam - answers stripped
const questions = rows.map(q => ({
  id: q.id,
  question: q.question,
  choices: { A: q.choice_a, B: q.choice_b, C: q.choice_c, D: q.choice_d },
  // NO 'answer' field here!
  domain: q.domain,
  qtype: q.qtype
}));

// getExamReview - only if submitted
const attempt = await get(
  'SELECT submitted_at FROM exam_attempts WHERE id = ? AND user_id = ?',
  [attemptId, userId]
);
if (!attempt || !attempt.submitted_at) {
  throw new Error('Cannot review unsubmitted exam');
}
```

#### 4. Input Validation

All API endpoints use validation middleware (validation.js):

```javascript
validateRegistration(req, res, next)  // Email format, password length
validateLogin(req, res, next)         // Required fields
validateStartExam(req, res, next)     // Type checking
validateSubmitExam(req, res, next)    // Answer structure
validateIdParam(req, res, next)       // Numeric ID validation
```

Validation occurs **before** business logic, preventing invalid data from reaching the database.

#### 5. Soft Delete with Cascade

Users and attempts are soft-deleted (flagged with `deleted_at`) instead of hard-deleted:

```javascript
// Soft delete user
await run('UPDATE users SET deleted_at = ? WHERE id = ?', [new Date(), userId]);

// Cascade delete to attempts
await run(
  'UPDATE exam_attempts SET deleted_at = ? WHERE user_id = ?',
  [new Date(), userId]
);
```

**Benefits:**
- Data retention for auditing
- Can be recovered if needed
- Automatic cleanup after 30 days (dataCleanup.js)

#### 6. Audit Logging

All sensitive operations are logged:

```javascript
await logAuditEvent(
  'user_deleted',
  adminUserId,
  ipAddress,
  { deletedUserId: userId, reason: 'admin_action' }
);
```

Audit logs include:
- Event type
- User who performed action
- IP address
- Timestamp
- JSON details

Retention: 180 days (configurable in dataCleanup.js)

#### 7. Data Retention & Cleanup

Automated daily cleanup (scheduled at startup):

```javascript
scheduleCleanup() // Runs every 24 hours

cleanupAuthLogins(90)      // Delete login logs > 90 days
cleanupAuditLogs(180)      // Delete audit logs > 180 days
cleanupDeletedUsers(30)    // Purge soft-deleted users > 30 days
cleanupDeletedAttempts(30) // Purge soft-deleted attempts > 30 days
```

#### 8. Helmet.js Security Headers

```javascript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
})
```

Protects against:
- XSS attacks
- Clickjacking
- MIME sniffing
- Protocol downgrade attacks

#### 9. GDPR Compliance

**Data Export Endpoint:**
```javascript
GET /api/me/export
```

Returns all user data in JSON format:
- User profile
- All exam attempts
- All answers
- Login history
- Bookmarked questions
- Statistics

**Data Deletion:**
- Users can delete their attempts
- Admins can delete user accounts
- Soft-deleted data is purged after 30 days
- Hard delete available via `DELETE FROM users WHERE id = ?`

---

## Request Observability

### Request Logging

Every request generates a unique ID and logs:
- Request ID (random 7-char string)
- HTTP method
- Path
- Status code
- Duration (ms)

```
[a7f2c3d] GET /api/health 200 15ms
[b8e4f1a] POST /api/auth/login 200 234ms
[c9d5e2b] GET /api/me/attempts 200 42ms
```

### Health Endpoint

```
GET /api/health
```

Returns:
```json
{
  "status": "ok",
  "database": "connected",
  "questionCount": 1140,
  "userCount": 42,
  "attemptCount": 186,
  "timestamp": "2026-01-31T10:30:00.000Z",
  "uptime": 3600.5
}
```

Used for:
- Uptime monitoring
- Database connectivity checks
- CI/CD health checks
- Load balancer health probes

---

## Database Migration System

### Why Migrations?

**Problems with runtime schema creation:**
- No versioning
- No rollback capability
- Difficult to evolve schema
- Race conditions on startup

**Benefits of migrations:**
- Version-controlled schema
- Rollback support
- Safe schema evolution
- Clear upgrade path

### Migration Structure

```
migrations/
  001_initial_schema.js     # Base tables
  migrate.js                # Migration runner
```

Each migration file exports:
```javascript
export const up = (db) => { /* create tables */ };
export const down = (db) => { /* drop tables */ };
```

### Running Migrations

```bash
npm run migrate         # Apply pending migrations
npm run migrate:down    # Rollback last migration
npm run migrate:status  # Show applied/pending
```

### Tracking Applied Migrations

```sql
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

On startup, app checks if database exists:
- **No database:** Runs migrations automatically
- **Existing database:** Uses current schema

---

## Integration Testing Strategy

### Test Coverage

17 comprehensive tests covering:

**Lifecycle Tests:**
1. Health check responds
2. User registration
3. User login with JWT
4. Protected endpoints require auth
5. JWT token works across multiple requests
6. Start exam returns attemptId
7. Submit exam creates exam_attempts row
8. Submit exam creates exam_attempt_answers rows
9. Exam history retrieval

**Security Tests:**
10. User cannot access another user's attempt
11. User cannot access another user's exam in progress
12. Deleted attempt disappears from all views
13. Cannot review deleted attempts

**Validation Tests:**
14. Invalid registration payloads rejected
15. Invalid login payloads rejected

**GDPR Tests:**
16. User can export their data

### Running Tests

```bash
npm test
```

Tests run against live server:
- Requires server running on localhost:3000
- Uses real database (creates test users/exams)
- Cleans up after itself (soft-deletes test data)

### CI Integration

```yaml
- name: Run linter
  run: npm run lint

- name: Run tests
  run: npm test
```

**CI fails if:**
- Any test fails
- Lint errors present
- Non-zero exit code

---

## Engineering Decisions & Tradeoffs

### 1. SQLite vs PostgreSQL

**Choice:** SQLite

**Reasoning:**
- Simple deployment (single file)
- No external dependencies
- Sufficient for < 10,000 users
- Easy to backup/restore
- Perfect for demo/portfolio projects

**Tradeoff:** Not suitable for high-concurrency production at scale

---

### 2. JWT vs Session-Based Auth

**Choice:** JWT with 7-day expiry

**Reasoning:**
- Stateless (no session store needed)
- Scales horizontally
- Works with CDN/edge deployment
- Mobile-friendly

**Tradeoff:** Cannot revoke tokens (mitigated by short expiry)

---

### 3. Soft Delete vs Hard Delete

**Choice:** Soft delete with scheduled cleanup

**Reasoning:**
- Audit trail preservation
- Accidental deletion recovery
- GDPR compliance (can export before purge)
- Analytics on deleted data

**Tradeoff:** More complex queries (must filter `deleted_at IS NULL`)

---

### 4. Dual Table System (exams + exam_attempts)

**Choice:** Maintain both for backwards compatibility

**Reasoning:**
- `exam_attempts` is cleaner model
- `exams` already exists in production
- Gradual migration reduces risk

**Tradeoff:** Code complexity (must update both)

**Future:** Deprecate `exams` table in v2.0

---

### 5. PBQ Partial Credit Scoring

**Choice:** 3-tier scoring (1.0 / 0.5 / 0.0)

**Reasoning:**
- Mirrors real CompTIA scoring
- Encourages partial solutions
- More accurate skill assessment

**Tradeoff:** More complex scoring logic

---

### 6. Rate Limiting by IP

**Choice:** IP-based with admin bypass

**Reasoning:**
- Simple to implement
- Effective against brute force
- No per-user state needed

**Tradeoff:** Shared IPs (offices/schools) hit limits faster

**Future:** Add per-user rate limits in addition to IP

---

## Deployment Considerations

### Environment Variables

Required:
```
JWT_SECRET=<random 64-char string>
PORT=3000
NODE_ENV=production
```

Optional:
```
DB_PATH=/var/data/comptia.db
LOG_LEVEL=info
CLEANUP_SCHEDULE=0 2 * * *  # 2am daily
```

### Production Checklist

- [ ] Set strong JWT_SECRET (not default)
- [ ] Enable HTTPS (reverse proxy or cert)
- [ ] Configure firewall (only 443/80 open)
- [ ] Set up database backups (daily snapshots)
- [ ] Monitor /api/health endpoint
- [ ] Configure log rotation
- [ ] Set up error tracking (Sentry/LogRocket)
- [ ] Enable CORS whitelist (not `*`)
- [ ] Review rate limits for your traffic
- [ ] Schedule cleanup jobs (cron or task scheduler)

### Scaling Strategy

**< 100 users:** Single server, SQLite
**100-1000 users:** Vertical scaling (more CPU/RAM)
**> 1000 users:** Migrate to PostgreSQL + load balancer

---

## Conclusion

This architecture prioritizes:

1. **Security:** No answer leakage, ownership checks, audit logging
2. **Maintainability:** Migrations, validation, modular services
3. **User Experience:** PBQ scoring, analytics, study modes
4. **Professional Quality:** Testing, linting, CI/CD, documentation

Built to demonstrate production-ready engineering practices for a portfolio/interview context.
