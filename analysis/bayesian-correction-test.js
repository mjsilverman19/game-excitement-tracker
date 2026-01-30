#!/usr/bin/env node
/**
 * Bayesian margin correction: use final margin as an independent signal
 * to correct WP-derived scores when they disagree with observable outcome.
 *
 * The key insight: all three current components (tension, drama, finish)
 * are derived from the same ESPN WP data. When ESPN is overconfident,
 * all three fail together. The final score margin is an INDEPENDENT
 * measurement of game closeness that can serve as a correction.
 *
 * Approach: For each game, compute what the "expected" GEI would be
 * based purely on margin (the regression line), then blend it with
 * the WP-derived score. The blend weight depends on how much we
 * trust the WP data (measured by data point density and WP movement).
 *
 * When WP data shows lots of movement (high totalSwing), we trust it.
 * When WP data is flat despite a close margin, ESPN was overconfident
 * and we should trust the margin more.
 */

import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getTier } from '../shared/algorithm-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');
const CANONICAL_PATH = join(__dirname, 'canonical-games.json');

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

async function loadCanonical() {
  const data = JSON.parse(await readFile(CANONICAL_PATH, 'utf8'));
  return Array.isArray(data) ? data : data.games;
}

// Compute per-sport regression: margin → expected GEI
function computeRegressions(games) {
  const regressions = {};
  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport && g.margin != null);
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

    // Also compute std of residuals for confidence weighting
    const residuals = subset.map(g => g.excitement - (a + b * g.margin));
    const residStd = Math.sqrt(residuals.reduce((s, r) => s + r*r, 0) / n);

    regressions[sport] = { a, b, residStd };
  }
  return regressions;
}

/**
 * Bayesian correction: blend WP-derived score with margin-predicted score.
 *
 * The blend factor (alpha) determines how much to trust the margin vs WP:
 * - When WP data agrees with margin (both say exciting or both say boring):
 *   alpha ≈ 0 (keep WP score, no correction needed)
 * - When WP says boring but margin says close: alpha > 0 (trust margin more)
 * - When WP says exciting but margin says blowout: alpha ≈ 0 (WP correctly
 *   captured mid-game excitement; margin doesn't tell the whole story)
 *
 * Key: We only correct UPWARD (when margin suggests the game was closer than
 * the WP data implies), never downward (blowouts that had mid-game excitement
 * are still exciting).
 */
function bayesianCorrection(game, regression, params) {
  const f = game.sport === 'NBA' ? 2 : 1;

  // Margin-predicted score from regression
  const marginPredicted = regression.a + regression.b * game.margin;

  // How much does the WP-derived score disagree with margin prediction?
  const residual = game.excitement - marginPredicted;

  // Only correct upward (negative residual = WP underrates relative to margin)
  if (residual >= 0) return game.excitement;

  // How confident are we that ESPN was overconfident?
  // Signal 1: How close was the margin? (closer = more confident in correction)
  const maxCloseMargin = params.maxCloseMargin * f;
  if (game.margin > maxCloseMargin) return game.excitement;

  const marginCloseness = 1 - (game.margin / maxCloseMargin); // 0 to 1

  // Signal 2: How flat was the WP data? (tension is a proxy)
  // Low tension in a close game → ESPN was likely overconfident
  const expectedTension = params.expectedTensionAtMargin(game.margin, f);
  const tensionDeficit = Math.max(0, expectedTension - game.tension);
  const tensionDeficitNorm = Math.min(1, tensionDeficit / params.maxTensionDeficit);

  // Blend factor: higher when margin is close AND tension is unexpectedly low
  const alpha = marginCloseness * tensionDeficitNorm * params.maxAlpha;

  // Corrected score: blend toward margin prediction
  const corrected = game.excitement + alpha * Math.abs(residual);

  return Math.min(10, corrected);
}

function evaluate(games, canonical, name, adjustFn) {
  const canonicalMap = new Map(canonical.map(c => [String(c.gameId), c]));

  let totalShift = 0, shiftCount = 0, maxShift = 0;
  let underratedFixed = 0, overratedCreated = 0;
  let canonPass = 0, canonFail = 0, canonImproved = 0, canonRegressed = 0;
  let shiftedGames = [];

  for (const game of games) {
    const adjusted = adjustFn(game);
    const shift = adjusted - game.excitement;

    if (Math.abs(shift) > 0.01) {
      totalShift += shift;
      shiftCount++;
      maxShift = Math.max(maxShift, Math.abs(shift));
      if (shift > 0.3) {
        shiftedGames.push({ ...game, adjusted, shift });
      }
    }

    const f = game.sport === 'NBA' ? 2 : 1;
    if (game.margin > 14 * f && shift > 0.5) overratedCreated++;
    if (game.margin <= 7 * f && game.excitement < 6 && adjusted >= 6) underratedFixed++;

    const canon = canonicalMap.get(String(game.id));
    if (canon && canon.dataQuality !== 'excluded') {
      const oldTier = getTier(game.excitement, game.sport);
      const newTier = getTier(adjusted, game.sport);
      const expected = canon.expectedTier;

      const oldMatch = (expected === 'must-watch' && oldTier.cssClass === 'must-watch') ||
        (expected === 'recommended' && oldTier.cssClass === 'recommended') ||
        (expected === 'skip' && oldTier.cssClass === 'skip');
      const newMatch = (expected === 'must-watch' && newTier.cssClass === 'must-watch') ||
        (expected === 'recommended' && newTier.cssClass === 'recommended') ||
        (expected === 'skip' && newTier.cssClass === 'skip');

      if (newMatch) canonPass++;
      else canonFail++;
      if (!oldMatch && newMatch) canonImproved++;
      if (oldMatch && !newMatch) canonRegressed++;
    }
  }

  console.log(`\n  ${name}:`);
  console.log(`    Affected: ${shiftCount}/${games.length} (${(shiftCount/games.length*100).toFixed(1)}%)`);
  console.log(`    Avg shift: +${(totalShift/games.length).toFixed(3)} | Max: ${maxShift.toFixed(2)}`);
  console.log(`    Underrated fixed: ${underratedFixed} | Overrated created: ${overratedCreated}`);
  console.log(`    Canonical: ${canonPass}p/${canonFail}f | +${canonImproved} improved, -${canonRegressed} regressed`);

  // Show distribution of shifts
  const shiftBuckets = { '0-0.5': 0, '0.5-1': 0, '1-1.5': 0, '1.5-2': 0, '2+': 0 };
  for (const g of shiftedGames) {
    if (g.shift < 0.5) shiftBuckets['0-0.5']++;
    else if (g.shift < 1) shiftBuckets['0.5-1']++;
    else if (g.shift < 1.5) shiftBuckets['1-1.5']++;
    else if (g.shift < 2) shiftBuckets['1.5-2']++;
    else shiftBuckets['2+']++;
  }
  console.log(`    Shift distribution: ${Object.entries(shiftBuckets).map(([k,v]) => `${k}:${v}`).join(' | ')}`);

  // Show top shifted games
  shiftedGames.sort((a, b) => b.shift - a.shift);
  if (shiftedGames.length > 0) {
    console.log(`    Top shifts:`);
    for (const g of shiftedGames.slice(0, 8)) {
      console.log(`      ${g.name.substring(0, 35).padEnd(35)} ${g.sport} m=${String(g.margin).padStart(2)} ${g.excitement.toFixed(1)}→${g.adjusted.toFixed(1)} (+${g.shift.toFixed(1)}) T=${g.tension.toFixed(1)} D=${g.drama.toFixed(1)} F=${g.finish.toFixed(1)}`);
    }
  }

  return { canonPass, canonFail, canonImproved, canonRegressed, underratedFixed, overratedCreated };
}

async function main() {
  const games = await loadAllGames();
  const canonical = await loadCanonical();
  const regressions = computeRegressions(games);

  console.log(`Games: ${games.length}, Canonical: ${canonical.length}\n`);

  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const r = regressions[sport];
    console.log(`${sport} regression: GEI = ${r.a.toFixed(2)} + ${r.b.toFixed(3)} * margin (residual std=${r.residStd.toFixed(2)})`);
  }

  console.log('\n=== BAYESIAN CORRECTION VARIANTS ===');

  // Baseline
  evaluate(games, canonical, 'BASELINE', g => g.excitement);

  // Parameter sweep
  const variants = [
    {
      name: 'Conservative (alpha=0.3, margin≤10)',
      params: {
        maxCloseMargin: 10,
        maxAlpha: 0.3,
        maxTensionDeficit: 4,
        expectedTensionAtMargin: (m, f) => Math.max(3, 7 - m / (1.5 * f)),
      }
    },
    {
      name: 'Moderate (alpha=0.4, margin≤14)',
      params: {
        maxCloseMargin: 14,
        maxAlpha: 0.4,
        maxTensionDeficit: 4,
        expectedTensionAtMargin: (m, f) => Math.max(3, 7 - m / (1.5 * f)),
      }
    },
    {
      name: 'Aggressive (alpha=0.5, margin≤14)',
      params: {
        maxCloseMargin: 14,
        maxAlpha: 0.5,
        maxTensionDeficit: 4,
        expectedTensionAtMargin: (m, f) => Math.max(3, 7 - m / (1.5 * f)),
      }
    },
    {
      name: 'Tension-gated (alpha=0.5, only tension<3)',
      params: {
        maxCloseMargin: 10,
        maxAlpha: 0.5,
        maxTensionDeficit: 4,
        expectedTensionAtMargin: (m, f) => 3.01, // only triggers when tension < 3
      }
    },
    {
      name: 'Drama-aware (alpha=0.5, margin≤14, drama deficit)',
      params: {
        maxCloseMargin: 14,
        maxAlpha: 0.5,
        maxTensionDeficit: 5,
        expectedTensionAtMargin: (m, f) => Math.max(2.5, 8 - m / f),
      }
    },
    {
      name: 'Smooth sigmoid (alpha=0.6, margin≤14)',
      params: {
        maxCloseMargin: 14,
        maxAlpha: 0.6,
        maxTensionDeficit: 5,
        expectedTensionAtMargin: (m, f) => Math.max(3, 7 - m / (1.5 * f)),
      }
    },
  ];

  for (const variant of variants) {
    evaluate(games, canonical, variant.name, g => {
      const reg = regressions[g.sport];
      return bayesianCorrection(g, reg, variant.params);
    });
  }

  // === Also test: Use drama deficit instead of tension deficit ===
  console.log('\n=== DRAMA-BASED VARIANT ===');

  function bayesianDramaCorrection(game, regression, params) {
    const f = game.sport === 'NBA' ? 2 : 1;
    const marginPredicted = regression.a + regression.b * game.margin;
    const residual = game.excitement - marginPredicted;

    if (residual >= 0) return game.excitement;

    const maxCloseMargin = params.maxCloseMargin * f;
    if (game.margin > maxCloseMargin) return game.excitement;

    const marginCloseness = 1 - (game.margin / maxCloseMargin);

    // Use drama deficit instead — drama has the strongest correlation with margin
    // and accounts for 55% of the weighted deficit in underrated games
    const expectedDrama = params.expectedDramaAtMargin(game.margin, f);
    const dramaDeficit = Math.max(0, expectedDrama - game.drama);
    const dramaDeficitNorm = Math.min(1, dramaDeficit / params.maxDramaDeficit);

    const alpha = marginCloseness * dramaDeficitNorm * params.maxAlpha;
    return Math.min(10, game.excitement + alpha * Math.abs(residual));
  }

  for (const variant of [
    {
      name: 'Drama-deficit moderate (alpha=0.4)',
      params: { maxCloseMargin: 14, maxAlpha: 0.4, maxDramaDeficit: 5, expectedDramaAtMargin: (m, f) => Math.max(3, 8 - m / f) }
    },
    {
      name: 'Drama-deficit aggressive (alpha=0.5)',
      params: { maxCloseMargin: 14, maxAlpha: 0.5, maxDramaDeficit: 5, expectedDramaAtMargin: (m, f) => Math.max(3, 8 - m / f) }
    },
  ]) {
    evaluate(games, canonical, variant.name, g => {
      return bayesianDramaCorrection(g, regressions[g.sport], variant.params);
    });
  }

  // === Combined: use BOTH tension and drama deficit ===
  console.log('\n=== COMBINED TENSION+DRAMA VARIANT ===');

  function bayesianCombinedCorrection(game, regression, params) {
    const f = game.sport === 'NBA' ? 2 : 1;
    const marginPredicted = regression.a + regression.b * game.margin;
    const residual = game.excitement - marginPredicted;

    if (residual >= 0) return game.excitement;

    const maxCloseMargin = params.maxCloseMargin * f;
    if (game.margin > maxCloseMargin) return game.excitement;

    const marginCloseness = 1 - (game.margin / maxCloseMargin);

    // Combined signal: average of tension and drama deficit
    const expectedTension = Math.max(3, 7 - game.margin / (1.5 * f));
    const expectedDrama = Math.max(3, 8 - game.margin / f);
    const tensionDeficit = Math.max(0, expectedTension - game.tension) / 4;
    const dramaDeficit = Math.max(0, expectedDrama - game.drama) / 5;
    const combinedDeficit = Math.min(1, (tensionDeficit + dramaDeficit) / 2 * 2);

    const alpha = marginCloseness * combinedDeficit * params.maxAlpha;
    return Math.min(10, game.excitement + alpha * Math.abs(residual));
  }

  for (const maxAlpha of [0.3, 0.4, 0.5]) {
    evaluate(games, canonical, `Combined T+D (alpha=${maxAlpha})`, g => {
      return bayesianCombinedCorrection(g, regressions[g.sport], { maxCloseMargin: 14, maxAlpha });
    });
  }

  console.log('\n=== DONE ===\n');
}

main().catch(console.error);
