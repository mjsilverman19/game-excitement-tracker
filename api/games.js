// Streamlined Games API Endpoint
import { fetchGames, fetchSingleGame } from './fetcher.js';
import { analyzeGameEntertainment } from './calculator.js';
import { NFL_PLAYOFF_ROUNDS, isNFLPlayoffRound } from '../shared/algorithm-config.js';

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
    const { sport = 'NFL', season, week, seasonType = '2', date, gameId } = req.body;

    // Handle single game request
    if (gameId) {
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

    // For NFL playoff rounds, set seasonType to 3 (postseason)
    if (sport === 'NFL' && isNFLPlayoffRound(week)) {
      actualSeasonType = '3';
    }

    if (sport === 'NBA') {
      console.log(`Fetching ${sport} games for ${date || 'yesterday'}`);
    } else if (week === 'bowls') {
      console.log(`Fetching ${sport} bowl games for ${season} season`);
    } else if (week === 'playoffs') {
      console.log(`Fetching ${sport} playoff games for ${season} season`);
    } else if (sport === 'NFL' && isNFLPlayoffRound(week)) {
      const roundInfo = NFL_PLAYOFF_ROUNDS[week];
      console.log(`Fetching NFL ${roundInfo.label} for ${season} season`);
    } else {
      console.log(`Fetching ${sport} games for Week ${week}, ${season} (Season Type: ${actualSeasonType})`);
    }

    // Fetch games from ESPN
    const games = await fetchGames(sport, season, week, actualSeasonType, date);

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: true,
        games: [],
        metadata: {
          sport,
          season,
          week,
          date,
          count: 0
        }
      });
    }

    console.log(`Found ${games.length} completed games, analyzing...`);

    // Analyze each game in parallel
    const analyzedGames = await Promise.all(
      games.map(game => analyzeGameEntertainment(game, sport))
    );

    // Filter out null results (games with insufficient data)
    const validGames = analyzedGames.filter(game => game !== null);
    const insufficientDataCount = analyzedGames.length - validGames.length;

    // Sort by excitement score
    validGames.sort((a, b) => (b.excitement || 0) - (a.excitement || 0));

    // Calculate bowl/playoff metadata for CFB postseason
    const metadata = {
      sport,
      season,
      week,
      date,
      count: validGames.length,
      totalGames: analyzedGames.length,
      insufficientData: insufficientDataCount,
      source: 'ESPN Win Probability Analysis'
    };

    // Add bowl-specific metadata if this is CFB postseason
    if (sport === 'CFB' && (week === 'bowls' || week === 'playoffs' || actualSeasonType === '3')) {
      const playoffGames = validGames.filter(g => g.playoffRound !== null && g.playoffRound !== undefined).length;
      const bowlGames = validGames.filter(g => g.bowlName !== null && g.bowlName !== undefined && !g.playoffRound).length;

      metadata.playoffGames = playoffGames;
      metadata.bowlGames = bowlGames;
      metadata.seasonType = '3';
    }

    // Add NFL playoff-specific metadata
    if (sport === 'NFL' && isNFLPlayoffRound(week)) {
      const roundInfo = NFL_PLAYOFF_ROUNDS[week];
      metadata.playoffRound = roundInfo.label;
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
