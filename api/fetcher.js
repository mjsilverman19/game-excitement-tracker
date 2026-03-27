// Simplified ESPN Data Fetcher

import { NFL_PLAYOFF_ROUNDS, isNFLPlayoffRound } from '../shared/algorithm-config.js';

export async function fetchGames(sport, season, week, seasonType = '2', date = null) {
  try {
    // Handle date-based fetching (NBA, MLB)
    if (sport === 'NBA') {
      return await fetchNBAGames(date);
    }
    if (sport === 'MLB') {
      return await fetchMLBGames(date);
    }
    if (sport === 'CBB') {
      return await fetchCBBGames(date);
    }

    // Handle NFL/CFB week-based fetching
    const league = sport === 'CFB' ? 'college-football' : 'nfl';
    // Use Site API for 2025+ or for NFL playoff rounds (better data)
    const usesSiteAPI = season >= 2025 || (sport === 'NFL' && isNFLPlayoffRound(week));

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
  const sport = league === 'nfl' ? 'NFL' : 'CFB';

  // For NFL playoff rounds, fetch specific round
  if (league === 'nfl' && isNFLPlayoffRound(week)) {
    const roundInfo = NFL_PLAYOFF_ROUNDS[week];
    const espnWeek = roundInfo.espnWeek;
    // Use seasontype=3 for postseason, no dates param needed
    url = `${baseUrl}?limit=100&week=${espnWeek}&seasontype=3`;
  }
  // For CFB postseason (bowls or playoffs), fetch all postseason games
  else if (league === 'college-football' && (week === 'bowls' || week === 'playoffs' || seasonType === '3')) {
    // Fetch all postseason games for the season
    // Bowl season spans mid-December through late January (includes national championship)
    const bowlStartDate = `${season}1214`; // December 14
    const bowlEndDate = `${season + 1}0125`; // January 25 of next year

    url = `${baseUrl}?limit=100&seasontype=3&dates=${bowlStartDate}-${bowlEndDate}`;
  } else {
    url = `${baseUrl}?limit=100&week=${week}&seasontype=${seasonType}`;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Site API error: ${response.status}`);

  const data = await response.json();

  // Pass the requested week for NFL playoff round parsing
  const requestedRound = (sport === 'NFL' && isNFLPlayoffRound(week)) ? week : null;
  return (data.events || []).map(event => parseEvent(event, sport, requestedRound));
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

export async function fetchMarchMadnessGames(season) {
  // Fetch all NCAA tournament games for a season
  // Tournament typically runs mid-March through early April
  const year = season + 1; // CBB season 2025 means 2025-26, tournament in March 2026
  const startDate = `${year}0301`;
  const endDate = `${year}0415`;

  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${startDate}-${endDate}&seasontype=3&groups=100&limit=200`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`March Madness API error: ${response.status}`);

  const data = await response.json();

  const games = (data.events || []).map(event => parseEvent(event, 'CBB'));
  return games; // Return all games including incomplete ones for bracket display
}

async function fetchCBBGames(date) {
  let targetDate = date;
  if (!targetDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    targetDate = yesterday.toISOString().split('T')[0].replace(/-/g, '');
  } else if (targetDate.includes('-')) {
    targetDate = targetDate.replace(/-/g, '');
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${targetDate}&groups=100&limit=100`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`CBB API error: ${response.status}`);

  const data = await response.json();

  const games = (data.events || []).map(event => parseEvent(event, 'CBB'));
  return games.filter(game => game.completed);
}

async function fetchMLBGames(date) {
  let targetDate = date;
  if (!targetDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    targetDate = yesterday.toISOString().split('T')[0].replace(/-/g, '');
  } else if (targetDate.includes('-')) {
    targetDate = targetDate.replace(/-/g, '');
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${targetDate}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`MLB API error: ${response.status}`);

  const data = await response.json();

  const games = (data.events || []).map(event => parseEvent(event, 'MLB'));
  return games.filter(game => game.completed);
}

function parseEvent(event, sport = 'NFL', nflPlayoffRound = null) {
  const competition = event.competitions?.[0] || event;
  const competitors = competition.competitors || [];

  const homeTeam = competitors.find(c => c.homeAway === 'home');
  const awayTeam = competitors.find(c => c.homeAway === 'away');

  const completed = competition.status?.type?.completed || false;

  const overtime = detectOvertimeFromStatus(competition.status, sport);

  // Parse bowl name and playoff round for postseason
  let bowlName = null;
  let playoffRound = null;

  // For NFL playoff games, set the round based on what was requested
  if (sport === 'NFL' && nflPlayoffRound) {
    const roundInfo = NFL_PLAYOFF_ROUNDS[nflPlayoffRound];
    playoffRound = roundInfo.label;
  }

  if (sport === 'CFB') {
    const notes = competition.notes || [];

    // Extract bowl/playoff information from notes headline
    // ESPN provides bowl and playoff info in competition.notes[].headline
    if (notes.length > 0) {
      const bowlNote = notes.find(note => note.headline);
      if (bowlNote?.headline) {
        const headline = bowlNote.headline;

        // Check if this is a College Football Playoff game
        if (headline.includes('College Football Playoff')) {
          // Extract playoff round
          if (headline.includes('National Championship')) {
            playoffRound = 'Championship';
            bowlName = headline; // Keep full name for championship
          } else if (headline.includes('Semifinal')) {
            playoffRound = 'Semifinal';
            // Extract bowl name: "College Football Playoff Semifinal at the Vrbo Fiesta Bowl"
            const bowlMatch = headline.match(/at the (.+)$/);
            if (bowlMatch) {
              bowlName = bowlMatch[1];
            }
          } else if (headline.includes('Quarterfinal')) {
            playoffRound = 'Quarterfinal';
            // Extract bowl name: "College Football Playoff Quarterfinal at the Rose Bowl Presented by Prudential"
            const bowlMatch = headline.match(/at the (.+)$/);
            if (bowlMatch) {
              bowlName = bowlMatch[1];
            }
          } else if (headline.includes('First Round')) {
            playoffRound = 'First Round';
            // First round games don't have bowl names (played at home stadiums)
            bowlName = null;
          }
        } else {
          // Regular bowl game - use the full headline as bowl name
          bowlName = headline;
        }
      }
    }
  }

  // Parse CBB tournament data (seeds and bracket round)
  let homeSeed = null;
  let awaySeed = null;
  let bracketRound = null;
  let bracketRegion = null;

  if (sport === 'CBB') {
    homeSeed = homeTeam?.curatedRank?.current ?? homeTeam?.seed ?? null;
    awaySeed = awayTeam?.curatedRank?.current ?? awayTeam?.seed ?? null;

    // Try to get bracket round from competition or notes
    if (competition.bracketRound) {
      bracketRound = competition.bracketRound.name || null;
    }
    // Fall back to notes headline for round info
    const notes = competition.notes || [];
    if (notes.length > 0) {
      const headline = notes[0]?.headline || '';
      if (!bracketRound && headline) {
        bracketRound = headline;
      }
      // Extract region from headline (e.g., "NCAA Tournament - South Region - First Round")
      const regionMatch = headline.match(/(South|East|West|Midwest)\s+Region/i);
      if (regionMatch) {
        bracketRegion = regionMatch[1];
      }
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
    playoffRound: playoffRound,
    homeSeed: homeSeed,
    awaySeed: awaySeed,
    bracketRound: bracketRound,
    bracketRegion: bracketRegion
  };
}

function detectOvertimeFromStatus(status, sport) {
  const regulationPeriods = sport === 'MLB' ? 9 : 4;
  if (typeof status?.period === 'number' && status.period > regulationPeriods) return true;

  const shortDetail = status?.type?.shortDetail || '';
  return /OT/i.test(shortDetail);
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
    } else if (sport === 'MLB') {
      apiPath = 'baseball/mlb';
    } else if (sport === 'CBB') {
      apiPath = 'basketball/mens-college-basketball';
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
    const overtime = detectOvertimeFromStatus(competition.status, sport);

    // Parse bowl name and playoff round for CFB
    let bowlName = null;
    let playoffRound = null;

    if (sport === 'CFB') {
      const notes = competition.notes || [];

      // Extract bowl/playoff information from notes headline
      if (notes.length > 0) {
        const bowlNote = notes.find(note => note.headline);
        if (bowlNote?.headline) {
          const headline = bowlNote.headline;

          // Check if this is a College Football Playoff game
          if (headline.includes('College Football Playoff')) {
            // Extract playoff round
            if (headline.includes('National Championship')) {
              playoffRound = 'Championship';
              bowlName = headline;
            } else if (headline.includes('Semifinal')) {
              playoffRound = 'Semifinal';
              const bowlMatch = headline.match(/at the (.+)$/);
              if (bowlMatch) {
                bowlName = bowlMatch[1];
              }
            } else if (headline.includes('Quarterfinal')) {
              playoffRound = 'Quarterfinal';
              const bowlMatch = headline.match(/at the (.+)$/);
              if (bowlMatch) {
                bowlName = bowlMatch[1];
              }
            } else if (headline.includes('First Round')) {
              playoffRound = 'First Round';
              bowlName = null;
            }
          } else {
            // Regular bowl game
            bowlName = headline;
          }
        }
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
