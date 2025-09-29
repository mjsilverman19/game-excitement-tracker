import { analyzeGameEntertainment } from './api/entertainmentCalculator.js';
import { getGamesForSearch } from './api/gameDataFetcher.js';

async function analyzeSpecificGame(weekNum, teamName1, teamName2) {
  console.log(`\n=== Searching for ${teamName1} vs ${teamName2} in Week ${weekNum} ===\n`);
  
  const games = await getGamesForSearch({ 
    week: weekNum, 
    season: 2025, 
    seasonType: 2 
  }, 'NFL');
  
  const game = games.find(g => 
    (g.homeTeam.includes(teamName1) || g.awayTeam.includes(teamName1)) &&
    (g.homeTeam.includes(teamName2) || g.awayTeam.includes(teamName2))
  );
  
  if (!game) {
    console.log('Game not found!');
    return;
  }
  
  console.log(`Found: ${game.awayTeam} @ ${game.homeTeam}`);
  console.log(`Final Score: ${game.awayScore} - ${game.homeScore}`);
  console.log(`Margin: ${Math.abs(game.homeScore - game.awayScore)} points`);
  console.log(`Total Points: ${game.homeScore + game.awayScore}\n`);
  
  const analysis = await analyzeGameEntertainment(game, 'NFL');
  
  console.log('========================================');
  console.log('   ENTERTAINMENT ANALYSIS');
  console.log('========================================\n');
  
  console.log(`🎬 ENTERTAINMENT SCORE: ${analysis.excitement}/10\n`);
  
  console.log('📊 DETAILED BREAKDOWN:\n');
  
  if (analysis.breakdown) {
    console.log('Core Metrics (weighted):');
    console.log(`  Uncertainty:      ${analysis.breakdown.uncertainty?.toFixed(2)} × 20% weight`);
    console.log(`  Persistence:      ${analysis.breakdown.persistence?.toFixed(2)} × 11% weight`);
    console.log(`  Peaks:            ${analysis.breakdown.peaks?.toFixed(2)} × 15% weight`);
    console.log(`  Comeback:         ${analysis.breakdown.comeback?.toFixed(2)} × 11% weight`);
    console.log(`  Tension:          ${analysis.breakdown.tension?.toFixed(2)} × 11% weight`);
    console.log(`  Narrative:        ${analysis.breakdown.narrative?.toFixed(2)} × 12% weight`);
    console.log(`  Dramatic Finish:  ${analysis.breakdown.dramaticFinish?.toFixed(2)} × 20% weight ⭐\n`);
    
    console.log('Context Multipliers:');
    console.log(`  Context:          ${analysis.breakdown.context?.toFixed(2)}x (scoring + competitive balance)`);
    console.log(`  Stakes:           ${analysis.breakdown.stakes?.toFixed(2)}x`);
    console.log(`  Quality:          ${analysis.breakdown.quality?.toFixed(2)}x`);
    console.log(`  Expectation:      ${analysis.breakdown.expectation?.toFixed(2)}x`);
    console.log(`  Noise Penalty:    ${analysis.breakdown.noise?.toFixed(2)}x\n`);
    
    console.log('Game Flow:');
    console.log(`  Lead Changes:     ${analysis.breakdown.leadChanges || 0}\n`);
    
    // Calculate what the raw score would be before context multipliers
    const weights = {
      uncertainty: 0.20,
      persistence: 0.11,
      peaks: 0.15,
      comeback: 0.11,
      tension: 0.11,
      narrative: 0.12,
      dramaticFinish: 0.20
    };
    
    const rawScore = (
      analysis.breakdown.uncertainty * weights.uncertainty +
      analysis.breakdown.persistence * weights.persistence +
      analysis.breakdown.peaks * weights.peaks +
      analysis.breakdown.comeback * weights.comeback +
      analysis.breakdown.tension * weights.tension +
      analysis.breakdown.narrative * weights.narrative +
      analysis.breakdown.dramaticFinish * weights.dramaticFinish
    );
    
    const contextMultiplier = 
      analysis.breakdown.context * 
      analysis.breakdown.stakes * 
      analysis.breakdown.quality * 
      analysis.breakdown.expectation * 
      analysis.breakdown.noise;
    
    const beforeCompression = rawScore * contextMultiplier;
    const afterCompression = 1.0 + (beforeCompression * 0.85);
    
    console.log('Score Calculation:');
    console.log(`  Raw Score (weighted avg):     ${rawScore.toFixed(2)}`);
    console.log(`  After Context Multipliers:    ${beforeCompression.toFixed(2)}`);
    console.log(`  After Compression (×0.85+1):  ${afterCompression.toFixed(2)}`);
    console.log(`  Final (capped at 9.8):        ${Math.min(9.8, afterCompression).toFixed(2)}\n`);
  }
  
  console.log('📝 Description:');
  console.log(`  ${analysis.description}\n`);
  
  console.log('🎯 Key Factors:');
  if (analysis.keyMoments && analysis.keyMoments.length > 0) {
    analysis.keyMoments.forEach(moment => {
      console.log(`  - ${moment}`);
    });
  }
  
  console.log('\n========================================');
  console.log('   WHAT\'S HELPING / HURTING THE SCORE');
  console.log('========================================\n');
  
  if (analysis.breakdown) {
    const b = analysis.breakdown;
    
    console.log('✅ Strengths:');
    if (b.comeback >= 7) console.log(`  • High comeback factor (${b.comeback.toFixed(1)})`);
    if (b.persistence >= 7) console.log(`  • Strong persistence (${b.persistence.toFixed(1)})`);
    if (b.peaks >= 7) console.log(`  • High peak uncertainty (${b.peaks.toFixed(1)})`);
    if (b.tension >= 7) console.log(`  • Good situational tension (${b.tension.toFixed(1)})`);
    if (b.dramaticFinish >= 7) console.log(`  • Dramatic finish (${b.dramaticFinish.toFixed(1)})`);
    if (b.leadChanges >= 5) console.log(`  • Multiple lead changes (${b.leadChanges})`);
    
    console.log('\n❌ Weaknesses:');
    if (b.uncertainty < 4) console.log(`  • Low late-game uncertainty (${b.uncertainty.toFixed(1)})`);
    if (b.dramaticFinish < 5) console.log(`  • Weak dramatic finish (${b.dramaticFinish.toFixed(1)})`);
    if (b.context < 1.0) console.log(`  • Context penalty - margin too large (${b.context.toFixed(2)}x)`);
    if (b.leadChanges < 3) console.log(`  • Few lead changes (${b.leadChanges})`);
    if (b.tension < 5) console.log(`  • Low situational tension (${b.tension.toFixed(1)})`);
  }
}

// Run analysis
const weekNum = 3;
const team1 = 'Lions';
const team2 = 'Ravens';

analyzeSpecificGame(weekNum, team1, team2).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});