#!/usr/bin/env node

/**
 * Purpose: Show full score calculation breakdown for a single game.
 * Usage: node scripts/debug-score-calculation.js <gameId> [sport]
 * Output: Console report of component scores, weights, and raw/normalized totals.
 */

import { ALGORITHM_CONFIG } from '../shared/algorithm-config.js';

const gameId = process.argv[2];
const sport = process.argv[3] || 'NFL';

if (!gameId) {
  console.error('Usage: node scripts/debug-score-calculation.js <gameId> [sport]');
  process.exit(1);
}

let sportType, league;
if (sport === 'NBA') {
  sportType = 'basketball';
  league = 'nba';
} else {
  sportType = 'football';
  league = sport === 'CFB' ? 'college-football' : 'nfl';
}

const probUrl = `https://sports.core.api.espn.com/v2/sports/${sportType}/leagues/${league}/events/${gameId}/competitions/${gameId}/probabilities?limit=1000`;

async function main() {
  const response = await fetch(probUrl);
  const data = await response.json();
  const items = data.items || [];
  
  if (items.length < 10) {
    console.error('Not enough data points');
    process.exit(1);
  }
  
  const probs = items.map(p => ({
    value: Math.max(0, Math.min(1, p.homeWinPercentage || 0.5)),
    period: p.period || 1
  }));
  
  console.log(`=== GAME ${gameId} (${sport}) ===`);
  console.log(`Data points: ${probs.length}\n`);
  
  // Calculate each component
  const tension = calculateTension(probs);
  const baseDrama = calculateMomentumDrama(probs);
  const leadChangeBoost = calculateLeadChangeBoost(probs);
  const finish = calculateFinishQuality(probs);
  
  console.log('=== COMPONENT SCORES (0-10 scale) ===');
  console.log(`Tension: ${tension.toFixed(2)}`);
  console.log();
  console.log(`Base Drama: ${baseDrama.toFixed(2)}`);
  console.log(`Lead Change Boost: +${leadChangeBoost.toFixed(2)}`);
  console.log(`Total Drama: ${Math.min(10, baseDrama + leadChangeBoost).toFixed(2)}`);
  console.log();
  console.log(`Finish Quality: ${finish.toFixed(2)}`);
  
  // Calculate weighted base
  const weights = ALGORITHM_CONFIG.weights;
  const dramaScore = Math.min(10, baseDrama + leadChangeBoost);
  
  const weightedBase = 
    tension * weights.tension +
    dramaScore * weights.drama +
    finish * weights.finish;
  
  console.log(`\n=== WEIGHTED BASE ===`);
  console.log(`Tension (${weights.tension * 100}%): ${tension.toFixed(2)} × ${weights.tension} = ${(tension * weights.tension).toFixed(2)}`);
  console.log(`Drama (${weights.drama * 100}%): ${dramaScore.toFixed(2)} × ${weights.drama} = ${(dramaScore * weights.drama).toFixed(2)}`);
  console.log(`Finish (${weights.finish * 100}%): ${finish.toFixed(2)} × ${weights.finish} = ${(finish * weights.finish).toFixed(2)}`);
  console.log(`Weighted Base: ${weightedBase.toFixed(2)}`);
  
  // Calculate bonuses
  const upsetBonus = calculateUpsetBonus(probs);
  const comebackBonus = calculateComebackBonus(probs);
  const volatilityBonus = calculateVolatilityBonus(probs);
  
  console.log(`\n=== BONUSES ===`);
  console.log(`Upset Bonus: +${upsetBonus.toFixed(2)}`);
  console.log(`Comeback Bonus: +${comebackBonus.toFixed(2)}`);
  console.log(`Volatility Bonus: +${volatilityBonus.toFixed(2)}`);
  // Note: OT and close game bonuses need game object, skipped here
  
  const rawScore = weightedBase + upsetBonus + comebackBonus + volatilityBonus;
  console.log(`\n=== RAW SCORE (pre-normalization) ===`);
  console.log(`Raw: ${rawScore.toFixed(2)}`);
  
  const normalized = normalizeScore(rawScore);
  console.log(`\n=== FINAL SCORE ===`);
  console.log(`Normalized: ${normalized.toFixed(1)}`);
}

// Copy of algorithm functions for testing
function calculateTension(probs) {
  if (probs.length < 10) return 5;
  
  // Base tension from closeness
  let totalCloseness = 0;
  for (let i = 0; i < probs.length; i++) {
    const closeness = 1 - Math.abs(probs[i].value - 0.5) * 2;
    const timeWeight = 1 + (i / probs.length) * 0.3;
    totalCloseness += closeness * timeWeight;
  }
  const avgWeight = 1 + 0.15;
  const avgCloseness = totalCloseness / (probs.length * avgWeight);
  const transformedCloseness = 1 - Math.pow(1 - avgCloseness, 1.3);
  const baseTension = transformedCloseness * 10;
  
  // Comeback boost
  const finalWP = probs[probs.length - 1].value;
  const homeWon = finalWP > 0.5;
  let maxDeficit = 0;
  let maxDeficitIndex = 0;
  for (let i = 0; i < probs.length; i++) {
    const wp = probs[i].value;
    let deficit = 0;
    if (homeWon && wp < 0.5) deficit = 0.5 - wp;
    else if (!homeWon && wp > 0.5) deficit = wp - 0.5;
    if (deficit > maxDeficit) {
      maxDeficit = deficit;
      maxDeficitIndex = i;
    }
  }
  
  let comebackBoost = 0;
  if (maxDeficit >= 0.15) {
    if (maxDeficit < 0.30) comebackBoost = ((maxDeficit - 0.15) / 0.15) * 1;
    else if (maxDeficit < 0.40) comebackBoost = 1 + ((maxDeficit - 0.30) / 0.10) * 1.5;
    else comebackBoost = Math.min(4, 2.5 + ((maxDeficit - 0.40) / 0.10) * 1.5);
    const gameProgress = maxDeficitIndex / probs.length;
    const timeMultiplier = 0.5 + 0.5 * gameProgress;
    comebackBoost *= timeMultiplier;
  }
  
  return Math.min(10, baseTension + comebackBoost);
}

function calculateMomentumDrama(probs) {
  if (probs.length < 2) return 0;
  let totalWeightedSwing = 0;
  for (let i = 1; i < probs.length; i++) {
    const swing = Math.abs(probs[i].value - probs[i - 1].value);
    const rawLeverage = probs[i - 1].value * (1 - probs[i - 1].value);
    const leverage = Math.max(0.05, rawLeverage);
    totalWeightedSwing += swing * leverage * 4;
  }
  return Math.min(10, (Math.log(1 + totalWeightedSwing) / Math.log(1 + 8)) * 10);
}

function calculateLeadChangeBoost(probs) {
  let leadChanges = 0;
  for (let i = 1; i < probs.length; i++) {
    const prev = probs[i - 1].value;
    const curr = probs[i].value;
    if ((prev - 0.5) * (curr - 0.5) < 0) {
      leadChanges++;
    }
  }
  if (leadChanges < 5) return 0;
  if (leadChanges < 8) return 0.3;
  if (leadChanges < 11) return 0.6;
  return 1.0;
}

function calculateFinishQuality(probs) {
  const finalMoments = Math.min(10, probs.length);
  const finalProbs = probs.slice(-finalMoments);
  const lastProb = probs[probs.length - 1].value;
  
  const preFinalWindow = probs.slice(-finalMoments, -1);
  const minDistanceFrom50 = preFinalWindow.length > 0
    ? Math.min(...preFinalWindow.map(p => Math.abs(p.value - 0.5)))
    : Math.abs(lastProb - 0.5);
  const finalCloseness = 1 - minDistanceFrom50 * 2;
  const closenessScore = Math.pow(Math.max(0, finalCloseness), 0.7) * 4;
  
  const finalPeriodSize = Math.max(2, Math.floor(probs.length * 0.25));
  const finalPeriod = probs.slice(-finalPeriodSize);
  let finalPeriodMovement = 0;
  for (let i = 1; i < finalPeriod.length; i++) {
    const swing = Math.abs(finalPeriod[i].value - finalPeriod[i - 1].value);
    const leverage = finalPeriod[i - 1].value * (1 - finalPeriod[i - 1].value);
    finalPeriodMovement += swing * leverage * 4;
  }
  const volatilityScore = Math.min(4, finalPeriodMovement * 4);
  
  let maxFinalSwing = 0;
  for (let i = 1; i < finalProbs.length; i++) {
    const startValue = finalProbs[i - 1].value;
    const endValue = finalProbs[i].value;
    const swing = Math.abs(endValue - startValue);
    const crossedHalf = (startValue - 0.5) * (endValue - 0.5) < 0;
    const startedCompetitive = startValue >= 0.4 && startValue <= 0.6;
    if (crossedHalf || startedCompetitive) {
      maxFinalSwing = Math.max(maxFinalSwing, swing);
    }
  }
  let walkoffScore = 0;
  if (maxFinalSwing >= 0.15) {
    walkoffScore = 2 + Math.min(2, (maxFinalSwing - 0.15) * 10);
  }
  
  const lateDramaWindow = probs.slice(-5);
  let maxLateDramaSwing = 0;
  for (let i = 1; i < lateDramaWindow.length; i++) {
    const swing = Math.abs(lateDramaWindow[i].value - lateDramaWindow[i - 1].value);
    maxLateDramaSwing = Math.max(maxLateDramaSwing, swing);
  }
  let lateDramaScore = 0;
  if (maxLateDramaSwing >= 0.20) {
    lateDramaScore = Math.min(2, (maxLateDramaSwing - 0.15) * 8);
  }
  
  return Math.min(10, Math.max(0, (closenessScore + volatilityScore + walkoffScore + lateDramaScore) * (10 / 14)));
}

function calculateUpsetBonus(probs) {
  if (probs.length < 10) return 0;
  const earlyWindowSize = Math.min(10, Math.floor(probs.length * 0.1));
  const earlyWindow = probs.slice(0, Math.max(earlyWindowSize, 5));
  const earlyHomeWP = earlyWindow.reduce((sum, p) => sum + p.value, 0) / earlyWindow.length;
  const homeFavored = earlyHomeWP > 0.5;
  const favoriteEarlyWP = homeFavored ? earlyHomeWP : (1 - earlyHomeWP);
  if (favoriteEarlyWP < 0.55) return 0;
  const finalHomeWP = probs[probs.length - 1].value;
  const homeWon = finalHomeWP > 0.5;
  const underdogWon = (homeFavored && !homeWon) || (!homeFavored && homeWon);
  if (!underdogWon) return 0;
  const upsetMagnitude = Math.min(1, Math.max(0, (favoriteEarlyWP - 0.55) / 0.2));
  return upsetMagnitude * 0.8;
}

function calculateComebackBonus(probs) {
  if (probs.length < 20) return 0;
  let maxComebackMagnitude = 0;
  for (let i = 0; i < probs.length - 10; i++) {
    const p = probs[i].value;
    const isHomeExtreme = p >= 0.85;
    const isAwayExtreme = p <= 0.15;
    if (!isHomeExtreme && !isAwayExtreme) continue;
    for (let j = i + 1; j < probs.length; j++) {
      const laterP = probs[j].value;
      const homeCameBack = isAwayExtreme && laterP > 0.5;
      const awayCameBack = isHomeExtreme && laterP < 0.5;
      if (homeCameBack || awayCameBack) {
        const deficit = isAwayExtreme ? (0.5 - p) : (p - 0.5);
        maxComebackMagnitude = Math.max(maxComebackMagnitude, deficit);
        break;
      }
    }
  }
  if (maxComebackMagnitude === 0) return 0;
  // Gradient: larger comebacks get more bonus
  if (maxComebackMagnitude < 0.35) return 0;
  if (maxComebackMagnitude < 0.40) return ((maxComebackMagnitude - 0.35) / 0.05) * 0.5;
  if (maxComebackMagnitude < 0.45) return 0.5 + ((maxComebackMagnitude - 0.40) / 0.05) * 0.7;
  return Math.min(2.0, 1.2 + ((maxComebackMagnitude - 0.45) / 0.04) * 0.8);
}

function calculateVolatilityBonus(probs) {
  if (probs.length < 20) return 0;
  let largeSwingCount = 0;
  let hasMassiveSwing = false;
  let hasExtremeRecovery = false;
  for (let i = 1; i < probs.length; i++) {
    const prev = probs[i - 1].value;
    const curr = probs[i].value;
    const swing = Math.abs(curr - prev);
    if (swing >= 0.18) largeSwingCount++;
    if (swing >= 0.50) hasMassiveSwing = true;
    if ((prev <= 0.10 || prev >= 0.90) && swing >= 0.18) hasExtremeRecovery = true;
  }
  let bonus = 0;
  if (largeSwingCount >= 6) bonus = Math.max(bonus, 1.0);
  if (hasMassiveSwing) bonus = Math.max(bonus, 1.5);
  if (hasExtremeRecovery) bonus = Math.max(bonus, 0.75);
  return bonus;
}

function normalizeScore(rawScore) {
  if (rawScore <= 3) {
    return 1 + (rawScore / 3) * 3;
  } else if (rawScore <= 5) {
    return 4 + ((rawScore - 3) / 2) * 1.5;
  } else if (rawScore <= 7) {
    return 5.5 + ((rawScore - 5) / 2) * 1.5;
  } else if (rawScore <= 8.5) {
    return 7 + ((rawScore - 7) / 1.5) * 1;
  } else if (rawScore <= 10) {
    return 8 + ((rawScore - 8.5) / 1.5) * 1;
  } else if (rawScore <= 12) {
    return 9 + ((rawScore - 10) / 2) * 0.5;
  } else {
    return Math.min(10, 9.5 + ((rawScore - 12) / 4) * 0.5);
  }
}

main().catch(console.error);
