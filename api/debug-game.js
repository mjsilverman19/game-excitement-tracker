// debug-game.js - Test the algorithm locally with sample data

import { calculateEnhancedEntertainment } from './entertainmentCalculator.js';
import { buildGameContext, createContextualFallback } from './contextAnalyzer.js';
import { supabase } from '../lib/supabase.js';

const testGame = {
  id: 'chiefs-bills-2021-divisional',
  homeTeam: 'Buffalo Bills',
  awayTeam: 'Kansas City Chiefs',
  homeScore: 36,
  awayScore: 42,
  overtime: true,
  season: 2021,
  seasonType: 3,
  week: 19
};

// Chiefs vs Bills 2022 - Simulated win probabilities showing the wild swings
const mockProbabilities = [
  { homeWinPercentage: 45.0 }, // Early game
  { homeWinPercentage: 52.0 },
  { homeWinPercentage: 48.0 },
  { homeWinPercentage: 55.0 },
  { homeWinPercentage: 60.0 },
  { homeWinPercentage: 65.0 },
  { homeWinPercentage: 58.0 },
  { homeWinPercentage: 62.0 },
  { homeWinPercentage: 55.0 },
  { homeWinPercentage: 48.0 },
  { homeWinPercentage: 52.0 },
  { homeWinPercentage: 45.0 },
  { homeWinPercentage: 40.0 },
  { homeWinPercentage: 35.0 },
  { homeWinPercentage: 42.0 },
  { homeWinPercentage: 38.0 },
  { homeWinPercentage: 45.0 },
  { homeWinPercentage: 55.0 }, // Late 4th quarter chaos begins
  { homeWinPercentage: 65.0 }, // Bills take lead
  { homeWinPercentage: 75.0 }, // Bills extend lead
  { homeWinPercentage: 25.0 }, // Chiefs TD with 1:02 left
  { homeWinPercentage: 15.0 }, // Chiefs take lead
  { homeWinPercentage: 85.0 }, // Bills TD with 13 seconds
  { homeWinPercentage: 92.0 }, // Bills leading in final seconds
  { homeWinPercentage: 50.0 }, // Overtime coin toss
  { homeWinPercentage: 0.0 }   // Chiefs win in OT
];

async function runDebugAnalysis() {
  console.log('\n=== SEARCHING FOR REAL CHIEFS VS BILLS 2021 GAME ===');

  if (!supabase) {
    console.log('❌ Database not configured, using mock data');
    runMockAnalysis();
    return;
  }

  try {
    // Search for the real game
    const { data: games, error } = await supabase
      .from('games')
      .select('*')
      .eq('season', 2021)
      .eq('season_type', 3)
      .or('home_team.ilike.%Chiefs%,away_team.ilike.%Chiefs%');

    if (error) throw error;

    if (!games || games.length === 0) {
      console.log('❌ No Chiefs playoff games found in 2021, using mock data');
      runMockAnalysis();
      return;
    }

    console.log(`Found ${games.length} Chiefs playoff games in 2021:`);
    games.forEach(game => {
      console.log(`- ${game.away_team} @ ${game.home_team} (${game.away_score}-${game.home_score})`);
    });

    const chiefsVsBills = games.find(game =>
      (game.home_team.toLowerCase().includes('bills') && game.away_team.toLowerCase().includes('chiefs')) ||
      (game.home_team.toLowerCase().includes('chiefs') && game.away_team.toLowerCase().includes('bills'))
    );

    if (chiefsVsBills && chiefsVsBills.probability_data) {
      console.log('\n🎯 FOUND REAL CHIEFS VS BILLS GAME WITH PROBABILITY DATA!');
      console.log('======================================================');
      console.log(`Game: ${chiefsVsBills.away_team} @ ${chiefsVsBills.home_team}`);
      console.log(`Score: ${chiefsVsBills.away_score}-${chiefsVsBills.home_score}${chiefsVsBills.overtime ? ' (OT)' : ''}`);
      console.log(`Probability points: ${chiefsVsBills.probability_data.length}`);

      const realGame = {
        id: chiefsVsBills.id,
        homeTeam: chiefsVsBills.home_team,
        awayTeam: chiefsVsBills.away_team,
        homeScore: chiefsVsBills.home_score,
        awayScore: chiefsVsBills.away_score,
        overtime: chiefsVsBills.overtime,
        season: chiefsVsBills.season,
        seasonType: chiefsVsBills.season_type,
        week: chiefsVsBills.week
      };

      const context = chiefsVsBills.game_context || buildGameContext(realGame, 'NFL');
      const result = calculateEnhancedEntertainment(chiefsVsBills.probability_data, realGame, context);

      console.log('\n📊 REAL DATA ANALYSIS:');
      console.log('- Entertainment Score:', result.entertainmentScore);
      console.log('- Confidence:', result.confidence);
      console.log('- Breakdown:', result.breakdown);
      console.log('- Narrative:', result.narrative);
      console.log('- Key Factors:', result.keyFactors);

      // Show probability swings
      console.log('\n📈 PROBABILITY SWINGS (first 5 and last 10):');
      const probs = chiefsVsBills.probability_data;
      probs.slice(0, 5).forEach((p, i) => console.log(`  ${i+1}. ${p.homeWinPercentage}%`));
      console.log('  ...');
      probs.slice(-10).forEach((p, i) => console.log(`  ${probs.length-10+i+1}. ${p.homeWinPercentage}%`));

    } else {
      console.log('\n❌ Chiefs vs Bills game found but no probability data, using mock');
      runMockAnalysis();
    }

  } catch (error) {
    console.error('Database error:', error);
    console.log('Falling back to mock data');
    runMockAnalysis();
  }
}

function runMockAnalysis() {
  console.log('\n=== USING MOCK DATA ===');
  console.log('Game:', testGame.awayTeam, 'vs', testGame.homeTeam);
  console.log('Final Score:', testGame.awayScore, '-', testGame.homeScore);
  console.log('Probability data points:', mockProbabilities.length);

  const context = buildGameContext(testGame, 'NFL');

  try {
    const result = calculateEnhancedEntertainment(mockProbabilities, testGame, context);

    console.log('\nMOCK RESULTS');
    console.log('- Entertainment Score:', result.entertainmentScore);
    console.log('- Confidence:', result.confidence);
    console.log('- Breakdown:', result.breakdown);
    console.log('- Narrative:', result.narrative);
    console.log('- Key Factors:', result.keyFactors);
  } catch (error) {
    console.error('Enhanced calculation error:', error);
    const fallback = createContextualFallback(testGame, context);
    console.log('Fallback entertainment score:', fallback.entertainmentScore);
    console.log('Fallback breakdown:', fallback.breakdown);
  }
}

runDebugAnalysis();
