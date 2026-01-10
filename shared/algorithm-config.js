// NFL Playoff Round Configuration
// Maps user-friendly round names to ESPN API week numbers
export const NFL_PLAYOFF_ROUNDS = {
  'wild-card': { espnWeek: 1, label: 'Wild Card Round', order: 19 },
  'divisional': { espnWeek: 2, label: 'Divisional Round', order: 20 },
  'conference': { espnWeek: 3, label: 'Conference Championships', order: 21 },
  'super-bowl': { espnWeek: 5, label: 'Super Bowl', order: 22 }
  // Note: ESPN week 4 is Pro Bowl - skipped as not a competitive game
};

// Helper to check if a week value is an NFL playoff round
export function isNFLPlayoffRound(week) {
  return typeof week === 'string' && week in NFL_PLAYOFF_ROUNDS;
}

// Get all NFL playoff round keys in order
export function getNFLPlayoffRoundKeys() {
  return Object.keys(NFL_PLAYOFF_ROUNDS);
}

// Get the next NFL playoff round (or null if at end)
export function getNextNFLPlayoffRound(currentRound) {
  const rounds = getNFLPlayoffRoundKeys();
  const currentIndex = rounds.indexOf(currentRound);
  if (currentIndex === -1 || currentIndex === rounds.length - 1) return null;
  return rounds[currentIndex + 1];
}

// Get the previous NFL playoff round (or null/18 if at start)
export function getPrevNFLPlayoffRound(currentRound) {
  const rounds = getNFLPlayoffRoundKeys();
  const currentIndex = rounds.indexOf(currentRound);
  if (currentIndex === -1) return null;
  if (currentIndex === 0) return 18; // Return to week 18
  return rounds[currentIndex - 1];
}

export const ALGORITHM_CONFIG = {
  // Version 3.0: Raise finish ceiling and add exceptional finish detection
  // - Adds finishLogBase and exceptionalFinish thresholds
  version: '3.0',

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
    leverageFloor: 0.01,
    lateDramaSwingThreshold: 0.15,
    largeFinalSwingThreshold: 0.20,
    lateClosenessThreshold: 0.25,
    dramaLogBase: 18,
    tensionFloor: {
      oneScore: { margin: 3, floor: 4.0 },
      close: { margin: 7, floor: 2.5 },
      competitive: { margin: 10, floor: 1.5 },
      nbaMultiplier: 2
    },
    finishLogBase: 12,
    finishWalkoff: {
      competitiveRange: { low: 0.35, high: 0.65 },
      minSwing: 0.15,
      largeSwing: 0.25
    },
    exceptionalFinish: {
      lateLeadChangesRequired: 3,
      competitiveOTRange: { low: 0.35, high: 0.65 },
      finalSwingThreshold: 0.25,
      finalWindowSize: 10,
      sustainedUncertaintyRange: { low: 0.40, high: 0.60 },
      multipliers: {
        tier3: 1.5,
        tier2: 1.25,
        tier1: 1.1
      }
    },
    blowoutMargin: {
      nflCfb: 21,
      nba: 18
    },
    competitiveBand: {
      low: 0.30,
      high: 0.70
    },
    dramaTimeWeight: {
      exponent: 2,
      factor: 0.5
    },
    leadChangeSigmoid: {
      center: 5,
      slope: 1.5
    },
    comeback: {
      minDeficit: 0.15,
      tier1: 0.30,
      tier2: 0.40,
      maxBoost: 4,
      timeMultiplier: {
        min: 0.5,
        max: 1.0
      }
    }
  },

  bonuses: {
    upset: { max: 0.8, threshold: 0.55 },
    comeback: {
      max: 2.0,
      minDeficit: 0.35,
      tier1: 0.40,
      tier2: 0.45
    },
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
      margin3orLess: 1.5,  // 1-3 point games
      margin7orLess: 0.5,  // 4-7 point games
      margin10orLess: 0.2, // 8-10 point games
      tensionFloor: 3.0,   // Below this, 75% reduction
      tensionFullCredit: 5.0 // Above this, full bonus
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
