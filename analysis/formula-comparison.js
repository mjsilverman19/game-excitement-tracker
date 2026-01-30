#!/usr/bin/env node
/**
 * Compare the current GEI algorithm against a proposed simpler formula:
 *   GEI_proposed = k * (1/t) * Σ|pᵢ - pᵢ₋₁|
 *
 * where:
 *   pᵢ = win probability at data point i
 *   t = number of data points (proxy for game length)
 *   k = scaling constant
 *
 * This is essentially "average absolute WP change per data point" scaled to 1-10.
 *
 * Tests against canonical games and compares distributions.
 */

import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchAllProbabilities } from '../shared/espn-api.js';
import { getTier } from '../shared/algorithm-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANONICAL_PATH = join(__dirname, 'canonical-games.json');
const DATA_DIR = join(__dirname, '..', 'public', 'data');

// Parse ESPN probability items into {value, period, clock}
function parseProbs(items) {
  return items.map(item => ({
    value: Math.max(0, Math.min(1, item.homeWinPercentage || 0.5)),
    period: item.sequenceNumber != null ? undefined : undefined,
  })).filter(p => p.value >= 0 && p.value <= 1);
}

// Proposed formula: sum of absolute WP changes, normalized
function proposedGEI(probs, variant = 'base') {
  if (probs.length < 2) return 0;

  let totalSwing = 0;
  for (let i = 1; i < probs.length; i++) {
    totalSwing += Math.abs(probs[i].value - probs[i - 1].value);
  }

  const n = probs.length;
  const avgSwing = totalSwing / (n - 1);

  // Also compute leverage-weighted version
  let leverageWeightedSwing = 0;
  for (let i = 1; i < probs.length; i++) {
    const swing = Math.abs(probs[i].value - probs[i - 1].value);
    const leverage = probs[i - 1].value * (1 - probs[i - 1].value) * 4; // max 1 at 0.5
    leverageWeightedSwing += swing * leverage;
  }
  const avgLeverageSwing = leverageWeightedSwing / (n - 1);

  if (variant === 'base') {
    // Raw volatility sum, scaled to 0-10
    // Empirically: exciting games have totalSwing ~ 2-6, boring ~ 0.5-1.5
    // Scale: score = min(10, totalSwing * k)
    return { totalSwing, avgSwing, n };
  }

  if (variant === 'leverage') {
    return { totalSwing: leverageWeightedSwing, avgSwing: avgLeverageSwing, n };
  }
}

async function loadCanonical() {
  const data = JSON.parse(await readFile(CANONICAL_PATH, 'utf8'));
  return Array.isArray(data) ? data : data.games;
}

// Load static game data to get current GEI scores
async function loadStaticScores() {
  const scores = new Map();
  for (const sport of ['nfl', 'cfb', 'nba']) {
    const sportDir = join(DATA_DIR, sport, '2025');
    let files;
    try { files = await readdir(sportDir); } catch { continue; }
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(await readFile(join(sportDir, file), 'utf8'));
        if (!data.games) continue;
        for (const game of data.games) {
          if (game.excitement != null) {
            scores.set(String(game.id), {
              excitement: game.excitement,
              breakdown: game.breakdown,
              margin: Math.abs((game.homeScore || 0) - (game.awayScore || 0)),
              homeScore: game.homeScore,
              awayScore: game.awayScore,
              sport: sport.toUpperCase()
            });
          }
        }
      } catch { continue; }
    }
  }
  return scores;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const canonical = await loadCanonical();
  const staticScores = await loadStaticScores();

  console.log(`Loaded ${canonical.length} canonical games, ${staticScores.size} static scores\n`);

  // Fetch WP data for canonical games + a random sample of non-canonical
  // Start with canonical since those have ground truth
  const results = [];

  console.log('Fetching WP data for canonical games...\n');

  let fetched = 0;
  let failed = 0;

  for (const entry of canonical) {
    const gameId = String(entry.gameId);
    const sport = entry.sport;

    try {
      const items = await fetchAllProbabilities(gameId, sport);
      if (!items || items.length < 10) {
        failed++;
        continue;
      }

      const probs = parseProbs(items);
      const baseMetrics = proposedGEI(probs, 'base');
      const leverageMetrics = proposedGEI(probs, 'leverage');

      const staticInfo = staticScores.get(gameId);

      results.push({
        gameId,
        sport,
        name: entry.description || `Game ${gameId}`,
        expectedTier: entry.expectedTier,
        dataQuality: entry.dataQuality || 'gold',
        currentGEI: staticInfo?.excitement || null,
        currentBreakdown: staticInfo?.breakdown || null,
        margin: staticInfo?.margin ?? null,
        nProbs: probs.length,
        totalSwing: baseMetrics.totalSwing,
        avgSwing: baseMetrics.avgSwing,
        leverageSwing: leverageMetrics.totalSwing,
        avgLeverageSwing: leverageMetrics.avgSwing,
      });

      fetched++;
      if (fetched % 10 === 0) console.log(`  Fetched ${fetched}/${canonical.length}...`);
    } catch (e) {
      failed++;
    }

    // Rate limit
    await sleep(100);
  }

  console.log(`\nFetched: ${fetched}, Failed: ${failed}\n`);

  // === Analysis ===

  // 1. Distribution of proposed metrics by expected tier
  console.log('=== PROPOSED METRIC DISTRIBUTION BY EXPECTED TIER ===\n');

  for (const tier of ['must-watch', 'recommended', 'skip']) {
    const tierGames = results.filter(r => r.expectedTier === tier && r.dataQuality !== 'excluded');
    if (!tierGames.length) continue;

    const totalSwings = tierGames.map(r => r.totalSwing).sort((a, b) => a - b);
    const avgSwings = tierGames.map(r => r.avgSwing).sort((a, b) => a - b);
    const leverageSwings = tierGames.map(r => r.leverageSwing).sort((a, b) => a - b);

    const median = arr => arr[Math.floor(arr.length / 2)];
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const p25 = arr => arr[Math.floor(arr.length * 0.25)];
    const p75 = arr => arr[Math.floor(arr.length * 0.75)];

    console.log(`  ${tier} (n=${tierGames.length}):`);
    console.log(`    totalSwing:   mean=${mean(totalSwings).toFixed(3)} med=${median(totalSwings).toFixed(3)} p25=${p25(totalSwings).toFixed(3)} p75=${p75(totalSwings).toFixed(3)}`);
    console.log(`    avgSwing:     mean=${mean(avgSwings).toFixed(4)} med=${median(avgSwings).toFixed(4)} p25=${p25(avgSwings).toFixed(4)} p75=${p75(avgSwings).toFixed(4)}`);
    console.log(`    leverageSwing: mean=${mean(leverageSwings).toFixed(3)} med=${median(leverageSwings).toFixed(3)} p25=${p25(leverageSwings).toFixed(3)} p75=${p75(leverageSwings).toFixed(3)}`);
    console.log();
  }

  // 2. Find optimal scaling to map totalSwing -> 1-10
  console.log('=== OPTIMAL SCALING SEARCH ===\n');

  // Try different scaling functions
  const scalingFunctions = [
    { name: 'linear', fn: (swing, k) => Math.min(10, Math.max(1, swing * k)) },
    { name: 'sqrt', fn: (swing, k) => Math.min(10, Math.max(1, Math.sqrt(swing) * k)) },
    { name: 'log', fn: (swing, k) => Math.min(10, Math.max(1, Math.log(1 + swing * k) / Math.log(1 + k * 5) * 10)) },
  ];

  const metrics = ['totalSwing', 'leverageSwing'];

  for (const metric of metrics) {
    for (const { name: scaleName, fn: scaleFn } of scalingFunctions) {
      // Grid search for best k
      let bestK = 0, bestAccuracy = 0, bestDetails = null;

      for (let k = 0.1; k <= 20; k += 0.1) {
        let correct = 0, total = 0;
        for (const r of results) {
          if (r.dataQuality === 'excluded') continue;
          const score = scaleFn(r[metric], k);
          const predictedTier = getTier(score, r.sport);
          const expected = r.expectedTier;
          const match =
            (expected === 'must-watch' && predictedTier.cssClass === 'must-watch') ||
            (expected === 'recommended' && predictedTier.cssClass === 'recommended') ||
            (expected === 'skip' && predictedTier.cssClass === 'skip');
          if (match) correct++;
          total++;
        }
        const accuracy = correct / total;
        if (accuracy > bestAccuracy) {
          bestAccuracy = accuracy;
          bestK = k;
        }
      }

      // Re-run best k to get details
      let correct = 0, total = 0;
      const failures = [];
      for (const r of results) {
        if (r.dataQuality === 'excluded') continue;
        const score = scaleFn(r[metric], bestK);
        const predictedTier = getTier(score, r.sport);
        const expected = r.expectedTier;
        const match =
          (expected === 'must-watch' && predictedTier.cssClass === 'must-watch') ||
          (expected === 'recommended' && predictedTier.cssClass === 'recommended') ||
          (expected === 'skip' && predictedTier.cssClass === 'skip');
        if (match) correct++;
        else failures.push({ name: r.name?.substring(0, 40), expected, got: predictedTier.label, score: score.toFixed(1), swing: r[metric].toFixed(3) });
        total++;
      }

      console.log(`  ${metric} + ${scaleName}: best k=${bestK.toFixed(1)}, accuracy=${correct}/${total} (${(correct/total*100).toFixed(1)}%)`);
      if (failures.length <= 15) {
        for (const f of failures) {
          console.log(`    FAIL: ${f.name?.padEnd(40)} expected=${f.expected} got=${f.got} score=${f.score} swing=${f.swing}`);
        }
      }
      console.log();
    }
  }

  // 3. Compare with current GEI
  console.log('=== CURRENT GEI vs PROPOSED (correlation) ===\n');

  const withBoth = results.filter(r => r.currentGEI != null);
  if (withBoth.length > 0) {
    const currentScores = withBoth.map(r => r.currentGEI);
    const swings = withBoth.map(r => r.totalSwing);
    const levSwings = withBoth.map(r => r.leverageSwing);

    function pearson(xs, ys) {
      const n = xs.length;
      const mx = xs.reduce((a,b) => a+b,0)/n;
      const my = ys.reduce((a,b) => a+b,0)/n;
      let num=0,dx=0,dy=0;
      for(let i=0;i<n;i++){
        const x=xs[i]-mx, y=ys[i]-my;
        num+=x*y; dx+=x*x; dy+=y*y;
      }
      return num/Math.sqrt(dx*dy);
    }

    console.log(`  Current GEI vs totalSwing:    r = ${pearson(currentScores, swings).toFixed(3)} (n=${withBoth.length})`);
    console.log(`  Current GEI vs leverageSwing: r = ${pearson(currentScores, levSwings).toFixed(3)}`);
  }

  // 4. Print raw data for inspection
  console.log('\n=== RAW DATA (canonical games) ===\n');
  console.log('Sport | Expected    | CurrGEI | TotalSwing | LevSwing | Margin | Name');
  console.log('------+-------------+---------+------------+----------+--------+--');

  for (const r of results.sort((a, b) => (b.totalSwing - a.totalSwing))) {
    const currGEI = r.currentGEI != null ? r.currentGEI.toFixed(1) : ' N/A';
    console.log(`${r.sport.padEnd(5)} | ${r.expectedTier.padEnd(11)} | ${currGEI.padStart(7)} | ${r.totalSwing.toFixed(3).padStart(10)} | ${r.leverageSwing.toFixed(3).padStart(8)} | ${r.margin != null ? String(r.margin).padStart(6) : '   N/A'} | ${(r.name || '').substring(0, 50)}`);
  }

  console.log('\n=== DONE ===\n');
}

main().catch(console.error);
