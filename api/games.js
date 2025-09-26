// File: /api/games.js - Enhanced Entertainment Analysis with Spoiler-Free Features

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

  const { date, sport, week, season } = req.body;

  if (!sport || (sport === 'NFL' && !week) || (sport !== 'NFL' && !date)) {
    return res.status(400).json({ 
      error: sport === 'NFL' ? 'Week and sport are required for NFL' : 'Date and sport are required' 
    });
  }

  try {
    let searchParam;
    if (sport === 'NFL' && week) {
      searchParam = { week, season: season || new Date().getFullYear() };
      console.log(`Analyzing NFL Week ${week} (${searchParam.season}) games...`);
    } else {
      searchParam = { date };
      console.log(`Analyzing ${sport} games for ${date}...`);
    }
    
    // Get games for the week/date
    const games = await getGamesForSearch(searchParam, sport);
    
    if (!games || games.length === 0) {
      return res.status(200).json({
        success: true,
        games: [],
        metadata: {
          date: sport === 'NFL' ? `Week ${week} (${searchParam.season})` : date,
          sport: sport,
          source: 'ESPN Win Probability API',
          analysisType: 'Enhanced Entertainment Analysis',
          gameCount: 0
        }
      });
    }

    // Analyze each game with enhanced algorithm
    const analyzedGames = await Promise.all(
      games.map(async (game) => await analyzeGameEntertainment(game))
    );

    const validGames = analyzedGames.filter(game => game !== null);

    console.log(`Successfully analyzed ${validGames.length} games with enhanced metrics`);

    return res.status(200).json({
      success: true,
      games: validGames,
      metadata: {
        date: sport === 'NFL' ? `Week ${week} (${searchParam.season})` : date,
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

async function getGamesForSearch(searchParam, sport) {
  try {
    let apiUrl;
    
    if (sport === 'NFL' && searchParam.week) {
      // Always include season parameter for NFL
      apiUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${searchParam.week}&season=${searchParam.season}`;
    } else if (sport === 'NBA') {
      const dateFormatted = searchParam.date.replace(/-/g, '');
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
      console.log('No games found for this week/season combination');
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
        status: competition.status.type.description,
        venue: competition.venue?.fullName || '',
        weather: competition.weather || null
      };
    });

    console.log(`Found ${games.length} games, ${games.filter(g => g.isCompleted).length} completed`);
    return games.filter(game => game.isCompleted);
    
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

// ENHANCED ALGORITHM FROM YOUR DOCUMENT
function calculateEnhancedEntertainment(probabilities, game, gameContext = {}) {
  try {
    const cleanProbs = preprocessProbabilities(probabilities, game);
    
    if (cleanProbs.length < 10) {
      return createContextualFallback(game, gameContext);
    }

    // Core uncertainty metrics with improvements
    const uncertaintyMetrics = calculateAdvancedUncertaintyMetrics(cleanProbs, game);
    
    // New contextual factors
    const contextualFactors = calculateContextualFactors(game, gameContext);
    
    // Narrative flow analysis
    const narrativeScore = analyzeNarrativeFlow(cleanProbs, game);
    
    // Combine all factors
    const entertainment = combineEnhancedMetrics({
      ...uncertaintyMetrics,
      ...contextualFactors,
      narrative: narrativeScore,
      gameType: game
    });

    // Generate spoiler-free description
    const spoilerFreeDescription = generateSpoilerFreeDescription(uncertaintyMetrics, game);

    return {
      entertainmentScore: Math.round(entertainment.score * 10) / 10,
      confidence: entertainment.confidence,
      breakdown: entertainment.breakdown,
      narrative: spoilerFreeDescription, // Spoiler-free description
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
  
  // Add lead changes for spoiler-free descriptions
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
  
  const earlyUncertainty = earlyProbs.reduce((sum, p) => {
    return sum + Math.abs(p.probability - 50);
  }, 0) / earlyProbs.length;
  
  return earlyUncertainty > 30 ? 3.0 : earlyUncertainty < 15 ? 7.0 : 5.0;
}

function assessMidGame(probabilities) {
  const midGameStart = Math.floor(probabilities.length * 0.3);
  const midGameEnd = Math.floor(probabilities.length * 0.7);
  const midSection = probabilities.slice(midGameStart, midGameEnd);
  
  if (midSection.length === 0) return 5.0;
  
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
  const climaxStart = Math.floor(probabilities.length * 0.75);
  const climax = probabilities.slice(climaxStart);
  
  if (climax.length === 0) return 5.0;
  
  const maxTension = Math.max(...climax.map(p => Math.abs(p.probability - 50)));
  const avgTension = climax.reduce((sum, p) => sum + Math.abs(p.probability - 50), 0) / climax.length;
  const volatility = calculateVolatility(climax.map(p => p.probability));
  
  return Math.min(10, (maxTension * 0.4 + avgTension * 0.3 + volatility * 0.3) / 5);
}

function assessResolution(probabilities, game) {
  const finalProbs = probabilities.slice(-5);
  if (finalProbs.length === 0) return 5.0;
  
  const finalUncertainty = finalProbs.reduce((sum, p) => sum + Math.abs(p.probability - 50), 0) / finalProbs.length;
  
  const margin = Math.abs(game.homeScore - game.awayScore);
  const overtime = game.overtime;
  
  if (overtime) return 9.0;
  
  if (margin <= 3 && finalUncertainty > 20) return 8.5;
  if (margin <= 7 && finalUncertainty > 15) return 7.0;
  
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
    narrative
  } = metrics;
  
  const uncertaintyScore = sigmoidTransform(timeWeightedUncertainty, 25, 10);
  const persistenceScore = linear(uncertaintyPersistence, 0, 0.4, 0, 10);
  const peakScore = sigmoidTransform(peakUncertainty, 20, 10);
  const comebackScore = sigmoidTransform(comebackFactor, 30, 10);
  const tensionScore = sigmoidTransform(situationalTension, 15, 10);
  const narrativeScore = narrative;
  
  const weights = calculateAdaptiveWeights(metrics);
  
  const rawScore = (
    uncertaintyScore * weights.uncertainty +
    persistenceScore * weights.persistence +
    peakScore * weights.peaks +
    comebackScore * weights.comeback +
    tensionScore * weights.tension +
    narrativeScore * weights.narrative
  );
  
  const contextScore = rawScore * scoringContext * competitiveBalance;
  
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

// SPOILER-FREE DESCRIPTION GENERATOR
function generateSpoilerFreeDescription(uncertaintyMetrics, game) {
  const descriptors = [];
  const totalScore = game.homeScore + game.awayScore;
  
  // Game flow (spoiler-free)
  if (uncertaintyMetrics.leadChanges >= 3) descriptors.push("Multiple lead changes");
  else if (uncertaintyMetrics.leadChanges >= 1) descriptors.push("Back-and-forth action");
  
  // Timing of drama
  if (uncertaintyMetrics.timeWeightedUncertainty <= 20) descriptors.push("Late drama");
  if (uncertaintyMetrics.uncertaintyPersistence > 0.6) descriptors.push("Sustained tension");
  
  // Style indicators
  if (totalScore > 60) descriptors.push("High-scoring affair");
  else if (totalScore < 35) descriptors.push("Defensive battle");
  else descriptors.push("Balanced scoring");
  
  // Special circumstances
  if (game.overtime) descriptors.push("Overtime thriller");
  if (game.weather && (game.weather.temperature < 32 || game.weather.precipitation)) {
    descriptors.push("Weather factor");
  }
  
  // Comeback potential
  if (uncertaintyMetrics.comebackFactor > 35) descriptors.push("Comeback drama");
  
  // Return top 2-3 descriptors
  return descriptors.length > 0 ? descriptors.slice(0, 3).join(", ") : "Competitive matchup";
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
  return Math.exp(progress * 1.5);
}

function calculateAdaptiveWeights(metrics) {
  const baseWeights = {
    uncertainty: 0.25,
    persistence: 0.15, 
    peaks: 0.2,
    comeback: 0.15,
    tension: 0.15,
    narrative: 0.1
  };
  
  if (metrics.comebackFactor > 40) {
    baseWeights.comeback += 0.1;
    baseWeights.uncertainty -= 0.05;
    baseWeights.persistence -= 0.05;
  }
  
  if (metrics.situationalTension > 20) {
    baseWeights.tension += 0.1;
    baseWeights.peaks -= 0.05;
    baseWeights.narrative -= 0.05;
  }
  
  return baseWeights;
}

function calculateConfidence(metrics) {
  let confidence = 0.8;
  
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
  const result = createContextualFallback(game, {});
  
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

function createContextualFallback(game, context) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  const totalScore = game.homeScore + game.awayScore;
  
  let baseScore = 5.0;
  
  if (margin <= 3) baseScore = 8.0;
  else if (margin <= 7) baseScore = 6.5;
  else if (margin <= 14) baseScore = 4.5;
  else baseScore = 2.0;
  
  if (totalScore > 50) baseScore += 1.0;
  if (game.overtime) baseScore += 1.5;
  
  // Generate spoiler-free fallback description
  const descriptors = [];
  if (totalScore > 50) descriptors.push("High-scoring");
  else if (totalScore < 35) descriptors.push("Defensive battle");
  
  if (margin <= 3) descriptors.push("Close finish");
  else if (margin > 21) descriptors.push("Decisive outcome");
  
  if (game.overtime) descriptors.push("Overtime");
  
  const spoilerFreeDesc = descriptors.length > 0 ? descriptors.join(", ") : "Competitive matchup";

  return {
    entertainmentScore: Math.min(10.0, baseScore),
    confidence: 0.6,
    breakdown: { 
      fallback: true,
      margin: margin,
      totalScore: totalScore,
      overtime: game.overtime 
    },
    narrative: spoilerFreeDesc,
    keyFactors: ["Final margin", "Total scoring", game.overtime ? "Overtime" : "Regulation finish"].filter(Boolean)
  };
}
