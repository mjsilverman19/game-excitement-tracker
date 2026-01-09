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
    largeFinalSwingThreshold: ALGORITHM_CONFIG.thresholds.largeFinalSwingThreshold,
    lateClosenessThreshold: ALGORITHM_CONFIG.thresholds.lateClosenessThreshold,
    blowoutMargin: ALGORITHM_CONFIG.thresholds.blowoutMargin,
    competitiveBand: ALGORITHM_CONFIG.thresholds.competitiveBand,
    dramaTimeWeight: ALGORITHM_CONFIG.thresholds.dramaTimeWeight,
    leadChangeSigmoid: ALGORITHM_CONFIG.thresholds.leadChangeSigmoid,
    comeback: ALGORITHM_CONFIG.thresholds.comeback
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
      overtime: excitement.overtimeDetected ?? game.overtime,
      bowlName: game.bowlName,
      playoffRound: game.playoffRound
    };
  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return null;
  }
}

export async function analyzeGameEntertainmentDetailed(game, sport = 'NFL') {
  try {
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

    const excitement = calculateExcitementDetailed(probData.items, game, sport);
    if (!excitement) return null;

    return {
      id: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      overtime: game.overtime,
      bowlName: game.bowlName,
      playoffRound: game.playoffRound,
      ...excitement
    };
  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return null;
  }
}

function calculateExcitement(probabilities, game, sport = 'NFL') {
  const detailed = calculateExcitementDetailed(probabilities, game, sport);
  if (!detailed) return null;
  return {
    score: detailed.score,
    breakdown: detailed.breakdown,
    overtimeDetected: detailed.overtimeDetected
  };
}

function calculateExcitementDetailed(probabilities, game, sport = 'NFL') {
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

  const overtimeDetected = Boolean(game?.overtime);

  // METRIC 1: Tension (was there reason to keep watching?)
  // Measures sustained competitive state only (time spent in 30-70% band)
  let tensionScore = calculateTension(probs);

  // METRIC 2: Momentum Drama (leverage-weighted swings + lead changes)
  const baseDrama = calculateMomentumDrama(probs);
  const leadChangeBoost = calculateLeadChangeBoost(probs);
  const comebackDramaBoost = calculateComebackDramaBoost(probs);
  let dramaScore = Math.min(10, baseDrama + leadChangeBoost + comebackDramaBoost);

  // METRIC 3: Finish Quality (did it come down to the wire?)
  const finishScore = calculateFinishQuality(probs, game, sport);

  const margin =
    typeof game?.homeScore === 'number' && typeof game?.awayScore === 'number'
      ? Math.abs(game.homeScore - game.awayScore)
      : null;
  const lateCloseness = calculateLateCloseness(probs);
  const blowoutThreshold = sport === 'NBA'
    ? SCORING_CONFIG.thresholds.blowoutMargin.nba
    : SCORING_CONFIG.thresholds.blowoutMargin.nflCfb;

  if (lateCloseness < SCORING_CONFIG.thresholds.lateClosenessThreshold &&
      margin != null &&
      margin > blowoutThreshold) {
    tensionScore *= 0.6;
    dramaScore *= 0.7;
  }

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
  const overtimeBonus = calculateOvertimeBonus(overtimeDetected);      // 0-0.8 -> 0-0.08 (8%)
  const closeGameBonus = calculateCloseGameBonus(game, sport, finishScore); // 0-1.0
  
  // Convert to percentage multipliers and sum
  // Old max total: 5.1 additive points
  // New max total: 61% multiplier (capped at 50%)
  const totalBonusRate = 
    (upsetBonus / 10) +      // max 0.08
    (comebackBonus / 10) +   // max 0.20 
    (volatilityBonus / 10) + // max 0.15
    (overtimeBonus / 10);    // max 0.08
  
  // Cap total bonus at 50% boost to prevent runaway scores
  const cappedBonusRate = Math.min(0.5, totalBonusRate);
  
  // Apply multiplicative bonus
  rawScore *= (1 + cappedBonusRate);

  // Apply close-game bonus as 50% additive, 50% multiplicative
  if (closeGameBonus > 0) {
    rawScore += closeGameBonus * 0.5;
    rawScore *= (1 + (closeGameBonus * 0.5) / 10);
  }

  // Normalize to 1-10 range with better distribution
  const finalScore = normalizeScore(rawScore);

  // Hard margin cap for extreme blowouts (data quality guardrail)
  if (margin != null) {
    const blowoutCapThreshold = sport === 'NBA' ? 22 : 28;
    if (margin > blowoutCapThreshold) {
      return {
        score: Math.min(finalScore, 6.5),
        breakdown,
        rawScore,
        finalScore,
        tensionScore,
        dramaScore,
        finishScore,
        overtimeFloorApplied: false,
        overtimeDetected
      };
    }
  }

  // OT floor: overtime games should rarely score below 6.0
  if (overtimeDetected && finalScore < 6.0) {
    return {
      score: 6.0,
      breakdown,
      rawScore,
      finalScore,
      tensionScore,
      dramaScore,
      finishScore,
      overtimeFloorApplied: true,
      overtimeDetected
    };
  }

  return {
    score: Math.max(1, Math.min(10, Math.round(finalScore * 10) / 10)),
    breakdown,
    rawScore,
    finalScore,
    tensionScore,
    dramaScore,
    finishScore,
    overtimeFloorApplied: false,
    overtimeDetected
  };
}

/**
 * METRIC 1: Tension
 * Measures sustained competitive state: time spent in 30-70% win-prob band.
 * 
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on game tension
 */
function calculateTension(probs) {
  if (probs.length < 10) return 5;

  const bandLow = SCORING_CONFIG.thresholds.competitiveBand.low;
  const bandHigh = SCORING_CONFIG.thresholds.competitiveBand.high;

  let totalCompetitive = 0;
  for (let i = 0; i < probs.length; i++) {
    const inBand = probs[i].value >= bandLow && probs[i].value <= bandHigh ? 1 : 0;
    const timeWeight = 1 + (i / probs.length) * 0.3;
    totalCompetitive += inBand * timeWeight;
  }
  const avgWeight = 1 + 0.15;
  const avgCompetitive = totalCompetitive / (probs.length * avgWeight);
  const transformedCompetitive = 1 - Math.pow(1 - avgCompetitive, 1.3);
  const baseTension = transformedCompetitive * 10;

  return Math.min(10, baseTension);
}

function calculateComebackMagnitude(probs) {
  if (probs.length < 10) {
    return { maxDeficit: 0, maxDeficitIndex: 0, gameProgress: 0 };
  }

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

  return {
    maxDeficit,
    maxDeficitIndex,
    gameProgress: maxDeficitIndex / probs.length
  };
}

function calculateComebackDramaBoost(probs) {
  const { maxDeficit, gameProgress } = calculateComebackMagnitude(probs);
  const config = SCORING_CONFIG.thresholds.comeback;

  if (maxDeficit < config.minDeficit) return 0;

  let boost = 0;
  if (maxDeficit < config.tier1) {
    boost = ((maxDeficit - config.minDeficit) / (config.tier1 - config.minDeficit)) * 1;
  } else if (maxDeficit < config.tier2) {
    boost = 1 + ((maxDeficit - config.tier1) / (config.tier2 - config.tier1)) * 1.5;
  } else {
    boost = Math.min(config.maxBoost, 2.5 + ((maxDeficit - config.tier2) / 0.10) * 1.5);
  }

  const timeMin = config.timeMultiplier.min;
  const timeMax = config.timeMultiplier.max;
  const timeMultiplier = timeMin + (timeMax - timeMin) * gameProgress;

  return boost * timeMultiplier;
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
  const leverageFloor = SCORING_CONFIG.thresholds.leverageFloor;
  const timeWeightFactor = SCORING_CONFIG.thresholds.dramaTimeWeight.factor;
  const timeWeightExponent = SCORING_CONFIG.thresholds.dramaTimeWeight.exponent;

  let totalWeightedSwing = 0;

  for (let i = 1; i < probs.length; i++) {
    const swing = Math.abs(probs[i].value - probs[i - 1].value);
    
    // Leverage: max at 0.5 (0.25), approaches 0 at extremes
    const rawLeverage = probs[i - 1].value * (1 - probs[i - 1].value);
    const leverage = Math.max(leverageFloor, rawLeverage);
    
    // Time weight: 1.0 at start, up to 1.5 at end
    // This makes Q4 swings count more than Q1 swings
    const timeWeight = 1 + Math.pow(i / probs.length, timeWeightExponent) * timeWeightFactor;
    
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
 * Calculates late-game closeness as average closeness in final quarter of data.
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Closeness from 0-1
 */
function calculateLateCloseness(probs) {
  if (!probs.length) return 0;
  const startIndex = Math.floor(probs.length * 0.75);
  const lateProbs = probs.slice(startIndex);
  if (lateProbs.length === 0) return 0;

  let total = 0;
  for (const p of lateProbs) {
    const closeness = 1 - Math.abs(p.value - 0.5) * 2;
    total += Math.max(0, Math.min(1, closeness));
  }

  return total / lateProbs.length;
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
  // V2.4: Only count movement TOWARD 0.5 or that CROSSES 0.5
  // This prevents false positives from monotonic pull-away sequences (e.g., 0.65→0.75→0.85→0.95)
  const finalPeriodSize = Math.max(2, Math.floor(adjustedProbs.length * 0.25));
  const finalPeriod = adjustedProbs.slice(-finalPeriodSize);

  let finalPeriodMovement = 0;
  for (let i = 1; i < finalPeriod.length; i++) {
    const prevValue = finalPeriod[i - 1].value;
    const currValue = finalPeriod[i].value;
    const swing = Math.abs(currValue - prevValue);

    // Only count movement toward 0.5 OR movement that crosses 0.5
    const crossedHalf = (prevValue - 0.5) * (currValue - 0.5) < 0;
    const movedToward50 = Math.abs(currValue - 0.5) < Math.abs(prevValue - 0.5);

    if (crossedHalf || movedToward50) {
      const leverage = prevValue * (1 - prevValue);
      finalPeriodMovement += swing * leverage * 4;
    }
  }
  // Slightly increased from *4 max 4 to *4.5 max 4 for more credit
  const volatilityScore = Math.min(4, finalPeriodMovement * 4.5);

  // Component 3: Walk-off detection (large swing in final moments)
  // V2.4: Tightened criteria to reduce false positives
  // Requires EITHER:
  // 1. Swing crosses 0.5 (true lead change), OR
  // 2. Started tight competitive (0.40-0.60) AND moved toward 0.5
  let maxFinalSwing = 0;
  for (let i = 1; i < finalProbs.length; i++) {
    const startValue = finalProbs[i - 1].value;
    const endValue = finalProbs[i].value;
    const swing = Math.abs(endValue - startValue);

    const crossedHalf = (startValue - 0.5) * (endValue - 0.5) < 0;
    const startedTightCompetitive = startValue >= 0.40 && startValue <= 0.60;
    const movedToward50 = Math.abs(endValue - 0.5) < Math.abs(startValue - 0.5);

    // Only count if it crossed 0.5 OR (started tight competitive AND moved toward 0.5)
    if (crossedHalf) {
      maxFinalSwing = Math.max(maxFinalSwing, swing);
    } else if (startedTightCompetitive && movedToward50) {
      maxFinalSwing = Math.max(maxFinalSwing, swing);
    }
  }

  let walkoffScore = 0;
  if (maxFinalSwing >= 0.15) {
    walkoffScore = 1 + Math.min(2, (maxFinalSwing - 0.15) * 8);
  }

  // If the late window never crosses 50% and stays outside 60/40 on average,
  // reduce finish sensitivity to avoid over-crediting stable leads.
  const avgFinalWinProb =
    finalProbs.reduce((sum, p) => sum + p.value, 0) / finalProbs.length;
  const crossedHalfLate = finalProbs.some(
    (p, i) => i > 0 && (finalProbs[i - 1].value - 0.5) * (p.value - 0.5) < 0
  );
  const lateStableLead = !crossedHalfLate && (avgFinalWinProb >= 0.60 || avgFinalWinProb <= 0.40);
  const finishPenalty = lateStableLead ? 0.5 : 1.0;

  // Combine components (max ~11.5, scale to 0-10)
  const totalScore = Math.min(
    10,
    (closenessScore + volatilityScore) * finishPenalty + walkoffScore
  );

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

  const center = SCORING_CONFIG.thresholds.leadChangeSigmoid.center;
  const slope = SCORING_CONFIG.thresholds.leadChangeSigmoid.slope;
  // Sigmoid function centered at configured lead-change count
  // Example with center=5: 3 changes ≈ 0.21, 5 changes = 0.5, 7 changes ≈ 0.79
  // Eliminates cliff effects while preserving the intent of rewarding back-and-forth games
  const sigmoid = 1 / (1 + Math.exp(-(leadChanges - center) / slope));
  
  return Math.min(1.0, sigmoid);
}

/**
 * Calculates overtime bonus
 * Games that go to OT are inherently dramatic
 * @param {boolean} overtimeDetected - Whether OT was detected
 * @returns {number} Bonus from 0-1.4+ based on OT
 */
function calculateOvertimeBonus(overtimeDetected) {
  if (!overtimeDetected) return 0;

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

  const config = SCORING_CONFIG.bonuses.comeback;
  const { maxDeficit } = calculateComebackMagnitude(probs);

  if (maxDeficit === 0) return 0;
  if (maxDeficit < config.minDeficit) return 0;

  if (maxDeficit < config.tier1) {
    return ((maxDeficit - config.minDeficit) / (config.tier1 - config.minDeficit)) * 0.5;
  } else if (maxDeficit < config.tier2) {
    return 0.5 + ((maxDeficit - config.tier1) / (config.tier2 - config.tier1)) * 0.7;
  }

  return Math.min(config.max, 1.2 + ((maxDeficit - config.tier2) / 0.04) * 0.8);
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
