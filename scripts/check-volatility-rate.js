#!/usr/bin/env node

/**
 * Purpose: Measure how often volatility bonus triggers across a sample of weeks.
 * Usage: node scripts/check-volatility-rate.js
 * Output: Console summary of swing trigger rates for the sample.
 */

import { fetchGames } from '../api/fetcher.js';

let totalGames = 0;
let massiveCount = 0;
let multiSwingCount = 0;
let extremeRecCount = 0;

for (let week = 1; week <= 10; week++) {
  const games = await fetchGames('NFL', 2025, week, '2');
  for (const game of games) {
    const probUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${game.id}/competitions/${game.id}/probabilities?limit=300`;
    try {
      const resp = await fetch(probUrl);
      if (!resp.ok) continue;
      const data = await resp.json();
      const items = data.items || [];
      if (items.length < 10) continue;
      
      totalGames++;
      let largeSwings = 0;
      let hasMassive = false;
      let hasExtremeRecovery = false;
      
      for (let i = 1; i < items.length; i++) {
        const prev = items[i-1].homeWinPercentage;
        const curr = items[i].homeWinPercentage;
        const swing = Math.abs(curr - prev);
        if (swing >= 0.18) largeSwings++;
        if (swing >= 0.50) hasMassive = true;
        if ((prev <= 0.10 || prev >= 0.90) && swing >= 0.18) hasExtremeRecovery = true;
      }
      
      if (hasMassive) massiveCount++;
      if (largeSwings >= 6) multiSwingCount++;
      if (hasExtremeRecovery) extremeRecCount++;
    } catch(e) {}
  }
}

const anyTrigger = massiveCount + multiSwingCount + extremeRecCount; // overcounts overlap but gives sense
console.log(`Total games: ${totalGames}`);
console.log(`Massive swing (45%+): ${massiveCount} (${(massiveCount/totalGames*100).toFixed(1)}%)`);
console.log(`Multi-swing (6+ at 18%+): ${multiSwingCount} (${(multiSwingCount/totalGames*100).toFixed(1)}%)`);
console.log(`Extreme recovery: ${extremeRecCount} (${(extremeRecCount/totalGames*100).toFixed(1)}%)`);
