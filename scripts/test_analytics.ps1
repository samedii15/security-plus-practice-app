Write-Host "`n🎯 Testing Learning Analytics Implementation`n" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Gray

$baseUrl = "http://localhost:3000"

# Test 1: Check if server is running
Write-Host "`n✓ Test 1: Server Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method Get
    Write-Host "  Server Status: " -NoNewline
    Write-Host "ONLINE ✓" -ForegroundColor Green
    Write-Host "  Questions in DB: $($health.questionCount)" -ForegroundColor Gray
} catch {
    Write-Host "  Server Status: " -NoNewline
    Write-Host "OFFLINE ✗" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    Write-Host "`n⚠️  Please start the server with: npm start`n" -ForegroundColor Yellow
    exit
}

# Test 2: Check analytics endpoints exist
Write-Host "`n✓ Test 2: Analytics Endpoints" -ForegroundColor Yellow

$testUser = @{
    email = "analytics-test@example.com"
    password = "TestPass123!"
}

# Try to register and login
try {
    Write-Host "  Attempting login..." -ForegroundColor Gray
    
    try {
        $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post `
            -Body ($testUser | ConvertTo-Json) -ContentType "application/json"
        $token = $loginResponse.token
    } catch {
        Write-Host "  Creating test user..." -ForegroundColor Gray
        $registerResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method Post `
            -Body ($testUser | ConvertTo-Json) -ContentType "application/json"
        $token = $registerResponse.token
    }
    
    Write-Host "  Authentication: " -NoNewline
    Write-Host "SUCCESS ✓" -ForegroundColor Green
    
    # Test analytics endpoint
    Write-Host "`n  Testing /api/analytics..." -ForegroundColor Gray
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    try {
        $analytics = Invoke-RestMethod -Uri "$baseUrl/api/analytics" -Method Get -Headers $headers
        
        Write-Host "  Analytics Endpoint: " -NoNewline
        Write-Host "WORKING ✓" -ForegroundColor Green
        
        Write-Host "`n📊 Analytics Data Available:" -ForegroundColor Cyan
        Write-Host "  • Total Exams: $($analytics.overall.totalExams)" -ForegroundColor Gray
        Write-Host "  • Total Questions: $($analytics.overall.totalQuestions)" -ForegroundColor Gray
        Write-Host "  • Overall Accuracy: $($analytics.overall.accuracy)%" -ForegroundColor Gray
        
        if ($analytics.byDomain -and $analytics.byDomain.Count -gt 0) {
            Write-Host "`n  📚 Domains Analyzed: $($analytics.byDomain.Count)" -ForegroundColor Gray
            $analytics.byDomain | Select-Object -First 3 | ForEach-Object {
                $bar = "█" * [Math]::Floor($_.accuracy / 10)
                Write-Host "    $($_.domain): $($_.accuracy)% $bar [$($_.strength)]" -ForegroundColor Gray
            }
        }
        
        if ($analytics.byTopic -and $analytics.byTopic.Count -gt 0) {
            Write-Host "`n  🎯 Topics Tracked: $($analytics.byTopic.Count)" -ForegroundColor Gray
            $analytics.byTopic | Select-Object -First 3 | ForEach-Object {
                Write-Host "    $($_.topic): $($_.accuracy)% [$($_.strength)]" -ForegroundColor Gray
            }
        }
        
        if ($analytics.weakestAreas -and $analytics.weakestAreas.Count -gt 0) {
            Write-Host "`n  ⚠️  Weak Areas Identified: $($analytics.weakestAreas.Count)" -ForegroundColor Yellow
            $analytics.weakestAreas | ForEach-Object {
                Write-Host "    $($_.rank). $($_.name) - $($_.accuracy)%" -ForegroundColor Yellow
            }
        } else {
            Write-Host "`n  ℹ️  No exam data yet - take practice exams to see analytics" -ForegroundColor Gray
        }
        
        if ($analytics.recommendations -and $analytics.recommendations.Count -gt 0) {
            Write-Host "`n  💡 Recommendations: $($analytics.recommendations.Count)" -ForegroundColor Cyan
            $analytics.recommendations | Select-Object -First 3 | ForEach-Object {
                Write-Host "    [$($_.priority)] $($_.message)" -ForegroundColor Cyan
            }
        }
        
    } catch {
        Write-Host "  Analytics Endpoint: " -NoNewline
        Write-Host "ERROR ✗" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
    }
    
    # Test progress endpoint
    Write-Host "`n  Testing /api/analytics/progress..." -ForegroundColor Gray
    try {
        $progress = Invoke-RestMethod -Uri "$baseUrl/api/analytics/progress" -Method Get -Headers $headers
        Write-Host "  Progress Endpoint: " -NoNewline
        Write-Host "WORKING ✓" -ForegroundColor Green
    } catch {
        Write-Host "  Progress Endpoint: " -NoNewline
        Write-Host "ERROR ✗" -ForegroundColor Red
    }
    
    # Test domain endpoint
    Write-Host "`n  Testing /api/analytics/domain/..." -ForegroundColor Gray
    try {
        $domain = [System.Web.HttpUtility]::UrlEncode("Security Operations")
        $domainPerf = Invoke-RestMethod -Uri "$baseUrl/api/analytics/domain/$domain" -Method Get -Headers $headers
        Write-Host "  Domain Endpoint: " -NoNewline
        Write-Host "WORKING ✓" -ForegroundColor Green
    } catch {
        Write-Host "  Domain Endpoint: " -NoNewline
        Write-Host "ERROR ✗" -ForegroundColor Red
    }
    
} catch {
    Write-Host "  Authentication: " -NoNewline
    Write-Host "FAILED ✗" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
}

Write-Host "`n" -NoNewline
Write-Host ("=" * 70) -ForegroundColor Gray
Write-Host "`n✅ Analytics Implementation Test Complete!`n" -ForegroundColor Green

Write-Host "📡 Available Endpoints:" -ForegroundColor Cyan
Write-Host "  GET /api/analytics - Comprehensive learning analytics" -ForegroundColor Gray
Write-Host "  GET /api/analytics/progress - Progress over time" -ForegroundColor Gray
Write-Host "  GET /api/analytics/domain/:domain - Domain-specific performance" -ForegroundColor Gray

Write-Host "`n💡 What Changed:" -ForegroundColor Cyan
Write-Host "  ✓ Added analyticsService.js with smart analytics engine" -ForegroundColor Gray
Write-Host "  ✓ Added 3 new API endpoints to server.js" -ForegroundColor Gray
Write-Host "  ✓ Automatic topic detection (12 topics)" -ForegroundColor Gray
Write-Host "  ✓ Top 5 weak areas identification" -ForegroundColor Gray
Write-Host "  ✓ Personalized recommendations" -ForegroundColor Gray
Write-Host "  ✓ Progress tracking over time" -ForegroundColor Gray

Write-Host "`n📊 Features:" -ForegroundColor Cyan
Write-Host "  • Performance by domain (21 domains)" -ForegroundColor Gray
Write-Host "  • Performance by topic (Crypto, IAM, IR, Cloud, etc.)" -ForegroundColor Gray
Write-Host "  • Performance by difficulty" -ForegroundColor Gray
Write-Host "  • Weak area prioritization" -ForegroundColor Gray
Write-Host "  • Smart study recommendations" -ForegroundColor Gray
Write-Host "  • Strength levels (Excellent → Needs Work)" -ForegroundColor Gray

Write-Host "`n📚 Documentation:" -ForegroundColor Cyan
Write-Host "  • LEARNING_ANALYTICS_GUIDE.md - Complete guide" -ForegroundColor Gray
Write-Host "  • ANALYTICS_QUICK_START.md - Quick reference" -ForegroundColor Gray
Write-Host "  • scripts/test_analytics.js - Node.js test script" -ForegroundColor Gray

Write-Host ""
