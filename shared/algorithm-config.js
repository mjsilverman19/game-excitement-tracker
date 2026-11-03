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
  // Version 4.0: Suspense and surprise model
  // Replaces the v3 tension/drama/finish formula and its bonuses with the
  // belief-path measures of Ely, Frankel & Kamenica, "Suspense and Surprise"
  // (JPE 2015). Each component is the game's percentile within its sport; the
  // equal-weight power mean of components is mapped onto the established score
  // distribution, so tier thresholds keep their meaning. Calibration lives in
  // shared/suspense-table.js and shared/score-calibration.js (both generated).
  // Earlier versions: see archive/calculator-v3.5.1.js.
  version: '4.0.0',

  scale: { min: 1, max: 10 },
  precision: { decimals: 1 },

  tiers: {
    // Default thresholds (used when sport is not specified)
    mustWatch: { min: 8, label: 'must watch', cssClass: 'must-watch' },
    recommended: { min: 6, label: 'recommended', cssClass: 'recommended' },
    skip: { min: 0, label: 'skip', cssClass: 'skip' },
    // Sport-specific overrides. Scores are quantile-mapped to each sport's
    // distribution, so these keep ~20% must-watch / ~35% recommended per sport.
    bySport: {
      NFL: { mustWatch: 8.3, recommended: 6.0 },
      CFB: { mustWatch: 7.7, recommended: 5.8 },
      NBA: { mustWatch: 8.5, recommended: 6.5 },
      MLB: { mustWatch: 8.5, recommended: 6.5 },
      CBB: { mustWatch: 8.5, recommended: 6.5 }
    }
  },

  // Components contribute equally (power mean, see shared/scoring-model.js).
  // Used by the breakdown panel to apportion the score.
  weights: {
    suspense: 0.2,
    surprise: 0.2,
    finish: 0.2,
    twist: 0.2,
    pacing: 0.2
  },

  thresholds: {
    minDataPoints: 10,
    // Share of plays treated as the closing stretch for the Finish component
    finishShare: 0.2
  },

  guardrails: {
    // ESPN data-quality guard for extreme final margins
    blowoutCap: {
      margin: { football: 28, basketball: 22, baseball: 12 },
      maxScore: 6.5
    },
    // Overtime means the game was level at the end of regulation
    overtimeFloor: 6.0
  },

  metrics: [
    { key: 'suspense', label: 'Suspense', description: 'How much the next play could swing the outcome, summed over the game. High when the game stayed close with time running down.' },
    { key: 'surprise', label: 'Surprise', description: 'How much the win probability actually moved: momentum swings, big plays and lead changes.' },
    { key: 'finish', label: 'Finish', description: 'Suspense and surprise in the closing stretch of the game.' },
    { key: 'twist', label: 'Twist', description: 'How unlikely the final result looked at its least likely moment.' },
    { key: 'pacing', label: 'Pacing', description: 'Whether the outcome stayed in doubt until the end, rather than being settled early.' }
  ]
};

export function getTier(score, sport) {
  const sportThresholds = sport && ALGORITHM_CONFIG.tiers.bySport?.[sport];
  const mustWatchMin = sportThresholds?.mustWatch ?? ALGORITHM_CONFIG.tiers.mustWatch.min;
  const recommendedMin = sportThresholds?.recommended ?? ALGORITHM_CONFIG.tiers.recommended.min;

  if (score >= mustWatchMin) return ALGORITHM_CONFIG.tiers.mustWatch;
  if (score >= recommendedMin) return ALGORITHM_CONFIG.tiers.recommended;
  return ALGORITHM_CONFIG.tiers.skip;
}
