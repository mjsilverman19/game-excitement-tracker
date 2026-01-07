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

  // METRIC 1: Tension (was there reason to keep watching?)
  // Captures EITHER sustained closeness OR meaningful comeback potential
  // This replaces the old Uncertainty which only measured closeness
  const tensionScore = calculateTension(probs);

  // METRIC 2: Momentum Drama (leverage-weighted swings + lead changes)
  const baseDrama = calculateMomentumDrama(probs);
  const leadChangeBoost = calculateLeadChangeBoost(probs);
  const dramaScore = Math.min(10, baseDrama + leadChangeBoost);

  // METRIC 3: Finish Quality (did it come down to the wire?)
  const finishScore = calculateFinishQuality(probs, game, sport);

  // Capture breakdown before weighting
  const breakdown = {
    tension: tensionScore,
    drama: dramaScore,
    finish: finishScore
  };

  // Weighted combination
  const weights = SCORING_CONFIG.weights;
  let rawScore =
    tensionScore * weights.tension +
    dramaScore * weights.drama +
    finishScore * weights.finish;

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
 * METRIC 1: Tension
 * Measures "was there reason to keep watching?" through two lenses:
 * 1. Closeness: How much time was spent in competitive range (30-70%)
 * 2. Comeback: Did a team mount a meaningful comeback that made it interesting?
 * 
 * Uses MAX of the two - a game is tense if it was EITHER close OR had a comeback.
 * This captures games the old "Uncertainty" metric missed (comeback games that
 * weren't close overall but were still engaging).
 * 
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on game tension
 */
function calculateTension(probs) {
  if (probs.length < 10) return 5;
  
  // Base tension from closeness (same formula as v2.2 Uncertainty)
  // Measures how much time the game spent near 50%
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
  
  // Comeback boost (same as v2.2 calculateComebackUncertaintyBoost)
  // Rewards games where winner came back from significant deficit
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
    if (maxDeficit < 0.30) {
      comebackBoost = ((maxDeficit - 0.15) / 0.15) * 1;
    } else if (maxDeficit < 0.40) {
      comebackBoost = 1 + ((maxDeficit - 0.30) / 0.10) * 1.5;
    } else {
      comebackBoost = Math.min(4, 2.5 + ((maxDeficit - 0.40) / 0.10) * 1.5);
    }
    
    // Time multiplier - late comebacks are more dramatic
    const gameProgress = maxDeficitIndex / probs.length;
    const timeMultiplier = 0.5 + 0.5 * gameProgress;
    comebackBoost *= timeMultiplier;
  }
  
  return Math.min(10, baseTension + comebackBoost);
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
 * Measures how dramatic the ending was
 * 
 * V2.3: Renamed from finishQuality, minor tuning for better average (~5 target)
 * 
 * @param {Array} probs - Array of probability objects with value, period, clock
 * @param {Object} game - Game object with score information
 * @param {string} sport - Sport type (NFL, CFB, NBA)
 * @returns {number} Score from 0-10 based on finish quality
 */
function calculateFinishQuality(probs, game, sport = 'NFL') {
  if (probs.length < SCORING_CONFIG.thresholds.finalMomentPoints) return 0;

  // Detect truncated OT data
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
  // Base floor of 1.0 (even blowouts get some credit) + up to 4.0 for closeness
  // More generous exponent (0.6 vs 0.7) to boost mid-range games
  const closenessScore = 1.0 + Math.pow(Math.max(0, finalCloseness), 0.6) * 4.0;

  // Component 2: Final period volatility (leverage-weighted movement near 0.5)
  const finalPeriodSize = Math.max(2, Math.floor(adjustedProbs.length * 0.25));
  const finalPeriod = adjustedProbs.slice(-finalPeriodSize);

  let finalPeriodMovement = 0;
  for (let i = 1; i < finalPeriod.length; i++) {
    const swing = Math.abs(finalPeriod[i].value - finalPeriod[i - 1].value);
    const leverage = finalPeriod[i - 1].value * (1 - finalPeriod[i - 1].value);
    finalPeriodMovement += swing * leverage * 4;
  }
  // Slightly increased from *4 max 4 to *4.5 max 4 for more credit
  const volatilityScore = Math.min(4, finalPeriodMovement * 4.5);

  // Component 3: Walk-off detection (large swing in final moments)
  let maxFinalSwing = 0;
  for (let i = 1; i < finalProbs.length; i++) {
    const startValue = finalProbs[i - 1].value;
    const endValue = finalProbs[i].value;
    const swing = Math.abs(endValue - startValue);
    const crossedHalf = (startValue - 0.5) * (endValue - 0.5) < 0;
    const startedCompetitive = startValue >= 0.35 && startValue <= 0.65;

    if (crossedHalf && startedCompetitive) {
      maxFinalSwing = Math.max(maxFinalSwing, swing);
    } else if (startedCompetitive && swing >= 0.15) {
      const movedTowardCertainty = Math.abs(endValue - 0.5) > Math.abs(startValue - 0.5);
      if (movedTowardCertainty) {
        maxFinalSwing = Math.max(maxFinalSwing, swing * 0.6);
      } else {
        maxFinalSwing = Math.max(maxFinalSwing, swing);
      }
    }
  }

  let walkoffScore = 0;
  if (maxFinalSwing >= 0.15) {
    walkoffScore = 1 + Math.min(2, (maxFinalSwing - 0.15) * 8);
  }

  // Combine components (max ~11.5, scale to 0-10)
  const totalScore = Math.min(10, closenessScore + volatilityScore + walkoffScore);

  return Math.max(0, totalScore);
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
