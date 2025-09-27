// debug-game.js - Test the Rams vs Eagles game algorithm locally

// Mock game data from your actual API response
const testGame = {
  id: "401772839",
  homeTeam: "Philadelphia", 
  awayTeam: "Los Angeles",
  homeScore: 33,
  awayScore: 26,
  overtime: false
};

// Sample probability data from the actual ESPN response (abbreviated for testing)
const mockProbabilities = [
  { homeWinPercentage: 57.6 },
  { homeWinPercentage: 56.0 },
  { homeWinPercentage: 64.2 },
  { homeWinPercentage: 62.5 },
  { homeWinPercentage: 69.0 },
  { homeWinPercentage: 72.2 },
  { homeWinPercentage: 70.9 },
  { homeWinPercentage: 68.7 },
  { homeWinPercentage: 49.5 },
  { homeWinPercentage: 48.9 },
  { homeWinPercentage: 46.6 },
  { homeWinPercentage: 42.0 },
  { homeWinPercentage: 41.9 },
  { homeWinPercentage: 43.9 },
  { homeWinPercentage: 38.6 },
  { homeWinPercentage: 32.6 },
  { homeWinPercentage: 29.1 },
  { homeWinPercentage: 24.4 },
  { homeWinPercentage: 17.6 },
  { homeWinPercentage: 52.8 },
  { homeWinPercentage: 73.1 },
  { homeWinPercentage: 61.7 },
  { homeWinPercentage: 100.0 }
];

// Copy your algorithm functions here with added logging
function calculateEnhancedEntertainment(probabilities, game) {
  console.log('\n=== STARTING ENTERTAINMENT CALCULATION ===');
  console.log('Game:', game.awayTeam, 'vs', game.homeTeam);
  console.log('Final Score:', game.awayScore, '-', game.homeScore);
  console.log('Probability data points:', probabilities.length);

  try {
    const cleanProbs = preprocessProbabilities(probabilities, game);
    console.log('Clean probabilities length:', cleanProbs.length);
    
    if (cleanProbs.length < 10) {
      console.log('WARNING: Insufficient data, using fallback');
      return createContextualFallback(game, {});
    }

    // Core uncertainty metrics with improvements
    const uncertaintyMetrics = calculateAdvancedUncertaintyMetrics(cleanProbs, game);
    console.log('\nUNCERTAINTY METRICS:');
    console.log('- Time Weighted Uncertainty:', uncertaintyMetrics.timeWeightedUncertainty);
    console.log('- Uncertainty Persistence:', uncertaintyMetrics.uncertaintyPersistence);
    console.log('- Peak Uncertainty:', uncertaintyMetrics.peakUncertainty);
    console.log('- Comeback Factor:', uncertaintyMetrics.comebackFactor);
    console.log('- Situational Tension:', uncertaintyMetrics.situationalTension);
    console.log('- Lead Changes:', uncertaintyMetrics.leadChanges);
    
    // New contextual factors
    const contextualFactors = calculateContextualFactors(game, {});
    console.log('\nCONTEXTUAL FACTORS:');
    console.log('- Scoring Context:', contextualFactors.scoringContext);
    console.log('- Competitive Balance:', contextualFactors.competitiveBalance);
    
    // Narrative flow analysis
    const narrativeScore = analyzeNarrativeFlow(cleanProbs, game);
    console.log('\nNARRATIVE SCORE:', narrativeScore);
    
    // Combine all factors
    const entertainment = combineEnhancedMetrics({
      ...uncertaintyMetrics,
      ...contextualFactors,
      narrative: narrativeScore,
      gameType: game
    });

    console.log('\nFINAL ENTERTAINMENT OBJECT:');
    console.log('- Entertainment Score:', entertainment.score);
    console.log('- Confidence:', entertainment.confidence);
    console.log('- Breakdown:', entertainment.breakdown);

    return {
      entertainmentScore: Math.round(entertainment.score * 10) / 10,
      confidence: entertainment.confidence,
      breakdown: entertainment.breakdown,
      narrative: 'Test narrative',
      keyFactors: entertainment.keyFactors
    };

  } catch (error) {
    console.error('Enhanced calculation error:', error);
    return createContextualFallback(game, {});
  }
}

function preprocessProbabilities(probabilities, game) {
  const cleaned = probabilities
    .map((p, index) => ({
      probability: Math.max(0.1, Math.min(99.9, p.homeWinPercentage || 50)),
      period: p.period || 1,
      timeRemaining: p.timeRemaining || estimateTimeRemaining(index, probabilities.length),
      index: index,
      gameState: p.gameState || 'unknown'
    }))
    .filter(p => p.probability !== null);

  return applyAdaptiveSmoothing(cleaned);
}

function estimateTimeRemaining(index, totalLength) {
  const progress = index / totalLength;
  return Math.max(0, 3600 * (1 - progress));
}

function applyAdaptiveSmoothing(probabilities) {
  const smoothed = [...probabilities];
  const windowSize = 3;
  
  for (let i = windowSize; i < probabilities.length - windowSize; i++) {
    const window = probabilities.slice(i - windowSize, i + windowSize + 1);
    const avg = window.reduce((sum, p) => sum + p.probability, 0) / window.length;
    const current = probabilities[i].probability;
    
    const deviation = Math.abs(current - avg);
    if (deviation > 15 && deviation < 30) {
      smoothed[i].probability = 0.7 * current + 0.3 * avg;
    }
  }
  
  return smoothed;
}

function calculateAdvancedUncertaintyMetrics(probabilities, game) {
  const timeWeightedUncertainty = calculateExponentialTimeWeighting(probabilities);
  const uncertaintyPersistence = calculateUncertaintyPersistence(probabilities);
  const peakUncertainty = findPeakUncertaintyMoments(probabilities);
  const comebackFactor = analyzeComebackDynamics(probabilities, game);
  const situationalTension = calculateSituationalTension(probabilities);
  const leadChanges = calculateLeadChanges(probabilities);

  return {
    timeWeightedUncertainty,
    uncertaintyPersistence,
    peakUncertainty,
    comebackFactor,
    situationalTension,
    leadChanges
  };
}

function calculateLeadChanges(probabilities) {
  let changes = 0;
  let lastLeader = null;
  
  probabilities.forEach(p => {
    const currentLeader = p.probability > 50 ? 'home' : 'away';
    if (lastLeader && lastLeader !== currentLeader) {
      changes++;
    }
    lastLeader = currentLeader;
  });
  
  return changes;
}

function calculateExponentialTimeWeighting(probabilities) {
  let weightedSum = 0;
  let totalWeight = 0;
  
  probabilities.forEach((p, index) => {
    const gameProgress = index / probabilities.length;
    const weight = Math.exp(gameProgress * 2);
    const uncertainty = Math.abs(p.probability - 50);
    
    weightedSum += uncertainty * weight;
    totalWeight += weight;
  });
  
  return weightedSum / totalWeight;
}

function calculateUncertaintyPersistence(probabilities) {
  const uncertaintyThreshold = 20;
  let persistentPeriods = 0;
  let currentStreak = 0;
  
  probabilities.forEach(p => {
    const uncertainty = Math.abs(p.probability - 50);
    
    if (uncertainty <= uncertaintyThreshold) {
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
  const minPeakHeight = 15;
  
  for (let i = 2; i < probabilities.length - 2; i++) {
    const current = Math.abs(probabilities[i].probability - 50);
    const prev2 = Math.abs(probabilities[i-2].probability - 50);
    const prev1 = Math.abs(probabilities[i-1].probability - 50);
    const next1 = Math.abs(probabilities[i+1].probability - 50);
    const next2 = Math.abs(probabilities[i+2].probability - 50);
    
    if (current > minPeakHeight && 
        current >= prev2 && current >= prev1 && 
        current >= next1 && current >= next2 &&
        (current > prev1 || current > next1)) {
      
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

function calculateLateGameWeight(index, totalLength) {
  const progress = index / totalLength;
  return Math.exp(progress * 1.5);
}

function analyzeComebackDynamics(probabilities, game) {
  let maxComeback = 0;
  let comebackCount = 0;
  let lateComeback = 0;
  
  for (let i = 10; i < probabilities.length; i++) {
    const swing = Math.abs(probabilities[i].probability - probabilities[i-10].probability);
    
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
    const uncertainty = Math.abs(p.probability - 50);
    
    if (gameProgress > 0.9 && uncertainty > 15) {
      tensionScore += uncertainty * 2.0;
    }
    else if (gameProgress > 0.75 && uncertainty > 20) {
      tensionScore += uncertainty * 1.3;
    }
    else if (uncertainty > 25) {
      tensionScore += uncertainty * 0.8;
    }
  });
  
  return tensionScore / probabilities.length;
}

function calculateContextualFactors(game, context) {
  return {
    scoringContext: analyzeScoring(game),
    competitiveBalance: assessCompetitiveBalance(game, context)
  };
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

function assessCompetitiveBalance(game, context) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  
  if (margin <= 3) return 1.3;
  if (margin <= 7) return 1.15;
  if (margin <= 14) return 1.0;
  return 0.8;
}

function analyzeNarrativeFlow(probabilities, game) {
  return 6.0; // Simplified for debugging
}

function combineEnhancedMetrics(metrics) {
  console.log('\n=== COMBINING METRICS ===');
  
  const {
    timeWeightedUncertainty,
    uncertaintyPersistence, 
    peakUncertainty,
    comebackFactor,
    situationalTension,
    scoringContext,
    competitiveBalance,
    narrative
  } = metrics;
  
  // Updated sigmoid transforms with reduced scale (8.5 instead of 10)
  const uncertaintyScore = sigmoidTransform(timeWeightedUncertainty, 25, 8.5);
  const persistenceScore = linear(uncertaintyPersistence, 0, 0.4, 0, 8.5);
  const peakScore = sigmoidTransform(peakUncertainty, 20, 8.5);
  const comebackScore = sigmoidTransform(comebackFactor, 30, 8.5);
  const tensionScore = sigmoidTransform(situationalTension, 15, 8.5);
  const narrativeScore = narrative;
  
  console.log('INDIVIDUAL SCORES:');
  console.log('- Uncertainty Score:', uncertaintyScore);
  console.log('- Persistence Score:', persistenceScore);
  console.log('- Peak Score:', peakScore);
  console.log('- Comeback Score:', comebackScore);
  console.log('- Tension Score:', tensionScore);
  console.log('- Narrative Score:', narrativeScore);
  
  const weights = calculateAdaptiveWeights(metrics);
  console.log('WEIGHTS:', weights);
  
  const rawScore = (
    uncertaintyScore * weights.uncertainty +
    persistenceScore * weights.persistence +
    peakScore * weights.peaks +
    comebackScore * weights.comeback +
    tensionScore * weights.tension +
    narrativeScore * weights.narrative
  );
  
  console.log('RAW SCORE:', rawScore);
  console.log('SCORING CONTEXT:', scoringContext);
  console.log('COMPETITIVE BALANCE:', competitiveBalance);
  
  const contextScore = rawScore * scoringContext * competitiveBalance;
  console.log('CONTEXT SCORE:', contextScore);
  
  const finalScore = Math.min(10.0, Math.max(0.0, contextScore));
  console.log('FINAL SCORE:', finalScore);
  
  return {
    score: finalScore,
    confidence: 0.9,
    breakdown: {
      uncertainty: Math.round(uncertaintyScore * 10) / 10,
      persistence: Math.round(persistenceScore * 10) / 10,
      peaks: Math.round(peakScore * 10) / 10,
      comeback: Math.round(comebackScore * 10) / 10,
      tension: Math.round(tensionScore * 10) / 10,
      narrative: Math.round(narrativeScore * 10) / 10,
      context: Math.round((scoringContext * competitiveBalance) * 10) / 10
    },
    keyFactors: ['debug', 'test', 'factors']
  };
}

function sigmoidTransform(value, midpoint, scale) {
  const result = scale / (1 + Math.exp(-(value - midpoint) / (midpoint * 0.3)));
  console.log(`SIGMOID: value=${value}, midpoint=${midpoint}, scale=${scale} => ${result}`);
  return result;
}

function linear(value, minIn, maxIn, minOut, maxOut) {
  const clampedValue = Math.max(minIn, Math.min(maxIn, value));
  const result = minOut + (clampedValue - minIn) * (maxOut - minOut) / (maxIn - minIn);
  console.log(`LINEAR: value=${value}, clamped=${clampedValue} => ${result}`);
  return result;
}

function calculateAdaptiveWeights(metrics) {
  return {
    uncertainty: 0.25,
    persistence: 0.15, 
    peaks: 0.2,
    comeback: 0.15,
    tension: 0.15,
    narrative: 0.1
  };
}

function createContextualFallback(game, context) {
  console.log('USING FALLBACK ANALYSIS');
  const margin = Math.abs(game.homeScore - game.awayScore);
  let baseScore = margin <= 7 ? 6.5 : 4.5;
  
  return {
    entertainmentScore: baseScore,
    confidence: 0.6,
    breakdown: { fallback: true },
    narrative: "Fallback analysis",
    keyFactors: ["Final margin"]
  };
}

// Run the test
console.log('Testing Rams vs Eagles algorithm...');
const result = calculateEnhancedEntertainment(mockProbabilities, testGame);
console.log('\n=== FINAL RESULT ===');
console.log('Entertainment Score:', result.entertainmentScore);
console.log('Confidence:', result.confidence);
console.log('Breakdown:', result.breakdown);