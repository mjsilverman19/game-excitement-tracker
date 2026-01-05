export const ALGORITHM_CONFIG = {
  version: '1.2',

  scale: { min: 1, max: 10 },
  precision: { decimals: 1 },

  tiers: {
    mustWatch: { min: 8, label: 'must watch', cssClass: 'must-watch' },
    recommended: { min: 6, label: 'recommended', cssClass: 'recommended' },
    skip: { min: 0, label: 'skip', cssClass: 'skip' }
  },

  weights: {
    outcomeUncertainty: 0.30,
    momentumDrama: 0.30,
    finishQuality: 0.40
  },

  thresholds: {
    minDataPoints: 10,
    finalMomentPoints: 10,
    walkoffSwingThreshold: 0.15
  },

  bonuses: { overtime: 0.8 },

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
