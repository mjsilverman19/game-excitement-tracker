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

  // METRIC 2: Momentum Drama (leverage-weighted swings + lead changes)
  const baseDrama = calculateMomentumDrama(probs);
  const leadChangeBoost = calculateLeadChangeBoost(probs);
  const dramaScore = Math.min(10, baseDrama + leadChangeBoost);

  // METRIC 3: Finish Quality (did it come down to the wire?)
  const finishScore = calculateFinishQuality(probs, game, sport);

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

  // MULTIPLICATIVE BONUSES
  // Key change: bonuses now scale with base quality instead of flat addition
  // This prevents mediocre games from inflating to high scores via bonus stacking
  // while still rewarding exceptional games
  
  // Calculate bonus multiplier (each bonus is now a percentage boost)
  // Old system: raw 5 + 5.1 bonuses = 10.1 (mediocre game becomes great)
  // New system: raw 5 * 1.5 = 7.5 (mediocre game improves but stays mediocre-good)
  
  const upsetBonus = calculateUpsetBonus(probs);           // 0-0.8 -> 0-0.08 (8%)
  const comebackBonus = calculateComebackBonus(probs);     // 0-2.0 -> 0-0.20 (20%)
  const volatilityBonus = calculateVolatilityBonus(probs); // 0-1.5 -> 0-0.15 (15%)
  const overtimeBonus = calculateOvertimeBonus(game);      // 0-0.8 -> 0-0.08 (8%)
  const closeGameBonus = calculateCloseGameBonus(game, sport, finishScore); // 0-1.0 -> 0-0.10 (10%)
  
  // Convert to percentage multipliers and sum
  // Old max total: 5.1 additive points
  // New max total: 61% multiplier (capped at 50%)
  const totalBonusRate = 
    (upsetBonus / 10) +      // max 0.08
    (comebackBonus / 10) +   // max 0.20 
    (volatilityBonus / 10) + // max 0.15
    (overtimeBonus / 10) +   // max 0.08
    (closeGameBonus / 10);   // max 0.10
  
  // Cap total bonus at 50% boost to prevent runaway scores
  const cappedBonusRate = Math.min(0.5, totalBonusRate);
  
  // Apply multiplicative bonus
  rawScore *= (1 + cappedBonusRate);

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
 * 
 * Key fix: Changed exponent from 0.8 to 1.3
 * - Old behavior: compressed differences between very close games (0.9 vs 0.95 closeness similar)
 * - New behavior: expands high-closeness differentiation, compresses low-closeness (blowouts)
 * 
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

  // Scale to 0-10 with exponential emphasis
  // Using 1 - (1 - x)^1.3 to expand near 1 and compress near 0
  // This means: very close games (0.9 vs 0.95) show more differentiation
  //             blowouts (0.3 vs 0.4) show less differentiation (both bad)
  const transformedCloseness = 1 - Math.pow(1 - avgCloseness, 1.3);
  const score = transformedCloseness * 10;

  return Math.min(10, Math.max(0, score));
}

/**
 * Boosts uncertainty score for games with significant comebacks
 * A game that looked "decided" but came back was actually uncertain in hindsight
 * 
 * Key improvement: Now considers WHEN the deficit occurred
 * - Late-game comebacks (Q4) get full boost
 * - Early-game comebacks (Q1) get reduced boost (less dramatic)
 * 
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Boost from 0-4 based on comeback magnitude and timing
 */
function calculateComebackUncertaintyBoost(probs) {
  if (probs.length < 20) return 0;

  // Find the most extreme point (furthest from 50%) where the eventual loser was "winning"
  const finalWP = probs[probs.length - 1].value;
  const homeWon = finalWP > 0.5;

  let maxDeficit = 0; // How far behind did the winner get?
  let maxDeficitIndex = 0; // WHEN did the max deficit occur?

  for (let i = 0; i < probs.length; i++) {
    const wp = probs[i].value;
    let deficit = 0;
    
    // If home won, look for points where home WP was low (home was losing)
    // If away won, look for points where home WP was high (away was losing)
    if (homeWon && wp < 0.5) {
      deficit = 0.5 - wp;
    } else if (!homeWon && wp > 0.5) {
      deficit = wp - 0.5;
    }
    
    if (deficit > maxDeficit) {
      maxDeficit = deficit;
      maxDeficitIndex = i;
    }
  }

  // No comeback if winner was never behind
  if (maxDeficit === 0) return 0;

  // Calculate base boost from deficit magnitude (tiered system)
  let baseBoost = 0;
  if (maxDeficit < 0.15) {
    baseBoost = 0;
  } else if (maxDeficit < 0.30) {
    // 15% -> 0, 30% -> 1
    baseBoost = ((maxDeficit - 0.15) / 0.15) * 1;
  } else if (maxDeficit < 0.40) {
    // 30% -> 1, 40% -> 2.5
    baseBoost = 1 + ((maxDeficit - 0.30) / 0.10) * 1.5;
  } else {
    // 40% -> 2.5, 50% -> 4
    baseBoost = Math.min(4, 2.5 + ((maxDeficit - 0.40) / 0.10) * 1.5);
  }

  if (baseBoost === 0) return 0;

  // Apply time multiplier based on when max deficit occurred
  // Early deficit (index near 0): 0.5x multiplier (less dramatic)
  // Late deficit (index near end): 1.0x multiplier (full drama)
  // A Q1 comeback from 20% is less exciting than a Q4 comeback from 20%
  const gameProgress = maxDeficitIndex / probs.length;
  const timeMultiplier = 0.5 + 0.5 * gameProgress; // 0.5 at start, 1.0 at end

  return baseBoost * timeMultiplier;
}

/**
 * METRIC 2: Momentum Drama
 * Measures leverage-weighted swings - big swings matter more when the game is close
 * Swings near 50/50 count more than swings when the game is already decided
 * 
 * Key improvements:
 * - Time-weighting: later swings count more (up to 50% more in final moments)
 * - Reduced leverage floor: garbage-time swings contribute minimally
 * - Smooth scaling for better differentiation
 * 
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on momentum drama
 */
function calculateMomentumDrama(probs) {
  if (probs.length < 2) return 0;

  // Reduced leverage floor - swings at extremes should contribute very little
  // Old value (0.05) meant 95%->98% swings contributed 5x their true leverage
  // New value (0.01) means extreme swings are nearly eliminated but not zero
  const leverageFloor = 0.01;
  const timeWeightFactor = 0.5; // Later moments count up to 50% more

  let totalWeightedSwing = 0;

  for (let i = 1; i < probs.length; i++) {
    const swing = Math.abs(probs[i].value - probs[i - 1].value);
    
    // Leverage: max at 0.5 (0.25), approaches 0 at extremes
    const rawLeverage = probs[i - 1].value * (1 - probs[i - 1].value);
    const leverage = Math.max(leverageFloor, rawLeverage);
    
    // Time weight: 1.0 at start, up to 1.5 at end
    // This makes Q4 swings count more than Q1 swings
    const timeWeight = 1 + (i / probs.length) * timeWeightFactor;
    
    const weightedSwing = swing * leverage * timeWeight * 4; // Scale factor since max leverage is 0.25
    totalWeightedSwing += weightedSwing;
  }

  // Apply diminishing returns to prevent single massive swings from dominating
  // Adjusted scaling factor (was 8, now 10) to account for time-weighting increase
  // and leverage floor decrease balancing out
  const score = Math.min(10, (Math.log(1 + totalWeightedSwing) / Math.log(1 + 10)) * 10);

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
 * Combines final probability closeness, competitive-range volatility, and walk-off detection
 * Games that come down to the wire score highest
 * 
 * Key design decisions to avoid false positives:
 * - Volatility only counts movement in competitive range (0.3-0.7) or crossing 0.5
 * - Walk-off requires crossing 0.5 OR starting competitive AND moving toward uncertainty
 * - Late drama removed (rewarded any movement regardless of context)
 * 
 * @param {Array} probs - Array of probability objects with value, period, clock
 * @param {Object} game - Game object with score information
 * @param {string} sport - Sport type (NFL, CFB, NBA)
 * @returns {number} Score from 0-10 based on finish quality
 */
function calculateFinishQuality(probs, game, sport = 'NFL') {
  if (probs.length < SCORING_CONFIG.thresholds.finalMomentPoints) return 0;

  // Detect truncated OT data: if final N points are all at same extreme (<2% or >98%),
  // use a broader window that captures the actual finish drama
  const adjustedProbs = detectAndAdjustForTruncatedData(probs);

  const finalMoments = Math.min(SCORING_CONFIG.thresholds.finalMomentPoints, adjustedProbs.length);
  const finalProbs = adjustedProbs.slice(-finalMoments);

  // Component 1: Pre-final closeness (how close to 0.5 before the decisive play)
  // Use AVERAGE distance from 0.5 in final window (not minimum - avoids single-point gaming)
  // This captures sustained uncertainty, not just one moment near 0.5
  const preFinalWindow = adjustedProbs.slice(-finalMoments, -1);
  const avgDistanceFrom50 = preFinalWindow.length > 0
    ? preFinalWindow.reduce((sum, p) => sum + Math.abs(p.value - 0.5), 0) / preFinalWindow.length
    : 0.5;
  const finalCloseness = 1 - avgDistanceFrom50 * 2; // 0 to 1
  const closenessScore = Math.pow(Math.max(0, finalCloseness), 1.2) * 4; // Up to 4 points, exponent >1 rewards truly close games

  // Component 2: Final period volatility - ONLY count competitive movement
  // Movement only counts if:
  //   a) It crosses 0.5 (actual lead change), OR
  //   b) It occurs while in competitive range (0.3-0.7) AND moves toward 0.5
  const finalPeriodSize = Math.max(2, Math.floor(adjustedProbs.length * 0.25));
  const finalPeriod = adjustedProbs.slice(-finalPeriodSize);
  const competitiveRange = { min: 0.3, max: 0.7 };

  let competitiveMovement = 0;
  let leadChangesInFinalPeriod = 0;

  for (let i = 1; i < finalPeriod.length; i++) {
    const startValue = finalPeriod[i - 1].value;
    const endValue = finalPeriod[i].value;
    const swing = Math.abs(endValue - startValue);
    const crossedHalf = (startValue - 0.5) * (endValue - 0.5) < 0;

    if (crossedHalf) {
      // Lead change - always counts, weighted by swing magnitude
      competitiveMovement += swing;
      leadChangesInFinalPeriod++;
    } else {
      // Not a lead change - only count if in competitive range AND moving toward 0.5
      const inCompetitiveRange = startValue >= competitiveRange.min && startValue <= competitiveRange.max;
      const startDistFrom50 = Math.abs(startValue - 0.5);
      const endDistFrom50 = Math.abs(endValue - 0.5);
      const movingTowardUncertainty = endDistFrom50 < startDistFrom50;

      if (inCompetitiveRange && movingTowardUncertainty) {
        // Weight by how much closer to 0.5 we got
        const uncertaintyGain = startDistFrom50 - endDistFrom50;
        competitiveMovement += uncertaintyGain;
      }
      // Movement away from 0.5 when not crossing = game ending, don't reward
    }
  }

  // Scale competitive movement: typical exciting finish has 0.3-0.6 total movement
  const volatilityScore = Math.min(4, competitiveMovement * 8); // Up to 4 points

  // Bonus for multiple lead changes in final period (genuine back-and-forth)
  const leadChangeBonus = Math.min(1, leadChangesInFinalPeriod * 0.5); // Up to 1 point for 2+ lead changes

  // Component 3: Walk-off detection (decisive swing in final moments)
  // Requirements tightened: must cross 0.5 OR (start competitive AND swing is dramatic)
  let walkoffScore = 0;
  let bestWalkoffSwing = 0;

  for (let i = 1; i < finalProbs.length; i++) {
    const startValue = finalProbs[i - 1].value;
    const endValue = finalProbs[i].value;
    const swing = Math.abs(endValue - startValue);
    const crossedHalf = (startValue - 0.5) * (endValue - 0.5) < 0;
    const startedCompetitive = startValue >= 0.35 && startValue <= 0.65;

    // Qualify for walk-off if:
    // 1. Crossed 0.5 (definitive lead change), OR
    // 2. Started in tight competitive range AND swing was large
    if (crossedHalf) {
      bestWalkoffSwing = Math.max(bestWalkoffSwing, swing);
    } else if (startedCompetitive && swing >= SCORING_CONFIG.thresholds.walkoffSwingThreshold) {
      // Started competitive, big swing - but discount swings that move away from 0.5
      const movedTowardCertainty = Math.abs(endValue - 0.5) > Math.abs(startValue - 0.5);
      if (movedTowardCertainty) {
        // Game-ending swing from competitive position - still dramatic but less so
        bestWalkoffSwing = Math.max(bestWalkoffSwing, swing * 0.6);
      } else {
        // Moved toward 0.5 - game getting MORE uncertain, very exciting
        bestWalkoffSwing = Math.max(bestWalkoffSwing, swing);
      }
    }
    // Swings like 0.75->0.95 don't qualify at all
  }

  if (bestWalkoffSwing >= SCORING_CONFIG.thresholds.walkoffSwingThreshold) {
    walkoffScore = 2 + Math.min(2, (bestWalkoffSwing - 0.15) * 8); // Up to 4 points
  }

  // Combine components (max 13, scaled to 10)
  // Removed late drama component - it rewarded any movement regardless of competitive context
  const totalScore = (closenessScore + volatilityScore + leadChangeBonus + walkoffScore) * (10 / 13);

  return Math.min(10, Math.max(0, totalScore));
}

/**
 * Calculates lead change boost for drama score
 * Games with multiple lead changes are more dramatic
 * 
 * Uses sigmoid function to eliminate cliff effects from step thresholds
 * Old implementation: 4->5 lead changes jumped from 0->0.3 (cliff)
 * New implementation: smooth continuous curve
 * 
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Boost from 0-1 based on lead changes
 */
function calculateLeadChangeBoost(probs) {
  if (probs.length < 10) return 0;

  let leadChanges = 0;
  for (let i = 1; i < probs.length; i++) {
    const prev = probs[i - 1].value;
    const curr = probs[i].value;
    // Lead change = crossing 50%
    if ((prev - 0.5) * (curr - 0.5) < 0) {
      leadChanges++;
    }
  }

  // Sigmoid function centered at 7 lead changes
  // This gives: 3 changes ≈ 0.02, 5 changes ≈ 0.12, 7 changes = 0.5, 9 changes ≈ 0.88, 11+ changes ≈ 0.98
  // Eliminates cliff effects while preserving the intent of rewarding back-and-forth games
  const sigmoid = 1 / (1 + Math.exp(-(leadChanges - 7) / 1.5));
  
  return Math.min(1.0, sigmoid);
}

/**
 * Calculates overtime bonus
 * Games that go to OT are inherently dramatic
 * @param {Object} game - Game object with overtime flag
 * @returns {number} Bonus from 0-1.4+ based on OT
 */
function calculateOvertimeBonus(game) {
  if (!game || !game.overtime) return 0;

  const config = SCORING_CONFIG.bonuses.overtime;
  // Base OT bonus
  let bonus = config.base;

  // For now, we only know if it went to OT, not how many periods
  // Future: could detect multiple OT from period data
  return bonus;
}

/**
 * Calculates close game bonus based on final score margin
 * Captures excitement that probability data may miss
 * 
 * Key fix (Task 10): Now conditional on finish quality to avoid double-counting
 * If finish quality already captured the close game drama, reduce/skip this bonus
 * 
 * @param {Object} game - Game object with scores
 * @param {string} sport - Sport type for context
 * @param {number} finishScore - The finish quality score (0-10), used to avoid double-counting
 * @returns {number} Bonus from 0-1.0 based on margin
 */
function calculateCloseGameBonus(game, sport, finishScore = 0) {
  if (!game) return 0;

  const margin = Math.abs(game.homeScore - game.awayScore);
  const config = SCORING_CONFIG.bonuses.closeGame;

  // Adjust thresholds for basketball (higher scoring)
  const factor = sport === 'NBA' ? 2 : 1;

  let baseBonus = 0;
  if (margin <= 3 * factor) {
    baseBonus = config.margin3orLess;
  } else if (margin <= 7 * factor) {
    baseBonus = config.margin7orLess;
  } else if (margin <= 10 * factor) {
    baseBonus = config.margin10orLess;
  }

  if (baseBonus === 0) return 0;

  // Task 10: Reduce double-counting with finish quality
  // If finish score is high (>7), the drama was already captured - reduce bonus
  // If finish score is low (<5), the bonus provides needed lift
  // Linear scaling: finishScore 5 = full bonus, finishScore 8+ = 25% bonus
  if (finishScore >= 8) {
    return baseBonus * 0.25; // Already captured, minimal bonus
  } else if (finishScore >= 5) {
    // Scale from 100% at finishScore=5 to 25% at finishScore=8
    const reductionFactor = 1 - 0.75 * ((finishScore - 5) / 3);
    return baseBonus * reductionFactor;
  }
  
  return baseBonus; // Low finish score, full bonus applies
}

/**
 * Normalizes raw score to 1-10 range with smooth S-curve distribution
 * 
 * Key improvement (Task 6): Replaced piecewise linear with sigmoid
 * - Old: 6 breakpoints with discontinuous derivatives (cliff effects in sensitivity)
 * - New: Smooth continuous function with consistent sensitivity
 * 
 * The sigmoid is tuned so:
 * - Raw 0-2: maps to ~1-3 (blowouts)
 * - Raw 4-6: maps to ~4-6 (average games)  
 * - Raw 7-9: maps to ~7-8.5 (good games)
 * - Raw 10+: maps to ~9-10 (great games, compressed top)
 * 
 * @param {number} rawScore - Raw weighted score before normalization
 * @returns {number} Normalized score between 1-10
 */
function normalizeScore(rawScore) {
  // Sigmoid-based normalization: smooth S-curve mapping
  // Formula: 1 + 9 / (1 + exp(-(rawScore - midpoint) / steepness))
  // 
  // Parameters tuned for desired distribution:
  // - midpoint = 5: raw score of 5 maps to ~5.5 final
  // - steepness = 2.5: controls how spread out the curve is
  //
  // This gives approximately:
  // - raw 0 -> ~1.2
  // - raw 2 -> ~2.3  
  // - raw 4 -> ~4.0
  // - raw 5 -> ~5.5 (midpoint)
  // - raw 6 -> ~6.9
  // - raw 8 -> ~8.5
  // - raw 10 -> ~9.3
  // - raw 12 -> ~9.7
  // - raw 15 -> ~9.9
  
  const midpoint = 5;
  const steepness = 2.5;
  
  const sigmoid = 1 / (1 + Math.exp(-(rawScore - midpoint) / steepness));
  const normalized = 1 + 9 * sigmoid;
  
  return Math.min(10, Math.max(1, normalized));
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
 * Uses gradient: larger comebacks get exponentially more bonus
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Bonus from 0-2.0 based on comeback magnitude
 */
function calculateComebackBonus(probs) {
  if (probs.length < 20) return 0;

  const extremeThreshold = SCORING_CONFIG.bonuses.comeback.extremeThreshold;

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

  // Gradient bonus based on comeback magnitude:
  // - 0.35 deficit (15% WP): 0 bonus
  // - 0.40 deficit (10% WP): 0.5 bonus
  // - 0.45 deficit (5% WP): 1.2 bonus
  // - 0.49+ deficit (1% WP): 2.0 bonus (Super Bowl LI territory)
  if (maxComebackMagnitude < 0.35) return 0;
  if (maxComebackMagnitude < 0.40) {
    return ((maxComebackMagnitude - 0.35) / 0.05) * 0.5;
  } else if (maxComebackMagnitude < 0.45) {
    return 0.5 + ((maxComebackMagnitude - 0.40) / 0.05) * 0.7;
  } else {
    return Math.min(2.0, 1.2 + ((maxComebackMagnitude - 0.45) / 0.04) * 0.8);
  }
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
