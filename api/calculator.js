// Entertainment Scoring Algorithm
// Analyzes NFL/CFB games using ESPN win probability data to rank entertainment value

const SCORING_CONFIG = {
  weights: {
    leadChanges: 0.25,
    lateGame: 0.30,
    totalMovement: 0.20,
    dramaticFinish: 0.15,
    persistence: 0.10
  },
  thresholds: {
    minDataPoints: 10,          // fewer than this = return null
    significantSwing: 0.10,     // 10% win prob change = notable
    blowoutThreshold: 0.95,     // above this in Q4 = garbage time
    closeGameBand: [0.35, 0.65], // final win prob in this range = close finish
    dramaticSwingThreshold: 0.20 // 20% swing in final 5 points = dramatic
  },
  bonuses: {
    overtime: 0.5,
    dramaticFinish: 1.0
  },
  // Scaling factors for normalizing to 1-10 range
  scaling: {
    leadChanges: 1.5,      // multiply lead change count by this
    totalMovement: 12,     // scale total movement to 0-10
    persistence: 12        // scale persistence ratio to 0-10
  }
};

export async function analyzeGameEntertainment(game, sport = 'NFL') {
  try {
    const league = sport === 'CFB' ? 'college-football' : 'nfl';
    const probUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/${league}/events/${game.id}/competitions/${game.id}/probabilities?limit=300`;

    const response = await fetch(probUrl);

    if (!response.ok) {
      return null;
    }

    const probData = await response.json();

    if (!probData.items || probData.items.length < SCORING_CONFIG.thresholds.minDataPoints) {
      return null;
    }

    const excitement = calculateExcitement(probData.items, game);

    return {
      id: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      excitement: excitement,
      overtime: game.overtime
    };
  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return null;
  }
}

function calculateExcitement(probabilities, game) {
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

  // METRIC 1: Lead Changes (how many times the favorite flipped)
  const leadChangeScore = calculateLeadChanges(probs);

  // METRIC 2: Late-Game Excitement (4th quarter action, penalize garbage time)
  const lateGameScore = calculateLateGameExcitement(probs);

  // METRIC 3: Total Movement (sum of absolute changes in win probability)
  const totalMovementScore = calculateTotalMovement(probs);

  // METRIC 4: Dramatic Finish (big swings or close finish in final moments)
  const dramaticFinishScore = calculateDramaticFinish(probs);

  // METRIC 5: Persistence (how long the game stayed close)
  const persistenceScore = calculatePersistence(probs);

  // Weighted combination
  const weights = SCORING_CONFIG.weights;
  let rawScore =
    leadChangeScore * weights.leadChanges +
    lateGameScore * weights.lateGame +
    totalMovementScore * weights.totalMovement +
    dramaticFinishScore * weights.dramaticFinish +
    persistenceScore * weights.persistence;

  // Add overtime bonus
  if (game.overtime) {
    rawScore += SCORING_CONFIG.bonuses.overtime;
  }

  // Normalize to 1-10 range with better distribution
  const finalScore = normalizeScore(rawScore);

  return Math.max(1, Math.min(10, Math.round(finalScore * 10) / 10));
}

/**
 * Counts how many times the lead changed (win probability crossed 0.5)
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on lead change count
 */
function calculateLeadChanges(probs) {
  if (probs.length < 2) return 0;

  let leadChanges = 0;
  for (let i = 1; i < probs.length; i++) {
    const prevLeader = probs[i - 1].value >= 0.5 ? 'home' : 'away';
    const currLeader = probs[i].value >= 0.5 ? 'home' : 'away';

    if (prevLeader !== currLeader) {
      leadChanges++;
    }
  }

  return Math.min(10, leadChanges * SCORING_CONFIG.scaling.leadChanges);
}

/**
 * Measures total movement in win probability (sum of absolute changes)
 * Higher movement = more swings and excitement
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on total movement
 */
function calculateTotalMovement(probs) {
  if (probs.length < 2) return 0;

  let totalMovement = 0;
  for (let i = 1; i < probs.length; i++) {
    totalMovement += Math.abs(probs[i].value - probs[i - 1].value);
  }

  return Math.min(10, totalMovement * SCORING_CONFIG.scaling.totalMovement);
}

/**
 * Analyzes 4th quarter excitement, with extra weight for final 2 minutes
 * Penalizes garbage time (blowouts that stay blown out in Q4)
 * @param {Array} probs - Array of probability objects with value, period, and clock
 * @returns {number} Score from 0-10 based on late-game action
 */
function calculateLateGameExcitement(probs) {
  if (probs.length < 4) return 5;

  // Filter to 4th quarter and overtime
  const fourthQuarter = probs.filter(p => p.period >= 4);

  if (fourthQuarter.length === 0) {
    // Fallback to last 25% of data points if period info missing
    const lastQuarter = probs.slice(Math.floor(probs.length * 0.75));
    return calculateQuarterExcitement(lastQuarter);
  }

  // Check for garbage time (win prob > 95% throughout Q4)
  const isGarbageTime = fourthQuarter.every(p =>
    p.value > SCORING_CONFIG.thresholds.blowoutThreshold ||
    p.value < (1 - SCORING_CONFIG.thresholds.blowoutThreshold)
  );

  if (isGarbageTime) {
    return 2; // Penalize heavily
  }

  // Calculate base Q4 excitement
  let score = calculateQuarterExcitement(fourthQuarter);

  // TODO: Add extra weight for final 2 minutes when clock data is available
  // This would require parsing clock strings like "2:00" to check if < 2 min remain

  return score;
}

/**
 * Helper function to calculate excitement for a quarter segment
 * @param {Array} segment - Array of probability objects
 * @returns {number} Score from 0-10
 */
function calculateQuarterExcitement(segment) {
  if (segment.length === 0) return 5;

  // Convert to balance scores (1 = perfectly balanced, 0 = blowout)
  const balances = segment.map(p => 1 - Math.abs(p.value - 0.5) * 2);

  // Average closeness in the quarter
  const avgBalance = balances.reduce((sum, b) => sum + b, 0) / balances.length;

  // Movement within the quarter
  let movement = 0;
  for (let i = 1; i < segment.length; i++) {
    movement += Math.abs(segment[i].value - segment[i - 1].value);
  }

  return Math.min(10, (avgBalance * 5) + (movement * 25));
}

/**
 * Detects dramatic finishes (big swings in final moments or close final score)
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10, with bonus for walk-offs and last-second wins
 */
function calculateDramaticFinish(probs) {
  if (probs.length < 5) return 0;

  const finalPoints = probs.slice(-5);
  const finalProb = probs[probs.length - 1].value;

  // Check for big swings in final 5 data points
  let maxSwing = 0;
  for (let i = 1; i < finalPoints.length; i++) {
    const swing = Math.abs(finalPoints[i].value - finalPoints[i - 1].value);
    maxSwing = Math.max(maxSwing, swing);
  }

  // Check if final win probability was in close game band
  const [minClose, maxClose] = SCORING_CONFIG.thresholds.closeGameBand;
  const wasCloseFinish = finalProb >= minClose && finalProb <= maxClose;

  let score = 0;

  if (maxSwing > SCORING_CONFIG.thresholds.dramaticSwingThreshold) {
    score += SCORING_CONFIG.bonuses.dramaticFinish;
  }

  if (wasCloseFinish) {
    score += SCORING_CONFIG.bonuses.dramaticFinish * 0.5;
  }

  return Math.min(10, score * 5); // Scale to 0-10 range
}

/**
 * Measures how long the game stayed close (win prob between 40-60%)
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on closeness persistence
 */
function calculatePersistence(probs) {
  if (probs.length === 0) return 5;

  // Count how many points the game was close (within 40-60% win probability)
  const closePoints = probs.filter(p => {
    const balance = 1 - Math.abs(p.value - 0.5) * 2;
    return balance > 0.5; // balance > 0.5 means win prob between 40-60%
  }).length;

  const closenessRatio = closePoints / probs.length;

  return Math.min(10, closenessRatio * SCORING_CONFIG.scaling.persistence);
}

/**
 * Normalizes raw score to 1-10 range with better distribution
 * Applies transformation to spread results more evenly
 * @param {number} rawScore - Raw weighted score before normalization
 * @returns {number} Normalized score between 1-10
 */
function normalizeScore(rawScore) {
  // Apply square root transformation to spread lower scores
  // This helps boring games score 2-3 instead of clustering at 5-6
  const transformed = Math.sqrt(Math.max(0, rawScore)) * 3.2;

  return Math.max(1, Math.min(10, transformed));
}
