import { analyzeGameEntertainment } from '../api/entertainmentCalculator.js';
import { getGamesForSearch } from '../api/gameDataFetcher.js';

async function testCurrentWeek() {
  // Get current date to determine the week
  // For now, let's test Week 4 of 2025 NFL season
  const week = 4;
  const season = 2025;
  const seasonType = 2; // Regular season
  
  console.log(`\n=== Fetching Week ${week} NFL Games (${season} Season) ===\n`);
  
  const games = await getGamesForSearch({ 
    week, 
    season, 
    seasonType 
  }, 'NFL');
  
  if (games.length === 0) {
    console.log('No completed games found for this week.');
    return;
  }
  
  console.log(`Found ${games.length} completed games\n`);
  console.log('Analyzing all games...\n');
  
  // Analyze all games
  const analyses = [];
  
  for (const game of games) {
    console.log(`Analyzing: ${game.awayTeam} @ ${game.homeTeam} (${game.awayScore}-${game.homeScore})...`);
    try {
      const analysis = await analyzeGameEntertainment(game, 'NFL');
      analyses.push({
        game,
        analysis
      });
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
  
  // Sort by entertainment score
  analyses.sort((a, b) => b.analysis.excitement - a.analysis.excitement);
  
  console.log('\n\n========================================');
  console.log('       WEEK ' + week + ' RESULTS');
  console.log('       (Sorted by Entertainment Score)');
  console.log('========================================\n');
  
  analyses.forEach((item, index) => {
    const { game, analysis } = item;
    const margin = Math.abs(game.homeScore - game.awayScore);
    
    console.log(`${index + 1}. ${game.awayTeam} @ ${game.homeTeam}`);
    console.log(`   Final: ${game.awayScore}-${game.homeScore} (${margin} pt margin)${game.overtime ? ' - OT' : ''}`);
    console.log(`   🎬 Entertainment: ${analysis.excitement}`);
    console.log(`   💥 Dramatic Finish: ${analysis.breakdown?.dramaticFinish?.toFixed(1) || 'N/A'}/10`);
    console.log(`   🔄 Lead Changes: ${analysis.breakdown?.leadChanges || 0}`);
    console.log(`   📊 Key Metrics:`);
    console.log(`      - Uncertainty: ${analysis.breakdown?.uncertainty?.toFixed(1) || 'N/A'}`);
    console.log(`      - Comeback: ${analysis.breakdown?.comeback?.toFixed(1) || 'N/A'}`);
    console.log(`      - Tension: ${analysis.breakdown?.tension?.toFixed(1) || 'N/A'}`);
    console.log(`   📝 ${analysis.description}`);
    console.log('');
  });
  
  // Show dramatic finish leaderboard
  console.log('\n========================================');
  console.log('   DRAMATIC FINISH LEADERBOARD');
  console.log('========================================\n');
  
  const sortedByDramaticFinish = [...analyses].sort((a, b) => 
    (b.analysis.breakdown?.dramaticFinish || 0) - (a.analysis.breakdown?.dramaticFinish || 0)
  );
  
  sortedByDramaticFinish.slice(0, 5).forEach((item, index) => {
    const { game, analysis } = item;
    const dramaticScore = analysis.breakdown?.dramaticFinish?.toFixed(1) || 'N/A';
    console.log(`${index + 1}. ${dramaticScore}/10 - ${game.awayTeam} @ ${game.homeTeam}`);
    console.log(`   Score: ${game.awayScore}-${game.homeScore} | Entertainment: ${analysis.excitement}`);
  });
  
  // Statistics
  console.log('\n\n========================================');
  console.log('   STATISTICS');
  console.log('========================================\n');
  
  const avgEntertainment = analyses.reduce((sum, a) => sum + a.analysis.excitement, 0) / analyses.length;
  const avgDramaticFinish = analyses.reduce((sum, a) => sum + (a.analysis.breakdown?.dramaticFinish || 0), 0) / analyses.length;
  const avgLeadChanges = analyses.reduce((sum, a) => sum + (a.analysis.breakdown?.leadChanges || 0), 0) / analyses.length;
  
  console.log(`Average Entertainment Score: ${avgEntertainment.toFixed(2)}`);
  console.log(`Average Dramatic Finish Score: ${avgDramaticFinish.toFixed(2)}/10`);
  console.log(`Average Lead Changes: ${avgLeadChanges.toFixed(1)}`);
  
  const highDramaGames = analyses.filter(a => (a.analysis.breakdown?.dramaticFinish || 0) >= 7);
  console.log(`\nGames with High Drama (≥7/10): ${highDramaGames.length}/${analyses.length}`);
  
  const closeGames = analyses.filter(a => Math.abs(a.game.homeScore - a.game.awayScore) <= 7);
  console.log(`Close Games (≤7 pt margin): ${closeGames.length}/${analyses.length}`);
}

testCurrentWeek().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});