#!/usr/bin/env node

/**
 * Decision Point Adjustment Impact Test
 *
 * Compares algorithm accuracy with and without the v3.1 decision point adjustment.
 * This helps determine if the adjustment was compensating for truncated data
 * or addressing a real algorithmic need.
 *
 * Usage: node scripts/test-decision-point-impact.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllProbabilities } from '../api/calculator.js';
import { fetchSingleGame } from '../api/fetcher.js';
import { ALGORITHM_CONFIG } from '../shared/algorithm-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load canonical games
const canonicalPath = path.join(__dirname, '..', 'analysis', 'canonical-games.json');
const canonicalGames = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));

// Simplified algorithm that can toggle decision point adjustment
function calculateScore(probs, game, sport, useDecisionAdjustment) {
  if (probs.length < 10) return null;

  const probValues = probs.map(p => ({
    value: Math.max(0, Math.min(1, p.homeWinPercentage || 0.5)),
    period: p.period || 1
  }));

  // TENSION
  const bandLow = 0.30, bandHigh = 0.70;
  let totalCompetitive = 0;
  for (let i = 0; i < probValues.length; i++) {
    const inBand = probValues[i].value >= bandLow && probValues[i].value <= bandHigh ? 1 : 0;
    const timeWeight = 1 + (i / probValues.length) * 0.3;
    totalCompetitive += inBand * timeWeight;
  }
  const avgWeight = 1 + 0.15;
  const avgCompetitive = totalCompetitive / (probValues.length * avgWeight);
  const transformedCompetitive = 1 - Math.pow(1 - avgCompetitive, 1.3);
  let tensionScore = Math.min(10, transformedCompetitive * 10);

  // DRAMA
  let totalWeightedSwing = 0;
  for (let i = 1; i < probValues.length; i++) {
    const swing = Math.abs(probValues[i].value - probValues[i - 1].value);
    const rawLeverage = probValues[i - 1].value * (1 - probValues[i - 1].value);
    const leverage = Math.max(0.01, rawLeverage);
    const timeWeight = 1 + Math.pow(i / probValues.length, 2) * 0.5;
    totalWeightedSwing += swing * leverage * timeWeight * 4;
  }
  let dramaScore = Math.min(10, (Math.log(1 + totalWeightedSwing) / Math.log(1 + 18)) * 10);

  // FINISH
  const finalMoments = Math.min(10, probValues.length);
  const finalProbs = probValues.slice(-finalMoments);
  const preFinalWindow = probValues.slice(-finalMoments, -1);
  const minDistanceFrom50 = preFinalWindow.length > 0
    ? Math.min(...preFinalWindow.map(p => Math.abs(p.value - 0.5)))
    : 0.5;
  const finalCloseness = 1 - minDistanceFrom50 * 2;
  const closenessScore = 1.0 + Math.pow(Math.max(0, finalCloseness), 0.6) * 4.0;

  let maxFinalSwing = 0;
  for (let i = 1; i < finalProbs.length; i++) {
    const swing = Math.abs(finalProbs[i].value - finalProbs[i - 1].value);
    const crossedHalf = (finalProbs[i - 1].value - 0.5) * (finalProbs[i].value - 0.5) < 0;
    if (crossedHalf || (finalProbs[i - 1].value >= 0.35 && finalProbs[i - 1].value <= 0.65)) {
      maxFinalSwing = Math.max(maxFinalSwing, swing);
    }
  }
  const walkoffScore = maxFinalSwing >= 0.15 ? 1 + Math.min(2, (maxFinalSwing - 0.15) * 8) : 0;
  let finishScore = Math.min(10, (Math.log(1 + closenessScore + walkoffScore) / Math.log(1 + 12)) * 10);

  // Weighted combination
  const weights = ALGORITHM_CONFIG.weights;
  let rawScore = tensionScore * weights.tension + dramaScore * weights.drama + finishScore * weights.finish;

  // DECISION POINT ADJUSTMENT (optional)
  if (useDecisionAdjustment) {
    const decisionInfo = findDecisionPoint(probValues);
    const multiplier = Math.pow(decisionInfo.decisionLateness, 0.5);
    rawScore = rawScore * multiplier;
  }

  // Normalize
  const midpoint = 5, steepness = 2.5;
  const sigmoid = 1 / (1 + Math.exp(-(rawScore - midpoint) / steepness));
  const finalScore = 1 + 9 * sigmoid;

  return Math.round(finalScore * 10) / 10;
}

function findDecisionPoint(probs) {
  const bandLow = 0.25, bandHigh = 0.75;

  if (!probs || probs.length < 2) {
    return { decisionLateness: 1.0 };
  }

  const inBand = probs.map(p => p.value >= bandLow && p.value <= bandHigh);
  const wasEverCompetitive = inBand.some(b => b);

  if (!wasEverCompetitive) {
    return { decisionLateness: 0.0 };
  }

  const wasAlwaysCompetitive = inBand.every(b => b);
  if (wasAlwaysCompetitive) {
    return { decisionLateness: 1.0 };
  }

  let decisionPointIndex = probs.length - 1;
  for (let i = probs.length - 1; i >= 0; i--) {
    if (inBand[i]) {
      decisionPointIndex = i;
      break;
    }
  }

  const decisionLateness = probs.length > 1 ? decisionPointIndex / (probs.length - 1) : 1.0;
  return { decisionLateness };
}

function getTier(score) {
  if (score >= 8.0) return 'must-watch';
  if (score >= 6.0) return 'recommended';
  return 'skip';
}

async function evaluateGame(game, useDecisionAdjustment) {
  try {
    const items = await fetchAllProbabilities(game.gameId, game.sport);
    if (!items || items.length < 10) {
      return null;
    }

    const gameData = await fetchSingleGame(game.sport, game.gameId);
    const score = calculateScore(items, gameData, game.sport, useDecisionAdjustment);

    if (score === null) return null;

    const actualTier = getTier(score);
    const expectedTier = game.expectedTier;
    const pass = actualTier === expectedTier;

    return {
      gameId: game.gameId,
      label: game.label,
      sport: game.sport,
      expectedTier,
      score,
      actualTier,
      pass
    };
  } catch (error) {
    return null;
  }
}

async function runTest(useDecisionAdjustment) {
  const label = useDecisionAdjustment ? 'WITH' : 'WITHOUT';
  console.log(`\nTesting ${label} decision point adjustment...`);

  const results = [];
  for (const game of canonicalGames) {
    process.stdout.write('.');
    const result = await evaluateGame(game, useDecisionAdjustment);
    if (result) results.push(result);
    await new Promise(r => setTimeout(r, 100));
  }
  console.log(' Done');

  const passes = results.filter(r => r.pass).length;
  const total = results.length;
  const accuracy = (passes / total * 100).toFixed(1);

  // Group by expected tier
  const byTier = {};
  for (const tier of ['must-watch', 'recommended', 'skip']) {
    const tierGames = results.filter(r => r.expectedTier === tier);
    const tierPasses = tierGames.filter(r => r.pass).length;
    byTier[tier] = {
      total: tierGames.length,
      passes: tierPasses,
      accuracy: tierGames.length > 0 ? (tierPasses / tierGames.length * 100).toFixed(1) : 'N/A'
    };
  }

  return { label, results, passes, total, accuracy, byTier };
}

async function main() {
  console.log('='.repeat(80));
  console.log('DECISION POINT ADJUSTMENT IMPACT TEST');
  console.log('='.repeat(80));
  console.log(`Testing ${canonicalGames.length} canonical games`);

  const withAdjustment = await runTest(true);
  const withoutAdjustment = await runTest(false);

  console.log('\n' + '='.repeat(80));
  console.log('RESULTS COMPARISON');
  console.log('='.repeat(80));

  console.log(`\n${'Metric'.padEnd(30)} | ${'With Adj'.padEnd(12)} | ${'Without Adj'.padEnd(12)} | Delta`);
  console.log('-'.repeat(75));

  console.log(`${'Overall Accuracy'.padEnd(30)} | ${(withAdjustment.accuracy + '%').padEnd(12)} | ${(withoutAdjustment.accuracy + '%').padEnd(12)} | ${(parseFloat(withoutAdjustment.accuracy) - parseFloat(withAdjustment.accuracy)).toFixed(1)}%`);

  for (const tier of ['must-watch', 'recommended', 'skip']) {
    const with_ = withAdjustment.byTier[tier];
    const without_ = withoutAdjustment.byTier[tier];
    const delta = (parseFloat(without_.accuracy) - parseFloat(with_.accuracy)).toFixed(1);
    console.log(`${`  ${tier} (${with_.total} games)`.padEnd(30)} | ${(with_.accuracy + '%').padEnd(12)} | ${(without_.accuracy + '%').padEnd(12)} | ${delta}%`);
  }

  // Find games that changed
  console.log('\n' + '='.repeat(80));
  console.log('GAMES THAT CHANGED');
  console.log('='.repeat(80));

  const changedGames = [];
  for (const withResult of withAdjustment.results) {
    const withoutResult = withoutAdjustment.results.find(r => r.gameId === withResult.gameId);
    if (withoutResult && withResult.score !== withoutResult.score) {
      const scoreDelta = withoutResult.score - withResult.score;
      const tierChanged = withResult.actualTier !== withoutResult.actualTier;
      const passChanged = withResult.pass !== withoutResult.pass;

      if (Math.abs(scoreDelta) >= 0.5 || tierChanged || passChanged) {
        changedGames.push({
          label: withResult.label,
          expected: withResult.expectedTier,
          withScore: withResult.score,
          withTier: withResult.actualTier,
          withPass: withResult.pass,
          withoutScore: withoutResult.score,
          withoutTier: withoutResult.actualTier,
          withoutPass: withoutResult.pass,
          scoreDelta,
          tierChanged,
          passChanged
        });
      }
    }
  }

  // Sort by impact (games that changed pass/fail status first, then by score delta)
  changedGames.sort((a, b) => {
    if (a.passChanged !== b.passChanged) return a.passChanged ? -1 : 1;
    return Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta);
  });

  if (changedGames.length === 0) {
    console.log('\nNo significant changes found.');
  } else {
    console.log(`\n${changedGames.length} games with significant changes:\n`);
    console.log(`${'Game'.padEnd(45)} | Expected | With Adj | Without | Delta | Impact`);
    console.log('-'.repeat(95));

    for (const g of changedGames) {
      const impact = g.passChanged
        ? (g.withoutPass ? 'FIXED' : 'BROKE')
        : (g.tierChanged ? 'tier change' : 'score only');

      const withStatus = g.withPass ? '✓' : '✗';
      const withoutStatus = g.withoutPass ? '✓' : '✗';

      console.log(`${g.label.substring(0, 44).padEnd(45)} | ${g.expected.padEnd(8)} | ${g.withScore}${withStatus.padEnd(4)} | ${g.withoutScore}${withoutStatus.padEnd(5)} | ${g.scoreDelta >= 0 ? '+' : ''}${g.scoreDelta.toFixed(1).padEnd(5)} | ${impact}`);
    }
  }

  // Recommendation
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATION');
  console.log('='.repeat(80));

  const accDelta = parseFloat(withoutAdjustment.accuracy) - parseFloat(withAdjustment.accuracy);

  if (accDelta > 2) {
    console.log(`\n✓ Removing decision point adjustment IMPROVES accuracy by ${accDelta.toFixed(1)}%`);
    console.log('  The v3.1 changes appear to have been compensating for truncated data.');
    console.log('  Consider setting adjustmentMethod: "none" in algorithm-config.js');
  } else if (accDelta < -2) {
    console.log(`\n✗ Removing decision point adjustment DECREASES accuracy by ${Math.abs(accDelta).toFixed(1)}%`);
    console.log('  The v3.1 changes are addressing a real algorithmic need.');
    console.log('  Keep the current decision point adjustment.');
  } else {
    console.log(`\n≈ Decision point adjustment has MINIMAL impact (${accDelta >= 0 ? '+' : ''}${accDelta.toFixed(1)}% difference)`);
    console.log('  Consider removing it to simplify the algorithm.');
  }
}

main().catch(console.error);
