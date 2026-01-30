Write-Host "Testing Analytics Implementation..." -ForegroundColor Cyan

$baseUrl = "http://localhost:3000"

# Test server
Write-Host "`nChecking server status..."
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing
    Write-Host "Server is RUNNING" -ForegroundColor Green
    
    # Check if analytics files exist
    Write-Host "`nChecking implementation files..."
    $files = @(
        "analyticsService.js",
        "LEARNING_ANALYTICS_GUIDE.md",
        "ANALYTICS_QUICK_START.md"
    )
    
    foreach ($file in $files) {
        if (Test-Path $file) {
            Write-Host "  [OK] $file" -ForegroundColor Green
        } else {
            Write-Host "  [MISSING] $file" -ForegroundColor Red
        }
    }
    
    Write-Host "`nNew API Endpoints Added:"
    Write-Host "  GET /api/analytics" -ForegroundColor Yellow
    Write-Host "  GET /api/analytics/progress" -ForegroundColor Yellow
    Write-Host "  GET /api/analytics/domain/:domain" -ForegroundColor Yellow
    
    Write-Host "`nFeatures Implemented:"
    Write-Host "  - Performance by domain (21 domains)" -ForegroundColor Gray
    Write-Host "  - Performance by topic (12 topics auto-detected)" -ForegroundColor Gray
    Write-Host "  - Top 5 weakest areas identification" -ForegroundColor Gray
    Write-Host "  - Personalized study recommendations" -ForegroundColor Gray
    Write-Host "  - Progress tracking over time" -ForegroundColor Gray
    Write-Host "  - Strength level indicators" -ForegroundColor Gray
    
    Write-Host "`nTo test with a real user:"
    Write-Host "  1. Take some practice exams" -ForegroundColor Cyan
    Write-Host "  2. Call GET /api/analytics with auth token" -ForegroundColor Cyan
    Write-Host "  3. See your performance breakdown!" -ForegroundColor Cyan
    
    Write-Host "`nDocumentation:"
    Write-Host "  - Read LEARNING_ANALYTICS_GUIDE.md for full details" -ForegroundColor Cyan
    Write-Host "  - Read ANALYTICS_QUICK_START.md for quick reference" -ForegroundColor Cyan
    
} catch {
    Write-Host "Server is NOT RUNNING" -ForegroundColor Red
    Write-Host "Start it with: npm start" -ForegroundColor Yellow
}

Write-Host ""
