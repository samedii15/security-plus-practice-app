# Web Authentication Monitoring & Alerting System

A **platform-agnostic** security monitoring system for Node.js/Express applications that works on **any hosting provider** (Fly.io, Render, Railway, VPS, Docker, local PC). Monitor login activity, detect suspicious behavior (brute force attacks, credential spraying), and generate clear alerts with detailed reports.

## 🎯 What It Does

1. **Node.js Application** - Emits structured JSON audit logs (single-line) to stdout for every authentication event
2. **Python Analyzer** - Parses logs from any environment (handles prefixes/timestamps), detects attacks, scores severity, generates reports

## ✨ Key Features

- ✅ **Platform-agnostic** - Works anywhere Node.js runs
- ✅ **Structured logging** - Single-line JSON to stdout (works with any log aggregation)
- ✅ **Robust parsing** - Handles logs with timestamps, hostnames, or other prefixes
- ✅ **Smart detection** - Brute force, credential spraying, suspicious patterns
- ✅ **Flexible filtering** - Time windows, IP, user, event type
- ✅ **Multiple exports** - Console, CSV, JSON, HTML reports
- ✅ **Rate limiting** - IP-based and user+IP correlation limiters
- ✅ **Configurable** - Environment variables for all thresholds

## 📋 Requirements

- **Node.js 14+** with Express
- **Python 3.7+** (no external dependencies)

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Application

```bash
# Run with logs to stdout (for development)
node app.js

# Redirect logs to file
node app.js > app.log 2>&1

# Or separate stdout (logs) from stderr (server messages)
node app.js > app.log
```

### 3. Analyze Logs

```bash
# Analyze last 60 minutes
python analyzer.py app.log --since-mins 60

# Investigate specific IP
python analyzer.py app.log --ip 1.2.3.4 --since-mins 120

# Export reports
python analyzer.py app.log --since-mins 60 --export-html report.html --export-csv alerts.csv
```

---

## 🔧 Configuration

### Environment Variables

Configure rate limits and filters via environment variables:

```bash
# IP rate limiting
export IP_RATE_WINDOW_MIN=15        # Time window in minutes (default: 15)
export IP_RATE_MAX_ATTEMPTS=20      # Max attempts per IP (default: 20)

# User+IP correlation limiter
export USER_IP_WINDOW_MIN=15        # Time window in minutes (default: 15)
export USER_IP_MAX_FAILURES=5       # Max failures per user+IP (default: 5)

# IP filtering (optional)
export IP_DENYLIST="1.2.3.4,5.6.7.8"         # Blocked IPs (comma-separated)
export IP_ALLOWLIST="10.0.0.1,192.168.1.1"  # Admin-only IPs (comma-separated)

# Server
export PORT=3000

# Run
node app.js > app.log
```

---

## 📊 Event Schema

All authentication events follow this JSON schema (one per line):

```json
{
  "type": "AUTH_FAIL",
  "ts": "2026-02-12T10:30:45.123Z",
  "ip": "1.2.3.4",
  "user": "admin@example.com",
  "path": "/login",
  "method": "POST",
  "ua": "Mozilla/5.0...",
  "status": 401,
  "req_id": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "RATE_LIMIT_IP",
  "meta": {"failure_count": 3}
}
```

### Event Types

- `AUTH_FAIL` - Invalid credentials (401)
- `AUTH_SUCCESS` - Successful login (200)
- `AUTH_LOCKED` - Rate limited or blocked (429/403)
- `AUTH_BAD_REQUEST` - Missing credentials (400)
- `AUTH_ERROR` - Server error (500)

---

## 🔍 Python Analyzer Usage

### Basic Analysis

```bash
# Analyze all events
python analyzer.py app.log

# Last 60 minutes only
python analyzer.py app.log --since-mins 60

# Specific IP
python analyzer.py app.log --ip 1.2.3.4

# Specific user
python analyzer.py app.log --user admin@example.com

# Failed logins only
python analyzer.py app.log --type AUTH_FAIL --since-mins 30
```

### Detection Thresholds

Customize alert thresholds:

```bash
python analyzer.py app.log \
  --ip-threshold 15 \           # Alert if IP has 15+ failures
  --spray-threshold 8 \          # Alert if IP tries 8+ unique users
  --success-after-fails 5 \      # Alert if success after 5+ fails
  --lock-threshold 3              # Alert if IP has 3+ lock events
```

### Export Options

```bash
# HTML report (visual dashboard)
python analyzer.py app.log --since-mins 60 --export-html report.html

# CSV (alerts only, for spreadsheets)
python analyzer.py app.log --export-csv alerts.csv

# JSON (full analysis, for automation)
python analyzer.py app.log --export-json analysis.json

# All formats
python analyzer.py app.log --since-mins 120 \
  --export-html report.html \
  --export-csv alerts.csv \
  --export-json analysis.json
```

### Advanced Filters

```bash
# Combine multiple filters
python analyzer.py app.log \
  --since-mins 120 \
  --path /login \
  --status 401 \
  --limit 10000

# Time-based investigation
python analyzer.py app.log --since-mins 30 --ip 1.2.3.4 --export-html recent_attack.html
```

---

## 🌐 Platform-Specific Log Collection

The analyzer works with any log file. Here's how to export logs from different environments:

### Local Development

```bash
# Run with log file
node app.js > app.log 2>&1

# Analyze
python analyzer.py app.log --since-mins 60
```

### Docker

```bash
# Export logs from running container
docker logs <container_name> > app.log 2>&1

# Or follow logs live
docker logs -f <container_name> | tee app.log

# Analyze
python analyzer.py app.log --since-mins 60
```

### Docker Compose

```bash
# Export logs from service
docker-compose logs app > app.log 2>&1

# Analyze
python analyzer.py app.log
```

### Systemd (VPS/Linux servers)

```bash
# Export journalctl logs for your service
sudo journalctl -u your-app-name --since "1 hour ago" > app.log

# Analyze
python analyzer.py app.log
```

### Fly.io

```bash
# Export logs
flyctl logs --app your-app-name > app.log

# Analyze
python analyzer.py app.log --since-mins 60
```

### Render

```bash
# Render Dashboard → Logs → Download
# Or via Render API:
curl -H "Authorization: Bearer YOUR_RENDER_API_KEY" \
  "https://api.render.com/v1/services/YOUR_SERVICE_ID/logs" > app.log

# Analyze
python analyzer.py app.log
```

### Railway

```bash
# Export from Railway dashboard or CLI
railway logs > app.log

# Analyze
python analyzer.py app.log
```

### Generic Cloud Providers (AWS, GCP, Azure)

Most cloud providers let you:
1. Stream logs to CloudWatch / Cloud Logging / Log Analytics
2. Export to S3 / Cloud Storage / Blob Storage
3. Download and analyze locally

```bash
# Example for AWS CloudWatch
aws logs get-log-events \
  --log-group-name /your-app/logs \
  --log-stream-name stream-name \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --output text > app.log

# Analyze
python analyzer.py app.log --since-mins 60
```

### PM2 (Process Manager)

```bash
# Export PM2 logs
pm2 logs --raw app-name > app.log

# Analyze
python analyzer.py app.log
```

---

## 🚨 Detection Rules

The analyzer automatically detects:

### 1. Brute Force Attack
IP attempts many failed logins against any accounts

**Severity:**
- LOW: `>= ip-threshold` (default: 10+ failures)
- MEDIUM: `>= 2x ip-threshold` (default: 20+ failures)
- HIGH: `>= 3x ip-threshold` (default: 30+ failures)

### 2. Credential Spraying
IP tries many different usernames (password spraying)

**Severity:**
- MEDIUM: `>= spray-threshold` unique users (default: 5+)

### 3. Suspicious Success After Failures
IP has many failures then a successful login (potential breach)

**Severity:**
- HIGH: Success after `>= success-after-fails` failures (default: 5+)

### 4. Excessive Lock Events
IP triggers rate limits repeatedly

**Severity:**
- LOW: `>= lock-threshold` locks (default: 3+)
- MEDIUM: `>= 2x lock-threshold` locks (default: 6+)

---

## 📈 Example Output

### Console Report

```
======================================================================
AUTHENTICATION LOG ANALYSIS REPORT
======================================================================

📊 SUMMARY:
  Total events analyzed: 1523
  Failed attempts: 248
  Successful logins: 1200
  Locked events: 45
  Bad requests: 18
  Errors: 12

🔝 TOP 10 IPs BY FAILURES:
  1. 1.2.3.4         - 87 failures
  2. 5.6.7.8         - 52 failures
  3. 10.20.30.40     - 34 failures

👤 TOP 10 TARGETED USERNAMES:
  1. admin@example.com           - 45 failures
  2. user@example.com            - 32 failures

🚨 ALERTS (2 total):
  [HIGH] IP=1.2.3.4 fails=87 users=23 reason=BRUTE_FORCE;SPRAY
  [MEDIUM] IP=5.6.7.8 fails=52 users=8 reason=BRUTE_FORCE;SPRAY

======================================================================
```

### HTML Report

Open `report.html` in any browser for a visual dashboard with:
- Summary statistics cards
- Color-coded severity alerts
- Top attackers table
- Top targeted users table
- Timestamp of generation

---

## 🛡️ Security Best Practices

1. **Never log passwords or tokens** - The audit system already prevents this
2. **Rotate logs regularly** - Implement log rotation (logrotate, Docker limits)
3. **Monitor alerts frequently** - Run analyzer on a schedule (cron, scheduled task)
4. **Adjust thresholds** - Tune based on your traffic patterns
5. **Investigate HIGH alerts immediately** - Potential active breaches
6. **Export logs off-server** - For forensics and compliance

---

## 🧪 Testing the System

### Test Login Endpoint

```bash
# Successful login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"admin123"}'

# Failed login (wrong password)
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"wrong"}'

# Missing credentials (bad request)
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Simulate Brute Force Attack

```bash
# Run 15 failed attempts (trigger brute force detection)
for i in {1..15}; do
  curl -X POST http://localhost:3000/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin@example.com","password":"wrong'$i'"}'
done

# Analyze
python analyzer.py app.log --since-mins 5 --ip-threshold 10
```

### Simulate Credential Spraying

```bash
# Try many different usernames from same IP
usernames=("admin" "user" "test" "root" "administrator" "guest")
for user in "${usernames[@]}"; do
  curl -X POST http://localhost:3000/login \
    -H "Content-Type: application/json" \
    -d '{"username":"'$user'@example.com","password":"test123"}'
done

# Analyze
python analyzer.py app.log --since-mins 5 --spray-threshold 5
```

---

## 📁 Project Structure

```
├── app.js           # Main Express application with /login endpoint
├── audit.js         # Structured audit logger (single-line JSON)
├── helpers.js       # IP extraction and request ID helpers
├── middleware.js    # Rate limiting and IP filtering middleware
├── analyzer.py      # Python log analyzer CLI (no dependencies)
├── package.json     # Node.js dependencies
└── README.md        # This file
```

---

## 🔄 Automation Ideas

### Scheduled Analysis (Cron)

```bash
# Add to crontab (every hour)
0 * * * * cd /path/to/app && python analyzer.py app.log --since-mins 60 --export-html /var/www/reports/latest.html
```

### Alert Webhook (JSON export + API call)

```bash
# After analysis, send alerts to Slack/Discord/etc
python analyzer.py app.log --since-mins 15 --export-json alerts.json
curl -X POST https://hooks.slack.com/... -d @alerts.json
```

### Log Rotation

```bash
# Rotate logs daily (keep 7 days)
# Add to /etc/logrotate.d/myapp
/path/to/app.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## 🐛 Troubleshooting

### No Events Found

**Problem:** Analyzer finds 0 events

**Solutions:**
1. Check log format - should be single-line JSON
2. Verify events have correct `type` field (AUTH_FAIL, AUTH_SUCCESS, etc.)
3. Check time filter - use `--since-mins` or remove it
4. Test JSON extraction: `python -c "import analyzer; print(analyzer.extract_json_from_line('your log line'))"`

### IP Shows as Empty

**Problem:** IP field is `""`

**Solutions:**
1. Check if you're behind a proxy - configure `x-forwarded-for` header
2. For local testing, use `127.0.0.1` or actual network IP
3. Verify Express `trust proxy` setting if behind reverse proxy

### Rate Limiting Not Working

**Problem:** No AUTH_LOCKED events

**Solutions:**
1. Check environment variables are set correctly
2. Verify thresholds aren't too high
3. Test with curl to trigger limit
4. Check if IP extraction is working correctly

---

## 📝 License

MIT License - Feel free to use in your projects!

---

## 🤝 Contributing

Issues and pull requests welcome! This is designed to be platform-agnostic and dependency-light.

---

## 📞 Support

For questions or issues:
1. Check the Troubleshooting section
2. Review example usage
3. Test with provided curl commands
4. Open an issue with log samples (redact sensitive data!)

---

**Built for security. Works everywhere. 🔒**
