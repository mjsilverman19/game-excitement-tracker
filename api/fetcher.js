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
      games = await fetchFromSiteAPI(league, week, seasonType, season);
    } else {
      games = await fetchFromCoreAPI(league, season, week, seasonType);
    }

    return games.filter(game => game.completed);
  } catch (error) {
    console.error('Error fetching games:', error);
    throw error;
  }
}

async function fetchFromSiteAPI(league, week, seasonType, season) {
  const baseUrl = league === 'nfl'
    ? 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
    : 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';

  let url;

  // For CFB postseason (bowls), fetch all postseason games
  if (league === 'college-football' && (week === 'bowls' || seasonType === '3')) {
    // Fetch all postseason games for the season
    // Bowl season spans mid-December through mid-January
    const bowlStartDate = `${season}1214`; // December 14
    const bowlEndDate = `${season + 1}0115`; // January 15 of next year

    url = `${baseUrl}?limit=100&seasontype=3&dates=${bowlStartDate}-${bowlEndDate}`;
  } else {
    url = `${baseUrl}?limit=100&week=${week}&seasontype=${seasonType}`;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Site API error: ${response.status}`);

  const data = await response.json();

  const sport = league === 'nfl' ? 'NFL' : 'CFB';
  return (data.events || []).map(event => parseEvent(event, sport));
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

  // Parse bowl name and playoff round for CFB postseason
  let bowlName = null;
  let playoffRound = null;

  if (sport === 'CFB') {
    // Bowl name is typically in event.name or competition.notes
    const eventName = event.name || event.shortName || '';
    const notes = competition.notes || [];

    // Check if this is a playoff game
    if (eventName.includes('CFP') || eventName.includes('College Football Playoff')) {
      if (eventName.includes('National Championship') || eventName.includes('Championship')) {
        playoffRound = 'Championship';
      } else if (eventName.includes('Semifinal')) {
        playoffRound = 'Semifinal';
      } else if (eventName.includes('Quarterfinal')) {
        playoffRound = 'Quarterfinal';
      } else if (eventName.includes('First Round')) {
        playoffRound = 'First Round';
      }
    }

    // Extract bowl name from event name or notes
    // Event names are typically like "Ohio State vs Oregon" or "Rose Bowl - CFP Quarterfinal"
    // Notes contain detailed information about the bowl
    if (notes.length > 0) {
      const bowlNote = notes.find(note => note.headline);
      if (bowlNote?.headline) {
        bowlName = bowlNote.headline;
      }
    }

    // If no bowl name from notes, try to extract from event name
    if (!bowlName && eventName) {
      // Look for common bowl game patterns
      const bowlMatch = eventName.match(/(.+?)\s*(Bowl|-|CFP|Playoff)/i);
      if (bowlMatch && !eventName.includes(' vs ') && !eventName.includes(' at ')) {
        bowlName = eventName.split(' - ')[0].trim();
      }
    }

    // Clean up bowl name if it contains playoff round info
    if (bowlName && playoffRound) {
      bowlName = bowlName.replace(/\s*-?\s*(CFP|College Football Playoff)?\s*(Quarterfinal|Semifinal|Championship|First Round)/i, '').trim();
    }
  }

  return {
    id: event.id,
    homeTeam: homeTeam?.team?.shortDisplayName || homeTeam?.team?.displayName || 'Unknown',
    awayTeam: awayTeam?.team?.shortDisplayName || awayTeam?.team?.displayName || 'Unknown',
    homeScore: parseInt(homeTeam?.score || 0),
    awayScore: parseInt(awayTeam?.score || 0),
    completed: completed,
    overtime: overtime,
    date: event.date || competition.date,
    bowlName: bowlName,
    playoffRound: playoffRound
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

    // Parse bowl name and playoff round for CFB
    let bowlName = null;
    let playoffRound = null;

    if (sport === 'CFB') {
      const eventName = data.header?.league?.name || '';
      const notes = competition.notes || [];

      // Check if this is a playoff game
      if (eventName.includes('CFP') || eventName.includes('College Football Playoff')) {
        if (eventName.includes('National Championship') || eventName.includes('Championship')) {
          playoffRound = 'Championship';
        } else if (eventName.includes('Semifinal')) {
          playoffRound = 'Semifinal';
        } else if (eventName.includes('Quarterfinal')) {
          playoffRound = 'Quarterfinal';
        } else if (eventName.includes('First Round')) {
          playoffRound = 'First Round';
        }
      }

      // Extract bowl name from notes
      if (notes.length > 0) {
        const bowlNote = notes.find(note => note.headline);
        if (bowlNote?.headline) {
          bowlName = bowlNote.headline;
        }
      }

      // Clean up bowl name if it contains playoff round info
      if (bowlName && playoffRound) {
        bowlName = bowlName.replace(/\s*-?\s*(CFP|College Football Playoff)?\s*(Quarterfinal|Semifinal|Championship|First Round)/i, '').trim();
      }
    }

    return {
      id: gameId,
      homeTeam: homeTeam?.team?.shortDisplayName || homeTeam?.team?.displayName || 'Unknown',
      awayTeam: awayTeam?.team?.shortDisplayName || awayTeam?.team?.displayName || 'Unknown',
      homeScore: parseInt(homeTeam?.score || 0),
      awayScore: parseInt(awayTeam?.score || 0),
      completed: completed,
      overtime: overtime,
      date: data.header?.competitions?.[0]?.date,
      bowlName: bowlName,
      playoffRound: playoffRound
    };
  } catch (error) {
    console.error('Error fetching single game:', error);
    throw error;
  }
}
