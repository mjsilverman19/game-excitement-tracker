#!/usr/bin/env node

/**
 * Purpose: Inspect raw win probability points for a single game.
 * Usage: node scripts/debug-game-probs.js <gameId> [sport]
 * Output: Console dump of first/last points plus final-moment swings.
 */

import { fetchAllProbabilities, buildProbabilityUrl } from '../shared/espn-api.js';

const gameId = process.argv[2];
const sport = process.argv[3] || 'NFL';

if (!gameId) {
  console.error('Usage: node scripts/debug-game-probs.js <gameId> [sport]');
  process.exit(1);
}

async function main() {
  console.log(`Fetching: ${buildProbabilityUrl(gameId, sport)}?limit=1000\n`);

  const items = await fetchAllProbabilities(gameId, sport);

  if (!items || items.length === 0) {
    console.log('No probability data available.');
    return;
  }

  console.log(`Total probability data points: ${items.length}\n`);

  // Show first 10 and last 20 data points
  console.log('=== FIRST 10 DATA POINTS ===');
  items.slice(0, 10).forEach((p, i) => {
    console.log(`${i}: period=${p.period}, clock=${p.clock?.displayValue || 'N/A'}, homeWP=${(p.homeWinPercentage * 100).toFixed(1)}%`);
  });

  console.log('\n=== LAST 20 DATA POINTS ===');
  const last20 = items.slice(-20);
  last20.forEach((p, i) => {
    const idx = items.length - 20 + i;
    console.log(`${idx}: period=${p.period}, clock=${p.clock?.displayValue || 'N/A'}, homeWP=${(p.homeWinPercentage * 100).toFixed(1)}%`);
  });

  // Analyze swings in final moments
  console.log('\n=== FINAL 10 SWINGS ===');
  const final10 = items.slice(-10);
  for (let i = 1; i < final10.length; i++) {
    const prev = final10[i-1].homeWinPercentage;
    const curr = final10[i].homeWinPercentage;
    const swing = Math.abs(curr - prev);
    const crossed50 = (prev - 0.5) * (curr - 0.5) < 0;
    console.log(`Swing: ${(swing * 100).toFixed(1)}% (${(prev*100).toFixed(1)}% → ${(curr*100).toFixed(1)}%)${crossed50 ? ' [CROSSED 50%]' : ''}`);
  }

  // Check if game ended near 50/50
  const lastProb = items[items.length - 1].homeWinPercentage;
  const secondToLast = items.length > 1 ? items[items.length - 2].homeWinPercentage : lastProb;
  console.log(`\nFinal homeWP: ${(lastProb * 100).toFixed(1)}%`);
  console.log(`Second-to-last homeWP: ${(secondToLast * 100).toFixed(1)}%`);
  console.log(`Final swing: ${(Math.abs(lastProb - secondToLast) * 100).toFixed(1)}%`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
