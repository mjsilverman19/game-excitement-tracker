// File: /api/games.js - Enhanced Entertainment Analysis with CFB Support

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

  const { date, sport, week, season, seasonType } = req.body;

  console.log('What we received:', req.body);
  console.log('Season is:', season, 'and its type is:', typeof season);

  // Updated validation for NFL/CFB (week-based) and NBA (date-based)
  if (!sport || (['NFL', 'CFB'].includes(sport) && !week) || (sport === 'NBA' && !date)) {
    return res.status(400).json({ 
      error: ['NFL', 'CFB'].includes(sport) ? 'Week and sport are required' : 'Date and sport are required' 
    });
  }

  try {
    let searchParam;
    if (sport === 'NFL' && week) {
      // Handle both number (3) and string ("Week 3") formats
      const weekNumber = typeof week === 'number' ? week.toString() : week.toString().replace(/^Week\s*/i, '');
      const typeNumber = seasonType || 2; // Default to regular season (2)
      searchParam = { week: weekNumber, season: season ? parseInt(season) : new Date().getFullYear(), seasonType: typeNumber };
      console.log(`Analyzing NFL Week ${weekNumber} (${searchParam.season}) ${typeNumber === 3 ? 'Playoffs' : 'Regular Season'} games...`);
    } else if (sport === 'CFB' && week) {
      // CFB postseason and regular season handling
      let weekNumber, seasonTypeNumber;
      
      if (week === 'playoff') {
        // CFB playoff games are in seasontype 4, week 1
        weekNumber = '1';
        seasonTypeNumber = 4;
      } else if (week === 'bowl') {
        // CFB bowl games are in seasontype 3, week 1
        weekNumber = '1';
        seasonTypeNumber = 3;
      } else {
        // Regular season
        weekNumber = typeof week === 'number' ? week.toString() : week.toString().replace(/^Week\s*/i, '');
        seasonTypeNumber = 2;
      }
      
      searchParam = { 
        week: weekNumber, 
        season: season ? parseInt(season) : new Date().getFullYear(),
        seasonType: seasonTypeNumber 
      };
      
      const gameTypeLabel = week === 'playoff' ? 'Playoff' : week === 'bowl' ? 'Bowl' : `Week ${weekNumber}`;
      console.log(`Analyzing CFB ${gameTypeLabel} (${searchParam.season}) games...`);
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
          date: ['NFL', 'CFB'].includes(sport) ? `Week ${week} (${searchParam.season})` : date,
          sport: sport,
          source: 'ESPN Win Probability API',
          analysisType: 'Enhanced Entertainment Analysis',
          gameCount: 0
        }
      });
    }

    // Analyze each game with enhanced algorithm
    const analyzedGames = await Promise.all(
      games.map(async (game) => await analyzeGameEntertainment(game, sport))
    );

    const validGames = analyzedGames.filter(game => game !== null);

    console.log(`Successfully analyzed ${validGames.length} ${sport} games with enhanced metrics`);

    return res.status(200).json({
      success: true,
      games: validGames,
      metadata: {
        date: ['NFL', 'CFB'].includes(sport) ? `Week ${week} (${searchParam.season})` : date,
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
    let usesCoreAPI = false;
    
    if (sport === 'NFL' && searchParam.week) {
      // Use core API for historical data, scoreboard API for current season
      if (searchParam.season && parseInt(searchParam.season) < 2025) {
        apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${searchParam.season}/types/${searchParam.seasonType}/weeks/${searchParam.week}/events`;
        usesCoreAPI = true;
      } else {
        apiUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=${searchParam.seasonType}&week=${searchParam.week}`;
        if (searchParam.season && searchParam.season !== new Date().getFullYear()) {
          apiUrl += `&season=${searchParam.season}`;
        }
      }
    } else if (sport === 'CFB' && searchParam.week) {
      // CFB uses same dual-API approach as NFL
      if (searchParam.season && parseInt(searchParam.season) < 2025) {
        apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${searchParam.season}/types/${searchParam.seasonType}/weeks/${searchParam.week}/events`;
        usesCoreAPI = true;
      } else {
        apiUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?seasontype=${searchParam.seasonType}&week=${searchParam.week}`;
        if (searchParam.season && searchParam.season !== new Date().getFullYear()) {
          apiUrl += `&season=${searchParam.season}`;
        }
      }
    } else if (sport === 'NBA') {
      const dateFormatted = searchParam.date.replace(/-/g, '');
      apiUrl = `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateFormatted}`;
    } else {
      throw new Error(`Unsupported sport: ${sport}`);
    }

    console.log(`Fetching ${sport} games from: ${apiUrl}`);
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (usesCoreAPI) {
      // Handle core API response (reference URLs)
      if (!data.items || data.items.length === 0) {
        console.log('No games found');
        return [];
      }

      // Fetch individual game details
      const gamePromises = data.items.map(async (item) => {
        try {
          const gameResponse = await fetch(item.$ref);
          if (!gameResponse.ok) return null;
          
          const gameData = await gameResponse.json();
          return parseGameFromCoreAPI(gameData);
        } catch (error) {
          console.error(`Error fetching game ${item.$ref}:`, error);
          return null;
        }
      });

      const games = await Promise.all(gamePromises);
      return games.filter(game => game !== null && game.isCompleted);
      
    } else {
      // Handle scoreboard API response (works for NFL, NBA, and CFB)
      if (!data.events || data.events.length === 0) {
        console.log('No games found');
        return [];
      }

      const games = data.events.map(event => {
        const competition = event.competitions[0];
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

        const seasonInfo = event.season?.type || {};
        const labels = Array.isArray(event.labels)
          ? event.labels
              .map(label => label.description || label.shortName || label.detail || label.name)
              .filter(Boolean)
          : [];

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
          weather: competition.weather || null,
          seasonType: normalizeNumericValue(seasonInfo.type ?? seasonInfo.id ?? seasonInfo),
          seasonLabel: seasonInfo.name || null,
          eventImportance: normalizeNumericValue(event.importance ?? competition.importance),
          labels,
          neutralSite: Boolean(competition.neutralSite),
          startDate: event.date
        };
      });

      console.log(`Found ${games.length} ${sport} games`);
      return games.filter(game => game.isCompleted);
    }
    
  } catch (error) {
    console.error(`Error fetching ${sport} games:`, error);
    return [];
  }
}

async function parseGameFromCoreAPI(gameData) {
  try {
    const competition = gameData.competitions?.[0];
    if (!competition) return null;

    // Filter out Pro Bowl games - they have different naming patterns
    if (gameData.name?.toLowerCase().includes('pro bowl') || 
        gameData.shortName?.toLowerCase().includes('pro bowl')) {
      console.log(`Skipping Pro Bowl game: ${gameData.name}`);
      return null;
    }

    const homeCompetitor = competition.competitors?.find(c => c.homeAway === 'home');
    const awayCompetitor = competition.competitors?.find(c => c.homeAway === 'away');
    
    if (!homeCompetitor || !awayCompetitor) return null;

    // Fetch team details and scores from reference URLs
    const [homeTeamData, awayTeamData, homeScoreData, awayScoreData, statusData] = await Promise.all([
      fetch(homeCompetitor.team.$ref).then(r => r.ok ? r.json() : null),
      fetch(awayCompetitor.team.$ref).then(r => r.ok ? r.json() : null),
      fetch(homeCompetitor.score.$ref).then(r => r.ok ? r.json() : null),
      fetch(awayCompetitor.score.$ref).then(r => r.ok ? r.json() : null),
      fetch(competition.status.$ref).then(r => r.ok ? r.json() : null)
    ]);

    // Extract team names
    const homeTeam = homeTeamData?.location || homeTeamData?.displayName || 'Unknown';
    const awayTeam = awayTeamData?.location || awayTeamData?.displayName || 'Unknown';
    
    // Additional Pro Bowl filter - check if teams are NFC/AFC
    if (homeTeam === 'NFC' || homeTeam === 'AFC' || awayTeam === 'NFC' || awayTeam === 'AFC') {
      console.log(`Skipping Pro Bowl game with conference teams: ${awayTeam} @ ${homeTeam}`);
      return null;
    }
    
    // Extract scores
    const homeScore = parseInt(homeScoreData?.value || 0);
    const awayScore = parseInt(awayScoreData?.value || 0);
    
    // Extract game status
    const isCompleted = statusData?.type?.completed || false;
    const overtime = statusData?.type?.name?.includes('OT') || false;
    const status = statusData?.type?.description || '';

    const labels = Array.isArray(gameData.labels)
      ? gameData.labels
          .map(label => label.description || label.shortName || label.detail || label.name)
          .filter(Boolean)
      : [];
    const seasonInfo = gameData.season?.type || {};

    return {
      id: gameData.id,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      homeScore: homeScore,
      awayScore: awayScore,
      isCompleted: isCompleted,
      overtime: overtime,
      status: status,
      venue: competition.venue?.fullName || '',
      weather: null,
      seasonType: normalizeNumericValue(seasonInfo.type ?? seasonInfo.id ?? seasonInfo),
      seasonLabel: seasonInfo.name || null,
      eventImportance: normalizeNumericValue(gameData.importance ?? gameData.eventImportance),
      labels,
      neutralSite: Boolean(competition.site?.neutral),
      startDate: gameData.date || competition.date || null
    };
  } catch (error) {
    console.error('Error parsing game from core API:', error);
    return null;
  }
}

async function analyzeGameEntertainment(game, sport = 'NFL') {
  try {
    console.log(`Analyzing entertainment for ${game.awayTeam} @ ${game.homeTeam} (${sport})`);
    
    // Determine the correct league for the API URL
    const league = sport === 'CFB' ? 'college-football' : 'nfl';
    const gameContext = buildGameContext(game, sport);
    
    // Fetch win probability data from ESPN
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

    // Calculate enhanced entertainment metrics
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

function buildGameContext(game, sport) {
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
    const spoilerFreeDescription = generateSpoilerFreeDescription(uncertaintyMetrics, game, gameContext);

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
      probability: normalizeWinProbability(p.homeWinPercentage),
      period: p.period || 1,
      timeRemaining: p.timeRemaining || estimateTimeRemaining(index, probabilities.length),
      index: index,
      gameState: p.gameState || 'unknown'
    }))
    .filter(p => p.probability !== null);

  return applyAdaptiveSmoothing(cleaned);
}

function normalizeWinProbability(value) {
  if (value === null || value === undefined) {
    return 50;
  }

  const numeric = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(numeric)) {
    return 50;
  }

  const percent = numeric <= 1 ? numeric * 100 : numeric;
  const clamped = Math.max(0.1, Math.min(99.9, percent));

  return clamped;
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
  const leadChangeMetrics = calculateLeadChanges(probabilities);
  const probabilityNoise = calculateProbabilityNoise(probabilities);

  return {
    timeWeightedUncertainty,
    uncertaintyPersistence,
    peakUncertainty,
    comebackFactor,
    situationalTension,
    leadChanges: leadChangeMetrics.total,
    leadChangeBreakdown: leadChangeMetrics.breakdown,
    probabilityNoise
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
    const prev2 = calculateBalanceFromProbability(probabilities[i-2].probability);
    const prev1 = calculateBalanceFromProbability(probabilities[i-1].probability);
    const next1 = calculateBalanceFromProbability(probabilities[i+1].probability);
    const next2 = calculateBalanceFromProbability(probabilities[i+2].probability);
    
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
    const balance = calculateBalanceFromProbability(p.probability);

    if (gameProgress > 0.9 && balance > 30) {
      tensionScore += balance * 2.0;
    }
    else if (gameProgress > 0.75 && balance > 25) {
      tensionScore += balance * 1.3;
    }
    else if (balance > 20) {
      tensionScore += balance * 0.8;
    }
  });
  
  return tensionScore / probabilities.length;
}

function calculateContextualFactors(game, context) {
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
    narrative
  } = metrics;
  
  // Updated sigmoid transforms with reduced scale and adjusted midpoints
  const uncertaintyScore = sigmoidTransform(timeWeightedUncertainty, 28, 8.5);
  const persistenceScore = linear(uncertaintyPersistence, 0, 0.4, 0, 8.5);
  const peakScore = sigmoidTransform(peakUncertainty, 26, 8.5);
  const comebackScore = sigmoidTransform(comebackFactor, 30, 8.5);
  const tensionScore = sigmoidTransform(situationalTension, 18, 8.5);
  const narrativeScore = narrative;
  
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
    narrativeScore * weights.narrative
  );
  
  const contextScore = rawScore * scoringContext * competitiveBalance * stakesBoost * qualityBoost * expectationBoost * noisePenalty;
  
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

// SPOILER-FREE DESCRIPTION GENERATOR
function generateSpoilerFreeDescription(uncertaintyMetrics, game, context = {}) {
  const descriptors = [];
  const totalScore = game.homeScore + game.awayScore;
  
  // Game flow (spoiler-free)
  if (uncertaintyMetrics.leadChanges >= 3) descriptors.push("Multiple lead changes");
  else if (uncertaintyMetrics.leadChanges >= 1) descriptors.push("Back-and-forth action");
  
  // Timing of drama
  if (uncertaintyMetrics.timeWeightedUncertainty >= 28) descriptors.push("Late drama");
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

  if (context.isPlayoff || context.isChampionship) {
    descriptors.push(context.isChampionship ? "Title stakes" : "Playoff stakes");
  } else if (context.isBowl) {
    descriptors.push("Bowl spotlight");
  } else if (context.isRivalry) {
    descriptors.push("Rivalry energy");
  }
  
  // Return top 2-3 descriptors
  return descriptors.length > 0 ? descriptors.slice(0, 3).join(", ") : "Competitive matchup";
}

// Utility functions
function sigmoidTransform(value, midpoint, scale) {
  return scale / (1 + Math.exp(-(value - midpoint) / (midpoint * 0.3)));
}

function calculateBalanceFromProbability(probability) {
  if (probability === null || probability === undefined) {
    return 0;
  }

  const difference = Math.abs(probability - 50);
  return Math.max(0, 50 - difference);
}

function calculateNoisePenalty(noiseLevel) {
  if (!noiseLevel || noiseLevel <= 8) {
    return 1.0;
  }

  if (noiseLevel >= 30) {
    return 0.75;
  }

  const scale = (noiseLevel - 8) / (30 - 8);
  return 1.0 - scale * 0.25;
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

function normalizeNumericValue(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
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
  
  if (metrics.situationalTension > 24) {
    baseWeights.tension += 0.1;
    baseWeights.peaks -= 0.05;
    baseWeights.narrative -= 0.05;
  }
  
  if ((metrics.probabilityNoise || 0) > 18) {
    baseWeights.peaks -= 0.05;
    baseWeights.comeback -= 0.02;
    baseWeights.narrative += 0.07;
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
  
  if (metrics.comebackFactor > 35) factors.push("dramatic comeback");
  if (metrics.uncertaintyPersistence > 0.4) factors.push("sustained tension");
  if (metrics.peakUncertainty > 25) factors.push("crucial momentum swings");
  if (metrics.situationalTension > 18) factors.push("late-game pressure");
  if (metrics.gameType?.overtime) factors.push("overtime thriller");
  if ((metrics.leadChanges || 0) >= 4) factors.push("frequent lead changes");
  if ((metrics.probabilityNoise || 0) <= 10 && (metrics.timeWeightedUncertainty || 0) >= 28) {
    factors.push("clean, high-leverage finish");
  }

  if (Array.isArray(contextSummary) && contextSummary.length > 0) {
    const contextPhrase = contextSummary[0].toLowerCase();
    if (!factors.some(item => item.includes(contextPhrase))) {
      factors.push(contextPhrase);
    }
  }
  
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
  
  if ((metrics.leadChanges || 0) >= 2) {
    factors.push({ name: "Frequent lead changes", value: metrics.leadChanges * 20 });
  }

  if ((metrics.stakesMultiplier || 1) > 1.05) {
    factors.push({ name: "High stakes setting", value: (metrics.stakesMultiplier - 1) * 120 });
  }

  if ((metrics.qualityFactor || 1) > 1.05) {
    factors.push({ name: "Quality of play", value: (metrics.qualityFactor - 1) * 100 });
  }

  if ((metrics.probabilityNoise || 0) <= 12 && (metrics.timeWeightedUncertainty || 0) >= 24) {
    factors.push({ name: "Composed finish", value: (30 - metrics.probabilityNoise) * 5 });
  }

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
  if (breakdown.stakes && breakdown.stakes > 1.1) {
    moments.push("High-stakes implications");
  }
  if (breakdown.noise && breakdown.noise >= 0.95) {
    moments.push("Clean finish without chaos");
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
  if (context?.isPlayoff || context?.isChampionship) baseScore += 0.5;
  
  // Generate spoiler-free fallback description
  const descriptors = [];
  if (totalScore > 50) descriptors.push("High-scoring");
  else if (totalScore < 35) descriptors.push("Defensive battle");
  
  if (margin <= 3) descriptors.push("Close finish");
  else if (margin > 21) descriptors.push("Decisive outcome");
  
  if (game.overtime) descriptors.push("Overtime");

  const contextFlags = summarizeContextFlags(context);
  if (contextFlags.length > 0) {
    descriptors.push(contextFlags[0]);
  }

  const stakesBoost = assessStakes(context);
  const qualityFactor = assessQualityOfPlay(context);
  const expectationAdjustment = calculateExpectationAdjustment(context);

  const adjustedScore = Math.min(10.0, baseScore * stakesBoost * qualityFactor * expectationAdjustment);
  
  const spoilerFreeDesc = descriptors.length > 0 ? descriptors.join(", ") : "Competitive matchup";

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
      "Final margin",
      "Total scoring",
      game.overtime ? "Overtime" : "Regulation finish",
      contextFlags[0] || null
    ].filter(Boolean)
  };
}
