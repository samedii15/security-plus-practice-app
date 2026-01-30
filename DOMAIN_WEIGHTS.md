# 🎯 Domain Weighting - Quick Reference

## What Changed?

✅ **Before:** Questions were selected completely randomly  
✅ **After:** Questions are weighted by domain to match real CompTIA Security+ exam

## Key Domains & Their Weights

| 🔥 Priority | Domain | Weight | ~Questions per Exam |
|------------|--------|--------|---------------------|
| **Highest** | Security Operations | 30% | 26 questions |
| **High** | Threats, Vulnerabilities & Mitigations | 22% | 19 questions |
| **High** | Security Program Management & Oversight | 20% | 17 questions |
| **Medium** | Security Architecture | 18% | 15 questions |
| **Medium** | General Security Concepts | 12% | 10 questions |
| Low | Other Domains | ~1-3% each | 1-3 questions each |

## How It Works

1. **Every exam now includes:**
   - 5 PBQs (Performance-Based Questions) - random selection
   - 85 MCQs (Multiple Choice) - **weighted by domain**

2. **The system automatically:**
   - Selects more questions from high-priority domains
   - Selects fewer questions from low-priority domains
   - Still avoids recently used questions
   - Still prioritizes missed questions in "Retake Missed" mode

3. **Result:**
   - Your practice exams feel much closer to the real thing
   - You spend more time on what matters most
   - Better preparation for actual exam day

## API Access

Check current domain weights and statistics:
```
GET /api/exams/domain-stats
```
(Requires authentication)

## For Developers

- Implementation: [examService.js](examService.js)
- Domain weights constant: `DOMAIN_WEIGHTS`
- Selection function: `selectRandomQuestions()`
- Full documentation: [DOMAIN_WEIGHTING_README.md](DOMAIN_WEIGHTING_README.md)

---

**Note:** The weighting happens automatically. No configuration needed!
