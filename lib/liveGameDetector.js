/**
 * Live Game Detector
 * Detects and fetches currently live NFL and CFB games from ESPN
 */

/**
 * Get currently live games for a given sport
 * @param {string} sport - Sport type ('NFL' or 'CFB')
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of live games
 */
export async function getLiveGames(sport = 'NFL', options = {}) {
  try {
    const sportName = sport === 'CFB' ? 'college-football' : 'nfl';
    console.log(`🔍 Detecting live ${sport} games...`);

    // Use ESPN's current scoreboard endpoint
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateString = `${year}${month}${day}`;

    const url = `https://site.web.api.espn.com/apis/site/v2/sports/football/${sportName}/scoreboard?dates=${dateString}`;

    console.log(`📊 Fetching live games from ESPN: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.events || !Array.isArray(data.events)) {
      console.log('⚠️  No games found for today');
      return [];
    }

    // Filter for live games only
    const liveGames = data.events.filter(isGameLive);

    // Transform to standard format with sport indicator
    const transformedGames = liveGames.map(event => {
      const game = transformESPNGame(event);
      return { ...game, sport };
    });

    console.log(`✅ Found ${transformedGames.length} live ${sport} games`);
    return transformedGames;

  } catch (error) {
    console.error(`❌ Error fetching live ${sport} games:`, error.message);
    return [];
  }
}

/**
 * Get currently live NFL games (backward compatibility)
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of live games
 */
export async function getLiveNFLGames(options = {}) {
  return getLiveGames('NFL', options);
}

/**
 * Get currently live CFB games
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of live games
 */
export async function getLiveCFBGames(options = {}) {
  return getLiveGames('CFB', options);
}

/**
 * Get all live games (both NFL and CFB)
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of all live games
 */
export async function getAllLiveGames(options = {}) {
  try {
    const [nflGames, cfbGames] = await Promise.all([
      getLiveGames('NFL', options),
      getLiveGames('CFB', options)
    ]);

    return [...nflGames, ...cfbGames];
  } catch (error) {
    console.error('❌ Error fetching all live games:', error.message);
    return [];
  }
}

/**
 * Check if a game is currently live
 * @param {Object} event - ESPN event object
 * @returns {boolean} Whether game is live
 */
function isGameLive(event) {
  if (!event.status) return false;

  const statusType = event.status.type;

  // ESPN live status indicators
  const liveStatuses = [
    'STATUS_IN_PROGRESS',
    'STATUS_HALFTIME',
    'STATUS_END_PERIOD'
  ];

  return liveStatuses.includes(statusType.name) ||
         statusType.state === 'in' ||
         statusType.description?.toLowerCase().includes('live');
}

/**
 * Transform ESPN game data to standard format
 * @param {Object} event - ESPN event object
 * @returns {Object} Standardized game object
 */
function transformESPNGame(event) {
  try {
    const competition = event.competitions[0];
    const competitors = competition.competitors;

    // Find home and away teams
    const homeTeam = competitors.find(c => c.homeAway === 'home');
    const awayTeam = competitors.find(c => c.homeAway === 'away');

    const game = {
      id: event.id,
      name: event.name,
      shortName: event.shortName,

      // Teams
      homeTeam: homeTeam?.team?.displayName || homeTeam?.team?.name,
      awayTeam: awayTeam?.team?.displayName || awayTeam?.team?.name,
      homeTeamAbbrev: homeTeam?.team?.abbreviation,
      awayTeamAbbrev: awayTeam?.team?.abbreviation,

      // Scores
      homeScore: parseInt(homeTeam?.score || 0),
      awayScore: parseInt(awayTeam?.score || 0),

      // Game info
      gameDate: event.date,
      season: competition.season?.year,
      week: competition.week?.number,
      seasonType: competition.season?.type,

      // Status
      status: event.status,
      gameState: 'live',

      // Additional context
      venue: competition.venue?.fullName,
      broadcast: competition.broadcasts?.[0]?.names?.join(', '),

      // Competitors array for compatibility
      competitors: competitors.map(c => ({
        id: c.id,
        homeAway: c.homeAway,
        team: c.team,
        score: c.score,
        record: c.records?.[0]?.summary
      }))
    };

    return game;

  } catch (error) {
    console.error('❌ Error transforming ESPN game:', error.message);
    return null;
  }
}

/**
 * Get detailed game status
 * @param {Object} game - Game object
 * @returns {Object} Detailed status information
 */
export function getGameStatus(game) {
  if (!game.status) {
    return {
      isLive: false,
      quarter: 0,
      timeRemaining: null,
      description: 'Unknown'
    };
  }

  const status = game.status;

  return {
    isLive: isGameLive(game),
    quarter: status.period || 0,
    timeRemaining: status.displayClock,
    timeRemainingSeconds: parseTimeToSeconds(status.displayClock),
    description: status.type?.description || status.type?.name,
    shortDetail: status.type?.shortDetail,
    longDetail: status.type?.detail
  };
}

/**
 * Parse time string to seconds
 * @param {string} timeString - Time in MM:SS format
 * @returns {number|null} Seconds remaining
 */
function parseTimeToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string') {
    return null;
  }

  try {
    const parts = timeString.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]);
      const seconds = parseInt(parts[1]);
      return (minutes * 60) + seconds;
    }
  } catch (error) {
    // Ignore parsing errors
  }

  return null;
}

/**
 * Monitor live games with periodic updates
 * @param {Function} callback - Called with updated games
 * @param {number} intervalMs - Update interval in milliseconds
 * @returns {Function} Stop monitoring function
 */
export function monitorLiveGames(callback, intervalMs = 60000) {
  console.log(`🎯 Starting live game monitoring (${intervalMs}ms interval)`);

  const checkGames = async () => {
    try {
      const liveGames = await getLiveNFLGames();
      callback(liveGames);
    } catch (error) {
      console.error('❌ Error in live game monitoring:', error.message);
    }
  };

  // Initial check
  checkGames();

  // Set up periodic monitoring
  const intervalId = setInterval(checkGames, intervalMs);

  // Return stop function
  return () => {
    console.log('🛑 Stopping live game monitoring');
    clearInterval(intervalId);
  };
}

/**
 * Check if any games are currently live
 * @returns {Promise<boolean>} Whether any NFL games are live
 */
export async function hasLiveGames() {
  try {
    const liveGames = await getLiveNFLGames();
    return liveGames.length > 0;
  } catch (error) {
    console.error('❌ Error checking for live games:', error.message);
    return false;
  }
}

/**
 * Get game by ID from live games
 * @param {string} gameId - ESPN game ID
 * @returns {Promise<Object|null>} Game object or null
 */
export async function getLiveGameById(gameId) {
  try {
    const liveGames = await getLiveNFLGames();
    return liveGames.find(game => game.id === gameId) || null;
  } catch (error) {
    console.error('❌ Error fetching live game by ID:', error.message);
    return null;
  }
}

/**
 * Get live games summary
 * @returns {Promise<Object>} Summary of live games
 */
export async function getLiveGamesSummary() {
  try {
    const liveGames = await getLiveNFLGames();

    const summary = {
      totalLiveGames: liveGames.length,
      games: liveGames.map(game => ({
        id: game.id,
        name: game.shortName || game.name,
        score: `${game.awayTeamAbbrev} ${game.awayScore} - ${game.homeScore} ${game.homeTeamAbbrev}`,
        status: getGameStatus(game).description,
        quarter: getGameStatus(game).quarter,
        timeRemaining: getGameStatus(game).timeRemaining
      }))
    };

    return summary;

  } catch (error) {
    console.error('❌ Error getting live games summary:', error.message);
    return {
      totalLiveGames: 0,
      games: [],
      error: error.message
    };
  }
}