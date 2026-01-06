export const ALGORITHM_CONFIG = {
  // Version 2.2: Major algorithm overhaul
  // - Fixed finish quality false positives (directional awareness, competitive-range only)
  // - Added time-weighting to momentum drama (later swings count more)
  // - Replaced cliff-effect thresholds with smooth sigmoid functions
  // - Reduced leverage floor to minimize garbage-time inflation
  // - Converted bonuses from additive to multiplicative
  // - Smooth sigmoid normalization replacing piecewise linear
  // - Rebalanced weights to reduce finish dominance
  // - Comeback timing awareness
  // - Close game bonus now conditional to avoid double-counting
  version: '2.2',

  scale: { min: 1, max: 10 },
  precision: { decimals: 1 },

  tiers: {
    mustWatch: { min: 8, label: 'must watch', cssClass: 'must-watch' },
    recommended: { min: 6, label: 'recommended', cssClass: 'recommended' },
    skip: { min: 0, label: 'skip', cssClass: 'skip' }
  },

  // Rebalanced weights (was 0.20/0.30/0.50)
  // Reduced finish quality dominance now that the metric is fixed
  // This better represents full-game experience vs just the ending
  weights: {
    outcomeUncertainty: 0.30,
    momentumDrama: 0.35,
    finishQuality: 0.35
  },

  thresholds: {
    minDataPoints: 10,
    finalMomentPoints: 10,
    walkoffSwingThreshold: 0.15,
    leverageFloor: 0.05,
    lateDramaSwingThreshold: 0.15,
    largeFinalSwingThreshold: 0.20
  },

  bonuses: {
    upset: { max: 0.8, threshold: 0.55 },
    comeback: { max: 1.0, extremeThreshold: 0.15 },
    volatility: {
      // Extraordinary volatility bonus for games with rare swing patterns
      max: 1.5,
      largeSwingThreshold: 0.18,
      massiveSwingThreshold: 0.50,
      extremeRecoveryThreshold: 0.18,
      multiSwingCount: 6
    },
    overtime: {
      // Overtime bonus - OT games are inherently dramatic
      base: 0.8,           // Base bonus for going to OT
      perAdditionalOT: 0.3 // Bonus per additional OT period
    },
    closeGame: {
      // Score margin bonus for close final scores
      margin3orLess: 1.0,  // 1-3 point games
      margin7orLess: 0.5,  // 4-7 point games
      margin10orLess: 0.2  // 8-10 point games
    }
  },

  metrics: [
    { key: 'uncertainty', label: 'Uncertainty', description: 'How long was the outcome in doubt?' },
    { key: 'drama', label: 'Drama', description: 'Magnitude of momentum swings when the game was close.' },
    { key: 'finish', label: 'Finish', description: 'How exciting were the final minutes?' }
  ]
};

export function getTier(score) {
  if (score >= ALGORITHM_CONFIG.tiers.mustWatch.min) return ALGORITHM_CONFIG.tiers.mustWatch;
  if (score >= ALGORITHM_CONFIG.tiers.recommended.min) return ALGORITHM_CONFIG.tiers.recommended;
  return ALGORITHM_CONFIG.tiers.skip;
}
