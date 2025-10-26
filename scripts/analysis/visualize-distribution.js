import { analyzeGameEntertainment } from '../api/entertainmentCalculator.js';
import { getGamesForSearch } from '../api/gameDataFetcher.js';

async function visualizeDistribution() {
  const week = 3;
  const season = 2025;
  const seasonType = 2;
  
  console.log(`\n=== Analyzing Week ${week} NFL Games ===\n`);
  
  const games = await getGamesForSearch({ week, season, seasonType }, 'NFL');
  
  if (games.length === 0) {
    console.log('No completed games found.');
    return;
  }
  
  const analyses = [];
  
  for (const game of games) {
    const analysis = await analyzeGameEntertainment(game, 'NFL');
    analyses.push({
      game,
      analysis,
      score: analysis.excitement
    });
  }
  
  // Sort by score
  analyses.sort((a, b) => b.score - a.score);
  
  console.log('\n========================================');
  console.log('   SCORE DISTRIBUTION VISUALIZATION');
  console.log('========================================\n');
  console.log('Scale: 0.0 ─────────── 5.0 ─────────── 10.0\n');
  
  // Create visual chart
  analyses.forEach((item, index) => {
    const { game, score } = item;
    const margin = Math.abs(game.homeScore - game.awayScore);
    
    // Create bar visualization
    const barLength = Math.round(score * 4); // 40 chars max
    const bar = '█'.repeat(barLength);
    const spaces = ' '.repeat(Math.max(0, 40 - barLength));
    
    // Color coding based on score
    let label = '';
    if (score >= 8.5) label = '🔥 INSTANT CLASSIC';
    else if (score >= 7.5) label = '⭐ EXCELLENT';
    else if (score >= 6.5) label = '👍 GREAT';
    else if (score >= 5.5) label = '✓  GOOD';
    else if (score >= 4.5) label = '−  AVERAGE';
    else if (score >= 3.0) label = '↓  BELOW AVG';
    else label = '💤 BORING';
    
    console.log(`${label}`);
    console.log(`${score.toFixed(1)} │${bar}${spaces}│`);
    console.log(`      ${game.awayTeam} @ ${game.homeTeam}`);
    console.log(`      ${game.awayScore}-${game.homeScore} (${margin}pt)${game.overtime ? ' OT' : ''}`);
    console.log('');
  });
  
  console.log('========================================\n');
  
  // Histogram
  console.log('HISTOGRAM:\n');
  const buckets = [
    { min: 0, max: 2, label: '0-2  ', count: 0 },
    { min: 2, max: 3, label: '2-3  ', count: 0 },
    { min: 3, max: 4, label: '3-4  ', count: 0 },
    { min: 4, max: 5, label: '4-5  ', count: 0 },
    { min: 5, max: 6, label: '5-6  ', count: 0 },
    { min: 6, max: 7, label: '6-7  ', count: 0 },
    { min: 7, max: 8, label: '7-8  ', count: 0 },
    { min: 8, max: 9, label: '8-9  ', count: 0 },
    { min: 9, max: 10, label: '9-10 ', count: 0 }
  ];
  
  analyses.forEach(item => {
    const score = item.score;
    for (const bucket of buckets) {
      if (score >= bucket.min && score < bucket.max) {
        bucket.count++;
        break;
      }
      if (score >= 9 && bucket.max === 10) {
        bucket.count++;
        break;
      }
    }
  });
  
  const maxCount = Math.max(...buckets.map(b => b.count));
  
  buckets.forEach(bucket => {
    const barLength = bucket.count > 0 ? Math.round((bucket.count / maxCount) * 30) : 0;
    const bar = '▓'.repeat(barLength);
    console.log(`${bucket.label} │${bar} ${bucket.count}`);
  });
  
  console.log('\n========================================');
  console.log('   DISTRIBUTION STATS');
  console.log('========================================\n');
  
  const scores = analyses.map(a => a.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  
  // Standard deviation
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  
  console.log(`Total Games: ${analyses.length}`);
  console.log(`Average:     ${avg.toFixed(2)}`);
  console.log(`Median:      ${median.toFixed(2)}`);
  console.log(`Range:       ${min.toFixed(1)} - ${max.toFixed(1)} (${range.toFixed(1)})`);
  console.log(`Std Dev:     ${stdDev.toFixed(2)}`);
  
  console.log('\nCategory Breakdown:');
  console.log(`  Instant Classic (8.5+):  ${scores.filter(s => s >= 8.5).length}`);
  console.log(`  Excellent (7.5-8.5):     ${scores.filter(s => s >= 7.5 && s < 8.5).length}`);
  console.log(`  Great (6.5-7.5):         ${scores.filter(s => s >= 6.5 && s < 7.5).length}`);
  console.log(`  Good (5.5-6.5):          ${scores.filter(s => s >= 5.5 && s < 6.5).length}`);
  console.log(`  Average (4.5-5.5):       ${scores.filter(s => s >= 4.5 && s < 5.5).length}`);
  console.log(`  Below Average (3.0-4.5): ${scores.filter(s => s >= 3.0 && s < 4.5).length}`);
  console.log(`  Boring (< 3.0):          ${scores.filter(s => s < 3.0).length}`);
}

visualizeDistribution().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});