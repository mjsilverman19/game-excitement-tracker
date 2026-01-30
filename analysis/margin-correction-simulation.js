#!/usr/bin/env node
/**
 * Simulate different margin-correction approaches on all 1410 games.
 *
 * The key insight: when ESPN WP data is overconfident, all three components
 * (tension, drama, finish) are suppressed simultaneously. The final margin
 * is an independent signal that should provide a floor.
 *
 * Approaches tested:
 * A) Margin-based score floor (if close, GEI >= X)
 * B) Component floor boost (if close + component low, raise component)
 * C) Margin residual correction (add fraction of expected-actual gap)
 * D) ESPN confidence penalty (detect overconfidence, boost proportionally)
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

async function loadCanonical() {
  const data = JSON.parse(await readFile(CANONICAL_PATH, 'utf8'));
  return Array.isArray(data) ? data : data.games;
}

// ======= APPROACH A: Score Floor Based on Margin =======
// If the game ended within N points, GEI can't be below floor
function approachA_scoreFloor(game, params) {
  const f = game.sport === 'NBA' ? 2 : 1;
  const margin = game.margin;
  let floor = 0;

  if (margin <= 3 * f) floor = params.nailBiterFloor;     // e.g. 5.5
  else if (margin <= 7 * f) floor = params.oneScoreFloor;  // e.g. 4.5
  else if (margin <= 10 * f) floor = params.twoScoreFloor; // e.g. 3.5

  return Math.max(game.excitement, floor);
}

// ======= APPROACH B: Component Floors =======
// When margin is close, enforce minimum values for each component
function approachB_componentFloors(game, params) {
  const f = game.sport === 'NBA' ? 2 : 1;
  const margin = game.margin;

  let tFloor = 0, dFloor = 0, fFloor = 0;
  if (margin <= 3 * f) {
    tFloor = params.nailBiterTension;
    dFloor = params.nailBiterDrama;
    fFloor = params.nailBiterFinish;
  } else if (margin <= 7 * f) {
    tFloor = params.oneScoreTension;
    dFloor = params.oneScoreDrama;
    fFloor = params.oneScoreFinish;
  }

  const newT = Math.max(game.tension, tFloor);
  const newD = Math.max(game.drama, dFloor);
  const newF = Math.max(game.finish, fFloor);

  // Recompute weighted score
  const rawScore = newT * 0.20 + newD * 0.45 + newF * 0.35;
  // Apply same normalization curve (simplified: linear for comparison)
  // The actual normalizeScore uses a logarithmic curve, but for relative
  // comparison this is sufficient
  return game.excitement + (rawScore - (game.tension * 0.20 + game.drama * 0.45 + game.finish * 0.35));
}

// ======= APPROACH C: Residual Correction =======
// Use regression to predict "expected" GEI from margin, close gap partially
function approachC_residualCorrection(game, regressionParams, correctionFraction) {
  const predicted = regressionParams.a + regressionParams.b * game.margin;
  const residual = game.excitement - predicted;

  // Only correct negative residuals (underrated games)
  if (residual >= 0) return game.excitement;

  return game.excitement - residual * correctionFraction;
}

// ======= APPROACH D: ESPN Overconfidence Detection =======
// If tension is very low for a close game, ESPN was overconfident → boost
function approachD_overconfidenceBoost(game, params) {
  const f = game.sport === 'NBA' ? 2 : 1;
  if (game.margin > params.maxMargin * f) return game.excitement;

  // Detect overconfidence: tension < threshold for a close game
  if (game.tension >= params.tensionThreshold) return game.excitement;

  // How overconfident was ESPN? Scale by how far tension is below expected
  const expectedTension = params.expectedTensionByMargin(game.margin, f);
  const tensionDeficit = Math.max(0, expectedTension - game.tension);

  // Boost proportional to deficit and margin closeness
  const marginCloseness = 1 - (game.margin / (params.maxMargin * f));
  const boost = tensionDeficit * params.boostPerDeficitPoint * marginCloseness;

  return game.excitement + boost;
}

// ======= Evaluation =======

function evaluateApproach(games, canonical, name, adjustFn) {
  let totalShift = 0;
  let shiftCount = 0;
  let maxShift = 0;
  let overratedCreated = 0; // blowouts wrongly boosted
  let underratedFixed = 0;  // close games lifted above 6
  let canonicalResults = { pass: 0, fail: 0, improved: 0, regressed: 0, unchanged: 0 };

  // Build canonical lookup
  const canonicalMap = new Map(canonical.map(c => [String(c.gameId), c]));

  for (const game of games) {
    const adjusted = adjustFn(game);
    const shift = adjusted - game.excitement;
    totalShift += shift;
    if (shift !== 0) shiftCount++;
    maxShift = Math.max(maxShift, Math.abs(shift));

    const f = game.sport === 'NBA' ? 2 : 1;

    // Check if we made a blowout look better (bad)
    if (game.margin > 14 * f && shift > 0.5) overratedCreated++;

    // Check if we fixed an underrated close game
    if (game.margin <= 7 * f && game.excitement < 6 && adjusted >= 6) underratedFixed++;

    // Check canonical games
    const canon = canonicalMap.get(String(game.id));
    if (canon && canon.dataQuality !== 'excluded') {
      const oldTier = getTier(game.excitement, game.sport);
      const newTier = getTier(adjusted, game.sport);
      const expectedTier = canon.expectedTier;

      const oldCorrect = oldTier.label.includes(expectedTier) ||
        (expectedTier === 'must-watch' && oldTier.cssClass === 'must-watch') ||
        (expectedTier === 'recommended' && oldTier.cssClass === 'recommended') ||
        (expectedTier === 'skip' && oldTier.cssClass === 'skip');
      const newCorrect = newTier.label.includes(expectedTier) ||
        (expectedTier === 'must-watch' && newTier.cssClass === 'must-watch') ||
        (expectedTier === 'recommended' && newTier.cssClass === 'recommended') ||
        (expectedTier === 'skip' && newTier.cssClass === 'skip');

      if (newCorrect) canonicalResults.pass++;
      else canonicalResults.fail++;

      if (!oldCorrect && newCorrect) canonicalResults.improved++;
      else if (oldCorrect && !newCorrect) canonicalResults.regressed++;
      else canonicalResults.unchanged++;
    }
  }

  const avgShift = totalShift / games.length;

  console.log(`\n  ${name}:`);
  console.log(`    Games affected: ${shiftCount}/${games.length} (${(shiftCount/games.length*100).toFixed(1)}%)`);
  console.log(`    Avg shift: ${avgShift >= 0 ? '+' : ''}${avgShift.toFixed(3)} | Max shift: ${maxShift.toFixed(2)}`);
  console.log(`    Underrated fixed: ${underratedFixed} | Overrated created: ${overratedCreated}`);
  console.log(`    Canonical: ${canonicalResults.pass} pass, ${canonicalResults.fail} fail | Improved: ${canonicalResults.improved} | Regressed: ${canonicalResults.regressed}`);

  return canonicalResults;
}

async function main() {
  const games = await loadAllGames();
  const canonical = await loadCanonical();
  console.log(`Loaded ${games.length} games, ${canonical.length} canonical\n`);

  // Compute per-sport regressions for approach C
  const regressions = {};
  for (const sport of ['NFL', 'CFB', 'NBA']) {
    const subset = games.filter(g => g.sport === sport);
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
    regressions[sport] = { a: meanS - (num/den)*meanM, b: num/den };
  }

  console.log('=== APPROACH COMPARISON ===');

  // Baseline
  evaluateApproach(games, canonical, 'BASELINE (no change)', g => g.excitement);

  // A: Score floors
  for (const [label, params] of [
    ['A1: Conservative floor (5.0/4.0/3.0)', { nailBiterFloor: 5.0, oneScoreFloor: 4.0, twoScoreFloor: 3.0 }],
    ['A2: Moderate floor (5.5/4.5/3.5)', { nailBiterFloor: 5.5, oneScoreFloor: 4.5, twoScoreFloor: 3.5 }],
    ['A3: Aggressive floor (6.0/5.0/4.0)', { nailBiterFloor: 6.0, oneScoreFloor: 5.0, twoScoreFloor: 4.0 }],
  ]) {
    evaluateApproach(games, canonical, label, g => approachA_scoreFloor(g, params));
  }

  // B: Component floors
  for (const [label, params] of [
    ['B1: Conservative component floors', {
      nailBiterTension: 4.0, nailBiterDrama: 4.0, nailBiterFinish: 4.0,
      oneScoreTension: 3.0, oneScoreDrama: 3.0, oneScoreFinish: 3.0
    }],
    ['B2: Drama-focused component floors', {
      nailBiterTension: 3.5, nailBiterDrama: 5.0, nailBiterFinish: 4.0,
      oneScoreTension: 2.5, oneScoreDrama: 4.0, oneScoreFinish: 3.0
    }],
  ]) {
    evaluateApproach(games, canonical, label, g => approachB_componentFloors(g, params));
  }

  // C: Residual correction
  for (const fraction of [0.3, 0.4, 0.5]) {
    evaluateApproach(games, canonical,
      `C: Residual correction (${(fraction*100).toFixed(0)}% gap closure)`,
      g => approachC_residualCorrection(g, regressions[g.sport], fraction)
    );
  }

  // D: ESPN overconfidence boost
  evaluateApproach(games, canonical,
    'D: Overconfidence boost (tension < 4, close games)',
    g => approachD_overconfidenceBoost(g, {
      maxMargin: 10,
      tensionThreshold: 4.0,
      expectedTensionByMargin: (m, f) => Math.max(3, 8 - m / (2 * f)),
      boostPerDeficitPoint: 0.4
    })
  );

  console.log('\n=== DONE ===\n');
}

main().catch(console.error);
