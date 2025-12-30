// Entertainment Scoring Algorithm
// Analyzes NFL/CFB games using ESPN win probability data to rank entertainment value

const SCORING_CONFIG = {
  weights: {
    leadChanges: 0.20,       // reduced from 0.25
    lateGame: 0.30,          // unchanged
    totalMovement: 0.15,     // reduced from 0.20
    dramaticFinish: 0.20,    // increased from 0.15
    persistence: 0.15        // increased from 0.10
  },
  thresholds: {
    minDataPoints: 10,
    blowoutThreshold: 0.88,      // lowered from 0.95
    closeGameBand: [0.35, 0.65],
    dramaticSwingThreshold: 0.12 // lowered from 0.20
  },
  bonuses: {
    overtime: 1.0  // increased from 0.5
  }
  // Remove the 'scaling' object entirely - each function handles its own scaling
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

  // Diminishing returns: 2 changes = 5, 5 = 7.5, 10 = 9.2, 20 = 9.9
  const score = 10 * (1 - Math.exp(-leadChanges / 4));
  return Math.min(10, score);
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

  // Log scale: movement of 1 = 4.3, 2 = 6.1, 4 = 7.7, 8 = 9.2
  const normalized = Math.log(1 + totalMovement) / Math.log(10);
  return Math.min(10, normalized * 10);
}

/**
 * Analyzes 4th quarter excitement, with extra weight for final 2 minutes
 * Penalizes garbage time (blowouts that stay blown out in Q4)
 * @param {Array} probs - Array of probability objects with value, period, and clock
 * @returns {number} Score from 0-10 based on late-game action
 */
function calculateLateGameExcitement(probs) {
  const fourthQuarter = probs.filter(p => p.period >= 4);
  const segment = fourthQuarter.length > 0
    ? fourthQuarter
    : probs.slice(Math.floor(probs.length * 0.75));

  if (segment.length === 0) return 5;

  // Detect garbage time
  const blowoutPoints = segment.filter(p =>
    p.value > SCORING_CONFIG.thresholds.blowoutThreshold ||
    p.value < (1 - SCORING_CONFIG.thresholds.blowoutThreshold)
  ).length;
  const garbageTimeRatio = blowoutPoints / segment.length;

  // Heavy penalty for garbage time
  if (garbageTimeRatio > 0.8) {
    return 1.5;
  }

  // Calculate balance (how close to 50/50)
  const balances = segment.map(p => 1 - Math.abs(p.value - 0.5) * 2);
  const avgBalance = balances.reduce((sum, b) => sum + b, 0) / balances.length;

  // Calculate Q4 movement
  let movement = 0;
  for (let i = 1; i < segment.length; i++) {
    movement += Math.abs(segment[i].value - segment[i - 1].value);
  }

  // More conservative formula with capped movement contribution
  let score = (avgBalance * 6) + Math.min(4, movement * 4);

  // Partial garbage time penalty
  if (garbageTimeRatio > 0.3) {
    score *= (1 - garbageTimeRatio * 0.5);
  }

  return Math.min(10, score);
}

/**
 * Detects dramatic finishes (big swings in final moments or close final score)
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10, with bonus for walk-offs and last-second wins
 */
function calculateDramaticFinish(probs) {
  if (probs.length < 10) return 0;

  const final10 = probs.slice(-10);
  const final5 = probs.slice(-5);
  const finalProb = probs[probs.length - 1].value;

  // Find maximum swing in final 10 data points
  let maxSwing = 0;
  for (let i = 1; i < final10.length; i++) {
    const swing = Math.abs(final10[i].value - final10[i - 1].value);
    maxSwing = Math.max(maxSwing, swing);
  }

  // Calculate volatility in final 5 points
  let finalVolatility = 0;
  for (let i = 1; i < final5.length; i++) {
    finalVolatility += Math.abs(final5[i].value - final5[i - 1].value);
  }

  const [minClose, maxClose] = SCORING_CONFIG.thresholds.closeGameBand;
  const wasCloseFinish = finalProb >= minClose && finalProb <= maxClose;

  let score = 0;

  // Big swing in final moments
  if (maxSwing > SCORING_CONFIG.thresholds.dramaticSwingThreshold) {
    score += 4 + Math.min(4, (maxSwing - 0.12) * 30);
  }

  // Close finish bonus
  if (wasCloseFinish) {
    score += 3;
  }

  // Extra volatility bonus
  if (finalVolatility > 0.2) {
    score += Math.min(2, finalVolatility * 4);
  }

  return Math.min(10, score);
}

/**
 * Measures how long the game stayed close (win prob between 40-60%)
 * @param {Array} probs - Array of probability objects with value property
 * @returns {number} Score from 0-10 based on closeness persistence
 */
function calculatePersistence(probs) {
  if (probs.length === 0) return 5;

  // Count points where game was actually close (35-65% win probability)
  const closePoints = probs.filter(p => p.value >= 0.35 && p.value <= 0.65).length;
  const closenessRatio = closePoints / probs.length;

  // Slightly exponential: 30% = 2.5, 50% = 5.5, 70% = 8.5, 90% = 10
  const score = Math.pow(closenessRatio, 1.3) * 12;

  return Math.min(10, score);
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
