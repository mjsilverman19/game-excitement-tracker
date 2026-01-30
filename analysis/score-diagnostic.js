#!/usr/bin/env node
/**
 * Score Diagnostic: Analyze correlation between actual game scores/margins
 * and algorithm GEI scores across all static data.
 *
 * Outputs CSV and summary statistics to identify systematic biases.
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
    try {
      files = await readdir(sportDir);
    } catch { continue; }

    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(await readFile(join(sportDir, file), 'utf8'));
        if (!data.games) continue;

        for (const game of data.games) {
          if (game.excitement == null) continue;
          games.push({
            sport: sport.toUpperCase(),
            file,
            id: game.id,
            name: game.name || game.shortName || `${game.awayTeam} at ${game.homeTeam}`,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            totalPoints: (game.homeScore || 0) + (game.awayScore || 0),
            margin: Math.abs((game.homeScore || 0) - (game.awayScore || 0)),
            excitement: game.excitement,
            tension: game.breakdown?.tension,
            drama: game.breakdown?.drama,
            finish: game.breakdown?.finish,
            overtime: game.overtime || false,
            tier: game.tier || game.ratingText || null
          });
        }
      } catch { continue; }
    }
  }

  return games;
}

function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  return num / Math.sqrt(denX * denY);
}

function stats(values) {
  if (!values.length) return {};
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    n,
    mean: mean.toFixed(2),
    median: sorted[Math.floor(n / 2)].toFixed(2),
    std: Math.sqrt(variance).toFixed(2),
    min: sorted[0].toFixed(2),
    max: sorted[n - 1].toFixed(2),
    p10: sorted[Math.floor(n * 0.1)].toFixed(2),
    p25: sorted[Math.floor(n * 0.25)].toFixed(2),
    p75: sorted[Math.floor(n * 0.75)].toFixed(2),
    p90: sorted[Math.floor(n * 0.9)].toFixed(2)
  };
}

function marginBucket(margin, sport) {
  // Sport-adjusted buckets
  const f = sport === 'NBA' ? 2 : 1;
  if (margin <= 3 * f) return 'nail-biter';
  if (margin <= 7 * f) return 'one-score';
  if (margin <= 14 * f) return 'competitive';
  if (margin <= 21 * f) return 'comfortable';
  return 'blowout';
}

async function main() {
  const games = await loadAllGames();
  console.log(`\nLoaded ${games.length} games across all sports\n`);

  // === 1. Overall correlation ===
  console.log('=== CORRELATION: Margin vs GEI ===');
  console.log('(Negative = closer margin -> higher score, which is expected)\n');

  for (const sport of ['NFL', 'CFB', 'NBA', 'ALL']) {
    const subset = sport === 'ALL' ? games : games.filter(g => g.sport === sport);
    const margins = subset.map(g => g.margin);
    const scores = subset.map(g => g.excitement);
    const r = pearsonCorrelation(margins, scores);
    console.log(`  ${sport.padEnd(4)} (n=${String(subset.length).padStart(4)}): r = ${r.toFixed(3)}`);
  }

  // === 2. GEI by margin bucket ===
  console.log('\n=== GEI SCORE BY MARGIN BUCKET ===\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport);
    console.log(`--- ${sport} ---`);

    const buckets = {};
    for (const g of subset) {
      const bucket = marginBucket(g.margin, sport);
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push(g);
    }

    for (const bucket of ['nail-biter', 'one-score', 'competitive', 'comfortable', 'blowout']) {
      const bg = buckets[bucket] || [];
      if (!bg.length) continue;
      const s = stats(bg.map(g => g.excitement));
      const finishStats = stats(bg.map(g => g.finish).filter(f => f != null));
      console.log(`  ${bucket.padEnd(12)} (n=${String(bg.length).padStart(3)}): GEI mean=${s.mean} med=${s.median} | Finish mean=${finishStats.mean || 'N/A'} med=${finishStats.median || 'N/A'}`);
    }
    console.log();
  }

  // === 3. Breakdown correlations with margin ===
  console.log('=== COMPONENT CORRELATION WITH MARGIN ===');
  console.log('(Which component best captures close game excitement?)\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport && g.tension != null);
    const margins = subset.map(g => g.margin);
    const tensions = subset.map(g => g.tension);
    const dramas = subset.map(g => g.drama);
    const finishes = subset.map(g => g.finish);

    console.log(`  ${sport}:`);
    console.log(`    Tension vs Margin:  r = ${pearsonCorrelation(margins, tensions).toFixed(3)}`);
    console.log(`    Drama vs Margin:    r = ${pearsonCorrelation(margins, dramas).toFixed(3)}`);
    console.log(`    Finish vs Margin:   r = ${pearsonCorrelation(margins, finishes).toFixed(3)}`);
    console.log();
  }

  // === 4. Identify "underrated close games" ===
  // Games where margin says close but GEI says boring
  console.log('=== UNDERRATED CLOSE GAMES ===');
  console.log('(Nail-biters or one-score games scoring below 6.0)\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport);
    const underrated = subset.filter(g => {
      const bucket = marginBucket(g.margin, sport);
      return (bucket === 'nail-biter' || bucket === 'one-score') && g.excitement < 6.0;
    }).sort((a, b) => a.excitement - b.excitement);

    console.log(`--- ${sport} (${underrated.length} underrated of ${subset.filter(g => {
      const b = marginBucket(g.margin, sport);
      return b === 'nail-biter' || b === 'one-score';
    }).length} close games) ---`);

    for (const g of underrated.slice(0, 10)) {
      console.log(`  ${g.name.substring(0, 40).padEnd(40)} margin=${String(g.margin).padStart(2)} GEI=${g.excitement.toFixed(1)} T=${g.tension?.toFixed(1) || '?'} D=${g.drama?.toFixed(1) || '?'} F=${g.finish?.toFixed(1) || '?'}`);
    }
    if (underrated.length > 10) console.log(`  ... and ${underrated.length - 10} more`);
    console.log();
  }

  // === 5. Identify "overrated blowouts" ===
  console.log('=== OVERRATED BLOWOUTS ===');
  console.log('(Comfortable/blowout margin games scoring above 7.0)\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport);
    const overrated = subset.filter(g => {
      const bucket = marginBucket(g.margin, sport);
      return (bucket === 'comfortable' || bucket === 'blowout') && g.excitement > 7.0;
    }).sort((a, b) => b.excitement - a.excitement);

    console.log(`--- ${sport} (${overrated.length} overrated) ---`);

    for (const g of overrated.slice(0, 10)) {
      console.log(`  ${g.name.substring(0, 40).padEnd(40)} margin=${String(g.margin).padStart(2)} GEI=${g.excitement.toFixed(1)} T=${g.tension?.toFixed(1) || '?'} D=${g.drama?.toFixed(1) || '?'} F=${g.finish?.toFixed(1) || '?'}`);
    }
    if (overrated.length > 10) console.log(`  ... and ${overrated.length - 10} more`);
    console.log();
  }

  // === 6. Finish Quality gap analysis ===
  console.log('=== FINISH QUALITY GAP BY MARGIN ===');
  console.log('(How much does Finish underperform relative to margin closeness?)\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport && g.finish != null);

    // Expected finish quality (naive: closer margin → higher finish)
    // Compare actual finish to what margin would predict
    const f = sport === 'NBA' ? 2 : 1;
    const closeGames = subset.filter(g => g.margin <= 7 * f);
    const farGames = subset.filter(g => g.margin > 14 * f);

    const closeFinish = stats(closeGames.map(g => g.finish));
    const farFinish = stats(farGames.map(g => g.finish));

    console.log(`  ${sport}: Close games (≤${7*f} pts) finish mean=${closeFinish.mean} | Blowout (>${14*f} pts) finish mean=${farFinish.mean} | Gap=${(parseFloat(closeFinish.mean) - parseFloat(farFinish.mean)).toFixed(2)}`);
  }

  // === 7. Component variance analysis ===
  console.log('\n=== COMPONENT VARIANCE (which metric varies most?) ===\n');

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport && g.tension != null);
    console.log(`  ${sport}: Tension std=${stats(subset.map(g => g.tension)).std} | Drama std=${stats(subset.map(g => g.drama)).std} | Finish std=${stats(subset.map(g => g.finish)).std}`);
  }

  console.log('\n=== DONE ===\n');
}

main().catch(console.error);
