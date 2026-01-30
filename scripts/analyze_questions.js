// Analyze questions.json to identify questions that need enhancement
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const questionsPath = path.join(__dirname, '../questions.json');
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

console.log('🔍 Analyzing Question Bank for Enhancement Opportunities\n');
console.log('='.repeat(70));

// Keywords that indicate proper CompTIA style
const goodKeywords = /\b(BEST|MOST|FIRST|PRIMARY|LEAST|MAIN|optimal|appropriate|effective|suitable)\b/i;

// Patterns that indicate weak questions
const weakPatterns = {
  obviousWrong: /\b(Never|Always|Impossible|Cannot|Must not)\b/i,
  tooSimple: /^(What is|Which is|What does|Which does)\b/,
  noContext: /^[^.]{0,80}\?$/  // Very short questions with no context
};

let stats = {
  total: questions.length,
  withGoodKeywords: 0,
  withoutKeywords: 0,
  tooSimple: 0,
  noContext: 0,
  enhanced: 0,
  needsWork: []
};

console.log(`\n📊 Total Questions: ${stats.total}\n`);

questions.forEach((q, index) => {
  const hasGoodKeyword = goodKeywords.test(q.question);
  const isTooSimple = weakPatterns.tooSimple.test(q.question);
  const lacksContext = q.question.length < 100; // Arbitrary but reasonable threshold
  const isEnhanced = q.id && q.id.includes('ENHANCED');

  if (isEnhanced) {
    stats.enhanced++;
  } else if (hasGoodKeyword) {
    stats.withGoodKeywords++;
  } else {
    stats.withoutKeywords++;
  }

  if (isTooSimple) stats.tooSimple++;
  if (lacksContext) stats.noContext++;

  // Identify questions that need work
  if (!hasGoodKeyword && !isEnhanced && lacksContext) {
    stats.needsWork.push({
      id: q.id,
      domain: q.domain,
      question: q.question.substring(0, 80) + (q.question.length > 80 ? '...' : ''),
      reason: []
    });

    const lastItem = stats.needsWork[stats.needsWork.length - 1];
    if (!hasGoodKeyword) lastItem.reason.push('No priority keyword');
    if (lacksContext) lastItem.reason.push('Too short/lacks context');
    if (isTooSimple) lastItem.reason.push('Simple factual question');
  }
});

// Domain breakdown
const domainStats = {};
questions.forEach(q => {
  const domain = q.domain || 'Unknown';
  if (!domainStats[domain]) {
    domainStats[domain] = { total: 0, enhanced: 0, withKeywords: 0 };
  }
  domainStats[domain].total++;
  
  if (q.id && q.id.includes('ENHANCED')) {
    domainStats[domain].enhanced++;
  } else if (goodKeywords.test(q.question)) {
    domainStats[domain].withKeywords++;
  }
});

console.log('📈 Question Quality Analysis:\n');
console.log(`✅ Enhanced Questions:        ${stats.enhanced} (${((stats.enhanced/stats.total)*100).toFixed(1)}%)`);
console.log(`⭐ With Priority Keywords:    ${stats.withGoodKeywords} (${((stats.withGoodKeywords/stats.total)*100).toFixed(1)}%)`);
console.log(`⚠️  Without Keywords:         ${stats.withoutKeywords} (${((stats.withoutKeywords/stats.total)*100).toFixed(1)}%)`);
console.log(`📉 Too Simple/Short:          ${stats.tooSimple} (${((stats.tooSimple/stats.total)*100).toFixed(1)}%)`);
console.log(`📉 Lacks Context:             ${stats.noContext} (${((stats.noContext/stats.total)*100).toFixed(1)}%)`);

console.log('\n🎯 Questions Needing Enhancement by Domain:\n');
console.log('Domain'.padEnd(50), 'Total', 'Enhanced', 'Good', 'Need Work');
console.log('-'.repeat(85));

const domainNeedsWork = {};
stats.needsWork.forEach(q => {
  domainNeedsWork[q.domain] = (domainNeedsWork[q.domain] || 0) + 1;
});

Object.keys(domainStats).sort().forEach(domain => {
  const d = domainStats[domain];
  const needWork = domainNeedsWork[domain] || 0;
  console.log(
    domain.padEnd(50),
    d.total.toString().padStart(5),
    d.enhanced.toString().padStart(8),
    d.withKeywords.toString().padStart(4),
    needWork.toString().padStart(10)
  );
});

console.log('\n🔧 Sample Questions Needing Enhancement:\n');
stats.needsWork.slice(0, 10).forEach((q, i) => {
  console.log(`${i + 1}. ${q.id} [${q.domain}]`);
  console.log(`   Q: ${q.question}`);
  console.log(`   Issues: ${q.reason.join(', ')}`);
  console.log();
});

console.log(`\n💡 Recommendations:\n`);
console.log(`1. Priority: Enhance ${stats.needsWork.length} questions lacking context/keywords`);
console.log(`2. Focus on top domains: Security Operations, Threats, Architecture`);
console.log(`3. Add scenarios, constraints, and stakeholder context`);
console.log(`4. Replace obvious distractors with plausible alternatives`);
console.log(`5. Enhance explanations to explain why alternatives are less optimal`);

console.log(`\n📝 Next Steps:\n`);
console.log(`• Review ENHANCED_QUESTIONS_GUIDE.md for best practices`);
console.log(`• Use the question writing formula for consistency`);
console.log(`• Focus on ${Math.round(stats.needsWork.length * 0.2)} questions per sprint`);
console.log(`• Test enhanced questions with users for feedback\n`);

// Save detailed report
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    total: stats.total,
    enhanced: stats.enhanced,
    withKeywords: stats.withGoodKeywords,
    needsEnhancement: stats.needsWork.length
  },
  domainBreakdown: domainStats,
  questionsNeedingWork: stats.needsWork.map(q => ({
    id: q.id,
    domain: q.domain,
    questionPreview: q.question,
    issues: q.reason
  }))
};

fs.writeFileSync(
  path.join(__dirname, '../question_analysis_report.json'),
  JSON.stringify(report, null, 2),
  'utf8'
);

console.log('💾 Detailed report saved to: question_analysis_report.json\n');
