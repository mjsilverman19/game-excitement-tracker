// File: /api/games.js - Refined Game Entertainment Analysis with Better Scoring

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
          analysisType: 'Refined Entertainment Analysis',
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
        analysisType: 'Refined Entertainment Analysis',
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

    // Calculate entertainment score - REFINED
    const excitement = calculateRefinedEntertainment(probData.items, game);
    
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
      source: 'Refined Analysis'
    };

  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return createFallback(game);
  }
}

function calculateRefinedEntertainment(probabilities, game) {
  // Clean the probability data
  const probs = probabilities
    .map(p => Math.max(1, Math.min(99, p.homeWinPercentage || 50)))
    .filter(p => p !== null);

  if (probs.length < 10) {
    return createScoreBasedAnalysis(game);
  }

  // Core metrics (more refined calculations)
  
  // 1. Average uncertainty - how close to 50/50 throughout game
  const avgUncertainty = probs.reduce((sum, p) => sum + Math.abs(p - 50), 0) / probs.length;
  
  // 2. Late game uncertainty - final 25% of game
  const finalQuarter = probs.slice(-Math.floor(probs.length * 0.25));
  const lateUncertainty = finalQuarter.reduce((sum, p) => sum + Math.abs(p - 50), 0) / finalQuarter.length;
  
  // 3. Peak uncertainty moments
  const maxUncertainty = Math.max(...probs.map(p => Math.abs(p - 50)));
  
  // 4. Biggest momentum swing
  let maxSwing = 0;
  for (let i = 5; i < probs.length; i++) {
    const swing = Math.abs(probs[i] - probs[i-5]);
    maxSwing = Math.max(maxSwing, swing);
  }
  
  // 5. Sustained tension (how long was it uncertain?)
  let tensionPeriods = 0;
  probs.forEach(p => {
    if (Math.abs(p - 50) <= 25) tensionPeriods++; // Within 25% of 50/50
  });
  const sustainedTension = tensionPeriods / probs.length;

  // Refined scoring system (0-10 with more discrimination)
  let baseScore = 3.0; // Start lower to avoid grade inflation
  
  // Uncertainty scoring (more nuanced)
  if (avgUncertainty <= 15) baseScore += 3.0;        // Consistently close
  else if (avgUncertainty <= 20) baseScore += 2.2;   
  else if (avgUncertainty <= 25) baseScore += 1.5;   
  else if (avgUncertainty <= 30) baseScore += 0.8;
  else baseScore += 0.2; // Very predictable game
  
  // Late drama bonus (exponential importance)
  if (lateUncertainty <= 10) baseScore += 2.5;       // Nail-biter finish
  else if (lateUncertainty <= 15) baseScore += 2.0;  
  else if (lateUncertainty <= 20) baseScore += 1.5;  
  else if (lateUncertainty <= 25) baseScore += 1.0;  
  else if (lateUncertainty <= 30) baseScore += 0.5;

  // Peak moments
  if (maxUncertainty >= 45) baseScore += 1.5;        // Truly uncertain moments
  else if (maxUncertainty >= 35) baseScore += 1.0;   
  else if (maxUncertainty >= 25) baseScore += 0.5;

  // Momentum swings
  if (maxSwing >= 40) baseScore += 1.5;              // Huge comeback
  else if (maxSwing >= 30) baseScore += 1.0;         
  else if (maxSwing >= 20) baseScore += 0.5;

  // Sustained tension bonus
  if (sustainedTension >= 0.7) baseScore += 1.0;     // Tense throughout
  else if (sustainedTension >= 0.5) baseScore += 0.5;

  // Final score context adjustments
  const margin = Math.abs(game.homeScore - game.awayScore);
  const totalScore = game.homeScore + game.awayScore;
  
  // Margin penalties/bonuses (more granular)
  if (margin === 0) baseScore += 0.8;                // Tie game
  else if (margin <= 3) baseScore += 0.6;            
  else if (margin <= 7) baseScore += 0.2;            
  else if (margin <= 14) baseScore -= 0.3;           
  else if (margin <= 21) baseScore -= 1.0;           
  else baseScore -= 2.0;                             // Blowout penalty

  // Scoring context
  if (totalScore >= 70) baseScore += 0.4;            // Shootout bonus
  else if (totalScore <= 30) {                       // Low-scoring game
    baseScore += margin <= 3 ? 0.3 : -0.5;          // Good if close, bad if blowout
  }

  // Overtime massive bonus
  if (game.overtime) baseScore += 1.2;

  // Apply more realistic caps and floors
  let finalScore = Math.max(1.0, Math.min(10.0, baseScore));
  
  // Add some randomness for ties (prevent identical scores)
  finalScore += (Math.random() - 0.5) * 0.1;
  
  // Round to one decimal place
  finalScore = Math.round(finalScore * 10) / 10;

  // More nuanced descriptions
  let description = "Average game";
  if (finalScore >= 9.5) description = "Instant classic";
  else if (finalScore >= 9.0) description = "Epic game";
  else if (finalScore >= 8.5) description = "Thriller";
  else if (finalScore >= 8.0) description = "Highly entertaining";
  else if (finalScore >= 7.5) description = "Very good";
  else if (finalScore >= 7.0) description = "Good game";
  else if (finalScore >= 6.5) description = "Solid entertainment";
  else if (finalScore >= 6.0) description = "Decent game";
  else if (finalScore >= 5.5) description = "Watchable";
  else if (finalScore >= 5.0) description = "Mediocre";
  else if (finalScore >= 4.0) description = "Below average";
  else if (finalScore >= 3.0) description = "Boring";
  else description = "Blowout";

  if (game.overtime) description += " (OT)";

  return {
    score: finalScore,
    description: description,
    analysis: `Avg uncertainty: ${Math.round(avgUncertainty)}%, Late drama: ${Math.round(lateUncertainty)}%, Peak tension: ${Math.round(maxUncertainty)}%`,
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
  
  let baseScore = 4.0; // Lower starting point
  
  // More granular margin-based scoring
  if (margin === 0) baseScore = 8.5;               // Tie
  else if (margin === 1) baseScore = 8.2;          
  else if (margin === 2) baseScore = 7.9;          
  else if (margin === 3) baseScore = 7.5;          
  else if (margin <= 6) baseScore = 6.8;           
  else if (margin <= 10) baseScore = 5.8;          
  else if (margin <= 14) baseScore = 4.5;          
  else if (margin <= 21) baseScore = 3.2;          
  else if (margin <= 28) baseScore = 2.5;          
  else baseScore = 1.8;                            // Major blowout
  
  // Scoring context adjustments
  if (totalScore >= 70) baseScore += 0.5;          // High-scoring bonus
  else if (totalScore >= 60) baseScore += 0.3;     
  else if (totalScore <= 30 && margin > 7) baseScore -= 0.5; // Low-scoring blowout penalty
  
  // Overtime
  if (game.overtime) baseScore += 1.2;
  
  // Add slight randomness and cap
  baseScore += (Math.random() - 0.5) * 0.1;
  baseScore = Math.max(1.0, Math.min(10.0, baseScore));
  
  // Round to one decimal
  const finalScore = Math.round(baseScore * 10) / 10;
  
  // Descriptions
  let description = "Moderate game";
  if (finalScore >= 9.0) description = "Classic";
  else if (finalScore >= 8.0) description = "Thriller";
  else if (finalScore >= 7.0) description = "Good game";
  else if (finalScore >= 6.0) description = "Decent";
  else if (finalScore >= 5.0) description = "Average";
  else if (finalScore >= 4.0) description = "Below average";
  else description = "Blowout";
  
  if (game.overtime) description += " (OT)";

  return {
    score: finalScore,
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
