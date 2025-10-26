// debug-game.js - Test the algorithm locally with sample data

import { calculateEnhancedEntertainment } from './entertainmentCalculator.js';
import { buildGameContext, createContextualFallback } from './contextAnalyzer.js';

const testGame = {
  id: '401772839',
  homeTeam: 'Philadelphia',
  awayTeam: 'Los Angeles',
  homeScore: 33,
  awayScore: 26,
  overtime: false
};

const mockProbabilities = [
  { homeWinPercentage: 57.6 },
  { homeWinPercentage: 56.0 },
  { homeWinPercentage: 64.2 },
  { homeWinPercentage: 62.5 },
  { homeWinPercentage: 69.0 },
  { homeWinPercentage: 72.2 },
  { homeWinPercentage: 70.9 },
  { homeWinPercentage: 68.7 },
  { homeWinPercentage: 49.5 },
  { homeWinPercentage: 48.9 },
  { homeWinPercentage: 46.6 },
  { homeWinPercentage: 42.0 },
  { homeWinPercentage: 41.9 },
  { homeWinPercentage: 43.9 },
  { homeWinPercentage: 38.6 },
  { homeWinPercentage: 32.6 },
  { homeWinPercentage: 29.1 },
  { homeWinPercentage: 24.4 },
  { homeWinPercentage: 17.6 },
  { homeWinPercentage: 52.8 },
  { homeWinPercentage: 73.1 },
  { homeWinPercentage: 61.7 },
  { homeWinPercentage: 100.0 }
];

function runDebugAnalysis() {
  console.log('\n=== STARTING ENTERTAINMENT CALCULATION ===');
  console.log('Game:', testGame.awayTeam, 'vs', testGame.homeTeam);
  console.log('Final Score:', testGame.awayScore, '-', testGame.homeScore);
  console.log('Probability data points:', mockProbabilities.length);

  const context = buildGameContext(testGame, 'NFL');

  try {
    const result = calculateEnhancedEntertainment(mockProbabilities, testGame, context);

    console.log('\nRESULTS');
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
