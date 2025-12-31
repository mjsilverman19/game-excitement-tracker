// Simplified ESPN Data Fetcher

export async function fetchGames(sport, season, week, seasonType = '2', date = null) {
  try {
    // Handle NBA date-based fetching
    if (sport === 'NBA') {
      return await fetchNBAGames(date);
    }

    // Handle NFL/CFB week-based fetching
    const league = sport === 'CFB' ? 'college-football' : 'nfl';
    const usesSiteAPI = season >= 2025;

    let games = [];

    if (usesSiteAPI) {
      games = await fetchFromSiteAPI(league, week, seasonType);
    } else {
      games = await fetchFromCoreAPI(league, season, week, seasonType);
    }

    return games.filter(game => game.completed);
  } catch (error) {
    console.error('Error fetching games:', error);
    throw error;
  }
}

async function fetchFromSiteAPI(league, week, seasonType) {
  const baseUrl = league === 'nfl'
    ? 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
    : 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';

  const url = `${baseUrl}?limit=100&week=${week}&seasontype=${seasonType}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Site API error: ${response.status}`);

  const data = await response.json();

  return (data.events || []).map(event => parseEvent(event));
}

async function fetchFromCoreAPI(league, season, week, seasonType) {
  const weekUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/${league}/seasons/${season}/types/${seasonType}/weeks/${week}/events?limit=100`;

  const weekResponse = await fetch(weekUrl);
  if (!weekResponse.ok) throw new Error(`Core API error: ${weekResponse.status}`);

  const weekData = await weekResponse.json();
  const eventRefs = (weekData.items || []).map(item => item.$ref);

  const games = await Promise.all(
    eventRefs.map(async (ref) => {
      try {
        const response = await fetch(ref);
        if (!response.ok) return null;
        const event = await response.json();
        return parseEvent(event);
      } catch (error) {
        console.error(`Failed to fetch event:`, error);
        return null;
      }
    })
  );

  return games.filter(game => game !== null);
}

async function fetchNBAGames(date) {
  // Default to yesterday if no date provided (most recent completed games)
  let targetDate = date;
  if (!targetDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    targetDate = yesterday.toISOString().split('T')[0].replace(/-/g, '');
  } else if (targetDate.includes('-')) {
    // Convert YYYY-MM-DD to YYYYMMDD
    targetDate = targetDate.replace(/-/g, '');
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${targetDate}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`NBA API error: ${response.status}`);

  const data = await response.json();

  const games = (data.events || []).map(event => parseEvent(event, 'NBA'));
  return games.filter(game => game.completed);
}

function parseEvent(event, sport = 'NFL') {
  const competition = event.competitions?.[0] || event;
  const competitors = competition.competitors || [];

  const homeTeam = competitors.find(c => c.homeAway === 'home');
  const awayTeam = competitors.find(c => c.homeAway === 'away');

  const completed = competition.status?.type?.completed || false;

  // Determine overtime based on sport
  // Football: period > 4, Basketball: period > 4 (regulation is 4 quarters)
  const overtime = competition.status?.period > 4;

  return {
    id: event.id,
    homeTeam: homeTeam?.team?.shortDisplayName || homeTeam?.team?.displayName || 'Unknown',
    awayTeam: awayTeam?.team?.shortDisplayName || awayTeam?.team?.displayName || 'Unknown',
    homeScore: parseInt(homeTeam?.score || 0),
    awayScore: parseInt(awayTeam?.score || 0),
    completed: completed,
    overtime: overtime,
    date: event.date || competition.date
  };
}

export async function fetchSingleGame(sport, gameId) {
  try {
    // Map sport to ESPN API path
    let apiPath;
    if (sport === 'NFL') {
      apiPath = 'football/nfl';
    } else if (sport === 'CFB') {
      apiPath = 'football/college-football';
    } else if (sport === 'NBA') {
      apiPath = 'basketball/nba';
    } else {
      throw new Error('Invalid sport');
    }

    // Use summary endpoint which has full game details
    const url = `https://site.api.espn.com/apis/site/v2/sports/${apiPath}/summary?event=${gameId}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`ESPN API error: ${response.status}`);

    const data = await response.json();

    // Summary endpoint structure: header.competitions[0].competitors[]
    const competition = data.header?.competitions?.[0];
    if (!competition) {
      throw new Error('Game not found');
    }

    const competitors = competition.competitors || [];
    const homeTeam = competitors.find(c => c.homeAway === 'home');
    const awayTeam = competitors.find(c => c.homeAway === 'away');

    const completed = competition.status?.type?.completed || false;
    const overtime = competition.status?.period > 4;

    return {
      id: gameId,
      homeTeam: homeTeam?.team?.shortDisplayName || homeTeam?.team?.displayName || 'Unknown',
      awayTeam: awayTeam?.team?.shortDisplayName || awayTeam?.team?.displayName || 'Unknown',
      homeScore: parseInt(homeTeam?.score || 0),
      awayScore: parseInt(awayTeam?.score || 0),
      completed: completed,
      overtime: overtime,
      date: data.header?.competitions?.[0]?.date
    };
  } catch (error) {
    console.error('Error fetching single game:', error);
    throw error;
  }
}
