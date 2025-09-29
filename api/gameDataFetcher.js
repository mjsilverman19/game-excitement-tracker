import { normalizeNumericValue } from './utils.js';

export async function getGamesForSearch(searchParam, sport) {
  try {
    let apiUrl;
    let usesCoreAPI = false;

    if (sport === 'NFL' && searchParam.week) {
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
      if (searchParam.season && parseInt(searchParam.season) < 2025) {
        apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${searchParam.season}/types/${searchParam.seasonType}/weeks/${searchParam.week}/events`;
        usesCoreAPI = true;
      } else {
        apiUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?seasontype=${searchParam.seasonType}&week=${searchParam.week}`;
        if (searchParam.season && searchParam.season !== new Date().getFullYear()) {
          apiUrl += `&season=${searchParam.season}`;
        }
      }
    } else {
      throw new Error(`Unsupported sport: ${sport}. Only NFL and CFB are supported.`);
    }

    console.log(`Fetching ${sport} games from: ${apiUrl}`);
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();

    if (usesCoreAPI) {
      if (!data.items || data.items.length === 0) {
        console.log('No games found');
        return [];
      }

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
    }

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
        homeTeam: homeTeam?.team.displayName || homeTeam?.team.location,
        awayTeam: awayTeam?.team.displayName || awayTeam?.team.location,
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
  } catch (error) {
    console.error(`Error fetching ${sport} games:`, error);
    return [];
  }
}

async function parseGameFromCoreAPI(gameData) {
  try {
    const competition = gameData.competitions?.[0];
    if (!competition) return null;

    if (gameData.name?.toLowerCase().includes('pro bowl') ||
        gameData.shortName?.toLowerCase().includes('pro bowl')) {
      console.log(`Skipping Pro Bowl game: ${gameData.name}`);
      return null;
    }

    const homeCompetitor = competition.competitors?.find(c => c.homeAway === 'home');
    const awayCompetitor = competition.competitors?.find(c => c.homeAway === 'away');

    if (!homeCompetitor || !awayCompetitor) return null;

    const [homeTeamData, awayTeamData, homeScoreData, awayScoreData, statusData] = await Promise.all([
      fetch(homeCompetitor.team.$ref).then(r => r.ok ? r.json() : null),
      fetch(awayCompetitor.team.$ref).then(r => r.ok ? r.json() : null),
      fetch(homeCompetitor.score.$ref).then(r => r.ok ? r.json() : null),
      fetch(awayCompetitor.score.$ref).then(r => r.ok ? r.json() : null),
      fetch(competition.status.$ref).then(r => r.ok ? r.json() : null)
    ]);

    const homeTeam = homeTeamData?.displayName || homeTeamData?.location || 'Unknown';
    const awayTeam = awayTeamData?.displayName || awayTeamData?.location || 'Unknown';

    if (homeTeam === 'NFC' || homeTeam === 'AFC' || awayTeam === 'NFC' || awayTeam === 'AFC') {
      console.log(`Skipping Pro Bowl game with conference teams: ${awayTeam} @ ${homeTeam}`);
      return null;
    }

    const homeScore = parseInt(homeScoreData?.value || 0);
    const awayScore = parseInt(awayScoreData?.value || 0);

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
