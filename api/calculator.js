// Entertainment Scoring Algorithm
// Analyzes NFL/CFB games using ESPN win probability data to rank entertainment value

const SCORING_CONFIG = {
  weights: {
    outcomeUncertainty: 0.30,
    momentumDrama: 0.30,
    finishQuality: 0.40
  },
  thresholds: {
    minDataPoints: 10,
    finalPeriodStart: 4,           // Q4 for both football and basketball
    finalMomentPoints: 10,         // Last N data points for finish analysis
    walkoffSwingThreshold: 0.15    // Minimum swing to qualify as "walk-off"
  },
  bonuses: {
    overtime: 0.8  // Applied after normalization
  }
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
      overtime: game.overtime
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
  const uncertaintyScore = calculateOutcomeUncertainty(probs);

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

  // Add overtime bonus (applied after weighted combination)
  const overtimeBonus = sport === 'NBA' ? 0.8 : SCORING_CONFIG.bonuses.overtime;
  if (game.overtime) {
    rawScore += overtimeBonus;
  }

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
 * METRIC 2: Momentum Drama
 * Measures leverage-weighted swings - big swings matter more when the game is close
 * Swings near 50/50 count more than swings when the game is already decided
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on momentum drama
 */
function calculateMomentumDrama(probs) {
  if (probs.length < 2) return 0;

  let totalWeightedSwing = 0;

  for (let i = 1; i < probs.length; i++) {
    const swing = Math.abs(probs[i].value - probs[i - 1].value);
    const leverage = probs[i - 1].value * (1 - probs[i - 1].value); // Max at 0.5, zero at 0 or 1
    const weightedSwing = swing * leverage * 4; // Scale factor since max leverage is 0.25
    totalWeightedSwing += weightedSwing;
  }

  // Apply diminishing returns to prevent single massive swings from dominating
  // Adjusted scaling to better differentiate between game types
  // Typical cumulative values: blowout ~1.0-1.5, close game ~2.5-3.5, thriller ~3.5-5.0
  const score = Math.min(10, (Math.log(1 + totalWeightedSwing) / Math.log(1 + 6)) * 10);

  return Math.max(0, score);
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

  const finalMoments = Math.min(SCORING_CONFIG.thresholds.finalMomentPoints, probs.length);
  const finalProbs = probs.slice(-finalMoments);
  const lastProb = probs[probs.length - 1].value;

  // Component 1: Final probability closeness (how close to 0.5 at game end)
  const finalCloseness = 1 - Math.abs(lastProb - 0.5) * 2; // 0 to 1
  const closenessScore = Math.pow(finalCloseness, 0.7) * 4; // Up to 4 points

  // Component 2: Final period volatility
  // Get final 25% of data points as "final period"
  const finalPeriodSize = Math.floor(probs.length * 0.25);
  const finalPeriod = probs.slice(-finalPeriodSize);

  let finalPeriodMovement = 0;
  for (let i = 1; i < finalPeriod.length; i++) {
    finalPeriodMovement += Math.abs(finalPeriod[i].value - finalPeriod[i - 1].value);
  }

  // More movement in final period = more exciting
  const volatilityScore = Math.min(4, finalPeriodMovement * 8); // Up to 4 points

  // Component 3: Walk-off detection (large swing in final moments)
  let maxFinalSwing = 0;
  for (let i = 1; i < finalProbs.length; i++) {
    const swing = Math.abs(finalProbs[i].value - finalProbs[i - 1].value);
    maxFinalSwing = Math.max(maxFinalSwing, swing);
  }

  let walkoffScore = 0;
  if (maxFinalSwing >= SCORING_CONFIG.thresholds.walkoffSwingThreshold) {
    walkoffScore = 2 + Math.min(2, (maxFinalSwing - 0.15) * 10); // Up to 4 points
  }

  // Combine components (max 12, scaled to 10)
  const totalScore = (closenessScore + volatilityScore + walkoffScore) * (10 / 12);

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
  const centered = (rawScore - 5) / 2.2;
  const sigmoid = 1 / (1 + Math.exp(-centered * 1.2));

  // Map sigmoid output (0-1) to final score (1-10)
  return Math.max(1, Math.min(10, 1 + sigmoid * 9));
}
