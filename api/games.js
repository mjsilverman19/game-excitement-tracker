// Streamlined Games API Endpoint
import { fetchGames } from './fetcher.js';
import { analyzeGameEntertainment } from './calculator.js';

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
    const { sport = 'NFL', season, week, seasonType = '2' } = req.body;

    console.log(`Fetching ${sport} games for Week ${week}, ${season} (Season Type: ${seasonType})`);

    // Fetch games from ESPN
    const games = await fetchGames(sport, season, week, seasonType);

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: true,
        games: [],
        metadata: {
          sport,
          season,
          week,
          count: 0
        }
      });
    }

    console.log(`Found ${games.length} completed games, analyzing...`);

    // Analyze each game in parallel
    const analyzedGames = await Promise.all(
      games.map(game => analyzeGameEntertainment(game, sport))
    );

    // Sort by excitement score
    analyzedGames.sort((a, b) => (b.excitement || 0) - (a.excitement || 0));

    return res.status(200).json({
      success: true,
      games: analyzedGames,
      metadata: {
        sport,
        season,
        week,
        count: analyzedGames.length,
        source: 'ESPN Win Probability Analysis'
      }
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
