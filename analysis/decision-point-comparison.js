#!/usr/bin/env node

/**
 * Decision Point Comparison Analysis
 *
 * Compares current GEI scores with proposed decision point adjustments.
 * Tests how Option A (multiplier) and Option C (blend) affect scoring
 * across different game types.
 *
 * Usage: node analysis/decision-point-comparison.js [--all] [--sport=NFL|CFB|NBA]
 *
 * Options:
 *   --all        Test all canonical games (default: curated subset)
 *   --sport=X    Filter to specific sport
 *   --verbose    Show detailed win probability analysis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  findDecisionPoint,
  applyDecisionAdjustmentA,
  applyDecisionAdjustmentC
} from '../api/calculator.js';
import { ALGORITHM_CONFIG } from '../shared/algorithm-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const useAll = args.includes('--all');
const verbose = args.includes('--verbose');
const sportFilter = args.find(a => a.startsWith('--sport='))?.split('=')[1]?.toUpperCase();

// Curated test cases representing different game patterns
const CURATED_TEST_CASES = [
  // Classic must-watch games (should stay high)
  { gameId: '400927752', sport: 'NFL', label: 'Super Bowl LI: Patriots vs Falcons', expected: 'must-watch', pattern: 'comeback' },
  { gameId: '401326594', sport: 'NFL', label: 'Bills at Chiefs (13 seconds)', expected: 'must-watch', pattern: 'final-minute-drama' },
  { gameId: '401437904', sport: 'NFL', label: 'Colts at Vikings (33-pt comeback)', expected: 'must-watch', pattern: 'comeback' },
  { gameId: '401030972', sport: 'NFL', label: 'Chiefs at Rams (54-51)', expected: 'must-watch', pattern: 'back-and-forth' },
  { gameId: '400878160', sport: 'NBA', label: 'Finals G7: Cavs at Warriors', expected: 'must-watch', pattern: 'final-minute-drama' },
  { gameId: '401129105', sport: 'NBA', label: '76ers at Raptors (Kawhi buzzer)', expected: 'must-watch', pattern: 'final-play' },

  // Games that should drop (decided early but still had movement)
  { gameId: '401671735', sport: 'NFL', label: 'Buccaneers at Saints', expected: 'skip', pattern: 'early-blowout' },
  { gameId: '401704905', sport: 'NBA', label: 'Jazz at Trail Blazers', expected: 'skip', pattern: 'blowout' },
  { gameId: '401704933', sport: 'NBA', label: 'Knicks at Timberwolves', expected: 'skip', pattern: 'blowout' },
  { gameId: '401628390', sport: 'CFB', label: 'Texas at Oklahoma', expected: 'skip', pattern: 'blowout' },

  // Recommended games (mixed patterns)
  { gameId: '401671789', sport: 'NFL', label: 'Ravens at Chiefs (TNF)', expected: 'recommended', pattern: 'competitive' },
  { gameId: '401671622', sport: 'NFL', label: 'Broncos at Jets', expected: 'recommended', pattern: 'defensive' },
  { gameId: '401704973', sport: 'NBA', label: 'Christmas: 76ers at Celtics', expected: 'recommended', pattern: 'competitive' },
  { gameId: '401704977', sport: 'NBA', label: 'Heat at Magic', expected: 'recommended', pattern: 'defensive' },
  { gameId: '401677176', sport: 'CFB', label: 'Clemson at Texas', expected: 'recommended', pattern: 'pulled-away' },

  // Overtime games (should naturally capture decision at end)
  { gameId: '401437833', sport: 'NFL', label: 'Vikings at Bills (OT)', expected: 'must-watch', pattern: 'overtime' },
  { gameId: '401671626', sport: 'NFL', label: 'Ravens at Bengals (OT)', expected: 'must-watch', pattern: 'overtime' },
  { gameId: '401704685', sport: 'NBA', label: 'Celtics at Pacers (OT)', expected: 'must-watch', pattern: 'overtime' },
  { gameId: '401677182', sport: 'CFB', label: 'Texas at Arizona State (2OT)', expected: 'must-watch', pattern: 'overtime' },
];

async function fetchProbabilities(gameId, sport) {
  let sportType, league;
  if (sport === 'NBA') {
    sportType = 'basketball';
    league = 'nba';
  } else {
    sportType = 'football';
    league = sport === 'CFB' ? 'college-football' : 'nfl';
  }

  const probUrl = `https://sports.core.api.espn.com/v2/sports/${sportType}/leagues/${league}/events/${gameId}/competitions/${gameId}/probabilities?limit=300`;

  try {
    const response = await fetch(probUrl);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.items || data.items.length < 10) return null;

    return data.items.map(p => ({
      value: Math.max(0, Math.min(1, p.homeWinPercentage || 0.5)),
      period: p.period || 1,
      clock: p.clock
    }));
  } catch (error) {
    console.error(`Error fetching ${gameId}:`, error.message);
    return null;
  }
}

function calculateCurrentScore(probs) {
  // Simplified calculation matching the main algorithm structure
  const bandLow = 0.30;
  const bandHigh = 0.70;

  // Tension
  let totalCompetitive = 0;
  for (let i = 0; i < probs.length; i++) {
    const inBand = probs[i].value >= bandLow && probs[i].value <= bandHigh ? 1 : 0;
    const timeWeight = 1 + (i / probs.length) * 0.3;
    totalCompetitive += inBand * timeWeight;
  }
  const avgWeight = 1 + 0.15;
  const avgCompetitive = totalCompetitive / (probs.length * avgWeight);
  const transformedCompetitive = 1 - Math.pow(1 - avgCompetitive, 1.3);
  const tensionScore = Math.min(10, transformedCompetitive * 10);

  // Drama (simplified)
  let totalWeightedSwing = 0;
  for (let i = 1; i < probs.length; i++) {
    const swing = Math.abs(probs[i].value - probs[i - 1].value);
    const rawLeverage = probs[i - 1].value * (1 - probs[i - 1].value);
    const leverage = Math.max(0.01, rawLeverage);
    const timeWeight = 1 + Math.pow(i / probs.length, 2) * 0.5;
    totalWeightedSwing += swing * leverage * timeWeight * 4;
  }
  const dramaScore = Math.min(10, (Math.log(1 + totalWeightedSwing) / Math.log(1 + 18)) * 10);

  // Finish (simplified)
  const finalMoments = Math.min(10, probs.length);
  const finalProbs = probs.slice(-finalMoments);
  const preFinalWindow = probs.slice(-finalMoments, -1);
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
  let walkoffScore = maxFinalSwing >= 0.15 ? 1 + Math.min(2, (maxFinalSwing - 0.15) * 8) : 0;
  const finishScore = Math.min(10, (Math.log(1 + closenessScore + walkoffScore) / Math.log(1 + 12)) * 10);

  // Weighted combination
  const weights = ALGORITHM_CONFIG.weights;
  const rawScore = tensionScore * weights.tension + dramaScore * weights.drama + finishScore * weights.finish;

  // Normalize
  const midpoint = 5;
  const steepness = 2.5;
  const sigmoid = 1 / (1 + Math.exp(-(rawScore - midpoint) / steepness));
  const finalScore = 1 + 9 * sigmoid;

  return {
    rawScore,
    finalScore: Math.round(finalScore * 10) / 10,
    breakdown: {
      tension: Math.round(tensionScore * 100) / 100,
      drama: Math.round(dramaScore * 100) / 100,
      finish: Math.round(finishScore * 100) / 100
    }
  };
}

function getTier(score) {
  if (score >= 8.0) return 'must-watch';
  if (score >= 6.0) return 'recommended';
  return 'skip';
}

function formatLateness(lateness) {
  return `${Math.round(lateness * 100)}%`;
}

function analyzeGamePattern(probs, decisionInfo) {
  // Determine game pattern based on probability curve
  const firstQuarter = probs.slice(0, Math.floor(probs.length * 0.25));
  const secondHalf = probs.slice(Math.floor(probs.length * 0.5));
  const finalQuarter = probs.slice(Math.floor(probs.length * 0.75));

  const avgFirst = firstQuarter.reduce((s, p) => s + p.value, 0) / firstQuarter.length;
  const avgSecondHalf = secondHalf.reduce((s, p) => s + p.value, 0) / secondHalf.length;
  const avgFinal = finalQuarter.reduce((s, p) => s + p.value, 0) / finalQuarter.length;

  // Count crossings of 0.5
  let crossings = 0;
  for (let i = 1; i < probs.length; i++) {
    if ((probs[i - 1].value - 0.5) * (probs[i].value - 0.5) < 0) crossings++;
  }

  // Check for extreme values
  const reachedExtreme = probs.some(p => p.value < 0.15 || p.value > 0.85);
  const endedExtreme = probs[probs.length - 1].value < 0.15 || probs[probs.length - 1].value > 0.85;

  return {
    crossings,
    reachedExtreme,
    endedExtreme,
    avgFirst: Math.round(avgFirst * 100) / 100,
    avgSecondHalf: Math.round(avgSecondHalf * 100) / 100,
    avgFinal: Math.round(avgFinal * 100) / 100
  };
}

async function analyzeGame(testCase) {
  const probs = await fetchProbabilities(testCase.gameId, testCase.sport);
  if (!probs) {
    return { ...testCase, error: 'No data' };
  }

  const currentScore = calculateCurrentScore(probs);
  const decisionInfo = findDecisionPoint(probs);

  // Calculate Option A and C adjustments
  const optionA = applyDecisionAdjustmentA(currentScore.rawScore, probs);
  const optionC = applyDecisionAdjustmentC(currentScore.rawScore, probs);

  // Normalize the adjusted scores
  const normalizeAdjusted = (rawScore) => {
    const midpoint = 5;
    const steepness = 2.5;
    const sigmoid = 1 / (1 + Math.exp(-(rawScore - midpoint) / steepness));
    return Math.round((1 + 9 * sigmoid) * 10) / 10;
  };

  const scoreA = normalizeAdjusted(optionA.adjustedScore);
  const scoreC = normalizeAdjusted(optionC.adjustedScore);

  const pattern = analyzeGamePattern(probs, decisionInfo);

  return {
    ...testCase,
    dataPoints: probs.length,
    currentScore: currentScore.finalScore,
    currentTier: getTier(currentScore.finalScore),
    rawScore: Math.round(currentScore.rawScore * 100) / 100,
    breakdown: currentScore.breakdown,
    decisionLateness: decisionInfo.decisionLateness,
    decisionIndex: decisionInfo.decisionPointIndex,
    wasEverCompetitive: decisionInfo.wasEverCompetitive,
    wasAlwaysCompetitive: decisionInfo.wasAlwaysCompetitive,
    scoreA,
    tierA: getTier(scoreA),
    scoreC,
    tierC: getTier(scoreC),
    deltaA: Math.round((scoreA - currentScore.finalScore) * 10) / 10,
    deltaC: Math.round((scoreC - currentScore.finalScore) * 10) / 10,
    pattern
  };
}

async function main() {
  console.log('='.repeat(100));
  console.log('DECISION POINT ADJUSTMENT COMPARISON ANALYSIS');
  console.log('='.repeat(100));
  console.log();
  console.log(`Config: competitive band = ${ALGORITHM_CONFIG.thresholds.decisionPoint?.competitiveBandLow ?? 0.25}-${ALGORITHM_CONFIG.thresholds.decisionPoint?.competitiveBandHigh ?? 0.75}`);
  console.log(`Option A: multiplier exponent = ${ALGORITHM_CONFIG.thresholds.decisionPoint?.multiplierExponent ?? 0.5}`);
  console.log(`Option C: lateness weight = ${ALGORITHM_CONFIG.thresholds.decisionPoint?.blendWeightLateness ?? 0.6}`);
  console.log();

  let testCases;
  if (useAll) {
    const canonicalPath = path.join(__dirname, 'canonical-games.json');
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
    testCases = canonical.map(g => ({
      gameId: g.gameId,
      sport: g.sport,
      label: g.label,
      expected: g.expectedTier,
      pattern: 'canonical'
    }));
  } else {
    testCases = CURATED_TEST_CASES;
  }

  if (sportFilter) {
    testCases = testCases.filter(t => t.sport === sportFilter);
    console.log(`Filtered to ${sportFilter}: ${testCases.length} games`);
  }

  console.log(`Analyzing ${testCases.length} games...`);
  console.log();

  const results = [];
  for (const testCase of testCases) {
    process.stdout.write(`  ${testCase.label.substring(0, 40).padEnd(40)} `);
    const result = await analyzeGame(testCase);
    results.push(result);

    if (result.error) {
      console.log('ERROR');
    } else {
      console.log(`Done (lateness: ${formatLateness(result.decisionLateness)})`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  // Output results table
  console.log();
  console.log('='.repeat(100));
  console.log('RESULTS');
  console.log('='.repeat(100));
  console.log();

  // Header
  const header = [
    'Game'.padEnd(42),
    'Sport',
    'Expected',
    'Current',
    'Lateness',
    'Opt A',
    '(Delta)',
    'Opt C',
    '(Delta)'
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  // Sort by delta (biggest drops first)
  const validResults = results.filter(r => !r.error);
  validResults.sort((a, b) => a.deltaA - b.deltaA);

  for (const r of validResults) {
    const tierMatch = (tier) => tier === r.expected ? '*' : ' ';
    const row = [
      r.label.substring(0, 42).padEnd(42),
      r.sport.padEnd(5),
      r.expected.padEnd(8),
      `${r.currentScore.toFixed(1)}${tierMatch(r.currentTier)}`.padEnd(7),
      formatLateness(r.decisionLateness).padEnd(8),
      `${r.scoreA.toFixed(1)}${tierMatch(r.tierA)}`.padEnd(5),
      `(${r.deltaA >= 0 ? '+' : ''}${r.deltaA.toFixed(1)})`.padEnd(7),
      `${r.scoreC.toFixed(1)}${tierMatch(r.tierC)}`.padEnd(5),
      `(${r.deltaC >= 0 ? '+' : ''}${r.deltaC.toFixed(1)})`
    ].join(' | ');
    console.log(row);
  }

  // Summary statistics
  console.log();
  console.log('='.repeat(100));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(100));
  console.log();

  const mustWatch = validResults.filter(r => r.expected === 'must-watch');
  const recommended = validResults.filter(r => r.expected === 'recommended');
  const skip = validResults.filter(r => r.expected === 'skip');

  const avgDelta = (arr, key) => arr.length > 0
    ? arr.reduce((s, r) => s + r[key], 0) / arr.length
    : 0;

  console.log('Average Delta by Expected Tier:');
  console.log(`  Must-Watch (${mustWatch.length} games): Option A = ${avgDelta(mustWatch, 'deltaA').toFixed(2)}, Option C = ${avgDelta(mustWatch, 'deltaC').toFixed(2)}`);
  console.log(`  Recommended (${recommended.length} games): Option A = ${avgDelta(recommended, 'deltaA').toFixed(2)}, Option C = ${avgDelta(recommended, 'deltaC').toFixed(2)}`);
  console.log(`  Skip (${skip.length} games): Option A = ${avgDelta(skip, 'deltaA').toFixed(2)}, Option C = ${avgDelta(skip, 'deltaC').toFixed(2)}`);
  console.log();

  // Tier accuracy
  const tierAccuracy = (arr, method) => {
    const key = method === 'current' ? 'currentTier' : `tier${method}`;
    return arr.filter(r => r[key] === r.expected).length / arr.length * 100;
  };

  console.log('Tier Classification Accuracy:');
  console.log(`  Current: ${tierAccuracy(validResults, 'current').toFixed(1)}%`);
  console.log(`  Option A: ${tierAccuracy(validResults, 'A').toFixed(1)}%`);
  console.log(`  Option C: ${tierAccuracy(validResults, 'C').toFixed(1)}%`);
  console.log();

  // Key findings
  console.log('KEY FINDINGS:');
  console.log();

  // Games with biggest drops
  const bigDropsA = validResults.filter(r => r.deltaA <= -1.0);
  if (bigDropsA.length > 0) {
    console.log('Games with significant drops (Option A, -1.0 or more):');
    for (const r of bigDropsA.slice(0, 5)) {
      console.log(`  ${r.label}: ${r.currentScore} -> ${r.scoreA} (lateness: ${formatLateness(r.decisionLateness)})`);
    }
    console.log();
  }

  // Must-watch games that stayed high
  const stableMusts = mustWatch.filter(r => r.deltaA >= -0.5);
  if (stableMusts.length > 0) {
    console.log('Must-watch games that remained stable (Option A):');
    for (const r of stableMusts.slice(0, 5)) {
      console.log(`  ${r.label}: ${r.currentScore} -> ${r.scoreA} (lateness: ${formatLateness(r.decisionLateness)})`);
    }
    console.log();
  }

  // Skip games that appropriately dropped
  const goodDrops = skip.filter(r => r.deltaA < -0.5 || r.deltaC < -0.5);
  if (goodDrops.length > 0) {
    console.log('Skip-tier games appropriately penalized:');
    for (const r of goodDrops) {
      console.log(`  ${r.label}: ${r.currentScore} -> A:${r.scoreA} / C:${r.scoreC} (lateness: ${formatLateness(r.decisionLateness)})`);
    }
    console.log();
  }

  // Verbose output
  if (verbose) {
    console.log();
    console.log('='.repeat(100));
    console.log('DETAILED ANALYSIS');
    console.log('='.repeat(100));

    for (const r of validResults) {
      console.log();
      console.log(`--- ${r.label} (${r.sport}) ---`);
      console.log(`Data points: ${r.dataPoints}`);
      console.log(`Expected: ${r.expected}`);
      console.log(`Current: ${r.currentScore} (${r.currentTier})`);
      console.log(`Raw score: ${r.rawScore}`);
      console.log(`Breakdown: T=${r.breakdown.tension}, D=${r.breakdown.drama}, F=${r.breakdown.finish}`);
      console.log();
      console.log(`Decision Point: index ${r.decisionIndex}/${r.dataPoints - 1} (${formatLateness(r.decisionLateness)})`);
      console.log(`Was competitive: ${r.wasEverCompetitive ? 'Yes' : 'No'}`);
      console.log(`Always competitive: ${r.wasAlwaysCompetitive ? 'Yes' : 'No'}`);
      console.log();
      console.log(`Option A: ${r.scoreA} (${r.tierA}), delta = ${r.deltaA >= 0 ? '+' : ''}${r.deltaA}`);
      console.log(`Option C: ${r.scoreC} (${r.tierC}), delta = ${r.deltaC >= 0 ? '+' : ''}${r.deltaC}`);
      console.log();
      console.log(`Pattern analysis:`);
      console.log(`  Lead changes: ${r.pattern.crossings}`);
      console.log(`  Reached extreme: ${r.pattern.reachedExtreme ? 'Yes' : 'No'}`);
      console.log(`  Ended extreme: ${r.pattern.endedExtreme ? 'Yes' : 'No'}`);
      console.log(`  Avg 1st quarter: ${r.pattern.avgFirst}`);
      console.log(`  Avg 2nd half: ${r.pattern.avgSecondHalf}`);
      console.log(`  Avg final quarter: ${r.pattern.avgFinal}`);
    }
  }
}

main().catch(console.error);
