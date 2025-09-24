// File: /api/games.js - ESPN Win Probability Analysis

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
    console.log(`Analyzing ${sport} games for ${date} using ESPN probability data...`);
    
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
          analysisType: 'Real Win Probability Variance',
          gameCount: 0
        }
      });
    }

    // Analyze each game's win probability variance
    const analyzedGames = await Promise.all(
      games.map(async (game) => await analyzeGameVariance(game))
    );

    // Filter out failed analyses
    const validGames = analyzedGames.filter(game => game !== null);

    console.log(`Successfully analyzed ${validGames.length} games`);

    return res.status(200).json({
      success: true,
      games: validGames,
      metadata: {
        date: date,
        sport: sport,
        source: 'ESPN Win Probability API',
        analysisType: 'Real Win Probability Variance',
        gameCount: validGames.length
      }
    });

  } catch (error) {
    console.error('Error in ESPN analysis:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to analyze game data',
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

async function analyzeGameVariance(game) {
  try {
    console.log(`Analyzing win probability for ${game.awayTeam} @ ${game.homeTeam}`);
    
    // Fetch win probability data from ESPN
    const probUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${game.id}/competitions/${game.id}/probabilities?limit=300`;
    
    const response = await fetch(probUrl);
    
    if (!response.ok) {
      console.log(`No probability data for game ${game.id}`);
      // Fallback to basic score-based rating
      return createBasicAnalysis(game);
    }

    const probData = await response.json();
    
    if (!probData.items || probData.items.length === 0) {
      console.log(`Empty probability data for game ${game.id}`);
      return createBasicAnalysis(game);
    }

    // Calculate variance from actual probability data
    const variance = calculateWinProbabilityVariance(probData.items, game);
    
    return {
      id: `espn-${game.id}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      excitement: variance.excitement,
      overtime: game.overtime,
      description: variance.description,
      varianceAnalysis: variance.analysis,
      keyMoments: variance.keyMoments,
      source: 'ESPN Win Probability API'
    };

  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return createBasicAnalysis(game);
  }
}

function calculateWinProbabilityVariance(probabilities, game) {
  try {
    // Extract home team probabilities throughout the game
    const homeProbs = probabilities.map(p => ({
      probability: p.homeWinPercentage || 50,
      playId: p.playId || 0,
      period: p.period || 1
    })).filter(p => p.probability !== null && p.probability !== undefined);

    if (homeProbs.length < 10) {
      console.log('Insufficient probability data, using basic analysis');
      return createBasicVarianceAnalysis(game);
    }

    // Calculate variance metrics
    const swings = findMajorSwings(homeProbs);
    const maxVariance = calculateMaxVariance(homeProbs);
    const fourthQuarterDrama = analyzeFourthQuarter(homeProbs);
    
    // Calculate base excitement from variance
    let excitement = 5.0;
    
    // Major swings scoring
    if (swings.count >= 6) excitement = 9.0 + Math.random() * 1.0;
    else if (swings.count >= 4) excitement = 7.5 + Math.random() * 1.5;
    else if (swings.count >= 2) excitement = 6.0 + Math.random() * 1.5;
    else excitement = 3.0 + Math.random() * 2.0;
    
    // Bonuses
    if (game.overtime) excitement += 1.0;
    if (maxVariance > 60) excitement += 0.5; // Huge swings
    if (fourthQuarterDrama.swings >= 2) excitement += 1.0; // Late drama
    
    // Cap at 10.0
    excitement = Math.min(10.0, excitement);
    
    return {
      excitement: Math.round(excitement * 10) / 10,
      description: generateVarianceDescription(swings.count, maxVariance, fourthQuarterDrama, game.overtime),
      analysis: `${swings.count} major probability swings, max variance: ${Math.round(maxVariance)}%`,
      keyMoments: swings.moments.slice(0, 3) // Top 3 moments
    };

  } catch (error) {
    console.error('Error calculating variance:', error);
    return createBasicVarianceAnalysis(game);
  }
}

function findMajorSwings(probabilities) {
  const swings = [];
  const moments = [];
  let swingCount = 0;
  
  for (let i = 1; i < probabilities.length - 1; i++) {
    const prev = probabilities[i - 1].probability;
    const curr = probabilities[i].probability;
    const next = probabilities[i + 1].probability;
    
    // Look for swings of 15+ percentage points
    const swing1 = Math.abs(curr - prev);
    const swing2 = Math.abs(next - curr);
    
    if (swing1 >= 15 || swing2 >= 15) {
      swingCount++;
      const period = probabilities[i].period;
      const direction = curr > prev ? 'increased' : 'decreased';
      moments.push(`Q${period}: Win probability ${direction} by ${Math.round(Math.max(swing1, swing2))}%`);
    }
  }
  
  return {
    count: swingCount,
    moments: moments
  };
}

function calculateMaxVariance(probabilities) {
  const probs = probabilities.map(p => p.probability);
  const max = Math.max(...probs);
  const min = Math.min(...probs);
  return max - min;
}

function analyzeFourthQuarter(probabilities) {
  const fourthQuarter = probabilities.filter(p => p.period >= 4);
  if (fourthQuarter.length < 5) return { swings: 0 };
  
  let swings = 0;
  for (let i = 1; i < fourthQuarter.length; i++) {
    const swing = Math.abs(fourthQuarter[i].probability - fourthQuarter[i-1].probability);
    if (swing >= 10) swings++;
  }
  
  return { swings };
}

function generateVarianceDescription(swings, maxVariance, fourthQuarter, overtime) {
  if (overtime) {
    return `Overtime thriller with ${swings} major probability swings`;
  } else if (swings >= 6) {
    return `${swings} massive probability swings, ${Math.round(maxVariance)}% total variance`;
  } else if (swings >= 4) {
    return `${swings} significant momentum shifts throughout the game`;
  } else if (fourthQuarter.swings >= 2) {
    return `Fourth quarter drama with ${fourthQuarter.swings} late probability swings`;
  } else if (swings >= 2) {
    return `${swings} notable probability swings, competitive throughout`;
  } else {
    return 'Relatively steady probability throughout, limited variance';
  }
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

function createBasicVarianceAnalysis(game) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  let excitement = margin <= 3 ? 7.5 : margin <= 7 ? 6.0 : margin <= 14 ? 4.5 : 2.5;
  if (game.overtime) excitement += 1.0;
  
  return {
    excitement: Math.min(10.0, excitement),
    description: `${margin}-point game ${game.overtime ? 'with overtime' : ''}`,
    analysis: 'Limited probability data available',
    keyMoments: []
  };
}
