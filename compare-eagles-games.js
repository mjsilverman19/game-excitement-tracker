import { analyzeGameEntertainment } from './api/entertainmentCalculator.js';
import { getGamesForSearch } from './api/gameDataFetcher.js';

async function compareEaglesGames() {
  console.log('\n=== Fetching Eagles Games ===\n');
  
  // Fetch Week 2 games (Eagles vs Chiefs)
  const week2Games = await getGamesForSearch({ 
    week: 2, 
    season: 2025, 
    seasonType: 2 
  }, 'NFL');
  
  const week2EaglesGame = week2Games.find(game => 
    (game.homeTeam.includes('Eagles') || game.awayTeam.includes('Eagles')) &&
    (game.homeTeam.includes('Chiefs') || game.awayTeam.includes('Chiefs'))
  );
  
  // Fetch Week 3 games (Eagles vs Rams)
  const week3Games = await getGamesForSearch({ 
    week: 3, 
    season: 2025, 
    seasonType: 2 
  }, 'NFL');
  
  const week3EaglesGame = week3Games.find(game => 
    (game.homeTeam.includes('Eagles') || game.awayTeam.includes('Eagles')) &&
    (game.homeTeam.includes('Rams') || game.awayTeam.includes('Rams'))
  );
  
  if (!week2EaglesGame) {
    console.log('❌ Could not find Week 2 Eagles vs Chiefs game');
    return;
  }
  
  if (!week3EaglesGame) {
    console.log('❌ Could not find Week 3 Eagles vs Rams game');
    return;
  }
  
  console.log('✅ Found both games!\n');
  
  // Analyze both games
  console.log('=== Analyzing Week 2: Eagles vs Chiefs ===');
  console.log(`${week2EaglesGame.awayTeam} @ ${week2EaglesGame.homeTeam}`);
  console.log(`Final Score: ${week2EaglesGame.awayScore} - ${week2EaglesGame.homeScore}\n`);
  
  const week2Analysis = await analyzeGameEntertainment(week2EaglesGame, 'NFL');
  
  console.log('\n=== Analyzing Week 3: Eagles vs Rams ===');
  console.log(`${week3EaglesGame.awayTeam} @ ${week3EaglesGame.homeTeam}`);
  console.log(`Final Score: ${week3EaglesGame.awayScore} - ${week3EaglesGame.homeScore}\n`);
  
  const week3Analysis = await analyzeGameEntertainment(week3EaglesGame, 'NFL');
  
  // Compare results
  console.log('\n\n========================================');
  console.log('       COMPARISON RESULTS');
  console.log('========================================\n');
  
  console.log('WEEK 2 (Eagles vs Chiefs):');
  console.log(`  Final Score: ${week2EaglesGame.awayScore} - ${week2EaglesGame.homeScore}`);
  console.log(`  Entertainment Score: ${week2Analysis.excitement}`);
  console.log(`  Confidence: ${Math.round(week2Analysis.breakdown?.confidence * 100 || 0)}%`);
  console.log(`  Description: ${week2Analysis.description}`);
  console.log(`  Key Factors: ${week2Analysis.keyMoments?.join(', ') || 'N/A'}`);
  console.log('\n  Breakdown:');
  if (week2Analysis.breakdown) {
    Object.entries(week2Analysis.breakdown).forEach(([key, value]) => {
      console.log(`    ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
    });
  }
  
  console.log('\n\nWEEK 3 (Eagles vs Rams):');
  console.log(`  Final Score: ${week3EaglesGame.awayScore} - ${week3EaglesGame.homeScore}`);
  console.log(`  Entertainment Score: ${week3Analysis.excitement}`);
  console.log(`  Confidence: ${Math.round(week3Analysis.breakdown?.confidence * 100 || 0)}%`);
  console.log(`  Description: ${week3Analysis.description}`);
  console.log(`  Key Factors: ${week3Analysis.keyMoments?.join(', ') || 'N/A'}`);
  console.log('\n  Breakdown:');
  if (week3Analysis.breakdown) {
    Object.entries(week3Analysis.breakdown).forEach(([key, value]) => {
      console.log(`    ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
    });
  }
  
  // Calculate differences
  console.log('\n\n========================================');
  console.log('       KEY DIFFERENCES');
  console.log('========================================\n');
  
  const scoreDiff = (week2Analysis.excitement - week3Analysis.excitement).toFixed(2);
  console.log(`Entertainment Score Difference: ${scoreDiff}`);
  console.log(`  (Week 2 ${scoreDiff > 0 ? 'higher' : 'lower'} than Week 3)`);
  
  if (week2Analysis.breakdown && week3Analysis.breakdown) {
    console.log('\nMetric Differences (Week 2 - Week 3):');
    const metrics = ['uncertainty', 'persistence', 'peaks', 'comeback', 'tension', 'narrative', 'dramaticFinish'];
    
    metrics.forEach(metric => {
      const val2 = week2Analysis.breakdown[metric] || 0;
      const val3 = week3Analysis.breakdown[metric] || 0;
      const diff = (val2 - val3).toFixed(2);
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
      console.log(`  ${metric}: ${arrow} ${diff > 0 ? '+' : ''}${diff} (Week 2: ${val2.toFixed(2)}, Week 3: ${val3.toFixed(2)})`);
    });
  }
}

compareEaglesGames().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});