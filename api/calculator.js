// Entertainment Scoring Algorithm (v4: suspense and surprise)
//
// Scores completed games from ESPN win probability data using the belief-path
// framework of Ely, Frankel & Kamenica, "Suspense and Surprise" (JPE 2015).
// The home win probability after each play is the audience's belief:
//   Suspense - how much the belief was expected to move on the next play
//   Surprise - how much it actually moved
//   Finish   - suspense and surprise in the closing stretch
//   Twist    - how unlikely the final result looked at its least likely moment
//   Pacing   - how closely the remaining uncertainty tracked the paper's ideal
//              of falling steadily to zero at the final whistle
// See shared/belief-metrics.js and shared/scoring-model.js.

import { ALGORITHM_CONFIG } from '../shared/algorithm-config.js';
import { computeBeliefMetrics } from '../shared/belief-metrics.js';
import { scoreFromMetrics } from '../shared/scoring-model.js';
import { detectDataQualityIssues } from './data-quality.js';
import { fetchAllProbabilities } from '../shared/espn-api.js';

// Re-export for backward compatibility - new code should import from '../shared/espn-api.js'
export { fetchAllProbabilities };

const { guardrails, thresholds } = ALGORITHM_CONFIG;

function gameMetadata(game) {
  return {
    id: game.id,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    homeTeamId: game.homeTeamId ?? null,
    awayTeamId: game.awayTeamId ?? null,
    homeAbbr: game.homeAbbr ?? null,
    awayAbbr: game.awayAbbr ?? null,
    homeLogo: game.homeLogo ?? null,
    awayLogo: game.awayLogo ?? null,
    date: game.date ?? null
  };
}

function bracketFields(game) {
  return {
    bowlName: game.bowlName,
    playoffRound: game.playoffRound,
    homeSeed: game.homeSeed,
    awaySeed: game.awaySeed,
    bracketRound: game.bracketRound,
    bracketRegion: game.bracketRegion,
    venueId: game.venueId ?? null,
    venueName: game.venueName ?? null,
    venueImage: game.venueImage ?? null
  };
}

function dataQualityField(probItems, game, sport) {
  const dataQuality = detectDataQualityIssues(probItems, game, sport);
  return dataQuality.hasIssues ? {
    warning: true,
    severity: dataQuality.severity,
    issues: dataQuality.issues.map(i => i.message)
  } : undefined;
}

export async function analyzeGameEntertainment(game, sport = 'NFL') {
  try {
    const probItems = await fetchAllProbabilities(game.id, sport);
    if (!probItems || probItems.length < thresholds.minDataPoints) return null;

    const excitement = calculateExcitement(probItems, game, sport);
    if (!excitement) return null;

    return {
      ...gameMetadata(game),
      excitement: excitement.score,
      breakdown: excitement.breakdown,
      overtime: excitement.overtimeDetected ?? game.overtime,
      ...bracketFields(game),
      dataQuality: dataQualityField(probItems, game, sport)
    };
  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return null;
  }
}

export async function analyzeGameEntertainmentDetailed(game, sport = 'NFL') {
  try {
    const probItems = await fetchAllProbabilities(game.id, sport);
    if (!probItems || probItems.length < thresholds.minDataPoints) return null;

    const excitement = calculateExcitement(probItems, game, sport);
    if (!excitement) return null;

    return {
      ...gameMetadata(game),
      overtime: game.overtime,
      ...excitement,
      ...bracketFields(game),
      dataQuality: dataQualityField(probItems, game, sport)
    };
  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return null;
  }
}

function blowoutMargin(sport) {
  const caps = guardrails.blowoutCap.margin;
  if (sport === 'NBA' || sport === 'CBB') return caps.basketball;
  if (sport === 'MLB') return caps.baseball;
  return caps.football;
}

/**
 * Scores a win probability series. Exported for offline calibration and tests.
 * @param {Array} probabilities - ESPN items with homeWinPercentage (0-1)
 * @param {Object} game - { homeScore, awayScore, overtime }
 * @param {string} sport
 */
export function calculateExcitement(probabilities, game, sport = 'NFL') {
  const values = (probabilities || []).map(p => {
    const v = p.homeWinPercentage ?? 0.5;
    return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
  });
  if (values.length < thresholds.minDataPoints) return null;

  const metrics = computeBeliefMetrics(values, sport, { finishShare: thresholds.finishShare });
  const model = scoreFromMetrics(metrics, sport);
  let score = model.score;
  const overtimeDetected = Boolean(game?.overtime);
  const margin = typeof game?.homeScore === 'number' && typeof game?.awayScore === 'number'
    ? Math.abs(game.homeScore - game.awayScore)
    : null;

  // Data-quality guardrails: ESPN occasionally publishes noisy series for
  // lopsided games, and overtime always means the game was tied at the end
  // of regulation even if the probability model was confident.
  const applied = [];
  if (margin != null && margin > blowoutMargin(sport) && score > guardrails.blowoutCap.maxScore) {
    score = guardrails.blowoutCap.maxScore;
    applied.push('blowoutCap');
  }
  if (overtimeDetected && score < guardrails.overtimeFloor) {
    score = guardrails.overtimeFloor;
    applied.push('overtimeFloor');
  }

  const factor = 10 ** ALGORITHM_CONFIG.precision.decimals;
  const breakdown = {};
  for (const [key, value] of Object.entries(model.breakdown)) {
    breakdown[key] = Math.round(value * factor) / factor;
  }

  return {
    score: Math.max(1, Math.min(10, Math.round(score * factor) / factor)),
    breakdown,
    overtimeDetected,
    metrics,
    composite: model.composite,
    percentile: model.percentile,
    guardrails: applied
  };
}
