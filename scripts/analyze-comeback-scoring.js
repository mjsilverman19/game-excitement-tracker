#!/usr/bin/env node

/**
 * Comeback Scoring Diagnostic Script
 *
 * Analyzes how comeback detection and scoring works for specific games.
 * Task 2: Verify and enhance comeback detection
 */

import { analyzeGameEntertainmentDetailed, fetchAllProbabilities } from '../api/calculator.js';
import { ALGORITHM_CONFIG } from '../shared/algorithm-config.js';

async function analyzeComebackScoring(gameId, sport = 'CFB') {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Comeback Analysis for Game ${gameId} (${sport})`);
  console.log(`${'='.repeat(70)}\n`);

  // Fetch probabilities
  const probs = await fetchAllProbabilities(gameId, sport);
  if (!probs || probs.length < 10) {
    console.log('ERROR: No probability data available');
    return;
  }

  // Get detailed analysis
  const result = await analyzeGameEntertainmentDetailed({ id: gameId }, sport);
  if (!result) {
    console.log('ERROR: Analysis returned null');
    return;
  }

  // Calculate comeback magnitude manually for detailed output
  const finalWP = probs[probs.length - 1].homeWinPercentage;
  const homeWon = finalWP > 0.5;

  let maxDeficit = 0;
  let maxDeficitIndex = 0;
  let maxDeficitWP = 0.5;

  for (let i = 0; i < probs.length; i++) {
    const wp = probs[i].homeWinPercentage;
    let deficit = 0;
    if (homeWon && wp < 0.5) deficit = 0.5 - wp;
    else if (!homeWon && wp > 0.5) deficit = wp - 0.5;

    if (deficit > maxDeficit) {
      maxDeficit = deficit;
      maxDeficitIndex = i;
      maxDeficitWP = wp;
    }
  }

  const comebackLateness = maxDeficitIndex / probs.length;
  const comebackMagnitude = maxDeficit * 2; // Convert to percentage (0-100% scale)

  // Calculate time in competitive band
  const bandLow = ALGORITHM_CONFIG.thresholds.competitiveBand.low;
  const bandHigh = ALGORITHM_CONFIG.thresholds.competitiveBand.high;
  let inBandCount = 0;
  for (const p of probs) {
    if (p.homeWinPercentage >= bandLow && p.homeWinPercentage <= bandHigh) {
      inBandCount++;
    }
  }
  const bandTimePercent = (inBandCount / probs.length) * 100;

  // Count lead changes
  let leadChanges = 0;
  for (let i = 1; i < probs.length; i++) {
    const prev = probs[i - 1].homeWinPercentage;
    const curr = probs[i].homeWinPercentage;
    if ((prev - 0.5) * (curr - 0.5) < 0) {
      leadChanges++;
    }
  }

  // Output analysis
  console.log('GAME SUMMARY:');
  console.log(`  Data points: ${probs.length}`);
  console.log(`  Winner: ${homeWon ? 'Home' : 'Away'} (final WP: ${(finalWP * 100).toFixed(1)}%)`);
  console.log(`  Lead changes: ${leadChanges}`);
  console.log(`  Time in competitive band (30-70%): ${bandTimePercent.toFixed(1)}%`);
  console.log();

  console.log('COMEBACK ANALYSIS:');
  console.log(`  Max deficit overcome: ${(comebackMagnitude * 100).toFixed(1)}%`);
  console.log(`  At deficit trough: Winner had ${homeWon ? (maxDeficitWP * 100).toFixed(1) : ((1 - maxDeficitWP) * 100).toFixed(1)}% win probability`);
  console.log(`  Deficit trough occurred at: ${(comebackLateness * 100).toFixed(1)}% through game`);
  console.log();

  console.log('COMEBACK CONFIG THRESHOLDS (from algorithm-config.js):');
  console.log('  Drama boost thresholds:');
  console.log(`    minDeficit: ${ALGORITHM_CONFIG.thresholds.comeback.minDeficit} (${(ALGORITHM_CONFIG.thresholds.comeback.minDeficit * 2 * 100).toFixed(0)}% deficit)`);
  console.log(`    tier1: ${ALGORITHM_CONFIG.thresholds.comeback.tier1} (${(ALGORITHM_CONFIG.thresholds.comeback.tier1 * 2 * 100).toFixed(0)}% deficit)`);
  console.log(`    tier2: ${ALGORITHM_CONFIG.thresholds.comeback.tier2} (${(ALGORITHM_CONFIG.thresholds.comeback.tier2 * 2 * 100).toFixed(0)}% deficit)`);
  console.log(`    maxBoost: ${ALGORITHM_CONFIG.thresholds.comeback.maxBoost}`);
  console.log('  Bonus thresholds:');
  console.log(`    minDeficit: ${ALGORITHM_CONFIG.bonuses.comeback.minDeficit} (${(ALGORITHM_CONFIG.bonuses.comeback.minDeficit * 2 * 100).toFixed(0)}% deficit)`);
  console.log(`    tier1: ${ALGORITHM_CONFIG.bonuses.comeback.tier1} (${(ALGORITHM_CONFIG.bonuses.comeback.tier1 * 2 * 100).toFixed(0)}% deficit)`);
  console.log(`    tier2: ${ALGORITHM_CONFIG.bonuses.comeback.tier2} (${(ALGORITHM_CONFIG.bonuses.comeback.tier2 * 2 * 100).toFixed(0)}% deficit)`);
  console.log(`    max: ${ALGORITHM_CONFIG.bonuses.comeback.max}`);
  console.log();

  // Calculate expected comeback boosts
  const thresholds = ALGORITHM_CONFIG.thresholds.comeback;
  const bonuses = ALGORITHM_CONFIG.bonuses.comeback;

  // Drama boost calculation
  let expectedDramaBoost = 0;
  if (maxDeficit >= thresholds.minDeficit) {
    if (maxDeficit < thresholds.tier1) {
      expectedDramaBoost = ((maxDeficit - thresholds.minDeficit) / (thresholds.tier1 - thresholds.minDeficit)) * 1;
    } else if (maxDeficit < thresholds.tier2) {
      expectedDramaBoost = 1 + ((maxDeficit - thresholds.tier1) / (thresholds.tier2 - thresholds.tier1)) * 1.5;
    } else {
      expectedDramaBoost = Math.min(thresholds.maxBoost, 2.5 + ((maxDeficit - thresholds.tier2) / 0.10) * 1.5);
    }
    // Apply time multiplier
    const timeMin = thresholds.timeMultiplier.min;
    const timeMax = thresholds.timeMultiplier.max;
    const timeMultiplier = timeMin + (timeMax - timeMin) * comebackLateness;
    expectedDramaBoost *= timeMultiplier;
  }

  // Bonus calculation
  let expectedBonus = 0;
  if (maxDeficit >= bonuses.minDeficit) {
    if (maxDeficit < bonuses.tier1) {
      expectedBonus = ((maxDeficit - bonuses.minDeficit) / (bonuses.tier1 - bonuses.minDeficit)) * 0.5;
    } else if (maxDeficit < bonuses.tier2) {
      expectedBonus = 0.5 + ((maxDeficit - bonuses.tier1) / (bonuses.tier2 - bonuses.tier1)) * 0.7;
    } else {
      expectedBonus = Math.min(bonuses.max, 1.2 + ((maxDeficit - bonuses.tier2) / 0.04) * 0.8);
    }
  }

  console.log('EXPECTED COMEBACK CONTRIBUTIONS:');
  console.log(`  Comeback drama boost: +${expectedDramaBoost.toFixed(2)} to drama score`);
  console.log(`  Comeback bonus: ${expectedBonus.toFixed(2)} (multiplicative, converted to ${(expectedBonus / 10 * 100).toFixed(1)}% boost)`);
  console.log();

  console.log('ACTUAL SCORE BREAKDOWN:');
  console.log(`  Tension score: ${result.tensionScore?.toFixed(2) ?? 'N/A'}`);
  console.log(`  Drama score: ${result.dramaScore?.toFixed(2) ?? 'N/A'}`);
  console.log(`  Finish score: ${result.finishScore?.toFixed(2) ?? 'N/A'}`);
  console.log(`  Raw score (before normalization): ${result.rawScore?.toFixed(2) ?? 'N/A'}`);
  console.log(`  FINAL SCORE: ${result.score}`);
  console.log();

  // Check if comeback is being properly credited
  console.log('ASSESSMENT:');
  if (comebackMagnitude >= 0.30) {
    console.log(`  ✓ Significant comeback detected (${(comebackMagnitude * 100).toFixed(1)}% >= 30%)`);
    if (result.score >= 8.0) {
      console.log(`  ✓ Score reflects comeback entertainment value (${result.score} >= 8.0)`);
    } else {
      console.log(`  ✗ Score may not fully reflect comeback (${result.score} < 8.0)`);
    }
  } else if (comebackMagnitude >= 0.20) {
    console.log(`  ~ Moderate comeback detected (${(comebackMagnitude * 100).toFixed(1)}%)`);
  } else {
    console.log(`  - No significant comeback detected (${(comebackMagnitude * 100).toFixed(1)}% < 20%)`);
  }

  // Check tension vs comeback tradeoff
  if (bandTimePercent < 30 && comebackMagnitude >= 0.30) {
    console.log(`  NOTE: Low band time (${bandTimePercent.toFixed(1)}%) but large comeback (${(comebackMagnitude * 100).toFixed(1)}%)`);
    console.log(`        This tests the "comeback overrides tension" principle.`);
  }

  console.log(`\n${'='.repeat(70)}\n`);
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  // Default: analyze Iowa State at Iowa (the case study from the task)
  console.log('Usage: node scripts/analyze-comeback-scoring.js <gameId> [sport]');
  console.log('');
  console.log('Running default analysis on Iowa State at Iowa (401628464)...');
  await analyzeComebackScoring('401628464', 'CFB');

  // Also analyze Super Bowl LI for comparison
  console.log('\nAlso analyzing Super Bowl LI (400927752) for comparison...');
  await analyzeComebackScoring('400927752', 'NFL');
} else {
  const gameId = args[0];
  const sport = args[1] || 'NFL';
  await analyzeComebackScoring(gameId, sport);
}
