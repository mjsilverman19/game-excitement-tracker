// File: /api/games.js - Simplified Game Entertainment Analysis

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
          analysisType: 'Simplified Entertainment Analysis',
          gameCount: 0
        }
      });
    }

    // Analyze each game
    const analyzedGames = await Promise.all(
      games.map(async (game) => await analyzeGameEntertainment(game))
    );

    // Filter out failed analyses
    const validGames = analyzedGames.filter(game => game !== null);

    console.log(`Successfully analyzed ${validGames.length} games`);

    return res.status(200).json({
      success: true,
      games: validGames,
      metadata: {
        date: sport === 'NFL' ? `Week ${week} (${searchParam.season})` : date,
        sport: sport,
        source: 'ESPN Win Probability API',
        analysisType: 'Simplified Entertainment Analysis',
        gameCount: validGames.length
      }
    });

  } catch (error) {
    console.error('Error in analysis:', error);
    
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
      // NFL week-based search
      apiUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${searchParam.week}`;
      if (searchParam.season && searchParam.season !== new Date().getFullYear()) {
        apiUrl += `&season=${searchParam.season}`;
      }
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
      console.log('No games found');
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
      return createFallback(game);
    }

    const probData = await response.json();
    
    if (!probData.items || probData.items.length < 10) {
      console.log(`Insufficient probability data for game ${game.id}`);
      return createFallback(game);
    }

    // Calculate entertainment score - SIMPLIFIED
    const excitement = calculateSimpleEntertainment(probData.items, game);
    
    return {
      id: `game-${game.id}`,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      excitement: excitement.score,
      overtime: game.overtime,
      description: excitement.description,
      varianceAnalysis: excitement.analysis,
      keyMoments: excitement.moments,
      source: 'Simplified Analysis'
    };

  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return createFallback(game);
  }
}

function calculateSimpleEntertainment(probabilities, game) {
  // Clean the probability data
  const probs = probabilities
    .map(p => Math.max(1, Math.min(99, p.homeWinPercentage || 50)))
    .filter(p => p !== null);

  if (probs.length < 10) {
    return createScoreBasedAnalysis(game);
  }

  // 1. How close to 50/50 was the game on average?
  const avgUncertainty = probs.reduce((sum, p) => sum + Math.abs(p - 50), 0) / probs.length;
  
  // 2. How uncertain was the ending?
  const finalQuarter = probs.slice(-Math.floor(probs.length / 4));
  const lateUncertainty = finalQuarter.reduce((sum, p) => sum + Math.abs(p - 50), 0) / finalQuarter.length;
  
  // 3. Biggest momentum swing
  let maxSwing = 0;
  for (let i = 10; i < probs.length; i++) {
    const swing = Math.abs(probs[i] - probs[i-10]);
    maxSwing = Math.max(maxSwing, swing);
  }

  // Combine into single score (0-10)
  let score = 5.0;
  
  // Lower average uncertainty = more exciting
  score += (50 - avgUncertainty) / 10;
  
  // Late uncertainty is extra valuable  
  score += lateUncertainty / 15;
  
  // Big swings add excitement
  score += maxSwing / 20;
  
  // Final score adjustments
  const margin = Math.abs(game.homeScore - game.awayScore);
  if (margin <= 3) score += 1.0;
  else if (margin > 21) score -= 2.0;
  
  if (game.overtime) score += 1.5;
  
  // Cap between 0-10
  score = Math.max(0, Math.min(10, score));
  
  // Generate description
  let description = "Average game";
  if (score >= 8.5) description = "Instant classic";
  else if (score >= 7.5) description = "Highly entertaining";
  else if (score >= 6.5) description = "Good game";
  else if (score >= 5.5) description = "Decent entertainment";
  else if (score >= 4.0) description = "Somewhat boring";
  else description = "Blowout";

  if (game.overtime) description += " (overtime)";

  return {
    score: Math.round(score * 10) / 10,
    description: description,
    analysis: `Avg uncertainty: ${Math.round(avgUncertainty)}%, Late drama: ${Math.round(lateUncertainty)}%, Max swing: ${Math.round(maxSwing)}%`,
    moments: findKeyMoments(probs)
  };
}

function findKeyMoments(probs) {
  const moments = [];
  
  // Find biggest swings
  for (let i = 10; i < probs.length; i++) {
    const swing = Math.abs(probs[i] - probs[i-10]);
    if (swing > 25) {
      const quarter = Math.ceil((i / probs.length) * 4);
      moments.push(`Q${quarter}: Major probability swing (${Math.round(swing)}%)`);
    }
  }
  
  return moments.slice(0, 3);
}

function createScoreBasedAnalysis(game) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  const totalScore = game.homeScore + game.awayScore;
  
  let score = 5.0;
  
  if (margin <= 3) score = 8.0;
  else if (margin <= 7) score = 6.5;
  else if (margin <= 14) score = 4.5;
  else score = 2.0;
  
  if (totalScore > 50) score += 0.5;
  if (game.overtime) score += 1.5;
  
  let description = margin <= 3 ? "Close game" : margin > 21 ? "Blowout" : "Moderate game";
  if (game.overtime) description += " (overtime)";

  return {
    score: Math.min(10, score),
    description: description,
    analysis: `${margin}-point game, ${totalScore} total points`,
    moments: []
  };
}

function createFallback(game) {
  const analysis = createScoreBasedAnalysis(game);
  
  return {
    id: `fallback-${game.id}`,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    excitement: analysis.score,
    overtime: game.overtime,
    description: analysis.description,
    varianceAnalysis: analysis.analysis + " (no probability data)",
    keyMoments: [],
    source: 'Score-based Analysis'
  };
}
