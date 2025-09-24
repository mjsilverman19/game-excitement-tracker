// File: /api/games.js - Principled Win Probability Variance Analysis

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
    console.log(`Analyzing ${sport} games for ${date} using principled variance analysis...`);
    
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
          analysisType: 'Principled Uncertainty Analysis',
          gameCount: 0
        }
      });
    }

    // Analyze each game with principled uncertainty metrics
    const analyzedGames = await Promise.all(
      games.map(async (game) => await analyzeGameUncertainty(game))
    );

    // Filter out failed analyses
    const validGames = analyzedGames.filter(game => game !== null);

    console.log(`Successfully analyzed ${validGames.length} games with principled metrics`);

    return res.status(200).json({
      success: true,
      games: validGames,
      metadata: {
        date: date,
        sport: sport,
        source: 'ESPN Win Probability API',
        analysisType: 'Principled Uncertainty Analysis',
        gameCount: validGames.length
      }
    });

  } catch (error) {
    console.error('Error in principled analysis:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to analyze game uncertainty',
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

async function analyzeGameUncertainty(game) {
  try {
    console.log(`Analyzing uncertainty for ${game.awayTeam} @ ${game.homeTeam}`);
    
    // Fetch win probability data from ESPN
    const probUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${game.id}/competitions/${game.id}/probabilities?limit=300`;
    
    const response = await fetch(probUrl);
    
    if (!response.ok) {
      console.log(`No probability data for game ${game.id}`);
      return createBasicAnalysis(game);
    }

    const probData = await response.json();
    
    if (!probData.items || probData.items.length < 10) {
      console.log(`Insufficient probability data for game ${game.id}`);
      return createBasicAnalysis(game);
    }

    // Calculate principled uncertainty metrics
    const uncertainty = calculatePrincipledUncertainty(probData.items, game);
    
    return {
      id: `uncertainty-${game.id}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      excitement: uncertainty.excitement,
      overtime: game.overtime,
      description: uncertainty.description,
      varianceAnalysis: uncertainty.analysis,
      keyMoments: uncertainty.keyMoments,
      source: 'Principled Uncertainty Analysis'
    };

  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return createBasicAnalysis(game);
  }
}

function calculatePrincipledUncertainty(probabilities, game) {
  try {
    // Extract and clean probability data
    const cleanProbs = probabilities
      .map((p, index) => ({
        probability: p.homeWinPercentage || 50,
        period: p.period || 1,
        index: index,
        timeWeight: calculateTimeWeight(p.period || 1, probabilities.length, index)
      }))
      .filter(p => p.probability !== null && p.probability !== undefined)
      .sort((a, b) => a.index - b.index);

    if (cleanProbs.length < 10) {
      return createBasicUncertaintyAnalysis(game);
    }

    // Metric 1: Average distance from 50% (uncertainty throughout)
    const avgUncertainty = cleanProbs.reduce((sum, p) => sum + Math.abs(p.probability - 50), 0) / cleanProbs.length;
    
    // Metric 2: Time-weighted uncertainty (late game matters more)
    const timeWeightedUncertainty = cleanProbs.reduce((sum, p) => sum + (Math.abs(p.probability - 50) * p.timeWeight), 0) / cleanProbs.length;
    
    // Metric 3: Outcome surprise (how predictable was the winner?)
    const outcomeSurprise = calculateOutcomeSurprise(cleanProbs, game);
    
    // Metric 4: Momentum volatility (how often did momentum shift?)
    const momentumVolatility = calculateMomentumVolatility(cleanProbs);
    
    // Metric 5: Late-game drama (final quarter uncertainty)
    const lateGameDrama = calculateLateGameDrama(cleanProbs);

    // Combine metrics into excitement score (0-10 scale)
    let excitement = combineUncertaintyMetrics({
      avgUncertainty,
      timeWeightedUncertainty, 
      outcomeSurprise,
      momentumVolatility,
      lateGameDrama
    });

    // Overtime bonus
    if (game.overtime) {
      excitement += 1.0;
    }

    // Cap at 10.0
    excitement = Math.min(10.0, Math.max(0.0, excitement));

    // Generate analysis
    const analysis = generateUncertaintyAnalysis({
      avgUncertainty,
      timeWeightedUncertainty,
      outcomeSurprise, 
      momentumVolatility,
      lateGameDrama,
      overtime: game.overtime
    });

    const keyMoments = findKeyUncertaintyMoments(cleanProbs);

    return {
      excitement: Math.round(excitement * 10) / 10,
      description: analysis.description,
      analysis: analysis.technical,
      keyMoments: keyMoments
    };

  } catch (error) {
    console.error('Error in principled calculation:', error);
    return createBasicUncertaintyAnalysis(game);
  }
}

function calculateTimeWeight(period, totalDataPoints, index) {
  // Give higher weight to later periods and later moments within periods
  const periodWeight = Math.pow(period, 1.5); // 1st=1, 2nd=2.8, 3rd=5.2, 4th=8.0
  const progressWeight = 1 + (index / totalDataPoints); // 1.0 to 2.0 based on game progress
  return periodWeight * progressWeight;
}

function calculateOutcomeSurprise(probabilities, game) {
  if (probabilities.length < 5) return 0;
  
  // Who actually won?
  const homeWon = game.homeScore > game.awayScore;
  
  // What was the average prediction throughout the game?
  const avgHomeProbability = probabilities.reduce((sum, p) => sum + p.probability, 0) / probabilities.length;
  
  // How surprised should we be by the outcome?
  const expectedHomeProbability = avgHomeProbability / 100;
  const actualOutcome = homeWon ? 1 : 0;
  
  // Surprise = how far the outcome was from expectation
  return Math.abs(actualOutcome - expectedHomeProbability) * 100;
}

function calculateMomentumVolatility(probabilities) {
  if (probabilities.length < 10) return 0;
  
  // Calculate how often momentum shifted (rolling average changes direction)
  let volatility = 0;
  const windowSize = 5;
  
  for (let i = windowSize; i < probabilities.length - windowSize; i++) {
    const prevAvg = probabilities.slice(i - windowSize, i).reduce((sum, p) => sum + p.probability, 0) / windowSize;
    const nextAvg = probabilities.slice(i, i + windowSize).reduce((sum, p) => sum + p.probability, 0) / windowSize;
    const change = Math.abs(nextAvg - prevAvg);
    
    if (change > 8) { // Significant momentum shift
      volatility += change * probabilities[i].timeWeight;
    }
  }
  
  return volatility / probabilities.length;
}

function calculateLateGameDrama(probabilities) {
  // Focus on 4th quarter drama
  const fourthQuarter = probabilities.filter(p => p.period >= 4);
  if (fourthQuarter.length < 5) return 0;
  
  // How uncertain was the outcome in the 4th quarter?
  const avgFourthUncertainty = fourthQuarter.reduce((sum, p) => sum + Math.abs(p.probability - 50), 0) / fourthQuarter.length;
  
  // Bonus for very late uncertainty (final few data points)
  const finalMoments = fourthQuarter.slice(-5);
  const finalUncertainty = finalMoments.reduce((sum, p) => sum + Math.abs(p.probability - 50), 0) / finalMoments.length;
  
  return (avgFourthUncertainty + finalUncertainty) / 2;
}

function combineUncertaintyMetrics(metrics) {
  // Convert each metric to 0-10 scale and weight them
  
  // Average uncertainty: Lower = more exciting (invert the scale)
  const uncertaintyScore = Math.max(0, 10 - (metrics.avgUncertainty / 5)); // 0-50 avg uncertainty maps to 10-0 excitement
  
  // Time-weighted uncertainty: Lower = more exciting (invert)
  const timeWeightedScore = Math.max(0, 10 - (metrics.timeWeightedUncertainty / 8));
  
  // Outcome surprise: Higher = more exciting
  const surpriseScore = Math.min(10, metrics.outcomeSurprise / 5); // 0-50 surprise maps to 0-10
  
  // Momentum volatility: Higher = more exciting  
  const volatilityScore = Math.min(10, metrics.momentumVolatility / 3);
  
  // Late game drama: Higher = more exciting
  const dramaScore = Math.min(10, metrics.lateGameDrama / 5);
  
  // Weighted combination (late drama and time-weighted uncertainty matter most)
  const excitement = (
    uncertaintyScore * 0.2 +      // 20% - overall uncertainty
    timeWeightedScore * 0.3 +     // 30% - time-weighted (late matters more)  
    surpriseScore * 0.2 +         // 20% - outcome surprise
    volatilityScore * 0.15 +      // 15% - momentum volatility
    dramaScore * 0.15             // 15% - late game drama
  );
  
  return excitement;
}

function generateUncertaintyAnalysis(metrics) {
  const { avgUncertainty, timeWeightedUncertainty, outcomeSurprise, momentumVolatility, lateGameDrama, overtime } = metrics;
  
  let description = '';
  let technical = '';
  
  if (overtime) {
    description = 'Overtime thriller with sustained uncertainty throughout regulation';
    technical = `Avg uncertainty: ${Math.round(avgUncertainty)}%, Late drama: ${Math.round(lateGameDrama)}%`;
  } else if (avgUncertainty < 15 && lateGameDrama < 20) {
    description = 'Consistently close with high uncertainty throughout entire game';
    technical = `Sustained uncertainty: ${Math.round(avgUncertainty)}%, Outcome surprise: ${Math.round(outcomeSurprise)}%`;
  } else if (lateGameDrama > 25) {
    description = 'Late-game drama with significant fourth quarter uncertainty';
    technical = `4th quarter uncertainty: ${Math.round(lateGameDrama)}%, Final outcome surprise: ${Math.round(outcomeSurprise)}%`;
  } else if (outcomeSurprise > 30) {
    description = 'Surprising outcome defied probability predictions';
    technical = `Outcome surprise: ${Math.round(outcomeSurprise)}%, Avg uncertainty: ${Math.round(avgUncertainty)}%`;
  } else if (momentumVolatility > 4) {
    description = 'Multiple momentum shifts created sustained drama';
    technical = `Momentum volatility: ${Math.round(momentumVolatility)}, Time-weighted uncertainty: ${Math.round(timeWeightedUncertainty)}%`;
  } else {
    description = 'Moderate uncertainty with some competitive moments';
    technical = `Avg uncertainty: ${Math.round(avgUncertainty)}%, Late drama: ${Math.round(lateGameDrama)}%`;
  }
  
  return { description, technical };
}

function findKeyUncertaintyMoments(probabilities) {
  const moments = [];
  
  // Find the biggest probability swings
  for (let i = 1; i < probabilities.length - 1; i++) {
    const prevProb = probabilities[i - 1].probability;
    const currProb = probabilities[i].probability;
    const swing = Math.abs(currProb - prevProb);
    
    if (swing > 20) {
      const period = probabilities[i].period;
      const direction = currProb > prevProb ? 'increased' : 'decreased';
      moments.push(`Q${period}: Probability ${direction} ${Math.round(swing)}% in key moment`);
    }
  }
  
  // Return top 3 moments
  return moments.slice(0, 3);
}

function createBasicAnalysis(game) {
  // Fallback when probability data unavailable
  const margin = Math.abs(game.homeScore - game.awayScore);
  let excitement = 5.0;
  
  if (margin <= 3) excitement = 8.0 + Math.random() * 2;
  else if (margin <= 7) excitement = 6.5 + Math.random() * 1.5;
  else if (margin <= 14) excitement = 4.0 + Math.random() * 2.5;
  else excitement = 1.5 + Math.random() * 3;
  
  if (game.overtime) excitement += 1.0;
  excitement = Math.min(10.0, excitement);
  
  return {
    id: `basic-${game.id}`,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    excitement: Math.round(excitement * 10) / 10,
    overtime: game.overtime,
    description: `${margin}-point ${game.overtime ? 'overtime ' : ''}game`,
    varianceAnalysis: 'Analysis based on score margin (probability data unavailable)',
    keyMoments: [],
    source: 'Basic Score Analysis'
  };
}

function createBasicUncertaintyAnalysis(game) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  let excitement = margin <= 3 ? 7.5 : margin <= 7 ? 6.0 : margin <= 14 ? 4.5 : 2.5;
  if (game.overtime) excitement += 1.0;
  
  return {
    excitement: Math.min(10.0, excitement),
    description: `${margin}-point game ${game.overtime ? 'with overtime' : ''}`,
    analysis: 'Limited probability data - score-based analysis',
    keyMoments: []
  };
}
