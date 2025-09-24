// File: /api/games.js - Enhanced Game Entertainment Analysis

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, sport } = req.body;

  if (!date || !sport) {
    return res.status(400).json({ error: 'Date and sport are required' });
  }

  try {
    console.log(`Analyzing ${sport} games for ${date} using enhanced entertainment analysis...`);
    
    // Get games for the date
    const games = await getGamesForDate(date, sport);
    
    if (!games || games.length === 0) {
      return res.status(200).json({
        success: true,
        games: [],
        metadata: {
          date: date,
          sport: sport,
          source: 'ESPN Win Probability API',
          analysisType: 'Enhanced Entertainment Analysis',
          gameCount: 0
        }
      });
    }

    // Analyze each game with enhanced entertainment algorithm
    const analyzedGames = await Promise.all(
      games.map(async (game) => await analyzeGameEntertainment(game))
    );

    // Filter out failed analyses
    const validGames = analyzedGames.filter(game => game !== null);

    console.log(`Successfully analyzed ${validGames.length} games with enhanced metrics`);

    return res.status(200).json({
      success: true,
      games: validGames,
      metadata: {
        date: date,
        sport: sport,
        source: 'ESPN Win Probability API',
        analysisType: 'Enhanced Entertainment Analysis',
        gameCount: validGames.length
      }
    });

  } catch (error) {
    console.error('Error in enhanced analysis:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to analyze game entertainment',
      details: error.message,
      games: []
    });
  }
}

async function getGamesForDate(date, sport) {
  try {
    const dateFormatted = date.replace(/-/g, '');
    let apiUrl;
    
    if (sport === 'NFL') {
      apiUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateFormatted}`;
    } else if (sport === 'NBA') {
      apiUrl = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateFormatted}`;
    } else {
      throw new Error(`Unsupported sport: ${sport}`);
    }

    console.log(`Fetching games from: ${apiUrl}`);
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.events || data.events.length === 0) {
      console.log('No games found for date');
      return [];
    }

    // Extract game data
    const games = data.events.map(event => {
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      return {
        id: event.id,
        homeTeam: homeTeam?.team.location || homeTeam?.team.displayName,
        awayTeam: awayTeam?.team.location || awayTeam?.team.displayName,
        homeScore: parseInt(homeTeam?.score || 0),
        awayScore: parseInt(awayTeam?.score || 0),
        isCompleted: competition.status.type.completed,
        overtime: competition.status.type.name.includes('OT'),
        status: competition.status.type.description
      };
    });

    console.log(`Found ${games.length} games`);
    return games.filter(game => game.isCompleted); // Only analyze completed games
    
  } catch (error) {
    console.error('Error fetching games:', error);
    return [];
  }
}

async function analyzeGameEntertainment(game) {
  try {
    console.log(`Analyzing entertainment for ${game.awayTeam} @ ${game.homeTeam}`);
    
    // Fetch win probability data from ESPN
    const probUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${game.id}/competitions/${game.id}/probabilities?limit=300`;
    
    const response = await fetch(probUrl);
    
    if (!response.ok) {
      console.log(`No probability data for game ${game.id}`);
      return createEnhancedFallback(game);
    }

    const probData = await response.json();
    
    if (!probData.items || probData.items.length < 10) {
      console.log(`Insufficient probability data for game ${game.id}`);
      return createEnhancedFallback(game);
    }

    // Calculate enhanced entertainment metrics
    const entertainment = calculateEnhancedEntertainment(probData.items, game);
    
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
      source: 'Enhanced Entertainment Analysis'
    };

  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return createEnhancedFallback(game);
  }
}

function calculateEnhancedEntertainment(probabilities, game) {
  try {
    const cleanProbs = preprocessProbabilities(probabilities, game);
    
    if (cleanProbs.length < 10) {
      return createEnhancedFallbackResult(game);
    }

    // Core uncertainty metrics with improvements
    const uncertaintyMetrics = calculateAdvancedUncertaintyMetrics(cleanProbs, game);
    
    // Contextual factors
    const contextualFactors = calculateContextualFactors(game);
    
    // Narrative flow analysis
    const narrativeScore = analyzeNarrativeFlow(cleanProbs, game);
    
    // Combine all factors
    const entertainment = combineEnhancedMetrics({
      ...uncertaintyMetrics,
      ...contextualFactors,
      narrative: narrativeScore,
      gameType: game
    });

    return {
      entertainmentScore: Math.round(entertainment.score * 10) / 10,
      confidence: entertainment.confidence,
      breakdown: entertainment.breakdown,
      narrative: entertainment.narrative,
      keyFactors: entertainment.keyFactors
    };

  } catch (error) {
    console.error('Enhanced calculation error:', error);
    return createEnhancedFallbackResult(game);
  }
}

function preprocessProbabilities(probabilities, game) {
  // Enhanced preprocessing with outlier detection and smoothing
  const cleaned = probabilities
    .map((p, index) => ({
      probability: Math.max(0.1, Math.min(99.9, p.homeWinPercentage || 50)),
      period: p.period || 1,
      timeRemaining: p.timeRemaining || estimateTimeRemaining(index, probabilities.length),
      index: index,
      gameState: p.gameState || 'unknown'
    }))
    .filter(p => p.probability !== null);

  // Apply smoothing to reduce noise while preserving genuine swings
  return applyAdaptiveSmoothing(cleaned);
}

function estimateTimeRemaining(index, totalLength) {
  // Estimate time remaining based on position in data
  const progress = index / totalLength;
  return Math.max(0, 3600 * (1 - progress)); // 3600 seconds in a game
}

function applyAdaptiveSmoothing(probabilities) {
  const smoothed = [...probabilities];
  const windowSize = 3;
  
  for (let i = windowSize; i < probabilities.length - windowSize; i++) {
    const window = probabilities.slice(i - windowSize, i + windowSize + 1);
    const avg = window.reduce((sum, p) => sum + p.probability, 0) / window.length;
    const current = probabilities[i].probability;
    
    // Only smooth if the point seems like noise (large deviation from neighbors)
    const deviation = Math.abs(current - avg);
    if (deviation > 15 && deviation < 30) {
      smoothed[i].probability = 0.7 * current + 0.3 * avg;
    }
  }
  
  return smoothed;
}

function calculateAdvancedUncertaintyMetrics(probabilities, game) {
  // 1. Time-decay weighted uncertainty (exponential weighting for late game)
  const timeWeightedUncertainty = calculateExponentialTimeWeighting(probabilities);
  
  // 2. Uncertainty persistence (how long did uncertainty last?)
  const uncertaintyPersistence = calculateUncertaintyPersistence(probabilities);
  
  // 3. Peak uncertainty analysis
  const peakUncertainty = findPeakUncertaintyMoments(probabilities);
  
  // 4. Comeback potential realized
  const comebackFactor = analyzeComebackDynamics(probabilities, game);
  
  // 5. Decision-point tension (red zone, 2-minute drill, etc.)
  const situationalTension = calculateSituationalTension(probabilities);

  return {
    timeWeightedUncertainty,
    uncertaintyPersistence,
    peakUncertainty,
    comebackFactor,
    situationalTension
  };
}

function calculateExponentialTimeWeighting(probabilities) {
  // Exponential decay gives much more weight to late-game uncertainty
  let weightedSum = 0;
  let totalWeight = 0;
  
  probabilities.forEach((p, index) => {
    const gameProgress = index / probabilities.length;
    const weight = Math.exp(gameProgress * 2); // Exponential growth toward end
    const uncertainty = Math.abs(p.probability - 50);
    
    weightedSum += uncertainty * weight;
    totalWeight += weight;
  });
  
  return weightedSum / totalWeight;
}

function calculateUncertaintyPersistence(probabilities) {
  // How consistently uncertain was the game?
  const uncertaintyThreshold = 20; // Within 20% of 50/50
  let persistentPeriods = 0;
  let currentStreak = 0;
  
  probabilities.forEach(p => {
    const uncertainty = Math.abs(p.probability - 50);
    
    if (uncertainty <= uncertaintyThreshold) {
      currentStreak++;
    } else {
      if (currentStreak >= 5) { // At least 5 consecutive uncertain moments
        persistentPeriods += currentStreak;
      }
      currentStreak = 0;
    }
  });
  
  // Final streak
  if (currentStreak >= 5) {
    persistentPeriods += currentStreak;
  }
  
  return persistentPeriods / probabilities.length;
}

function findPeakUncertaintyMoments(probabilities) {
  const peaks = [];
  const minPeakHeight = 15; // Minimum uncertainty to be considered a peak
  
  for (let i = 2; i < probabilities.length - 2; i++) {
    const current = Math.abs(probabilities[i].probability - 50);
    const prev2 = Math.abs(probabilities[i-2].probability - 50);
    const prev1 = Math.abs(probabilities[i-1].probability - 50);
    const next1 = Math.abs(probabilities[i+1].probability - 50);
    const next2 = Math.abs(probabilities[i+2].probability - 50);
    
    // Check if this is a local maximum
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
  
  // Score based on number, intensity, and timing of peaks
  const peakScore = peaks.reduce((sum, peak) => {
    return sum + (peak.uncertainty * peak.timeWeight);
  }, 0) / Math.max(1, peaks.length);
  
  return peakScore;
}

function analyzeComebackDynamics(probabilities, game) {
  // Identify significant comeback attempts and their drama
  let maxComeback = 0;
  let comebackCount = 0;
  let lateComeback = 0;
  
  for (let i = 10; i < probabilities.length; i++) {
    const swing = Math.abs(probabilities[i].probability - probabilities[i-10].probability);
    
    if (swing > 25) { // Significant probability swing
      comebackCount++;
      maxComeback = Math.max(maxComeback, swing);
      
      // Late game comeback is extra dramatic
      const gameProgress = i / probabilities.length;
      if (gameProgress > 0.75) {
        lateComeback = Math.max(lateComeback, swing);
      }
    }
  }
  
  // Factor in actual score differential for context
  const finalMargin = Math.abs(game.homeScore - game.awayScore);
  const marginMultiplier = finalMargin <= 3 ? 1.5 : finalMargin <= 7 ? 1.2 : 1.0;
  
  return (maxComeback * 0.4 + comebackCount * 5 + lateComeback * 0.6) * marginMultiplier;
}

function calculateSituationalTension(probabilities) {
  // Identify high-leverage moments (goal line, two-minute drill, overtime)
  let tensionScore = 0;
  
  probabilities.forEach((p, index) => {
    const gameProgress = index / probabilities.length;
    const uncertainty = Math.abs(p.probability - 50);
    
    // Two-minute drill equivalent (final 10% of data points)
    if (gameProgress > 0.9 && uncertainty > 15) {
      tensionScore += uncertainty * 2.0;
    }
    
    // Fourth quarter tensions (final 25% of regulation)
    else if (gameProgress > 0.75 && uncertainty > 20) {
      tensionScore += uncertainty * 1.3;
    }
    
    // General high-leverage moments
    else if (uncertainty > 25) {
      tensionScore += uncertainty * 0.8;
    }
  });
  
  return tensionScore / probabilities.length;
}

function calculateContextualFactors(game) {
  const factors = {};
  
  // Score-based context
  factors.scoringContext = analyzeScoring(game);
  
  // Competitive balance
  factors.competitiveBalance = assessCompetitiveBalance(game);
  
  return factors;
}

function analyzeScoring(game) {
  const totalScore = game.homeScore + game.awayScore;
  const margin = Math.abs(game.homeScore - game.awayScore);
  
  // High-scoring games can be entertaining even with larger margins
  let scoringFactor = 1.0;
  
  if (totalScore > 60) { // High-scoring affair
    scoringFactor = 1.3;
  } else if (totalScore < 30) { // Defensive struggle
    scoringFactor = margin <= 3 ? 1.2 : 0.8; // Only good if close
  }
  
  // Margin impact with non-linear decay
  const marginPenalty = Math.pow(margin / 10, 1.5); // Accelerating penalty for blowouts
  
  return Math.max(0.2, scoringFactor - marginPenalty * 0.3);
}

function assessCompetitiveBalance(game) {
  // Basic competitive balance (could be enhanced with team strength data)
  const margin = Math.abs(game.homeScore - game.awayScore);
  
  if (margin <= 3) return 1.3;
  if (margin <= 7) return 1.15;
  if (margin <= 14) return 1.0;
  return 0.8;
}

function analyzeNarrativeFlow(probabilities, game) {
  // Assess the "story" of the game
  const story = {
    openingTone: assessOpeningTone(probabilities.slice(0, Math.min(20, probabilities.length))),
    midGameDevelopment: assessMidGame(probabilities),
    climaxIntensity: assessClimax(probabilities),
    resolution: assessResolution(probabilities, game)
  };
  
  // Weight different story elements
  return (
    story.openingTone * 0.15 +
    story.midGameDevelopment * 0.25 +
    story.climaxIntensity * 0.45 +
    story.resolution * 0.15
  );
}

function assessOpeningTone(earlyProbs) {
  if (earlyProbs.length < 5) return 5.0;
  
  const earlyUncertainty = earlyProbs.reduce((sum, p) => {
    return sum + Math.abs(p.probability - 50);
  }, 0) / earlyProbs.length;
  
  // Moderate early uncertainty is ideal
  return earlyUncertainty > 30 ? 3.0 : earlyUncertainty < 15 ? 7.0 : 5.0;
}

function assessMidGame(probabilities) {
  const midGameStart = Math.floor(probabilities.length * 0.3);
  const midGameEnd = Math.floor(probabilities.length * 0.7);
  const midSection = probabilities.slice(midGameStart, midGameEnd);
  
  if (midSection.length === 0) return 5.0;
  
  // Look for development, momentum shifts
  let shifts = 0;
  let totalMovement = 0;
  
  for (let i = 1; i < midSection.length; i++) {
    const movement = Math.abs(midSection[i].probability - midSection[i-1].probability);
    totalMovement += movement;
    
    if (movement > 8) shifts++;
  }
  
  const averageMovement = totalMovement / midSection.length;
  const shiftDensity = shifts / midSection.length;
  
  return Math.min(10, averageMovement * 0.3 + shiftDensity * 40);
}

function assessClimax(probabilities) {
  // Final 25% of the game
  const climaxStart = Math.floor(probabilities.length * 0.75);
  const climax = probabilities.slice(climaxStart);
  
  if (climax.length === 0) return 5.0;
  
  const maxTension = Math.max(...climax.map(p => Math.abs(p.probability - 50)));
  const avgTension = climax.reduce((sum, p) => sum + Math.abs(p.probability - 50), 0) / climax.length;
  const volatility = calculateVolatility(climax.map(p => p.probability));
  
  return Math.min(10, (maxTension * 0.4 + avgTension * 0.3 + volatility * 0.3) / 5);
}

function assessResolution(probabilities, game) {
  // How satisfying was the ending?
  const finalProbs = probabilities.slice(-5);
  if (finalProbs.length === 0) return 5.0;
  
  const finalUncertainty = finalProbs.reduce((sum, p) => sum + Math.abs(p.probability - 50), 0) / finalProbs.length;
  
  const margin = Math.abs(game.homeScore - game.awayScore);
  const overtime = game.overtime;
  
  // Overtime is always dramatic
  if (overtime) return 9.0;
  
  // Close finish with late uncertainty
  if (margin <= 3 && finalUncertainty > 20) return 8.5;
  if (margin <= 7 && finalUncertainty > 15) return 7.0;
  
  // Comfortable but not blowout
  if (margin <= 14) return 5.5;
  
  return Math.max(2.0, 6.0 - margin * 0.2);
}

function combineEnhancedMetrics(metrics) {
  // Non-linear combination with contextual weighting
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
  
  // Convert each metric to 0-10 scale with appropriate curves
  const uncertaintyScore = sigmoidTransform(timeWeightedUncertainty, 25, 10);
  const persistenceScore = linear(uncertaintyPersistence, 0, 0.4, 0, 10);
  const peakScore = sigmoidTransform(peakUncertainty, 20, 10);
  const comebackScore = sigmoidTransform(comebackFactor, 30, 10);
  const tensionScore = sigmoidTransform(situationalTension, 15, 10);
  const narrativeScore = narrative;
  
  // Adaptive weighting based on game characteristics
  const weights = calculateAdaptiveWeights(metrics);
  
  const rawScore = (
    uncertaintyScore * weights.uncertainty +
    persistenceScore * weights.persistence +
    peakScore * weights.peaks +
    comebackScore * weights.comeback +
    tensionScore * weights.tension +
    narrativeScore * weights.narrative
  );
  
  // Apply contextual multipliers
  const contextScore = rawScore * scoringContext * competitiveBalance;
  
  // Calculate confidence based on data quality
  const confidence = calculateConfidence(metrics);
  
  return {
    score: Math.min(10.0, Math.max(0.0, contextScore)),
    confidence: confidence,
    breakdown: {
      uncertainty: Math.round(uncertaintyScore * 10) / 10,
      persistence: Math.round(persistenceScore * 10) / 10,
      peaks: Math.round(peakScore * 10) / 10,
      comeback: Math.round(comebackScore * 10) / 10,
      tension: Math.round(tensionScore * 10) / 10,
      narrative: Math.round(narrativeScore * 10) / 10,
      context: Math.round((scoringContext * competitiveBalance) * 10) / 10
    },
    narrative: generateNarrativeDescription(metrics),
    keyFactors: identifyKeyFactors(metrics)
  };
}

// Utility functions
function sigmoidTransform(value, midpoint, scale) {
  return scale / (1 + Math.exp(-(value - midpoint) / (midpoint * 0.3)));
}

function linear(value, minIn, maxIn, minOut, maxOut) {
  const clampedValue = Math.max(minIn, Math.min(maxIn, value));
  return minOut + (clampedValue - minIn) * (maxOut - minOut) / (maxIn - minIn);
}

function calculateVolatility(values) {
  if (values.length < 2) return 0;
  
  let sumSquaredDiffs = 0;
  for (let i = 1; i < values.length; i++) {
    sumSquaredDiffs += Math.pow(values[i] - values[i-1], 2);
  }
  
  return Math.sqrt(sumSquaredDiffs / (values.length - 1));
}

function calculateLateGameWeight(index, totalLength) {
  const progress = index / totalLength;
  return Math.exp(progress * 1.5); // Exponential weighting
}

function calculateAdaptiveWeights(metrics) {
  // Adjust weights based on what happened in the game
  const baseWeights = {
    uncertainty: 0.25,
    persistence: 0.15, 
    peaks: 0.2,
    comeback: 0.15,
    tension: 0.15,
    narrative: 0.1
  };
  
  // If there were major comebacks, weight that more heavily
  if (metrics.comebackFactor > 40) {
    baseWeights.comeback += 0.1;
    baseWeights.uncertainty -= 0.05;
    baseWeights.persistence -= 0.05;
  }
  
  // If tension was the main factor, emphasize it
  if (metrics.situationalTension > 20) {
    baseWeights.tension += 0.1;
    baseWeights.peaks -= 0.05;
    baseWeights.narrative -= 0.05;
  }
  
  return baseWeights;
}

function calculateConfidence(metrics) {
  // Higher confidence when we have consistent signals
  let confidence = 0.8;
  
  // Boost confidence if multiple metrics agree
  const scores = [
    metrics.timeWeightedUncertainty > 20,
    metrics.uncertaintyPersistence > 0.3,
    metrics.peakUncertainty > 15,
    metrics.comebackFactor > 25,
    metrics.situationalTension > 12
  ];
  
  const agreementCount = scores.filter(s => s).length;
  confidence += agreementCount * 0.04;
  
  return Math.min(1.0, confidence);
}

function generateNarrativeDescription(metrics) {
  // Generate a human-readable description
  const factors = [];
  
  if (metrics.comebackFactor > 35) factors.push("dramatic comeback");
  if (metrics.uncertaintyPersistence > 0.4) factors.push("sustained tension");
  if (metrics.peakUncertainty > 25) factors.push("crucial momentum swings");
  if (metrics.situationalTension > 18) factors.push("late-game pressure");
  if (metrics.gameType?.overtime) factors.push("overtime thriller");
  
  if (factors.length === 0) return "competitive game with moderate entertainment";
  
  return factors.join(" and ");
}

function identifyKeyFactors(metrics) {
  // Return the top contributing factors
  const factors = [
    { name: "Late-game uncertainty", value: metrics.timeWeightedUncertainty },
    { name: "Sustained competition", value: metrics.uncertaintyPersistence * 100 },
    { name: "Peak drama moments", value: metrics.peakUncertainty },
    { name: "Comeback dynamics", value: metrics.comebackFactor },
    { name: "High-pressure situations", value: metrics.situationalTension }
  ];
  
  return factors
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map(f => f.name);
}

function generateKeyMomentsFromBreakdown(breakdown) {
  const moments = [];
  
  if (breakdown.comeback > 7) {
    moments.push("Major momentum shift identified");
  }
  if (breakdown.tension > 7) {
    moments.push("High-pressure situation in final period");
  }
  if (breakdown.peaks > 7) {
    moments.push("Critical uncertainty peak reached");
  }
  
  return moments.slice(0, 3);
}

function createEnhancedFallback(game) {
  // Enhanced fallback when probability data unavailable
  const result = createEnhancedFallbackResult(game);
  
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
    source: 'Enhanced Fallback Analysis'
  };
}

function createEnhancedFallbackResult(game) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  const totalScore = game.homeScore + game.awayScore;
  
  let baseScore = 5.0;
  
  // Score-based adjustments
  if (margin <= 3) baseScore = 8.0;
  else if (margin <= 7) baseScore = 6.5;
  else if (margin <= 14) baseScore = 4.5;
  else baseScore = 2.0;
  
  // High-scoring bonus
  if (totalScore > 50) baseScore += 1.0;
  
  // Overtime
  if (game.overtime) baseScore += 1.5;
  
  return {
    entertainmentScore: Math.min(10.0, baseScore),
    confidence: 0.6,
    breakdown: { 
      fallback: true,
      margin: margin,
      totalScore: totalScore,
      overtime: game.overtime 
    },
    narrative: `${margin}-point ${game.overtime ? 'overtime ' : ''}game with ${totalScore} total points`,
    keyFactors: ["Final margin", "Total scoring", game.overtime ? "Overtime" : "Regulation finish"].filter(Boolean)
  };
}
