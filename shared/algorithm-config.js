export const ALGORITHM_CONFIG = {
  version: '1.5',

  scale: { min: 1, max: 10 },
  precision: { decimals: 1 },

  tiers: {
    mustWatch: { min: 8, label: 'must watch', cssClass: 'must-watch' },
    recommended: { min: 6, label: 'recommended', cssClass: 'recommended' },
    skip: { min: 0, label: 'skip', cssClass: 'skip' }
  },

  weights: {
    outcomeUncertainty: 0.25,
    momentumDrama: 0.30,
    finishQuality: 0.45
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
      largeSwingThreshold: 0.18,      // 18%+ swing is "large" (raised from 15%)
      massiveSwingThreshold: 0.50,    // 50%+ swing is "massive" (truly rare)
      extremeRecoveryThreshold: 0.18, // 18%+ swing from <10% WP is extraordinary
      multiSwingCount: 6              // 6+ large swings is extraordinary (raised from 5)
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
