import { normalizeNumericValue } from './utils.js';

export function buildGameContext(game, sport) {
  const labels = Array.isArray(game.labels) ? game.labels : [];
  const seasonType = normalizeNumericValue(game.seasonType);
  const eventImportance = normalizeNumericValue(game.eventImportance);

  const context = {
    sport,
    seasonType,
    seasonLabel: game.seasonLabel || null,
    eventImportance,
    labels,
    neutralSite: Boolean(game.neutralSite),
    startDate: game.startDate || null,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    overtime: Boolean(game.overtime),
    homeScore: Number(game.homeScore || 0),
    awayScore: Number(game.awayScore || 0),
    totalScore: Number(game.homeScore || 0) + Number(game.awayScore || 0),
    margin: Math.abs(Number(game.homeScore || 0) - Number(game.awayScore || 0)),
    qualityMetrics: game.qualityMetrics || null,
    preGameSpread: normalizeNumericValue(game.preGameSpread),
    expectation: game.expectation || null
  };

  const labelMatches = (patterns) => labels.some(label => patterns.test(label));

  context.isPlayoff = seasonType !== null ? seasonType >= 3 : labelMatches(/playoff|postseason|championship|bowl/i);
  context.isChampionship = labelMatches(/championship|title|final/i);
  context.isBowl = labelMatches(/bowl/i);
  context.isRivalry = labelMatches(/rivalry|classic|cup/i);
  context.isElimination = labelMatches(/elimination|winner-takes-all|winner take all/i);
  context.importanceScore = eventImportance ?? (context.isChampionship ? 5 : context.isPlayoff ? 3 : context.isRivalry ? 2 : 0);

  return context;
}

export function calculateContextualFactors(game, context) {
  const scoringContext = analyzeScoring(game);
  const competitiveBalance = assessCompetitiveBalance(game, context);
  const stakesMultiplier = assessStakes(context);
  const qualityFactor = assessQualityOfPlay(context);
  const expectationAdjustment = calculateExpectationAdjustment(context);

  return {
    scoringContext,
    competitiveBalance,
    stakesMultiplier,
    qualityFactor,
    expectationAdjustment,
    contextSummary: summarizeContextFlags(context)
  };
}

export function createContextualFallback(game, context) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  const totalScore = game.homeScore + game.awayScore;

  let baseScore = 5.0;

  if (margin <= 3) baseScore = 8.0;
  else if (margin <= 7) baseScore = 6.5;
  else if (margin <= 14) baseScore = 4.5;
  else baseScore = 2.0;

  if (totalScore > 50) baseScore += 1.0;
  if (game.overtime) baseScore += 1.5;
  if (context?.isPlayoff || context?.isChampionship) baseScore += 0.5;

  const descriptors = [];
  if (totalScore > 50) descriptors.push('High-scoring');
  else if (totalScore < 35) descriptors.push('Defensive battle');

  if (margin <= 3) descriptors.push('Close finish');
  else if (margin > 21) descriptors.push('Decisive outcome');

  if (game.overtime) descriptors.push('Overtime');

  const contextFlags = summarizeContextFlags(context);
  if (contextFlags.length > 0) {
    descriptors.push(contextFlags[0]);
  }

  const stakesBoost = assessStakes(context);
  const qualityFactor = assessQualityOfPlay(context);
  const expectationAdjustment = calculateExpectationAdjustment(context);

  const adjustedScore = Math.min(10.0, baseScore * stakesBoost * qualityFactor * expectationAdjustment);

  const spoilerFreeDesc = descriptors.length > 0 ? descriptors.join(', ') : 'Competitive matchup';

  return {
    entertainmentScore: adjustedScore,
    confidence: Math.max(0.4, Math.min(0.85, 0.55 + (stakesBoost - 1) * 0.2 + (qualityFactor - 1) * 0.1)),
    breakdown: {
      fallback: true,
      margin: margin,
      totalScore: totalScore,
      overtime: game.overtime,
      stakes: Math.round(stakesBoost * 10) / 10,
      quality: Math.round(qualityFactor * 10) / 10,
      expectation: Math.round(expectationAdjustment * 10) / 10
    },
    narrative: spoilerFreeDesc,
    keyFactors: [
      'Final margin',
      'Total scoring',
      game.overtime ? 'Overtime' : 'Regulation finish',
      contextFlags[0] || null
    ].filter(Boolean)
  };
}

function assessStakes(context) {
  if (!context) return 1.0;

  let multiplier = 1.0;

  if (context.isChampionship) {
    multiplier += 0.25;
  } else if (context.isPlayoff) {
    multiplier += 0.18;
  } else if (context.isBowl) {
    multiplier += 0.12;
  }

  if (context.isRivalry) {
    multiplier += 0.07;
  }

  if (typeof context.eventImportance === 'number') {
    multiplier += Math.min(0.2, context.eventImportance * 0.04);
  }

  if (context.isElimination) {
    multiplier += 0.08;
  }

  return Math.min(1.6, Math.max(0.85, multiplier));
}

function assessQualityOfPlay(context) {
  if (!context) return 1.0;

  let factor = 1.0;
  const { qualityMetrics } = context;

  if (qualityMetrics) {
    if (typeof qualityMetrics.offensiveEfficiency === 'number') {
      factor += Math.max(-0.1, Math.min(0.15, (qualityMetrics.offensiveEfficiency - 1) * 0.1));
    }
    if (typeof qualityMetrics.turnoverDifferential === 'number') {
      factor += Math.max(-0.15, Math.min(0.05, -qualityMetrics.turnoverDifferential * 0.03));
    }
    if (typeof qualityMetrics.explosivePlays === 'number') {
      factor += Math.min(0.12, qualityMetrics.explosivePlays * 0.01);
    }
  }

  if (context.totalScore < 24 && context.margin >= 17) {
    factor -= 0.15;
  }
  if (context.totalScore >= 60 && context.margin <= 10) {
    factor += 0.08;
  }
  if (context.margin >= 25) {
    factor -= 0.2;
  }

  return Math.min(1.3, Math.max(0.7, factor));
}

function calculateExpectationAdjustment(context) {
  if (!context) return 1.0;

  if (typeof context.expectation === 'string') {
    if (/upset/i.test(context.expectation)) return 1.15;
    if (/dominant|chalk/i.test(context.expectation)) return 0.92;
  }

  return 1.0;
}

function summarizeContextFlags(context) {
  if (!context) return [];

  const flags = [];
  if (context.isChampionship) flags.push('Championship stakes');
  else if (context.isPlayoff) flags.push('Playoff stakes');
  else if (context.isBowl) flags.push('Bowl game');

  if (context.isRivalry) flags.push('Rivalry matchup');
  if (context.neutralSite) flags.push('Neutral site');
  if (context.isElimination) flags.push('Elimination game');

  return flags;
}

function analyzeScoring(game) {
  const totalScore = game.homeScore + game.awayScore;
  const margin = Math.abs(game.homeScore - game.awayScore);

  let scoringFactor = 1.0;

  if (totalScore > 60) {
    scoringFactor = 1.3;
  } else if (totalScore < 30) {
    scoringFactor = margin <= 3 ? 1.2 : 0.8;
  }

  const marginPenalty = Math.pow(margin / 10, 1.5);

  return Math.max(0.2, scoringFactor - marginPenalty * 0.3);
}

function assessCompetitiveBalance(game) {
  const margin = Math.abs(game.homeScore - game.awayScore);

  if (margin <= 3) return 1.3;
  if (margin <= 7) return 1.15;
  if (margin <= 14) return 1.0;
  return 0.8;
}
