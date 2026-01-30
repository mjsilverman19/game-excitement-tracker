#!/usr/bin/env node
/**
 * Deep diagnostic: For underrated close games, identify which component
 * is most responsible and whether a margin-based correction is justified.
 */

import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');

async function loadAllGames() {
  const games = [];
  for (const sport of ['nfl', 'cfb', 'nba']) {
    const sportDir = join(DATA_DIR, sport, '2025');
    let files;
    try { files = await readdir(sportDir); } catch { continue; }
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(await readFile(join(sportDir, file), 'utf8'));
        if (!data.games) continue;
        for (const game of data.games) {
          if (game.excitement == null || game.breakdown == null) continue;
          games.push({
            sport: sport.toUpperCase(),
            id: game.id,
            name: game.name || game.shortName || `${game.awayTeam} at ${game.homeTeam}`,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            totalPoints: (game.homeScore || 0) + (game.awayScore || 0),
            margin: Math.abs((game.homeScore || 0) - (game.awayScore || 0)),
            excitement: game.excitement,
            tension: game.breakdown.tension,
            drama: game.breakdown.drama,
            finish: game.breakdown.finish,
            overtime: game.overtime || false
          });
        }
      } catch { continue; }
    }
  }
  return games;
}

function marginBucket(margin, sport) {
  const f = sport === 'NBA' ? 2 : 1;
  if (margin <= 3 * f) return 'nail-biter';
  if (margin <= 7 * f) return 'one-score';
  if (margin <= 14 * f) return 'competitive';
  if (margin <= 21 * f) return 'comfortable';
  return 'blowout';
}

async function main() {
  const games = await loadAllGames();

  // === 1. For each sport, what % of close games are "underrated"? ===
  console.log('=== UNDERRATING RATE BY MARGIN BUCKET ===\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport);
    const f = sport === 'NBA' ? 2 : 1;

    console.log(`--- ${sport} ---`);
    for (const [label, maxMargin] of [['nail-biter', 3*f], ['one-score', 7*f], ['competitive', 14*f]]) {
      const bucket = subset.filter(g => {
        if (label === 'nail-biter') return g.margin <= maxMargin;
        if (label === 'one-score') return g.margin > 3*f && g.margin <= maxMargin;
        return g.margin > 7*f && g.margin <= maxMargin;
      });
      // "Underrated" = one of the three components is below 4.0
      const lowTension = bucket.filter(g => g.tension < 4.0);
      const lowDrama = bucket.filter(g => g.drama < 4.0);
      const lowFinish = bucket.filter(g => g.finish < 4.0);
      const anyLow = bucket.filter(g => g.tension < 4.0 || g.drama < 4.0 || g.finish < 4.0);

      if (!bucket.length) continue;
      console.log(`  ${label.padEnd(12)} (n=${bucket.length}): Low T=${lowTension.length} (${(lowTension.length/bucket.length*100).toFixed(0)}%) | Low D=${lowDrama.length} (${(lowDrama.length/bucket.length*100).toFixed(0)}%) | Low F=${lowFinish.length} (${(lowFinish.length/bucket.length*100).toFixed(0)}%) | Any low=${anyLow.length} (${(anyLow.length/bucket.length*100).toFixed(0)}%)`);
    }
    console.log();
  }

  // === 2. Residual analysis: predicted GEI from margin vs actual ===
  console.log('=== RESIDUAL ANALYSIS: What GEI "should be" based on margin ===\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport);
    const f = sport === 'NBA' ? 2 : 1;

    // Simple linear regression: GEI = a + b*margin
    const n = subset.length;
    const margins = subset.map(g => g.margin);
    const scores = subset.map(g => g.excitement);
    const meanM = margins.reduce((a,b) => a+b, 0) / n;
    const meanS = scores.reduce((a,b) => a+b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (margins[i] - meanM) * (scores[i] - meanS);
      den += (margins[i] - meanM) ** 2;
    }
    const b = num / den;
    const a = meanS - b * meanM;

    console.log(`  ${sport}: GEI = ${a.toFixed(2)} + ${b.toFixed(3)} * margin`);
    console.log(`         Expected GEI at margin=0: ${a.toFixed(1)}, at margin=${7*f}: ${(a + b*7*f).toFixed(1)}, at margin=${21*f}: ${(a + b*21*f).toFixed(1)}`);

    // Find largest negative residuals (most underrated relative to margin)
    const withResiduals = subset.map(g => ({
      ...g,
      predicted: a + b * g.margin,
      residual: g.excitement - (a + b * g.margin)
    }));

    const mostUnderrated = withResiduals
      .filter(g => g.margin <= 7 * f) // only close games
      .sort((a, b) => a.residual - b.residual)
      .slice(0, 8);

    console.log(`\n  Most underrated close games (largest negative residuals):`);
    for (const g of mostUnderrated) {
      console.log(`    ${g.name.substring(0, 38).padEnd(38)} m=${String(g.margin).padStart(2)} actual=${g.excitement.toFixed(1)} predicted=${g.predicted.toFixed(1)} residual=${g.residual.toFixed(1)} [T=${g.tension.toFixed(1)} D=${g.drama.toFixed(1)} F=${g.finish.toFixed(1)}]`);
    }
    console.log();
  }

  // === 3. Component-specific: which component drags down close games most? ===
  console.log('=== COMPONENT DEFICIT IN UNDERRATED CLOSE GAMES ===');
  console.log('(How far below "expected" is each component for close games scoring < 6?)\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport);
    const f = sport === 'NBA' ? 2 : 1;

    const closeGames = subset.filter(g => g.margin <= 7 * f);
    const underratedClose = closeGames.filter(g => g.excitement < 6.0);
    const wellRatedClose = closeGames.filter(g => g.excitement >= 6.0);

    if (!underratedClose.length || !wellRatedClose.length) continue;

    const avgT_good = wellRatedClose.reduce((s,g) => s + g.tension, 0) / wellRatedClose.length;
    const avgD_good = wellRatedClose.reduce((s,g) => s + g.drama, 0) / wellRatedClose.length;
    const avgF_good = wellRatedClose.reduce((s,g) => s + g.finish, 0) / wellRatedClose.length;

    const avgT_bad = underratedClose.reduce((s,g) => s + g.tension, 0) / underratedClose.length;
    const avgD_bad = underratedClose.reduce((s,g) => s + g.drama, 0) / underratedClose.length;
    const avgF_bad = underratedClose.reduce((s,g) => s + g.finish, 0) / underratedClose.length;

    console.log(`  ${sport} close games (≤${7*f} pts):`);
    console.log(`    Well-rated (n=${wellRatedClose.length}): T=${avgT_good.toFixed(1)} D=${avgD_good.toFixed(1)} F=${avgF_good.toFixed(1)}`);
    console.log(`    Underrated (n=${underratedClose.length}): T=${avgT_bad.toFixed(1)} D=${avgD_bad.toFixed(1)} F=${avgF_bad.toFixed(1)}`);
    console.log(`    DEFICIT:                  T=${(avgT_bad - avgT_good).toFixed(1)} D=${(avgD_bad - avgD_good).toFixed(1)} F=${(avgF_bad - avgF_good).toFixed(1)}`);
    console.log(`    Deficit (weighted 20/45/35): T=${((avgT_bad - avgT_good) * 0.20).toFixed(2)} D=${((avgD_bad - avgD_good) * 0.45).toFixed(2)} F=${((avgF_bad - avgF_good) * 0.35).toFixed(2)} total=${((avgT_bad - avgT_good) * 0.20 + (avgD_bad - avgD_good) * 0.45 + (avgF_bad - avgF_good) * 0.35).toFixed(2)}`);
    console.log();
  }

  // === 4. ESPN WP overconfidence: what % of close game WP curves stay one-sided? ===
  console.log('=== ESPN OVERCONFIDENCE DETECTION ===');
  console.log('(Close games where WP never entered 35-65% band → ESPN was overconfident)\n');
  // We don't have raw WP data here, but tension < 3 in a close game is a proxy
  // (tension measures how much time WP spent near 50%)

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport);
    const f = sport === 'NBA' ? 2 : 1;
    const closeGames = subset.filter(g => g.margin <= 7 * f);
    const overconfident = closeGames.filter(g => g.tension < 3.0);

    console.log(`  ${sport}: ${overconfident.length} of ${closeGames.length} close games (${(overconfident.length/closeGames.length*100).toFixed(0)}%) have tension < 3.0 (ESPN overconfident proxy)`);
  }

  console.log('\n=== DONE ===\n');
}

main().catch(console.error);
