import { buildGameContext, calculateContextualFactors, createContextualFallback } from './contextAnalyzer.js';
import {
  normalizeWinProbability,
  estimateTimeRemaining,
  applyAdaptiveSmoothing,
  calculateBalanceFromProbability,
  sigmoidTransform,
  linear,
  calculateVolatility,
  calculateLateGameWeight,
  calculateNoisePenalty
} from './utils.js';

export async function analyzeGameEntertainment(game, sport = 'NFL') {
  try {
    console.log(`Analyzing entertainment for ${game.awayTeam} @ ${game.homeTeam} (${sport})`);

    const league = sport === 'CFB' ? 'college-football' : 'nfl';
    const gameContext = buildGameContext(game, sport);

    const probUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/${league}/events/${game.id}/competitions/${game.id}/probabilities?limit=300`;

    const response = await fetch(probUrl);

    if (!response.ok) {
      console.log(`No probability data for ${sport} game ${game.id}`);
      return createEnhancedFallback(game, sport, gameContext);
    }

    const probData = await response.json();

    if (!probData.items || probData.items.length < 10) {
      console.log(`Insufficient probability data for ${sport} game ${game.id}`);
      return createEnhancedFallback(game, sport, gameContext);
    }

    const entertainment = calculateEnhancedEntertainment(probData.items, game, gameContext);

    return {
      id: `enhanced-${game.id}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      excitement: entertainment.entertainmentScore,
      overtime: game.overtime,
      description: entertainment.narrative,
      varianceAnalysis: `Confidence: ${Math.round(entertainment.confidence * 100)}% - Key factors: ${entertainment.keyFactors.join(', ')}`,
      keyMoments: generateKeyMomentsFromBreakdown(entertainment.breakdown),
      breakdown: entertainment.breakdown,
      source: `Enhanced Entertainment Analysis (${sport})`
    };
  } catch (error) {
    console.error(`Error analyzing ${sport} game ${game.id}:`, error);
    const fallbackContext = buildGameContext(game, sport);
    return createEnhancedFallback(game, sport, fallbackContext);
  }
}

export function calculateEnhancedEntertainment(probabilities, game, gameContext = {}) {
  try {
    const cleanProbs = preprocessProbabilities(probabilities, game);

    if (cleanProbs.length < 10) {
      return createContextualFallback(game, gameContext);
    }

    const uncertaintyMetrics = calculateAdvancedUncertaintyMetrics(cleanProbs, game);
    const contextualFactors = calculateContextualFactors(game, gameContext);
    const narrativeScore = analyzeNarrativeFlow(cleanProbs, game);

    const entertainment = combineEnhancedMetrics({
      ...uncertaintyMetrics,
      ...contextualFactors,
      narrative: narrativeScore,
      gameType: game
    });

    const spoilerFreeDescription = generateSpoilerFreeDescription(uncertaintyMetrics, game, gameContext);

    return {
      entertainmentScore: Math.round(entertainment.score * 10) / 10,
      confidence: entertainment.confidence,
      breakdown: entertainment.breakdown,
      narrative: spoilerFreeDescription,
      keyFactors: entertainment.keyFactors
    };
  } catch (error) {
    console.error('Enhanced calculation error:', error);
    return createContextualFallback(game, gameContext);
  }
}

function preprocessProbabilities(probabilities, game) {
  const cleaned = probabilities
    .map((p, index) => ({
      probability: normalizeWinProbability(p.homeWinPercentage),
      period: p.period || 1,
      timeRemaining: p.timeRemaining || estimateTimeRemaining(index, probabilities.length),
      index: index,
      gameState: p.gameState || 'unknown'
    }))
    .filter(p => p.probability !== null);

  return applyAdaptiveSmoothing(cleaned);
}

function calculateAdvancedUncertaintyMetrics(probabilities, game) {
  const timeWeightedUncertainty = calculateExponentialTimeWeighting(probabilities);
  const uncertaintyPersistence = calculateUncertaintyPersistence(probabilities);
  const peakUncertainty = findPeakUncertaintyMoments(probabilities);
  const comebackFactor = analyzeComebackDynamics(probabilities, game);
  const situationalTension = calculateSituationalTension(probabilities);

  const leadChangeMetrics = calculateLeadChanges(probabilities);
  const probabilityNoise = calculateProbabilityNoise(probabilities);
  const dramaticFinish = calculateDramaticFinish(probabilities);

  return {
    timeWeightedUncertainty,
    uncertaintyPersistence,
    peakUncertainty,
    comebackFactor,
    situationalTension,
    leadChanges: leadChangeMetrics.total,
    leadChangeBreakdown: leadChangeMetrics.breakdown,
    probabilityNoise,
    dramaticFinish
  };
}

function calculateLeadChanges(probabilities) {
  const scoreboardChanges = calculateScoreboardLeadChanges(probabilities);
  const probabilityChanges = calculateProbabilityLeadChanges(probabilities);

  if (scoreboardChanges !== null) {
    return {
      total: Math.max(scoreboardChanges, probabilityChanges),
      breakdown: {
        scoreboard: scoreboardChanges,
        probability: probabilityChanges
      }
    };
  }

  return {
    total: probabilityChanges,
    breakdown: {
      probability: probabilityChanges
    }
  };
}

function calculateScoreboardLeadChanges(probabilities) {
  let lastLeader = null;
  let changes = 0;
  let sawScore = false;

  probabilities.forEach(point => {
    const score = extractScoresFromProbabilityPoint(point);

    if (!score) {
      return;
    }

    const { home, away } = score;
    if (home === null || away === null) {
      return;
    }

    sawScore = true;

    if (home === away) {
      return;
    }

    const currentLeader = home > away ? 'home' : 'away';
    if (lastLeader && currentLeader !== lastLeader) {
      changes++;
    }
    lastLeader = currentLeader;
  });

  return sawScore ? changes : null;
}

function calculateProbabilityLeadChanges(probabilities) {
  let changes = 0;
  let lastLeader = null;

  probabilities.forEach(point => {
    if (point.probability === null || point.probability === undefined) {
      return;
    }

    const currentLeader = point.probability > 50 ? 'home' : point.probability < 50 ? 'away' : null;
    if (!currentLeader) {
      return;
    }

    if (lastLeader && lastLeader !== currentLeader) {
      changes++;
    }
    lastLeader = currentLeader;
  });

  return changes;
}

function extractScoresFromProbabilityPoint(point) {
  const readCandidate = (candidate) => {
    if (candidate === null || candidate === undefined) return null;
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string') {
      const parsed = parseInt(candidate, 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof candidate === 'object') {
      if (typeof candidate.value === 'number') return candidate.value;
      if (typeof candidate.displayValue === 'string') {
        const parsed = parseInt(candidate.displayValue, 10);
        return Number.isNaN(parsed) ? null : parsed;
      }
    }
    return null;
  };

  const homeCandidates = [
    point.homeScore,
    point.homeTeamScore,
    point.homeTeamPoints,
    point.homePoints,
    point.home,
    point.team1Score
  ];

  const awayCandidates = [
    point.awayScore,
    point.awayTeamScore,
    point.awayTeamPoints,
    point.awayPoints,
    point.away,
    point.team2Score
  ];

  let homeScore = null;
  for (const candidate of homeCandidates) {
    const value = readCandidate(candidate);
    if (value !== null) {
      homeScore = value;
      break;
    }
  }

  if (homeScore === null && point.homeTeam && typeof point.homeTeam.score === 'number') {
    homeScore = point.homeTeam.score;
  }

  let awayScore = null;
  for (const candidate of awayCandidates) {
    const value = readCandidate(candidate);
    if (value !== null) {
      awayScore = value;
      break;
    }
  }

  if (awayScore === null && point.awayTeam && typeof point.awayTeam.score === 'number') {
    awayScore = point.awayTeam.score;
  }

  if (homeScore === null && awayScore === null) {
    return null;
  }

  return {
    home: homeScore,
    away: awayScore
  };
}

function calculateProbabilityNoise(probabilities) {
  if (!probabilities || probabilities.length < 2) {
    return 0;
  }

  let diffSum = 0;
  let validPairs = 0;

  for (let i = 1; i < probabilities.length; i++) {
    const current = probabilities[i].probability;
    const previous = probabilities[i - 1].probability;

    if (current === null || current === undefined || previous === null || previous === undefined) {
      continue;
    }

    diffSum += Math.abs(current - previous);
    validPairs++;
  }

  if (validPairs === 0) {
    return 0;
  }

  return diffSum / validPairs;
}

function calculateDramaticFinish(probabilities) {
  const lastTenPercent = probabilities.slice(-Math.floor(probabilities.length * 0.1));
  
  let maxSwing = 0;
  for (let i = 1; i < lastTenPercent.length; i++) {
    const swing = Math.abs(lastTenPercent[i].probability - lastTenPercent[i-1].probability);
    maxSwing = Math.max(maxSwing, swing);
  }
  
  // Convert to 0-10 scale
  return Math.min(10, maxSwing * 0.2);
}

function calculateExponentialTimeWeighting(probabilities) {
  let weightedSum = 0;
  let totalWeight = 0;

  probabilities.forEach((p, index) => {
    const gameProgress = index / probabilities.length;
    const weight = Math.exp(gameProgress * 2);
    const balance = calculateBalanceFromProbability(p.probability);

    weightedSum += balance * weight;
    totalWeight += weight;
  });

  return weightedSum / totalWeight;
}

function calculateUncertaintyPersistence(probabilities) {
  const balanceThreshold = 30;
  let persistentPeriods = 0;
  let currentStreak = 0;

  probabilities.forEach(p => {
    const balance = calculateBalanceFromProbability(p.probability);

    if (balance >= balanceThreshold) {
      currentStreak++;
    } else {
      if (currentStreak >= 5) {
        persistentPeriods += currentStreak;
      }
      currentStreak = 0;
    }
  });

  if (currentStreak >= 5) {
    persistentPeriods += currentStreak;
  }

  return persistentPeriods / probabilities.length;
}

function findPeakUncertaintyMoments(probabilities) {
  const peaks = [];
  const minPeakHeight = 25;

  for (let i = 2; i < probabilities.length - 2; i++) {
    const current = calculateBalanceFromProbability(probabilities[i].probability);
    const prev2 = calculateBalanceFromProbability(probabilities[i - 2].probability);
    const prev1 = calculateBalanceFromProbability(probabilities[i - 1].probability);
    const next1 = calculateBalanceFromProbability(probabilities[i + 1].probability);
    const next2 = calculateBalanceFromProbability(probabilities[i + 2].probability);

    if (
      current > minPeakHeight &&
      current >= prev2 && current >= prev1 &&
      current >= next1 && current >= next2 &&
      (current > prev1 || current > next1)
    ) {
      peaks.push({
        index: i,
        uncertainty: current,
        period: probabilities[i].period,
        timeWeight: calculateLateGameWeight(i, probabilities.length)
      });
    }
  }

  const peakScore = peaks.reduce((sum, peak) => {
    return sum + (peak.uncertainty * peak.timeWeight);
  }, 0) / Math.max(1, peaks.length);

  return peakScore;
}

function analyzeComebackDynamics(probabilities, game) {
  let maxComeback = 0;
  let comebackCount = 0;
  let lateComeback = 0;

  for (let i = 10; i < probabilities.length; i++) {
    const swing = Math.abs(probabilities[i].probability - probabilities[i - 10].probability);

    if (swing > 25) {
      comebackCount++;
      maxComeback = Math.max(maxComeback, swing);

      const gameProgress = i / probabilities.length;
      if (gameProgress > 0.75) {
        lateComeback = Math.max(lateComeback, swing);
      }
    }
  }

  const finalMargin = Math.abs(game.homeScore - game.awayScore);
  const marginMultiplier = finalMargin <= 3 ? 1.5 : finalMargin <= 7 ? 1.2 : 1.0;

  return (maxComeback * 0.4 + comebackCount * 5 + lateComeback * 0.6) * marginMultiplier;
}

function calculateSituationalTension(probabilities) {
  let tensionScore = 0;

  probabilities.forEach((p, index) => {
    const gameProgress = index / probabilities.length;
    const balance = calculateBalanceFromProbability(p.probability);

    if (gameProgress > 0.9 && balance > 30) {
      tensionScore += balance * 2.0;
    } else if (gameProgress > 0.75 && balance > 25) {
      tensionScore += balance * 1.3;
    } else if (balance > 20) {
      tensionScore += balance * 0.8;
    }
  });

  return tensionScore / probabilities.length;
}

function analyzeNarrativeFlow(probabilities, game) {
  const story = {
    openingTone: assessOpeningTone(probabilities.slice(0, Math.min(20, probabilities.length))),
    midGameDevelopment: assessMidGame(probabilities),
    climaxIntensity: assessClimax(probabilities),
    resolution: assessResolution(probabilities, game)
  };

  return (
    story.openingTone * 0.15 +
    story.midGameDevelopment * 0.25 +
    story.climaxIntensity * 0.45 +
    story.resolution * 0.15
  );
}

function assessOpeningTone(earlyProbs) {
  if (earlyProbs.length < 5) return 5.0;

  const earlyBalance = earlyProbs.reduce((sum, p) => {
    return sum + calculateBalanceFromProbability(p.probability);
  }, 0) / earlyProbs.length;

  return earlyBalance < 20 ? 3.0 : earlyBalance > 30 ? 7.0 : 5.0;
}

function assessMidGame(probabilities) {
  const midGameStart = Math.floor(probabilities.length * 0.3);
  const midGameEnd = Math.floor(probabilities.length * 0.7);
  const midSection = probabilities.slice(midGameStart, midGameEnd);

  if (midSection.length === 0) return 5.0;

  let shifts = 0;
  let totalMovement = 0;

  for (let i = 1; i < midSection.length; i++) {
    const movement = Math.abs(midSection[i].probability - midSection[i - 1].probability);
    totalMovement += movement;

    if (movement > 8) shifts++;
  }

  const averageMovement = totalMovement / midSection.length;
  const shiftDensity = shifts / midSection.length;

  return Math.min(10, averageMovement * 0.3 + shiftDensity * 40);
}

function assessClimax(probabilities) {
  const climaxStart = Math.floor(probabilities.length * 0.75);
  const climax = probabilities.slice(climaxStart);

  if (climax.length === 0) return 5.0;

  const maxTension = Math.max(...climax.map(p => calculateBalanceFromProbability(p.probability)));
  const avgTension = climax.reduce((sum, p) => sum + calculateBalanceFromProbability(p.probability), 0) / climax.length;
  const volatility = calculateVolatility(climax.map(p => p.probability));

  return Math.min(10, (maxTension * 0.4 + avgTension * 0.3 + volatility * 0.3) / 5);
}

function assessResolution(probabilities, game) {
  const finalProbs = probabilities.slice(-5);
  if (finalProbs.length === 0) return 5.0;

  const finalBalance = finalProbs.reduce((sum, p) => sum + calculateBalanceFromProbability(p.probability), 0) / finalProbs.length;

  const margin = Math.abs(game.homeScore - game.awayScore);
  const overtime = game.overtime;

  if (overtime) return 9.0;

  if (margin <= 3 && finalBalance > 28) return 8.5;
  if (margin <= 7 && finalBalance > 24) return 7.0;

  if (margin <= 14) return 5.5;

  return Math.max(2.0, 6.0 - margin * 0.2);
}

function combineEnhancedMetrics(metrics) {
  const {
    timeWeightedUncertainty,
    uncertaintyPersistence,
    peakUncertainty,
    comebackFactor,
    situationalTension,
    scoringContext,
    competitiveBalance,
    stakesMultiplier,
    qualityFactor,
    expectationAdjustment,
    probabilityNoise,
    contextSummary,
    narrative,
    dramaticFinish
  } = metrics;

  const uncertaintyScore = sigmoidTransform(timeWeightedUncertainty, 28, 8.5);
  const persistenceScore = linear(uncertaintyPersistence, 0, 0.4, 0, 8.5);
  const peakScore = sigmoidTransform(peakUncertainty, 26, 8.5);
  const comebackScore = sigmoidTransform(comebackFactor, 30, 8.5);
  const tensionScore = sigmoidTransform(situationalTension, 18, 8.5);
  const narrativeScore = narrative;
  const dramaticFinishScore = dramaticFinish ?? 0;

  const weights = calculateAdaptiveWeights(metrics);
  const noisePenalty = calculateNoisePenalty(probabilityNoise);
  const stakesBoost = stakesMultiplier ?? 1.0;
  const qualityBoost = qualityFactor ?? 1.0;
  const expectationBoost = expectationAdjustment ?? 1.0;

  const rawScore = (
    uncertaintyScore * weights.uncertainty +
    persistenceScore * weights.persistence +
    peakScore * weights.peaks +
    comebackScore * weights.comeback +
    tensionScore * weights.tension +
    narrativeScore * weights.narrative +
    dramaticFinishScore * weights.dramaticFinish
  );

  const contextScore = rawScore * scoringContext * competitiveBalance * stakesBoost * qualityBoost * expectationBoost * noisePenalty;

  // Apply compression to reduce extremes - maps 0-10 to roughly 1-9.5
  const compressedScore = 1.0 + (contextScore * 0.85);
  const finalScore = Math.min(9.8, Math.max(0.5, compressedScore));

  const confidence = calculateConfidence(metrics);

  return {
    score: finalScore,
    confidence: confidence,
    breakdown: {
      uncertainty: Math.round(uncertaintyScore * 10) / 10,
      persistence: Math.round(persistenceScore * 10) / 10,
      peaks: Math.round(peakScore * 10) / 10,
      comeback: Math.round(comebackScore * 10) / 10,
      tension: Math.round(tensionScore * 10) / 10,
      narrative: Math.round(narrativeScore * 10) / 10,
      dramaticFinish: Math.round(dramaticFinishScore * 10) / 10,
      context: Math.round((scoringContext * competitiveBalance) * 10) / 10,
      stakes: Math.round((stakesBoost) * 10) / 10,
      quality: Math.round((qualityBoost) * 10) / 10,
      expectation: Math.round((expectationBoost) * 10) / 10,
      noise: Math.round((noisePenalty) * 10) / 10,
      leadChanges: metrics.leadChanges ?? 0
    },
    narrative: generateNarrativeDescription(metrics, contextSummary),
    keyFactors: identifyKeyFactors(metrics)
  };
}

function generateSpoilerFreeDescription(uncertaintyMetrics, game, context = {}) {
  const descriptors = [];
  const totalScore = game.homeScore + game.awayScore;

  if (uncertaintyMetrics.leadChanges >= 3) descriptors.push('Multiple lead changes');
  else if (uncertaintyMetrics.leadChanges >= 1) descriptors.push('Back-and-forth action');

  if (uncertaintyMetrics.timeWeightedUncertainty >= 28) descriptors.push('Late drama');
  if (uncertaintyMetrics.uncertaintyPersistence > 0.6) descriptors.push('Sustained tension');

  if (totalScore > 60) descriptors.push('High-scoring affair');
  else if (totalScore < 35) descriptors.push('Defensive battle');
  else descriptors.push('Balanced scoring');

  if (game.overtime) descriptors.push('Overtime thriller');
  if (game.weather && (game.weather.temperature < 32 || game.weather.precipitation)) {
    descriptors.push('Weather factor');
  }

  if (uncertaintyMetrics.comebackFactor > 35) descriptors.push('Comeback drama');

  if (context.isPlayoff || context.isChampionship) {
    descriptors.push(context.isChampionship ? 'Title stakes' : 'Playoff stakes');
  } else if (context.isBowl) {
    descriptors.push('Bowl spotlight');
  } else if (context.isRivalry) {
    descriptors.push('Rivalry energy');
  }

  return descriptors.length > 0 ? descriptors.slice(0, 3).join(', ') : 'Competitive matchup';
}

function calculateAdaptiveWeights(metrics) {
  const baseWeights = {
    uncertainty: 0.20,
    persistence: 0.13,
    peaks: 0.16,
    comeback: 0.12,
    tension: 0.12,
    narrative: 0.11,
    dramaticFinish: 0.16
  };

  // If there were many lead changes, reduce dramatic finish importance
  if ((metrics.leadChanges || 0) >= 6) {
    baseWeights.dramaticFinish -= 0.04;
    baseWeights.persistence += 0.02;
    baseWeights.peaks += 0.02;
  }

  if (metrics.comebackFactor > 40) {
    baseWeights.comeback += 0.08;
    baseWeights.uncertainty -= 0.04;
    baseWeights.persistence -= 0.04;
  }

  if (metrics.situationalTension > 24) {
    baseWeights.tension += 0.08;
    baseWeights.peaks -= 0.04;
    baseWeights.narrative -= 0.04;
  }

  if ((metrics.probabilityNoise || 0) > 18) {
    baseWeights.peaks -= 0.04;
    baseWeights.comeback -= 0.02;
    baseWeights.narrative += 0.06;
  }

  return baseWeights;
}

function calculateConfidence(metrics) {
  let confidence = 0.8;

  const scores = [
    metrics.timeWeightedUncertainty >= 28,
    metrics.uncertaintyPersistence > 0.3,
    metrics.peakUncertainty >= 24,
    metrics.comebackFactor > 25,
    metrics.situationalTension >= 16,
    (metrics.stakesMultiplier || 1) > 1.05,
    (metrics.probabilityNoise || 0) <= 15
  ];

  const agreementCount = scores.filter(s => s).length;
  confidence += agreementCount * 0.04;

  return Math.min(1.0, confidence);
}

function generateNarrativeDescription(metrics, contextSummary = []) {
  const factors = [];

  if (metrics.comebackFactor > 35) factors.push('dramatic comeback');
  if (metrics.uncertaintyPersistence > 0.4) factors.push('sustained tension');
  if (metrics.peakUncertainty > 25) factors.push('crucial momentum swings');
  if (metrics.situationalTension > 18) factors.push('late-game pressure');
  if (metrics.gameType?.overtime) factors.push('overtime thriller');
  if ((metrics.leadChanges || 0) >= 4) factors.push('frequent lead changes');
  if ((metrics.probabilityNoise || 0) <= 10 && (metrics.timeWeightedUncertainty || 0) >= 28) {
    factors.push('clean, high-leverage finish');
  }

  if (Array.isArray(contextSummary) && contextSummary.length > 0) {
    const contextPhrase = contextSummary[0].toLowerCase();
    if (!factors.some(item => item.includes(contextPhrase))) {
      factors.push(contextPhrase);
    }
  }

  if (factors.length === 0) return 'competitive game with moderate entertainment';

  return factors.join(' and ');
}

function identifyKeyFactors(metrics) {
  const factors = [
    { name: 'Late-game uncertainty', value: metrics.timeWeightedUncertainty },
    { name: 'Sustained competition', value: metrics.uncertaintyPersistence * 100 },
    { name: 'Peak drama moments', value: metrics.peakUncertainty },
    { name: 'Comeback dynamics', value: metrics.comebackFactor },
    { name: 'High-pressure situations', value: metrics.situationalTension }
  ];

  if ((metrics.leadChanges || 0) >= 2) {
    factors.push({ name: 'Frequent lead changes', value: metrics.leadChanges * 20 });
  }

  if ((metrics.stakesMultiplier || 1) > 1.05) {
    factors.push({ name: 'High stakes setting', value: (metrics.stakesMultiplier - 1) * 120 });
  }

  if ((metrics.qualityFactor || 1) > 1.05) {
    factors.push({ name: 'Quality of play', value: (metrics.qualityFactor - 1) * 100 });
  }

  if ((metrics.probabilityNoise || 0) <= 12 && (metrics.timeWeightedUncertainty || 0) >= 24) {
    factors.push({ name: 'Composed finish', value: (30 - metrics.probabilityNoise) * 5 });
  }

  return factors
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map(f => f.name);
}

function generateKeyMomentsFromBreakdown(breakdown) {
  const moments = [];

  if (breakdown.comeback > 7) {
    moments.push('Major momentum shift identified');
  }
  if (breakdown.tension > 7) {
    moments.push('High-pressure situation in final period');
  }
  if (breakdown.peaks > 7) {
    moments.push('Critical uncertainty peak reached');
  }
  if (breakdown.stakes && breakdown.stakes > 1.1) {
    moments.push('High-stakes implications');
  }
  if (breakdown.noise && breakdown.noise >= 0.95) {
    moments.push('Clean finish without chaos');
  }

  return moments.slice(0, 3);
}

function createEnhancedFallback(game, sport = 'NFL', context = {}) {
  const result = createContextualFallback(game, context);

  return {
    id: `fallback-${game.id}`,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    excitement: result.entertainmentScore,
    overtime: game.overtime,
    description: result.narrative,
    varianceAnalysis: `Score-based analysis - Confidence: ${Math.round(result.confidence * 100)}%`,
    keyMoments: result.keyFactors.map(factor => `Analysis based on ${factor.toLowerCase()}`),
    breakdown: result.breakdown,
    source: `Enhanced Fallback Analysis (${sport})`
  };
}
