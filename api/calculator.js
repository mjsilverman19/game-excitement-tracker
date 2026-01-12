// Entertainment Scoring Algorithm
// Analyzes NFL/CFB games using ESPN win probability data to rank entertainment value

import { ALGORITHM_CONFIG } from '../shared/algorithm-config.js';
import { detectDataQualityIssues } from './data-quality.js';

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
    dramaLogBase: ALGORITHM_CONFIG.thresholds.dramaLogBase,
    tensionFloor: ALGORITHM_CONFIG.thresholds.tensionFloor,
    finishLogBase: ALGORITHM_CONFIG.thresholds.finishLogBase,
    finishWalkoff: ALGORITHM_CONFIG.thresholds.finishWalkoff,
    exceptionalFinish: ALGORITHM_CONFIG.thresholds.exceptionalFinish,
    blowoutMargin: ALGORITHM_CONFIG.thresholds.blowoutMargin,
    competitiveBand: ALGORITHM_CONFIG.thresholds.competitiveBand,
    dramaTimeWeight: ALGORITHM_CONFIG.thresholds.dramaTimeWeight,
    leadChangeSigmoid: ALGORITHM_CONFIG.thresholds.leadChangeSigmoid,
    comeback: ALGORITHM_CONFIG.thresholds.comeback,
    decisionPoint: ALGORITHM_CONFIG.thresholds.decisionPoint
  },
  bonuses: ALGORITHM_CONFIG.bonuses
};

/**
 * Fetches all probability data for a game, handling pagination if needed.
 * ESPN API typically returns 400-600 data points for a full game.
 *
 * @param {string} gameId - ESPN game ID
 * @param {string} sport - Sport type (NFL, CFB, NBA)
 * @returns {Promise<Array|null>} Array of probability items or null on error
 */
export async function fetchAllProbabilities(gameId, sport) {
  let sportType, league;
  if (sport === 'NBA') {
    sportType = 'basketball';
    league = 'nba';
  } else {
    sportType = 'football';
    league = sport === 'CFB' ? 'college-football' : 'nfl';
  }

  const baseUrl = `https://sports.core.api.espn.com/v2/sports/${sportType}/leagues/${league}/events/${gameId}/competitions/${gameId}/probabilities`;

  // Use limit=1000 to capture all data points (games typically have 400-600)
  // This prevents the truncation bug that was causing missing game-ending sequences
  let allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}?limit=1000&page=${page}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (page === 1) return null; // First page failed
        break; // Subsequent pages may not exist
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        break;
      }

      allItems = allItems.concat(data.items);

      // Check if there are more pages
      // ESPN uses pageCount to indicate total pages
      const pageCount = data.pageCount || 1;
      hasMore = page < pageCount;
      page++;

      // Safety limit to prevent infinite loops
      if (page > 10) break;
    } catch (error) {
      if (page === 1) return null;
      break;
    }
  }

  return allItems.length > 0 ? allItems : null;
}

export async function analyzeGameEntertainment(game, sport = 'NFL') {
  try {
    const probItems = await fetchAllProbabilities(game.id, sport);

    if (!probItems || probItems.length < SCORING_CONFIG.thresholds.minDataPoints) {
      return null;
    }

    const excitement = calculateExcitement(probItems, game, sport);

    // Check for data quality issues
    const dataQuality = detectDataQualityIssues(probItems, game, sport);

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
      playoffRound: game.playoffRound,
      dataQuality: dataQuality.hasIssues ? {
        warning: true,
        severity: dataQuality.severity,
        issues: dataQuality.issues.map(i => i.message)
      } : undefined
    };
  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return null;
  }
}

export async function analyzeGameEntertainmentDetailed(game, sport = 'NFL') {
  try {
    const probItems = await fetchAllProbabilities(game.id, sport);

    if (!probItems || probItems.length < SCORING_CONFIG.thresholds.minDataPoints) {
      return null;
    }

    const excitement = calculateExcitementDetailed(probItems, game, sport);
    if (!excitement) return null;

    // Check for data quality issues
    const dataQuality = detectDataQualityIssues(probItems, game, sport);

    return {
      id: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      overtime: game.overtime,
      bowlName: game.bowlName,
      playoffRound: game.playoffRound,
      ...excitement,
      dataQuality: dataQuality.hasIssues ? {
        warning: true,
        severity: dataQuality.severity,
        issues: dataQuality.issues.map(i => i.message)
      } : undefined
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
  const finishScore = calculateFinishQuality(probs, game, sport, overtimeDetected);

  const margin =
    typeof game?.homeScore === 'number' && typeof game?.awayScore === 'number'
      ? Math.abs(game.homeScore - game.awayScore)
      : null;
  const lateCloseness = calculateLateCloseness(probs);

  // Apply margin-based tension floor for close final scores
  if (margin != null) {
    const marginFloor = calculateMarginBasedTensionFloor(margin, sport, lateCloseness);
    tensionScore = Math.max(tensionScore, marginFloor);
  }
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
  const closeGameBonus = calculateCloseGameBonus(game, sport, finishScore, tensionScore); // 0-1.0
  
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

  // Store pre-adjustment score for diagnostics
  const rawScoreBeforeDecision = rawScore;

  // DECISION POINT ADJUSTMENT
  // Penalize games that were decided early, even if they had excitement before that
  const decisionAdjustment = applyDecisionAdjustment(rawScore, probs);
  rawScore = decisionAdjustment.adjustedScore;
  const decisionPointInfo = decisionAdjustment.decisionPointInfo;

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
        rawScoreBeforeDecision,
        finalScore,
        tensionScore,
        dramaScore,
        finishScore,
        overtimeFloorApplied: false,
        overtimeDetected,
        decisionPointInfo
      };
    }
  }

  // OT floor: overtime games should rarely score below 6.0
  if (overtimeDetected && finalScore < 6.0) {
    return {
      score: 6.0,
      breakdown,
      rawScore,
      rawScoreBeforeDecision,
      finalScore,
      tensionScore,
      dramaScore,
      finishScore,
      overtimeFloorApplied: true,
      overtimeDetected,
      decisionPointInfo
    };
  }

  return {
    score: Math.max(1, Math.min(10, Math.round(finalScore * 10) / 10)),
    breakdown,
    rawScore,
    rawScoreBeforeDecision,
    finalScore,
    tensionScore,
    dramaScore,
    finishScore,
    overtimeFloorApplied: false,
    overtimeDetected,
    decisionPointInfo
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
  const logBase = SCORING_CONFIG.thresholds.dramaLogBase;
  const score = Math.min(10, (Math.log(1 + totalWeightedSwing) / Math.log(1 + logBase)) * 10);

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
 * Detects when game data ends with an extended decisive stretch and trims it
 * for finish quality evaluation. If the final N points are all at an extreme
 * (<2% or >98%), trim them to find the actual competitive finish window.
 *
 * Note (v3.2): With complete data fetching (limit=1000), this function still
 * triggers on ~10 canonical games where the game became decisive and stayed
 * that way. This helps the finish metric focus on the last competitive moment
 * rather than the decisive "mop-up" period. Kept for finish quality accuracy.
 *
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
 * @param {boolean} overtimeDetected - Whether the game went to overtime
 * @returns {number} Score from 0-10 based on finish quality
 */
function calculateFinishQuality(probs, game, sport = 'NFL', overtimeDetected = false) {
  if (probs.length < SCORING_CONFIG.thresholds.finalMomentPoints) return 0;

  // Detect truncated OT data
  const adjustedProbs = detectAndAdjustForTruncatedData(probs);
  const finalMoments = Math.min(SCORING_CONFIG.thresholds.finalMomentPoints, adjustedProbs.length);
  const finalProbs = adjustedProbs.slice(-finalMoments);
  const lastProb = adjustedProbs[adjustedProbs.length - 1].value;
  const finishWalkoff = SCORING_CONFIG.thresholds.finishWalkoff ?? {
    competitiveRange: { low: 0.35, high: 0.65 },
    minSwing: 0.15,
    largeSwing: 0.25
  };

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
  // V2.9: Loosen competitive range and add decisive final-play detection
  // Requires EITHER:
  // 1. Swing crosses 0.5 (true lead change), OR
  // 2. Started competitive AND moved toward 0.5
  let maxFinalSwing = 0;
  for (let i = 1; i < finalProbs.length; i++) {
    const startValue = finalProbs[i - 1].value;
    const endValue = finalProbs[i].value;
    const swing = Math.abs(endValue - startValue);

    const crossedHalf = (startValue - 0.5) * (endValue - 0.5) < 0;
    const startedTightCompetitive =
      startValue >= finishWalkoff.competitiveRange.low &&
      startValue <= finishWalkoff.competitiveRange.high;
    const movedToward50 = Math.abs(endValue - 0.5) < Math.abs(startValue - 0.5);

    // Only count if it crossed 0.5 OR (started tight competitive AND moved toward 0.5)
    if (crossedHalf) {
      maxFinalSwing = Math.max(maxFinalSwing, swing);
    } else if (startedTightCompetitive && movedToward50) {
      maxFinalSwing = Math.max(maxFinalSwing, swing);
    }
  }

  let walkoffScore = 0;
  if (maxFinalSwing >= finishWalkoff.minSwing) {
    walkoffScore = 1 + Math.min(2, (maxFinalSwing - finishWalkoff.minSwing) * 8);
  }

  const secondToLast =
    finalProbs.length >= 2 ? finalProbs[finalProbs.length - 2].value : null;
  const lastValue = finalProbs[finalProbs.length - 1].value;
  if (secondToLast !== null) {
    const finalSwing = Math.abs(lastValue - secondToLast);
    const preSwingCompetitive =
      secondToLast >= finishWalkoff.competitiveRange.low &&
      secondToLast <= finishWalkoff.competitiveRange.high;
    const veryLargeSwing = finalSwing >= finishWalkoff.largeSwing;

    if (finalSwing >= finishWalkoff.minSwing && (preSwingCompetitive || veryLargeSwing)) {
      const finalPlayBonus = Math.min(2.0, finalSwing * 6);
      walkoffScore = Math.max(walkoffScore, finalPlayBonus);
    }
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

  const baseTotalScore = (closenessScore + volatilityScore) * finishPenalty + walkoffScore;
  const exceptionalMultiplier = calculateExceptionalFinishMultiplier(
    adjustedProbs,
    overtimeDetected
  );
  const finishLogBase = SCORING_CONFIG.thresholds.finishLogBase ?? 12;

  // Scale to 0-10 with higher ceiling for truly elite finishes
  const totalScore = Math.min(
    10,
    (Math.log(1 + baseTotalScore * exceptionalMultiplier) /
      Math.log(1 + finishLogBase)) * 10
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
 * @param {number} tensionScore - The tension score (0-10), used to dampen boring close games
 * @returns {number} Bonus from 0-1.0 based on margin
 */
function calculateCloseGameBonus(game, sport, finishScore = 0, tensionScore = 0) {
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

  // Reduce bonus if tension was low (close score doesn't fix a non-competitive game)
  const tensionFloor = config.tensionFloor ?? 3.0;
  const tensionFullCredit = config.tensionFullCredit ?? 5.0;
  if (tensionScore < tensionFloor) {
    baseBonus *= 0.25;
  } else if (tensionScore < tensionFullCredit) {
    const tensionFactor =
      0.25 + 0.75 * ((tensionScore - tensionFloor) / (tensionFullCredit - tensionFloor));
    baseBonus *= tensionFactor;
  }

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
 * Ensures close games receive baseline tension even when win-probability leans
 * are steady throughout the game.
 * 
 * @param {number} margin - Final score margin
 * @param {string} sport - Sport type for context
 * @param {number|null} lateCloseness - Late-game closeness metric
 * @returns {number} Tension floor from 0-4.0 based on margin
 */
function calculateMarginBasedTensionFloor(margin, sport, lateCloseness = null) {
  const config = SCORING_CONFIG.thresholds.tensionFloor;
  if (!config) return 0;

  const factor = sport === 'NBA' ? config.nbaMultiplier : 1;
  let floor = 0;

  if (margin <= config.oneScore.margin * factor) {
    floor = config.oneScore.floor;
  } else if (margin <= config.close.margin * factor) {
    floor = config.close.floor;
  } else if (margin <= config.competitive.margin * factor) {
    floor = config.competitive.floor;
  }

  if (floor > 0 && lateCloseness != null && lateCloseness < 0.15 &&
      margin <= config.close.margin * factor) {
    floor *= 0.5;
  }

  return floor;
}

function calculateExceptionalFinishMultiplier(probs, overtimeDetected) {
  const config = SCORING_CONFIG.thresholds.exceptionalFinish;
  if (!config || probs.length < 20) return 1.0;

  let criteriaCount = 0;

  const q4StartIndex = Math.floor(probs.length * 0.75);
  const q4Probs = probs.slice(q4StartIndex);
  let q4Crossings = 0;
  for (let i = 1; i < q4Probs.length; i++) {
    if ((q4Probs[i - 1].value - 0.5) * (q4Probs[i].value - 0.5) < 0) {
      q4Crossings++;
    }
  }
  if (q4Crossings >= config.lateLeadChangesRequired) criteriaCount++;

  if (overtimeDetected) {
    const preOTWindow = probs.slice(
      Math.floor(probs.length * 0.80),
      Math.floor(probs.length * 0.90)
    );
    if (preOTWindow.length > 0) {
      const avgPreOT =
        preOTWindow.reduce((sum, p) => sum + p.value, 0) / preOTWindow.length;
      if (
        avgPreOT >= config.competitiveOTRange.low &&
        avgPreOT <= config.competitiveOTRange.high
      ) {
        criteriaCount++;
      }
    }
  }

  if (probs.length >= 2) {
    const prevValue = probs[probs.length - 2].value;
    const lastValue = probs[probs.length - 1].value;
    const lastSwing = Math.abs(lastValue - prevValue);
    const lastCrossed = (prevValue - 0.5) * (lastValue - 0.5) < 0;
    if (lastSwing >= config.finalSwingThreshold && lastCrossed) criteriaCount++;
  }

  const finalWindow = probs.slice(-config.finalWindowSize);
  if (finalWindow.length > 0) {
    const avgFinal =
      finalWindow.reduce((sum, p) => sum + p.value, 0) / finalWindow.length;
    if (
      avgFinal >= config.sustainedUncertaintyRange.low &&
      avgFinal <= config.sustainedUncertaintyRange.high
    ) {
      criteriaCount++;
    }
  }

  if (criteriaCount >= 3) return config.multipliers.tier3;
  if (criteriaCount >= 2) return config.multipliers.tier2;
  if (criteriaCount >= 1) return config.multipliers.tier1;
  return 1.0;
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

/**
 * DECISION POINT DETECTION
 *
 * Finds the last moment a game was truly competitive before the outcome became inevitable.
 * This helps identify games that were decided early despite having late-game "movement"
 * (which is usually garbage time and emotionally irrelevant).
 *
 * Logic: Find the LAST index where probability was inside the competitive band (25-75%)
 * AND the game subsequently stayed outside this band for the remainder.
 *
 * @param {Array} probs - Array of probability objects with value property (0-1)
 * @returns {Object} { decisionPointIndex, decisionLateness, wasEverCompetitive, wasAlwaysCompetitive }
 */
export function findDecisionPoint(probs) {
  const config = SCORING_CONFIG.thresholds.decisionPoint;
  const bandLow = config?.competitiveBandLow ?? 0.25;
  const bandHigh = config?.competitiveBandHigh ?? 0.75;

  if (!probs || probs.length < 2) {
    return {
      decisionPointIndex: 0,
      decisionLateness: 1.0,
      wasEverCompetitive: true,
      wasAlwaysCompetitive: true
    };
  }

  // Check if each point is in the competitive band
  const inBand = probs.map(p => p.value >= bandLow && p.value <= bandHigh);

  // Edge case: game was never competitive (never entered the band)
  const wasEverCompetitive = inBand.some(b => b);
  if (!wasEverCompetitive) {
    return {
      decisionPointIndex: 0,
      decisionLateness: 0.0,
      wasEverCompetitive: false,
      wasAlwaysCompetitive: false
    };
  }

  // Edge case: game never left competitive band (always in doubt)
  const wasAlwaysCompetitive = inBand.every(b => b);
  if (wasAlwaysCompetitive) {
    return {
      decisionPointIndex: probs.length - 1,
      decisionLateness: 1.0,
      wasEverCompetitive: true,
      wasAlwaysCompetitive: true
    };
  }

  // Find the LAST index where:
  // 1. The game was in the competitive band at this point
  // 2. The game stayed OUTSIDE the band for all remaining points
  //
  // Walk backwards from the end to find the first point (from the end) that's in the band
  // That point + 1 is where the game "left" the competitive zone for good
  let decisionPointIndex = probs.length - 1;

  for (let i = probs.length - 1; i >= 0; i--) {
    if (inBand[i]) {
      // This is the last time the game was in the competitive band
      decisionPointIndex = i;
      break;
    }
  }

  // Calculate decision lateness (0.0 = decided at start, 1.0 = decided at end)
  const decisionLateness = probs.length > 1
    ? decisionPointIndex / (probs.length - 1)
    : 1.0;

  return {
    decisionPointIndex,
    decisionLateness,
    wasEverCompetitive: true,
    wasAlwaysCompetitive: false
  };
}

/**
 * Maps decision lateness to a 1-10 score for Option C blend
 * Non-linear mapping that rewards late decisions
 *
 * @param {number} lateness - Value from 0.0 to 1.0
 * @returns {number} Score from 2-10 based on lateness tier
 */
function decisionLatenessToScore(lateness) {
  const config = SCORING_CONFIG.thresholds.decisionPoint;
  const scoreMap = config?.latenessScoreMap ?? [
    { minLateness: 0.95, score: 10 },
    { minLateness: 0.90, score: 9 },
    { minLateness: 0.80, score: 8 },
    { minLateness: 0.70, score: 7 },
    { minLateness: 0.60, score: 6 },
    { minLateness: 0.50, score: 5 },
    { minLateness: 0.35, score: 4 },
    { minLateness: 0.20, score: 3 },
    { minLateness: 0.00, score: 2 }
  ];

  // Find the tier for this lateness value
  for (const tier of scoreMap) {
    if (lateness >= tier.minLateness) {
      return tier.score;
    }
  }

  return 2; // Fallback for very early decisions
}

/**
 * Option A: Multiplier Approach
 *
 * Applies a multiplier based on decision lateness using a power function.
 * sqrt(lateness) softens the penalty while still penalizing early decisions.
 *
 * Examples:
 * - Game decided at 100% (final play): multiplier = 1.0 (no penalty)
 * - Game decided at 90%: multiplier = 0.95 (5% penalty)
 * - Game decided at 60%: multiplier = 0.77 (23% penalty)
 * - Game decided at 25%: multiplier = 0.50 (50% penalty)
 *
 * @param {number} rawScore - The raw weighted score before decision adjustment
 * @param {Array} probs - Array of probability objects with value property
 * @returns {Object} { adjustedScore, decisionPointInfo }
 */
export function applyDecisionAdjustmentA(rawScore, probs) {
  const config = SCORING_CONFIG.thresholds.decisionPoint;
  const exponent = config?.multiplierExponent ?? 0.5;

  const decisionInfo = findDecisionPoint(probs);
  const multiplier = Math.pow(decisionInfo.decisionLateness, exponent);
  const adjustedScore = rawScore * multiplier;

  return {
    adjustedScore,
    decisionPointInfo: {
      ...decisionInfo,
      multiplier,
      method: 'A'
    }
  };
}

/**
 * Option C: Blend Approach
 *
 * Blends the raw score with a lateness-derived score.
 * Default: 40% raw score + 60% lateness score
 *
 * This approach weights "when was it decided" heavily while still
 * preserving some credit for early-game excitement.
 *
 * Example (76ers game with lateness ~0.6):
 * - Raw score: 8.6
 * - Lateness score: 6 (from 60% lateness)
 * - Blended: (8.6 × 0.4) + (6 × 0.6) = 3.44 + 3.6 = 7.04
 *
 * @param {number} rawScore - The raw weighted score before decision adjustment
 * @param {Array} probs - Array of probability objects with value property
 * @returns {Object} { adjustedScore, decisionPointInfo }
 */
export function applyDecisionAdjustmentC(rawScore, probs) {
  const config = SCORING_CONFIG.thresholds.decisionPoint;
  const blendWeightLateness = config?.blendWeightLateness ?? 0.6;
  const blendWeightRaw = 1 - blendWeightLateness;

  const decisionInfo = findDecisionPoint(probs);
  const latenessScore = decisionLatenessToScore(decisionInfo.decisionLateness);
  const adjustedScore = (rawScore * blendWeightRaw) + (latenessScore * blendWeightLateness);

  return {
    adjustedScore,
    decisionPointInfo: {
      ...decisionInfo,
      latenessScore,
      blendWeightRaw,
      blendWeightLateness,
      method: 'C'
    }
  };
}

/**
 * Applies decision point adjustment based on configured method
 *
 * @param {number} rawScore - The raw weighted score before decision adjustment
 * @param {Array} probs - Array of probability objects with value property
 * @returns {Object} { adjustedScore, decisionPointInfo } or { adjustedScore: rawScore, decisionPointInfo: null } if disabled
 */
export function applyDecisionAdjustment(rawScore, probs) {
  const config = SCORING_CONFIG.thresholds.decisionPoint;
  const method = config?.adjustmentMethod ?? 'none';

  switch (method) {
    case 'A':
      return applyDecisionAdjustmentA(rawScore, probs);
    case 'C':
      return applyDecisionAdjustmentC(rawScore, probs);
    case 'none':
    default:
      return {
        adjustedScore: rawScore,
        decisionPointInfo: null
      };
  }
}
