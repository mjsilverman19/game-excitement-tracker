export const ALGORITHM_CONFIG = {
  // Version 2.4: Fixed Finish metric false positives
  // - Directional volatility: Only count movement toward 0.5 or crossing 0.5
  // - Tightened walk-off criteria: Require true competitive swings (0.40-0.60 range)
  // - Prevents false positives from monotonic pull-away sequences
  // - Three factors represent complementary lenses on excitement:
  //   * Tension: "Was there reason to keep watching?"
  //   * Drama: "Did big things happen?"
  //   * Finish: "How did it end?"
  version: '2.4',

  scale: { min: 1, max: 10 },
  precision: { decimals: 1 },

  tiers: {
    mustWatch: { min: 8, label: 'must watch', cssClass: 'must-watch' },
    recommended: { min: 6, label: 'recommended', cssClass: 'recommended' },
    skip: { min: 0, label: 'skip', cssClass: 'skip' }
  },

  // Weights for 3-factor model
  // Tension and Drama are correlated by design (close games have more swings)
  // but they tell users different parts of the story
  weights: {
    tension: 0.30,
    drama: 0.35,
    finish: 0.35
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
    { key: 'tension', label: 'Tension', description: 'Was there sustained reason to keep watching? (closeness or comeback potential)' },
    { key: 'drama', label: 'Drama', description: 'How much volatility and momentum swings throughout the game.' },
    { key: 'finish', label: 'Finish', description: 'How dramatic was the ending?' }
  ]
};

export function getTier(score) {
  if (score >= ALGORITHM_CONFIG.tiers.mustWatch.min) return ALGORITHM_CONFIG.tiers.mustWatch;
  if (score >= ALGORITHM_CONFIG.tiers.recommended.min) return ALGORITHM_CONFIG.tiers.recommended;
  return ALGORITHM_CONFIG.tiers.skip;
}
