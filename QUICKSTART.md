# ⚡ Quick Start Guide

Get your authentication monitoring system running in **under 5 minutes**.

## 🎯 In a Nutshell

1. **Install** → 2. **Run** → 3. **Test** → 4. **Analyze**

---

## Step 1: Install Dependencies

```bash
npm install
```

That's it! No Python dependencies needed.

---

## Step 2: Run the Application

```bash
# Start server with logs to file
node app.js > app.log 2>&1
```

Server starts on **http://localhost:3000**

---

## Step 3: Test the System (Automated)

**Option A: Run automated tests** (recommended)

```bash
# In a new terminal
python test_system.py
```

This will:
- Send test login requests
- Simulate attacks (brute force, spraying)
- Automatically run analysis

**Option B: Manual testing**

```bash
# Valid login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"admin123"}'

# Invalid login (10 times to trigger alert)
for i in {1..10}; do
  curl -X POST http://localhost:3000/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin@example.com","password":"wrong'$i'"}'
done
```

---

## Step 4: Analyze Logs

```bash
# View analysis in terminal
python analyzer.py app.log --since-mins 10

# Generate visual HTML report
python analyzer.py app.log --since-mins 10 --export-html report.html

# Open report in browser
# Windows:
start report.html
# Mac:
open report.html
# Linux:
xdg-open report.html
```

---

## 🎨 Example Output

```
======================================================================
AUTHENTICATION LOG ANALYSIS REPORT
======================================================================

📊 SUMMARY:
  Total events analyzed: 25
  Failed attempts: 17
  Successful logins: 3
  Locked events: 0

🚨 ALERTS (1 total):
  [MEDIUM] IP=127.0.0.1 fails=17 users=8 reason=BRUTE_FORCE;SPRAY

======================================================================
```

---

## ⚙️ Configuration (Optional)

Create `.env` file for custom settings:

```bash
cp .env.example .env
# Edit .env with your preferred settings
```

Then run:

```bash
# Load environment variables (Linux/Mac)
source .env && node app.js > app.log 2>&1

# Or Windows PowerShell
Get-Content .env | ForEach-Object { $var = $_.Split('='); [Environment]::SetEnvironmentVariable($var[0], $var[1]) }
node app.js > app.log 2>&1
```

---

## 🚀 Deploy to Production

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["node", "app.js"]
```

```bash
docker build -t auth-monitor .
docker run -p 3000:3000 auth-monitor > app.log 2>&1
```

### Any Cloud Provider

1. Push code to Git repository
2. Connect to your cloud provider (Fly.io, Render, Railway, etc.)
3. Set environment variables in provider dashboard
4. Deploy!
5. Export logs and run analyzer locally or on a schedule

---

## 📊 Common Analysis Commands

```bash
# Last hour
python analyzer.py app.log --since-mins 60

# Investigate specific IP
python analyzer.py app.log --ip 1.2.3.4 --since-mins 120

# Failed logins only
python analyzer.py app.log --type AUTH_FAIL --since-mins 30

# Export all formats
python analyzer.py app.log --since-mins 60 \
  --export-html report.html \
  --export-csv alerts.csv \
  --export-json analysis.json

# Custom thresholds
python analyzer.py app.log \
  --ip-threshold 15 \
  --spray-threshold 8 \
  --success-after-fails 5
```

---

## 🆘 Troubleshooting

**Server won't start?**
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000   # Windows
lsof -i :3000                  # Mac/Linux

# Use different port
PORT=8080 node app.js > app.log 2>&1
```

**No events in analyzer?**
```bash
# Check log file exists and has content
cat app.log | head -n 5

# Try without time filter
python analyzer.py app.log
```

**IP shows as empty?**
- Normal for localhost testing
- Behind proxy? Configure `x-forwarded-for` header
- Or test from another machine

---

## 📚 Next Steps

- Read [README.md](README.md) for full documentation
- Customize detection thresholds
- Set up automated analysis (cron/scheduled task)
- Configure IP allowlist/denylist
- Deploy to your production environment

---

**You're all set! 🎉**
