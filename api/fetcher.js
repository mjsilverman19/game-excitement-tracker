// Simplified ESPN Data Fetcher

export async function fetchGames(sport, season, week, seasonType = '2') {
  try {
    // Handle NBA differently
    if (sport === 'NBA') {
      return await fetchNBAGames(season, week, seasonType);
    }

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

async function fetchNBAGames(season, week, seasonType) {
  // Calculate date range for this week
  // NBA week 1 starts on opening night (last Tuesday of October)
  let openingNight = new Date(season, 9, 31); // Oct 31
  while (openingNight.getDay() !== 2) { // Find Tuesday (0=Sun, 2=Tue)
    openingNight.setDate(openingNight.getDate() - 1);
  }

  // Calculate start of requested week (weeks are 7-day periods from opening night)
  const weekStart = new Date(openingNight);
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7);

  // Fetch games for the 7-day period
  const games = [];
  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(weekStart);
    currentDate.setDate(currentDate.getDate() + i);

    const dateStr = formatDate(currentDate);
    const dayGames = await fetchNBAByDate(dateStr);
    games.push(...dayGames);
  }

  return games.filter(game => game.completed);
}

async function fetchNBAByDate(dateStr) {
  const baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
  const url = `${baseUrl}?dates=${dateStr}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`NBA API error for ${dateStr}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return (data.events || []).map(event => parseEvent(event));
  } catch (error) {
    console.error(`Error fetching NBA games for ${dateStr}:`, error);
    return [];
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
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

function parseEvent(event) {
  const competition = event.competitions?.[0] || event;
  const competitors = competition.competitors || [];

  const homeTeam = competitors.find(c => c.homeAway === 'home');
  const awayTeam = competitors.find(c => c.homeAway === 'away');

  const completed = competition.status?.type?.completed || false;
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
