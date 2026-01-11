/**
 * vNext Entertainment Scoring Algorithm
 *
 * Three-metric model grounded in psychology research:
 * - Volatility: Moment-to-moment engagement (action density)
 * - Surprise: Expectation violation via log-odds movements
 * - Finish: Peak-end rule (endings matter most)
 */

import { VNEXT_CONFIG, getEpsilon, getEndWindow } from './algorithm-vnext-config.js';

/**
 * Calculate logit (log-odds) for a probability.
 * logit(p) = log(p / (1 - p))
 *
 * @param {number} p - Probability (should be clipped to avoid infinity)
 * @returns {number} Log-odds
 */
function logit(p) {
  return Math.log(p / (1 - p));
}

/**
 * Clip probability to safe range for logit calculation.
 *
 * @param {number} p - Raw probability
 * @returns {number} Clipped probability
 */
function clipProbability(p) {
  const { min, max } = VNEXT_CONFIG.clipping;
  return Math.max(min, Math.min(max, p));
}

/**
 * Detect indices where probability crosses 0.5 (lead changes).
 *
 * @param {Array<number>} values - Probability values
 * @returns {Array<number>} Indices where crossing occurred
 */
function detectCrossings(values) {
  const crossings = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    // Crossing occurs when values move from one side of 0.5 to the other
    if ((prev < 0.5 && curr > 0.5) || (prev > 0.5 && curr < 0.5)) {
      crossings.push(i);
    }
  }
  return crossings;
}

/**
 * Preprocess probability series for analysis.
 *
 * Steps:
 * 1. Extract values from probability objects
 * 2. Clip probabilities for logit safety
 * 3. Compute deltas (absolute probability changes)
 * 4. Compute logits and logit deltas
 * 5. Identify lead change crossings
 * 6. Determine end window boundaries
 *
 * @param {Array<Object>} probs - Array of {value, period?, clock?}
 * @param {string} sport - Sport identifier
 * @returns {Object} Preprocessed data
 */
function preprocessProbabilities(probs, sport) {
  // Extract and clip values
  const values = probs.map(p => {
    const val = typeof p === 'number' ? p : p.value;
    return clipProbability(val);
  });

  // Compute deltas (absolute changes between consecutive probabilities)
  const deltas = [];
  for (let i = 1; i < values.length; i++) {
    const delta = Math.abs(values[i] - values[i - 1]);
    deltas.push(delta);
  }

  // Compute logits
  const logits = values.map(v => logit(v));

  // Compute logit deltas (absolute changes in log-odds)
  const logitDeltas = [];
  for (let i = 1; i < logits.length; i++) {
    const delta = Math.abs(logits[i] - logits[i - 1]);
    logitDeltas.push(delta);
  }

  // Detect lead changes
  const crossings = detectCrossings(values);

  // Determine end window boundaries
  const endWindowConfig = getEndWindow(sport);
  const endWindowStart = Math.floor(values.length * (1 - endWindowConfig.percentage));

  return {
    values,
    deltas,
    logits,
    logitDeltas,
    crossings,
    endWindowStart
  };
}

/**
 * Calculate Volatility metric.
 *
 * Measures "did things happen" via sum of meaningful probability movements.
 * High volatility = lots of back-and-forth action.
 *
 * @param {Array<number>} deltas - Probability deltas
 * @param {Array<number>} crossings - Indices of lead changes
 * @param {number} endWindowStart - Index where end window begins
 * @param {Object} epsilon - Noise thresholds
 * @param {Object} config - Configuration
 * @returns {number} Raw volatility score
 */
function calculateVolatility(deltas, crossings, endWindowStart, epsilon, config) {
  // Sum meaningful probability movements (filter noise)
  const significantDeltas = deltas.filter(d => d >= epsilon.probability);
  let volatility = significantDeltas.reduce((sum, d) => sum + d, 0);

  // Add bonus for lead changes (capped)
  const cappedCrossings = Math.min(crossings.length, config.leadChange.maxCrossings);

  // Count late crossings (in finish window)
  const lateCrossings = crossings.filter(idx => idx >= endWindowStart).length;
  const earlyCrossings = cappedCrossings - lateCrossings;

  // Late crossings worth more
  const crossingBonus =
    (earlyCrossings * config.leadChange.volatilityBonus) +
    (lateCrossings * config.leadChange.volatilityBonus * config.leadChange.finishWindowMultiplier);

  volatility += crossingBonus;

  return volatility;
}

/**
 * Calculate Surprise metric.
 *
 * Measures expectation violation via sum of log-odds movements.
 * Swings from high certainty (90% → 80%) produce larger surprise than
 * swings near 50% (55% → 45%), even with same percentage point change.
 *
 * This captures the "the game was over, then it wasn't" phenomenon.
 *
 * @param {Array<number>} logitDeltas - Log-odds deltas
 * @param {Object} epsilon - Noise thresholds
 * @returns {number} Raw surprise score
 */
function calculateSurprise(logitDeltas, epsilon) {
  // Sum meaningful log-odds movements (filter noise)
  const significantDeltas = logitDeltas.filter(d => d >= epsilon.logit);
  const surprise = significantDeltas.reduce((sum, d) => sum + d, 0);
  return surprise;
}

/**
 * Calculate Finish metric.
 *
 * Measures ending drama via combination of:
 * 1. End-window volatility (action in final period)
 * 2. End-window uncertainty (how close was it?)
 * 3. Late lead changes (salient dramatic events)
 *
 * Based on Peak-End Rule: endings disproportionately affect memory.
 *
 * @param {Array<number>} values - Probability values
 * @param {Array<number>} deltas - Probability deltas
 * @param {Array<number>} crossings - Indices of lead changes
 * @param {number} endWindowStart - Index where end window begins
 * @param {Object} epsilon - Noise thresholds
 * @param {Object} config - Configuration
 * @returns {number} Raw finish score
 */
function calculateFinish(values, deltas, crossings, endWindowStart, epsilon, config) {
  // Extract end window data
  const endWindowValues = values.slice(endWindowStart);
  const endWindowDeltas = deltas.slice(endWindowStart);

  // 1. End-window volatility: sum of probability movements in final period
  const significantEndDeltas = endWindowDeltas.filter(d => d >= epsilon.probability);
  const endVolatility = significantEndDeltas.reduce((sum, d) => sum + d, 0);

  // 2. End-window uncertainty: how close was the game?
  // Uncertainty = 1 - 2*|p - 0.5|
  // Max uncertainty (1.0) at p = 0.5, min (0.0) at p = 0 or 1
  const uncertainties = endWindowValues.map(p => 1 - 2 * Math.abs(p - 0.5));
  const avgUncertainty = uncertainties.reduce((sum, u) => sum + u, 0) / uncertainties.length;

  // 3. Late lead changes: crossings in end window
  const lateCrossings = crossings.filter(idx => idx >= endWindowStart).length;
  const lateCrossingBonus = lateCrossings * config.leadChange.volatilityBonus * config.leadChange.finishWindowMultiplier;

  // Combine components
  const finish = endVolatility + avgUncertainty + lateCrossingBonus;

  return finish;
}

/**
 * Normalize raw subscores to 0-1 range using sport-specific normalizers.
 *
 * Uses percentile-based scaling where the 95th percentile maps to 1.0.
 * This is established via calibration on historical game data.
 *
 * @param {number} rawVolatility - Raw volatility score
 * @param {number} rawSurprise - Raw surprise score
 * @param {number} rawFinish - Raw finish score
 * @param {string} sport - Sport identifier
 * @param {Object} normalizers - Calibration-derived normalizer values
 * @returns {Object} {volatility, surprise, finish} normalized to [0, 1]
 */
function normalizeSubscores(rawVolatility, rawSurprise, rawFinish, sport, normalizers) {
  // Default normalizers if none provided or sport not found
  const defaultNormalizers = {
    volatility: { p50: 1.0, p95: 2.5 },
    surprise: { p50: 8.0, p95: 18.0 },
    finish: { p50: 0.5, p95: 1.2 }
  };

  const sportNormalizers = (normalizers && normalizers[sport]) || defaultNormalizers;

  // Linear scaling: 95th percentile → 1.0
  // Formula: normalized = raw / p95
  // Clamped to [0, 1]
  const volatility = Math.max(0, Math.min(1, rawVolatility / sportNormalizers.volatility.p95));
  const surprise = Math.max(0, Math.min(1, rawSurprise / sportNormalizers.surprise.p95));
  const finish = Math.max(0, Math.min(1, rawFinish / sportNormalizers.finish.p95));

  return { volatility, surprise, finish };
}

/**
 * Map weighted subscore sum (0-1) to final score (1-10).
 *
 * Simple linear mapping with clamping.
 *
 * @param {number} weightedSum - Weighted sum of normalized subscores
 * @param {Object} config - Configuration
 * @returns {number} Final score on 1-10 scale
 */
function mapToFinalScore(weightedSum, config) {
  const { min, max } = config.scoreRange;
  const range = max - min;

  // Linear mapping: 0 → 1, 1 → 10
  const score = min + (weightedSum * range);

  // Clamp and round
  const clamped = Math.max(min, Math.min(max, score));
  return Math.round(clamped * 10) / 10; // Round to 1 decimal place
}

/**
 * Detect potentially truncated end-game data.
 *
 * If final probability is suspiciously close to 50% and game is complete,
 * data may have been cut off before the actual ending.
 *
 * @param {Array<number>} values - Probability values
 * @returns {boolean} True if truncation suspected
 */
function detectTruncation(values) {
  if (values.length === 0) return false;

  const finalProb = values[values.length - 1];
  // Suspicious if final probability is between 0.45 and 0.55
  return finalProb >= 0.45 && finalProb <= 0.55;
}

/**
 * Score a game using the vNext Volatility + Surprise + Finish model.
 *
 * @param {Array} probabilities - Array of {value: number, period?: number, clock?: string}
 *                                where value is home team win probability (0-1)
 * @param {Object} meta - Game metadata {sport: string, overtime: boolean}
 * @param {Object} normalizers - Optional sport-specific normalizer values from calibration
 * @returns {Object|null} {
 *   score: number (1-10),
 *   subscores: {volatility, surprise, finish}, // normalized to 0-1
 *   diagnostics: {...}
 * } or null if insufficient data
 */
export function scoreGame(probabilities, meta = {}, normalizers = null) {
  // Validate input
  if (!probabilities || probabilities.length < VNEXT_CONFIG.minDataPoints) {
    return null;
  }

  const sport = meta.sport || 'NFL';
  const overtime = meta.overtime || false;

  // Preprocess data
  const {
    values,
    deltas,
    logits,
    logitDeltas,
    crossings,
    endWindowStart
  } = preprocessProbabilities(probabilities, sport);

  // Get sport-specific configuration
  const epsilon = getEpsilon(sport);

  // Calculate raw subscores
  const rawVolatility = calculateVolatility(
    deltas,
    crossings,
    endWindowStart,
    epsilon,
    VNEXT_CONFIG
  );

  const rawSurprise = calculateSurprise(logitDeltas, epsilon);

  const rawFinish = calculateFinish(
    values,
    deltas,
    crossings,
    endWindowStart,
    epsilon,
    VNEXT_CONFIG
  );

  // Normalize subscores
  const normalizedSubscores = normalizeSubscores(
    rawVolatility,
    rawSurprise,
    rawFinish,
    sport,
    normalizers
  );

  // Calculate weighted sum
  const weightedSum =
    (normalizedSubscores.volatility * VNEXT_CONFIG.weights.volatility) +
    (normalizedSubscores.surprise * VNEXT_CONFIG.weights.surprise) +
    (normalizedSubscores.finish * VNEXT_CONFIG.weights.finish);

  // Map to final score
  const score = mapToFinalScore(weightedSum, VNEXT_CONFIG);

  // Detect potential issues
  const possibleTruncation = detectTruncation(values);
  const finalProbability = values[values.length - 1];

  // Count late crossings for diagnostics
  const lateCrossings = crossings.filter(idx => idx >= endWindowStart).length;

  return {
    score,
    subscores: {
      volatility: normalizedSubscores.volatility,
      surprise: normalizedSubscores.surprise,
      finish: normalizedSubscores.finish
    },
    diagnostics: {
      dataPoints: probabilities.length,
      endWindowStart,
      endWindowSize: probabilities.length - endWindowStart,
      totalCrossings: crossings.length,
      lateCrossings,
      rawVolatility,
      rawSurprise,
      rawFinish,
      finalProbability,
      possibleTruncation,
      overtime,
      sport,
      configVersion: VNEXT_CONFIG.version,
      weightedSum
    }
  };
}

/**
 * Export internal functions for testing purposes.
 */
export const _testing = {
  logit,
  clipProbability,
  detectCrossings,
  preprocessProbabilities,
  calculateVolatility,
  calculateSurprise,
  calculateFinish,
  normalizeSubscores,
  mapToFinalScore,
  detectTruncation
};
