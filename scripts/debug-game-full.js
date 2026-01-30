#!/usr/bin/env node

/**
 * Purpose: Dump full win probability trace highlights for a single game.
 * Usage: node scripts/debug-game-full.js <gameId> [sport]
 * Output: Console report with competitive-range points and swing list.
 */

import { fetchAllProbabilities } from '../shared/espn-api.js';

const gameId = process.argv[2];
const sport = process.argv[3] || 'NFL';

if (!gameId) {
  console.error('Usage: node scripts/debug-game-full.js <gameId> [sport]');
  process.exit(1);
}

async function main() {
  const items = await fetchAllProbabilities(gameId, sport);

  if (!items || items.length === 0) {
    console.error('No probability data available.');
    process.exit(1);
  }

  console.log(`Total: ${items.length} points\n`);

  // Find points near 50%
  const closePoints = [];
  items.forEach((p, i) => {
    const wp = p.homeWinPercentage;
    if (wp >= 0.35 && wp <= 0.65) {
      closePoints.push({ index: i, wp: (wp * 100).toFixed(1) });
    }
  });

  console.log(`Points in competitive range (35-65%): ${closePoints.length}`);
  if (closePoints.length > 0) {
    console.log(`First competitive: index ${closePoints[0].index} (${closePoints[0].wp}%)`);
    console.log(`Last competitive: index ${closePoints[closePoints.length-1].index} (${closePoints[closePoints.length-1].wp}%)`);
  }

  // Find big swings
  console.log('\n=== SWINGS > 10% ===');
  for (let i = 1; i < items.length; i++) {
    const prev = items[i-1].homeWinPercentage;
    const curr = items[i].homeWinPercentage;
    const swing = Math.abs(curr - prev);
    if (swing > 0.10) {
      console.log(`${i}: ${(prev*100).toFixed(1)}% → ${(curr*100).toFixed(1)}% (${(swing*100).toFixed(1)}% swing)`);
    }
  }
}

main().catch(console.error);
