// Streamlined Games API Endpoint
import { fetchGames, fetchSingleGame } from './fetcher.js';
import { analyzeGameEntertainment } from './calculator.js';
import { fetchSoccerGames, fetchSoccerOddsTimeseries, SOCCER_LEAGUES } from './soccer-fetcher.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { sport = 'NFL', season, week, seasonType = '2', date, gameId, league } = req.body;
    let effectiveDate = date;

    // Handle single game request
    if (gameId) {
      if (sport === 'SOCCER') {
        return res.status(400).json({
          success: false,
          error: 'Single-game lookup is not supported for soccer'
        });
      }
      console.log(`Fetching single ${sport} game: ${gameId}`);

      const game = await fetchSingleGame(sport, gameId);
      const analyzed = await analyzeGameEntertainment(game, sport);

      if (!analyzed) {
        return res.status(200).json({
          success: true,
          games: [],
          metadata: {
            sport,
            gameId,
            count: 0,
            insufficientData: 1
          }
        });
      }

      return res.status(200).json({
        success: true,
        games: [analyzed],
        metadata: {
          sport,
          gameId,
          count: 1
        }
      });
    }

    // Handle week/date-based request
    let actualSeasonType = seasonType;

    // For CFB bowls or playoffs, set seasonType to 3 (postseason)
    if (sport === 'CFB' && (week === 'bowls' || week === 'playoffs')) {
      actualSeasonType = '3';
    }

    if (sport === 'NBA') {
      console.log(`Fetching ${sport} games for ${effectiveDate || 'yesterday'}`);
    } else if (sport === 'SOCCER') {
      console.log(`Fetching ${sport} games for ${league || 'unknown league'} on ${effectiveDate}`);
    } else if (week === 'bowls') {
      console.log(`Fetching ${sport} bowl games for ${season} season`);
    } else if (week === 'playoffs') {
      console.log(`Fetching ${sport} playoff games for ${season} season`);
    } else {
      console.log(`Fetching ${sport} games for Week ${week}, ${season} (Season Type: ${actualSeasonType})`);
    }

    let games;

    if (sport === 'SOCCER') {
      if (!process.env.ODDS_API_KEY) {
        return res.status(200).json({
          success: false,
          error: 'Soccer support requires ODDS_API_KEY environment variable'
        });
      }

      if (!league || !SOCCER_LEAGUES[league]) {
        return res.status(400).json({
          success: false,
          error: 'Invalid soccer league',
          supportedLeagues: Object.keys(SOCCER_LEAGUES)
        });
      }

      effectiveDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      games = await fetchSoccerGames(league, effectiveDate);
    } else {
      // Fetch games from ESPN
      games = await fetchGames(sport, season, week, actualSeasonType, date);
    }

    if (sport === 'SOCCER' && games === null) {
      return res.status(200).json({
        success: false,
        error: 'Unable to fetch soccer data from The Odds API'
      });
    }

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: true,
        games: [],
        metadata: {
          sport,
          league,
          season,
          week,
          date: effectiveDate,
          count: 0,
          source: sport === 'SOCCER' ? 'The Odds API Historical Data' : 'ESPN Win Probability Analysis'
        }
      });
    }

    console.log(`Found ${games.length} completed games, analyzing...`);

    let analyzedGames;

    if (sport === 'SOCCER') {
      analyzedGames = await Promise.all(
        games.map(async game => {
          const oddsTimeseries = await fetchSoccerOddsTimeseries(game.id);
          if (!oddsTimeseries) return null;

          const lastSnapshot = oddsTimeseries[oddsTimeseries.length - 1];
          const minute = lastSnapshot?.minute ?? 0;
          const extraTime = minute > 90;
          const penalties = minute > 120;

          const enrichedGame = {
            ...game,
            minute,
            period: lastSnapshot?.period,
            clock: lastSnapshot?.clock,
            extraTime,
            penalties
          };

          return analyzeGameEntertainment(enrichedGame, sport, oddsTimeseries);
        })
      );
    } else {
      // Analyze each game in parallel
      analyzedGames = await Promise.all(
        games.map(game => analyzeGameEntertainment(game, sport))
      );
    }

    // Filter out null results (games with insufficient data)
    const validGames = analyzedGames.filter(game => game !== null);
    const insufficientDataCount = analyzedGames.length - validGames.length;

    // Sort by excitement score
    validGames.sort((a, b) => (b.excitement || 0) - (a.excitement || 0));

    // Calculate bowl/playoff metadata for CFB postseason
    const metadata = {
      sport,
      league,
      season,
      week,
      date: effectiveDate,
      count: validGames.length,
      totalGames: analyzedGames.length,
      insufficientData: insufficientDataCount,
      source: sport === 'SOCCER' ? 'The Odds API Historical Data' : 'ESPN Win Probability Analysis'
    };

    // Add bowl-specific metadata if this is CFB postseason
    if (sport === 'CFB' && (week === 'bowls' || week === 'playoffs' || actualSeasonType === '3')) {
      const playoffGames = validGames.filter(g => g.playoffRound !== null && g.playoffRound !== undefined).length;
      const bowlGames = validGames.filter(g => g.bowlName !== null && g.bowlName !== undefined && !g.playoffRound).length;

      metadata.playoffGames = playoffGames;
      metadata.bowlGames = bowlGames;
      metadata.seasonType = '3';
    }

    return res.status(200).json({
      success: true,
      games: validGames,
      metadata
    });

  } catch (error) {
    console.error('API Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to analyze games',
      details: error.message
    });
  }
}
