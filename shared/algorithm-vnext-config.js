/**
 * vNext Entertainment Scoring Model Configuration
 *
 * This module contains all configurable parameters for the Volatility + Surprise + Finish
 * scoring algorithm. The three-metric model is grounded in psychology research:
 *
 * - Volatility: Continuous attentional engagement, action density
 * - Surprise: Expectation violation via log-odds movements
 * - Finish: Peak-end rule, narrative resolution
 */

export const VNEXT_CONFIG = {
  version: '4.0.0-alpha',

  /**
   * Metric weights for final score calculation.
   * Final score = (volatility * 0.25) + (surprise * 0.35) + (finish * 0.40)
   *
   * Rationale:
   * - Finish weighted highest (0.40) due to peak-end rule: humans disproportionately
   *   remember endings when judging experiences
   * - Surprise weighted second (0.35) because expectation violation creates memorable moments
   * - Volatility weighted lowest (0.25) but still important for capturing sustained action
   */
  weights: {
    volatility: 0.25,
    surprise: 0.35,
    finish: 0.40
  },

  /**
   * Probability clipping bounds to avoid infinity in logit calculation.
   * logit(p) = log(p / (1-p)) becomes infinite at p=0 or p=1.
   */
  clipping: {
    min: 0.01,  // Probabilities below 1% clipped to 1%
    max: 0.99   // Probabilities above 99% clipped to 99%
  },

  /**
   * Minimum delta thresholds to filter noise.
   * Sport-specific because data granularity and natural volatility vary.
   *
   * - probability: Minimum probability movement to count (filters trivial fluctuations)
   * - logit: Minimum log-odds movement to count (filters trivial belief updates)
   */
  epsilon: {
    NFL: {
      probability: 0.02,  // 2% minimum probability swing
      logit: 0.15         // Minimum log-odds change
    },
    CFB: {
      probability: 0.02,
      logit: 0.15
    },
    NBA: {
      probability: 0.015, // Smaller threshold for NBA's more granular data
      logit: 0.12
    }
  },

  /**
   * End window definition as percentage of total data points.
   * Based on Peak-End Rule: endings disproportionately affect memory of experience.
   *
   * Uses data percentage (not clock time) to handle variable data granularity.
   */
  endWindow: {
    NFL: { percentage: 0.20 },   // Last 20% of data points (~4th quarter)
    CFB: { percentage: 0.20 },
    NBA: { percentage: 0.25 }    // Last 25% (~4th quarter, NBA has more data points)
  },

  /**
   * Lead change bonuses.
   * Crossing the 0.5 threshold (lead change) is a salient event that increases engagement.
   *
   * - volatilityBonus: Added to volatility score per crossing
   * - maxCrossings: Cap to prevent spam in degenerate cases
   * - finishWindowMultiplier: Late lead changes are more dramatic
   */
  leadChange: {
    volatilityBonus: 0.1,
    maxCrossings: 10,
    finishWindowMultiplier: 1.5  // Crossings in finish window worth 1.5x
  },

  /**
   * Final score range (1-10 scale).
   */
  scoreRange: {
    min: 1,
    max: 10
  },

  /**
   * Tier thresholds for human-readable categorization.
   * These match the existing system for consistency.
   */
  tiers: {
    mustWatch: { min: 8, label: 'must watch' },
    recommended: { min: 6, label: 'recommended' },
    skip: { min: 0, label: 'skip' }
  },

  /**
   * Minimum data points required to score a game.
   * Games with insufficient data return null.
   */
  minDataPoints: 20
};

/**
 * Get sport-specific epsilon configuration.
 * Falls back to NFL values if sport not recognized.
 */
export function getEpsilon(sport) {
  return VNEXT_CONFIG.epsilon[sport] || VNEXT_CONFIG.epsilon.NFL;
}

/**
 * Get sport-specific end window configuration.
 * Falls back to NFL values if sport not recognized.
 */
export function getEndWindow(sport) {
  return VNEXT_CONFIG.endWindow[sport] || VNEXT_CONFIG.endWindow.NFL;
}

/**
 * Get tier label for a given score.
 */
export function getTierLabel(score) {
  if (score >= VNEXT_CONFIG.tiers.mustWatch.min) {
    return VNEXT_CONFIG.tiers.mustWatch.label;
  }
  if (score >= VNEXT_CONFIG.tiers.recommended.min) {
    return VNEXT_CONFIG.tiers.recommended.label;
  }
  return VNEXT_CONFIG.tiers.skip.label;
}
