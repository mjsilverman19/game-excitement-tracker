// Simplified ESPN Data Fetcher

export async function fetchGames(sport, season, week, seasonType = '2') {
  try {
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
