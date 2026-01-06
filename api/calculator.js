// Entertainment Scoring Algorithm
// Analyzes NFL/CFB games using ESPN win probability data to rank entertainment value

import { ALGORITHM_CONFIG } from '../shared/algorithm-config.js';

const SCORING_CONFIG = {
  weights: ALGORITHM_CONFIG.weights,
  thresholds: {
    minDataPoints: ALGORITHM_CONFIG.thresholds.minDataPoints,
    finalPeriodStart: 4, // Q4 for both football and basketball
    finalMomentPoints: ALGORITHM_CONFIG.thresholds.finalMomentPoints,
    walkoffSwingThreshold: ALGORITHM_CONFIG.thresholds.walkoffSwingThreshold,
    leverageFloor: ALGORITHM_CONFIG.thresholds.leverageFloor,
    lateDramaSwingThreshold: ALGORITHM_CONFIG.thresholds.lateDramaSwingThreshold,
    largeFinalSwingThreshold: ALGORITHM_CONFIG.thresholds.largeFinalSwingThreshold
  },
  bonuses: ALGORITHM_CONFIG.bonuses
};

export async function analyzeGameEntertainment(game, sport = 'NFL') {
  try {
    // Determine the correct sport type and league for ESPN API
    let sportType, league;
    if (sport === 'NBA') {
      sportType = 'basketball';
      league = 'nba';
    } else {
      sportType = 'football';
      league = sport === 'CFB' ? 'college-football' : 'nfl';
    }

    const probUrl = `https://sports.core.api.espn.com/v2/sports/${sportType}/leagues/${league}/events/${game.id}/competitions/${game.id}/probabilities?limit=300`;

    const response = await fetch(probUrl);

    if (!response.ok) {
      return null;
    }

    const probData = await response.json();

    if (!probData.items || probData.items.length < SCORING_CONFIG.thresholds.minDataPoints) {
      return null;
    }

    const excitement = calculateExcitement(probData.items, game, sport);

    return {
      id: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      excitement: excitement.score,
      breakdown: excitement.breakdown,
      overtime: game.overtime,
      bowlName: game.bowlName,
      playoffRound: game.playoffRound
    };
  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return null;
  }
}

function calculateExcitement(probabilities, game, sport = 'NFL') {
  const probs = probabilities
    .map(p => ({
      value: Math.max(0, Math.min(1, p.homeWinPercentage || 0.5)),
      period: p.period || 1,
      clock: p.clock
    }))
    .filter(p => p.value >= 0 && p.value <= 1);

  if (probs.length < SCORING_CONFIG.thresholds.minDataPoints) {
    return null;
  }

  // METRIC 1: Outcome Uncertainty (how long was the result in doubt?)
  // Adjust for comebacks - a game that looked decided but came back was actually uncertain
  const baseUncertainty = calculateOutcomeUncertainty(probs);
  const comebackFactor = calculateComebackUncertaintyBoost(probs);
  const uncertaintyScore = Math.min(10, baseUncertainty + comebackFactor);

  // METRIC 2: Momentum Drama (leverage-weighted swings)
  const dramaScore = calculateMomentumDrama(probs);

  // METRIC 3: Finish Quality (did it come down to the wire?)
  const finishScore = calculateFinishQuality(probs, sport);

  // Capture breakdown before weighting
  const breakdown = {
    uncertainty: uncertaintyScore,
    drama: dramaScore,
    finish: finishScore
  };

  // Weighted combination
  const weights = SCORING_CONFIG.weights;
  let rawScore =
    uncertaintyScore * weights.outcomeUncertainty +
    dramaScore * weights.momentumDrama +
    finishScore * weights.finishQuality;

  // Add upset bonus (replaces overtime bonus - rewards games where underdogs win)
  const upsetBonus = calculateUpsetBonus(probs);
  rawScore += upsetBonus;

  // Add comeback bonus for dramatic comebacks from extreme deficits
  const comebackBonus = calculateComebackBonus(probs);
  rawScore += comebackBonus;

  // Add extraordinary volatility bonus for rare swing patterns
  const volatilityBonus = calculateVolatilityBonus(probs);
  rawScore += volatilityBonus;

  // Normalize to 1-10 range with better distribution
  const finalScore = normalizeScore(rawScore);

  return {
    score: Math.max(1, Math.min(10, Math.round(finalScore * 10) / 10)),
    breakdown
  };
}

/**
 * METRIC 1: Outcome Uncertainty
 * Measures how long the result was in doubt by integrating closeness to 50/50 over time
 * A game at 50/50 the entire time scores 10; a wire-to-wire blowout scores near 0
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on outcome uncertainty
 */
function calculateOutcomeUncertainty(probs) {
  if (probs.length === 0) return 0;

  // For each probability point, calculate how close to 0.5
  // Weight slightly more towards later in the game
  let totalCloseness = 0;
  for (let i = 0; i < probs.length; i++) {
    const closeness = 1 - Math.abs(probs[i].value - 0.5) * 2; // 0 at extremes, 1 at 0.5
    const timeWeight = 1 + (i / probs.length) * 0.3; // Slight increase for later moments
    totalCloseness += closeness * timeWeight;
  }

  // Calculate average weighted closeness
  const avgWeight = 1 + 0.15; // Average of time weights
  const avgCloseness = totalCloseness / (probs.length * avgWeight);

  // Scale to 0-10 with some exponential emphasis on very close games
  const score = Math.pow(avgCloseness, 0.8) * 10;

  return Math.min(10, Math.max(0, score));
}

/**
 * Boosts uncertainty score for games with significant comebacks
 * A game that looked "decided" but came back was actually uncertain in hindsight
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Boost from 0-4 based on comeback magnitude
 */
function calculateComebackUncertaintyBoost(probs) {
  if (probs.length < 20) return 0;

  // Find the most extreme point (furthest from 50%) where the eventual loser was "winning"
  const finalWP = probs[probs.length - 1].value;
  const homeWon = finalWP > 0.5;

  let maxDeficit = 0; // How far behind did the winner get?

  for (let i = 0; i < probs.length; i++) {
    const wp = probs[i].value;
    // If home won, look for points where home WP was low (home was losing)
    // If away won, look for points where home WP was high (away was losing)
    if (homeWon && wp < 0.5) {
      maxDeficit = Math.max(maxDeficit, 0.5 - wp);
    } else if (!homeWon && wp > 0.5) {
      maxDeficit = Math.max(maxDeficit, wp - 0.5);
    }
  }

  // No comeback if winner was never behind
  if (maxDeficit === 0) return 0;

  // Scale boost: small deficit (5%) = tiny boost, large deficit (40%+) = max boost
  // 0.05 deficit = 0, 0.40 deficit = 4 points
  const boost = Math.min(4, Math.max(0, (maxDeficit - 0.05) / 0.35) * 4);

  return boost;
}

/**
 * METRIC 2: Momentum Drama
 * Measures leverage-weighted swings - big swings matter more when the game is close
 * Swings near 50/50 count more than swings when the game is already decided
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on momentum drama
 */
function calculateMomentumDrama(probs) {
  if (probs.length < 2) return 0;

  const leverageFloor = SCORING_CONFIG.thresholds.leverageFloor;
  let totalWeightedSwing = 0;

  for (let i = 1; i < probs.length; i++) {
    const swing = Math.abs(probs[i].value - probs[i - 1].value);
    // Add leverage floor so swings at extremes still contribute
    const rawLeverage = probs[i - 1].value * (1 - probs[i - 1].value);
    const leverage = Math.max(leverageFloor, rawLeverage);
    const weightedSwing = swing * leverage * 4; // Scale factor since max leverage is 0.25
    totalWeightedSwing += weightedSwing;
  }

  // Apply diminishing returns to prevent single massive swings from dominating
  // Adjusted scaling to better differentiate between game types
  // Typical cumulative values: blowout ~0.8-1.5, close game ~2.5-4.0, thriller ~4.0-7.0
  const score = Math.min(10, (Math.log(1 + totalWeightedSwing) / Math.log(1 + 8)) * 10);

  return Math.max(0, score);
}

/**
 * Detects truncated OT/late-game data and returns an adjusted probability array
 * If the final N points are all stuck at an extreme (<2% or >98%), trim them
 * to find the actual competitive finish window
 * @param {Array} probs - Array of probability objects with value property
 * @returns {Array} Adjusted probability array for finish evaluation
 */
function detectAndAdjustForTruncatedData(probs) {
  if (probs.length < 20) return probs;

  // Check if final 10+ points are all at same extreme
  const checkWindow = 10;
  const finalWindow = probs.slice(-checkWindow);
  const extremeThreshold = 0.02; // 2%

  const allAtLowExtreme = finalWindow.every(p => p.value <= extremeThreshold);
  const allAtHighExtreme = finalWindow.every(p => p.value >= (1 - extremeThreshold));

  if (!allAtLowExtreme && !allAtHighExtreme) {
    return probs; // Data looks fine
  }

  // Find where the data became "stuck" at the extreme
  // Walk backwards to find last point that wasn't at the extreme
  let cutoffIndex = probs.length - 1;
  for (let i = probs.length - 1; i >= 0; i--) {
    const p = probs[i].value;
    const isExtreme = p <= extremeThreshold || p >= (1 - extremeThreshold);
    if (!isExtreme) {
      cutoffIndex = i + 1; // Include one extreme point as the "finish"
      break;
    }
  }

  // Don't trim too much - keep at least 80% of data
  const minKeep = Math.floor(probs.length * 0.8);
  if (cutoffIndex < minKeep) {
    cutoffIndex = minKeep;
  }

  return probs.slice(0, cutoffIndex);
}

/**
 * METRIC 3: Finish Quality
 * Combines final probability closeness, final period volatility, and walk-off detection
 * Games that come down to the wire score highest
 * @param {Array} probs - Array of probability objects with value, period, clock
 * @param {string} sport - Sport type (NFL, CFB, NBA)
 * @returns {number} Score from 0-10 based on finish quality
 */
function calculateFinishQuality(probs, sport = 'NFL') {
  if (probs.length < SCORING_CONFIG.thresholds.finalMomentPoints) return 0;

  // Detect truncated OT data: if final N points are all at same extreme (<2% or >98%),
  // use a broader window that captures the actual finish drama
  const adjustedProbs = detectAndAdjustForTruncatedData(probs);

  const finalMoments = Math.min(SCORING_CONFIG.thresholds.finalMomentPoints, adjustedProbs.length);
  const finalProbs = adjustedProbs.slice(-finalMoments);
  const lastProb = adjustedProbs[adjustedProbs.length - 1].value;

  // Component 1: Pre-final closeness (how close to 0.5 before the decisive play)
  // Use the minimum distance from 0.5 among final points, excluding absolute last
  // This captures "how close was the game before the walk-off play"
  const preFinalWindow = adjustedProbs.slice(-finalMoments, -1);
  const minDistanceFrom50 = preFinalWindow.length > 0
    ? Math.min(...preFinalWindow.map(p => Math.abs(p.value - 0.5)))
    : Math.abs(lastProb - 0.5);
  const finalCloseness = 1 - minDistanceFrom50 * 2; // 0 to 1
  const closenessScore = Math.pow(Math.max(0, finalCloseness), 0.7) * 4; // Up to 4 points

  // Component 2: Final period volatility (leverage-weighted movement near 0.5)
  // Get final 25% of data points as "final period"
  const finalPeriodSize = Math.max(2, Math.floor(adjustedProbs.length * 0.25));
  const finalPeriod = adjustedProbs.slice(-finalPeriodSize);

  let finalPeriodMovement = 0;
  for (let i = 1; i < finalPeriod.length; i++) {
    const swing = Math.abs(finalPeriod[i].value - finalPeriod[i - 1].value);
    const leverage = finalPeriod[i - 1].value * (1 - finalPeriod[i - 1].value); // Max at 0.5, zero at 0 or 1
    finalPeriodMovement += swing * leverage * 4; // Scale factor since max leverage is 0.25
  }

  // More leverage-weighted movement in final period = more exciting
  const volatilityScore = Math.min(4, finalPeriodMovement * 4); // Up to 4 points

  // Component 3: Walk-off detection (large swing in final moments)
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
  if (maxFinalSwing >= SCORING_CONFIG.thresholds.walkoffSwingThreshold) {
    walkoffScore = 2 + Math.min(2, (maxFinalSwing - 0.15) * 10); // Up to 4 points
  }

  // Component 4: Late drama - any large swing in final 5 points regardless of position
  const lateDramaWindow = adjustedProbs.slice(-5);
  let maxLateDramaSwing = 0;
  for (let i = 1; i < lateDramaWindow.length; i++) {
    const swing = Math.abs(lateDramaWindow[i].value - lateDramaWindow[i - 1].value);
    maxLateDramaSwing = Math.max(maxLateDramaSwing, swing);
  }

  let lateDramaScore = 0;
  if (maxLateDramaSwing >= SCORING_CONFIG.thresholds.largeFinalSwingThreshold) {
    // Large swing in final moments, even at extremes
    lateDramaScore = Math.min(2, (maxLateDramaSwing - 0.15) * 8); // Up to 2 points
  }

  // Combine components (max 14, scaled to 10)
  const totalScore = (closenessScore + volatilityScore + walkoffScore + lateDramaScore) * (10 / 14);

  return Math.min(10, Math.max(0, totalScore));
}

/**
 * Normalizes raw score to 1-10 range with better distribution
 * Applies transformation to spread results more evenly
 * @param {number} rawScore - Raw weighted score before normalization
 * @returns {number} Normalized score between 1-10
 */
function normalizeScore(rawScore) {
  // Sigmoid centered at 5 to spread scores across 1-10
  // Adjusted parameters to allow elite games to reach 9.5+
  const centered = (rawScore - 5) / 1.9;
  const sigmoid = 1 / (1 + Math.exp(-centered * 1.4));

  // Map sigmoid output (0-1) to final score (1-10)
  return Math.max(1, Math.min(10, 1 + sigmoid * 9));
}

/**
 * Calculates upset bonus based on pre-game expectations vs outcome
 * Rewards games where underdogs win, scaling with degree of upset
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Bonus from 0-0.8 based on upset magnitude
 */
function calculateUpsetBonus(probs) {
  if (probs.length < 10) return 0;

  // Get early game state (first 10 points or 10% of game, whichever is smaller)
  const earlyWindowSize = Math.min(10, Math.floor(probs.length * 0.1));
  const earlyWindow = probs.slice(0, Math.max(earlyWindowSize, 5));
  const earlyHomeWP = earlyWindow.reduce((sum, p) => sum + p.value, 0) / earlyWindow.length;

  // Determine pre-game favorite (team with >50% early WP)
  const homeFavored = earlyHomeWP > 0.5;
  const favoriteEarlyWP = homeFavored ? earlyHomeWP : (1 - earlyHomeWP);

  // Need a clear favorite (>55%) for upset bonus to apply
  if (favoriteEarlyWP < SCORING_CONFIG.bonuses.upset.threshold) return 0;

  // Get final outcome
  const finalHomeWP = probs[probs.length - 1].value;
  const homeWon = finalHomeWP > 0.5;

  // Check if underdog won
  const underdogWon = (homeFavored && !homeWon) || (!homeFavored && homeWon);

  if (!underdogWon) return 0;

  // Scale bonus by degree of upset (0.55 favorite losing = small bonus, 0.75+ favorite losing = max bonus)
  // upsetMagnitude: 0 at 0.55, 1 at 0.75+
  const upsetMagnitude = Math.min(1, Math.max(0, (favoriteEarlyWP - 0.55) / 0.2));
  const bonus = upsetMagnitude * SCORING_CONFIG.bonuses.upset.max;

  return bonus;
}

/**
 * Calculates comeback bonus for games with dramatic swings from extreme deficits
 * Rewards games where a team comes back from <15% or >85% win probability through 50%
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Bonus from 0-1.0 based on comeback magnitude
 */
function calculateComebackBonus(probs) {
  if (probs.length < 20) return 0;

  const extremeThreshold = SCORING_CONFIG.bonuses.comeback.extremeThreshold;
  const maxBonus = SCORING_CONFIG.bonuses.comeback.max;

  // Track extreme points and subsequent crossings of 50%
  let maxComebackMagnitude = 0;

  // Find all points where a team was in extreme territory
  for (let i = 0; i < probs.length - 10; i++) {
    const p = probs[i].value;

    // Check if this is an extreme point (one team heavily favored)
    const isHomeExtreme = p >= (1 - extremeThreshold); // Home >85%
    const isAwayExtreme = p <= extremeThreshold; // Away >85% (home <15%)

    if (!isHomeExtreme && !isAwayExtreme) continue;

    // Look for subsequent crossing of 50% in the opposite direction
    for (let j = i + 1; j < probs.length; j++) {
      const laterP = probs[j].value;

      // Did the disadvantaged team come back through 50%?
      const homeCameBack = isAwayExtreme && laterP > 0.5;
      const awayCameBack = isHomeExtreme && laterP < 0.5;

      if (homeCameBack || awayCameBack) {
        // Calculate comeback magnitude: how far from 50% were they?
        const deficit = isAwayExtreme ? (0.5 - p) : (p - 0.5);
        maxComebackMagnitude = Math.max(maxComebackMagnitude, deficit);
        break; // Found a comeback from this extreme point
      }
    }
  }

  if (maxComebackMagnitude === 0) return 0;

  // Scale bonus: 0.35 deficit (15% WP) = 0, 0.50 deficit (0% WP) = max
  // comebackScale: 0 at 0.35, 1 at 0.50
  const comebackScale = Math.min(1, Math.max(0, (maxComebackMagnitude - 0.35) / 0.15));
  return comebackScale * maxBonus;
}

/**
 * Calculates extraordinary volatility bonus for games with rare swing patterns
 * Only triggers for truly exceptional games to avoid score inflation
 * Criteria:
 * - Multiple large swings (5+ swings > 15%) OR
 * - A massive single swing (>25%) OR
 * - An extreme recovery swing (>18% from <10% WP)
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Bonus from 0-1.5 based on extraordinary volatility
 */
function calculateVolatilityBonus(probs) {
  if (probs.length < 20) return 0;

  const config = SCORING_CONFIG.bonuses.volatility;
  const maxBonus = config.max;

  let largeSwingCount = 0;
  let hasMassiveSwing = false;
  let hasExtremeRecovery = false;

  for (let i = 1; i < probs.length; i++) {
    const prev = probs[i - 1].value;
    const curr = probs[i].value;
    const swing = Math.abs(curr - prev);

    // Count large swings (>15%)
    if (swing >= config.largeSwingThreshold) {
      largeSwingCount++;
    }

    // Check for massive swing (>25%) - very rare
    if (swing >= config.massiveSwingThreshold) {
      hasMassiveSwing = true;
    }

    // Check for extreme recovery: large swing FROM a very low probability
    // e.g., going from 5% to 25% is extraordinary (hope from despair)
    const prevIsExtremeLow = prev <= 0.10;
    const prevIsExtremeHigh = prev >= 0.90;
    if ((prevIsExtremeLow || prevIsExtremeHigh) && swing >= config.extremeRecoveryThreshold) {
      hasExtremeRecovery = true;
    }
  }

  // Calculate bonus based on which criteria are met
  // These are rare patterns, so we can be generous when they occur
  let bonus = 0;

  // Multiple large swings: indicates sustained back-and-forth drama
  if (largeSwingCount >= config.multiSwingCount) {
    // Scale from 0.5 at 5 swings to max at 10+ swings
    const multiSwingScale = Math.min(1, (largeSwingCount - 5) / 5);
    bonus = Math.max(bonus, 0.5 + multiSwingScale * 0.5);
  }

  // Massive single swing: indicates a game-changing moment
  if (hasMassiveSwing) {
    bonus = Math.max(bonus, 0.8);
  }

  // Extreme recovery: indicates hope from near-certain defeat
  if (hasExtremeRecovery) {
    bonus = Math.max(bonus, 1.0);
  }

  // If multiple criteria are met, give extra credit
  const criteriaCount = (largeSwingCount >= config.multiSwingCount ? 1 : 0) +
                        (hasMassiveSwing ? 1 : 0) +
                        (hasExtremeRecovery ? 1 : 0);
  if (criteriaCount >= 2) {
    bonus = Math.min(maxBonus, bonus + 0.5);
  }

  return Math.min(maxBonus, bonus);
}
