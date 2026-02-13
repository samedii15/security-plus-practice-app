# Scheduler Setup Examples

Automate your authentication monitoring to run continuously without manual intervention.

## Option 1: Windows Task Scheduler

### Create a PowerShell script (`run_monitor.ps1`):

```powershell
# run_monitor.ps1 - Automated auth monitoring
Set-Location "C:\path\to\your\project"

# Export logs (adjust for your hosting)
# For local: logs are already in app.log
# For Docker: docker logs my-app > temp.log 2>&1; cat temp.log >> app.log
# For cloud: download logs via CLI

# Run analyzer with incremental processing
python analyzer.py app.log --incremental `
    --export-alerts-json alerts.json `
    --export-html "reports/report_$(Get-Date -Format 'yyyyMMdd_HHmmss').html"

# Send alerts if any HIGH severity found
if (Test-Path alerts.json) {
    $alerts = Get-Content alerts.json | ConvertFrom-Json
    $highCount = ($alerts.alerts | Where-Object { $_.severity -eq 'HIGH' }).Count
    
    if ($highCount -gt 0) {
        Write-Host "Found $highCount HIGH severity alerts - sending notifications"
        python notifier.py alerts.json --slack-webhook $env:SLACK_WEBHOOK --min-severity MEDIUM
    }
}
```

### Schedule in Task Scheduler:

1. Open Task Scheduler
2. Create Basic Task
3. **Trigger:** Every 5 minutes (or your preferred interval)
4. **Action:** Start a program
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "C:\path\to\run_monitor.ps1"`
5. **Settings:**
   - Run whether user is logged on or not
   - Run with highest privileges (if needed for Docker/logs)

---

## Option 2: Linux/Mac Cron

### Create a shell script (`run_monitor.sh`):

```bash
#!/bin/bash
# run_monitor.sh - Automated auth monitoring

cd /path/to/your/project

# Export logs (adjust for your environment)
# For systemd: journalctl -u your-app --since "5 minutes ago" >> app.log
# For Docker: docker logs --since 5m my-app >> app.log 2>&1
# For PM2: pm2 logs --raw --lines 1000 >> app.log

# Run analyzer with incremental processing
python3 analyzer.py app.log --incremental \
    --export-alerts-json alerts.json \
    --export-html "reports/report_$(date +%Y%m%d_%H%M%S).html"

# Send alerts if HIGH severity found
if [ -f alerts.json ]; then
    high_count=$(jq '[.alerts[] | select(.severity=="HIGH")] | length' alerts.json)
    if [ "$high_count" -gt 0 ]; then
        echo "Found $high_count HIGH alerts - sending notifications"
        python3 notifier.py alerts.json \
            --slack-webhook "$SLACK_WEBHOOK" \
            --min-severity MEDIUM
    fi
fi

# Cleanup old reports (keep last 30 days)
find reports/ -name "report_*.html" -mtime +30 -delete
```

### Schedule with cron:

```bash
# Make script executable
chmod +x run_monitor.sh

# Edit crontab
crontab -e

# Add entry (run every 5 minutes)
*/5 * * * * /path/to/run_monitor.sh >> /var/log/auth-monitor-cron.log 2>&1

# Or every 15 minutes
*/15 * * * * /path/to/run_monitor.sh >> /var/log/auth-monitor-cron.log 2>&1

# Or every hour
0 * * * * /path/to/run_monitor.sh >> /var/log/auth-monitor-cron.log 2>&1
```

---

## Option 3: GitHub Actions (Cloud-based)

**Perfect for monitoring cloud-hosted apps without a dedicated server.**

### `.github/workflows/auth-monitor.yml`:

```yaml
name: Authentication Monitoring

on:
  schedule:
    # Run every 15 minutes
    - cron: '*/15 * * * *'
  workflow_dispatch:  # Allow manual triggers

jobs:
  monitor:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - name: Export logs from Fly.io
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          curl -L https://fly.io/install.sh | sh
          export PATH="$HOME/.fly/bin:$PATH"
          flyctl logs --app your-app-name > app.log
        # OR for Render:
        # curl -H "Authorization: Bearer ${{ secrets.RENDER_API_KEY }}" \
        #   "https://api.render.com/v1/services/$SERVICE_ID/logs" > app.log
      
      - name: Run analyzer
        run: |
          python analyzer.py app.log --since-mins 20 \
            --export-alerts-json alerts.json \
            --export-html report.html \
            --export-incident-bundle incident.zip --incident-window 20
      
      - name: Send alerts to Slack
        if: hashFiles('alerts.json') != ''
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
        run: |
          python notifier.py alerts.json \
            --slack-webhook "$SLACK_WEBHOOK" \
            --min-severity MEDIUM
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: auth-reports
          path: |
            report.html
            alerts.json
            incident.zip
          retention-days: 30
      
      - name: Publish to GitHub Pages (optional)
        if: github.ref == 'refs/heads/main'
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
          destination_dir: reports
          keep_files: true
```

### Required secrets (Settings → Secrets):
- `FLY_API_TOKEN` or `RENDER_API_KEY` (for log export)
- `SLACK_WEBHOOK` or `DISCORD_WEBHOOK` (for notifications)

---

## Option 4: Fly.io Machine (Dedicated Monitor)

Deploy a separate tiny Fly.io app that runs the analyzer on schedule.

### Create `monitor-app.py`:

```python
import time
import subprocess
import os

INTERVAL_SECONDS = 300  # 5 minutes

while True:
    print(f"Running auth monitor...")
    
    # Export logs from main app
    subprocess.run([
        "flyctl", "logs", "--app", os.getenv("TARGET_APP"),
        ">", "app.log"
    ], shell=True)
    
    # Run analyzer
    subprocess.run([
        "python", "analyzer.py", "app.log",
        "--incremental",
        "--export-alerts-json", "alerts.json"
    ])
    
    # Send notifications
    if os.path.exists("alerts.json"):
        webhook = os.getenv("SLACK_WEBHOOK")
        if webhook:
            subprocess.run([
                "python", "notifier.py", "alerts.json",
                "--slack-webhook", webhook,
                "--min-severity", "MEDIUM"
            ])
    
    time.sleep(INTERVAL_SECONDS)
```

### Deploy on Fly.io:

```bash
# Create new app
flyctl launch --name auth-monitor

# Set secrets
flyctl secrets set TARGET_APP=your-main-app-name
flyctl secrets set SLACK_WEBHOOK=https://hooks.slack.com/...

# Deploy
flyctl deploy
```

---

## Option 5: Docker Container (Sidecar)

Run the monitor as a sidecar container alongside your app.

### `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - AUTH_LOG_SALT=${AUTH_LOG_SALT}
  
  monitor:
    image: python:3.10-slim
    volumes:
      - ./:/workspace
      - app-logs:/logs
    working_dir: /workspace
    command: >
      sh -c "
        apt-get update && apt-get install -y curl &&
        while true; do
          docker logs app > /logs/app.log 2>&1 &&
          python analyzer.py /logs/app.log --incremental \
            --export-alerts-json /logs/alerts.json &&
          python notifier.py /logs/alerts.json \
            --slack-webhook $$SLACK_WEBHOOK \
            --min-severity MEDIUM;
          sleep 300;
        done
      "
    environment:
      - SLACK_WEBHOOK=${SLACK_WEBHOOK}
    depends_on:
      - app

volumes:
  app-logs:
```

---

## Best Practices

### 1. Incremental Processing
Always use `--incremental` for scheduled runs to avoid reprocessing old events:
```bash
python analyzer.py app.log --incremental
```

### 2. Rotate Logs
Prevent disk space issues:
```bash
# Linux/Mac - logrotate
# /etc/logrotate.d/auth-monitor
/path/to/app.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
}

# Windows - PowerShell in scheduled task
Get-ChildItem app.log | Where-Object {$_.Length -gt 100MB} | 
    Rename-Item -NewName {"app_$(Get-Date -Format 'yyyyMMdd').log"}
```

### 3. Alert Filtering
Only send important alerts to avoid noise:
```bash
python notifier.py alerts.json --min-severity HIGH
```

### 4. Monitoring the Monitor
Set up a dead man's switch to ensure your monitor is running:
- Use healthchecks.io, UptimeRobot, or similar
- Send a ping after each successful run

```bash
# At end of run_monitor.sh
curl https://hc-ping.com/your-uuid
```

### 5. Retention Policy
Clean up old reports regularly:
```bash
# Keep only last 30 days
find reports/ -name "*.html" -mtime +30 -delete
```

---

## Quick Start

1. Choose your scheduling method above
2. Create the script for your platform
3. Set required environment variables (SLACK_WEBHOOK, etc.)
4. Test manually first:
   ```bash
   ./run_monitor.sh
   # or
   powershell -File run_monitor.ps1
   ```
5. Add to scheduler
6. Monitor for 24 hours to verify it's working

---

## Troubleshooting

**Script not running?**
- Check scheduler logs
- Verify script has execution permissions (`chmod +x`)
- Test script manually first

**No alerts being sent?**
- Check if alerts.json exists and has data
- Verify webhook URLs are correct
- Test notifier manually: `python notifier.py alerts.json --slack-webhook ...`

**Logs growing too large?**
- Implement log rotation
- Use `--incremental` mode
- Add cleanup step in scheduler

**Missing events?**
- Ensure log export covers the monitoring interval
- Check state file is being updated (`analyzer_state.json`)
- Verify time filters match your interval
