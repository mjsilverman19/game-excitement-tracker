// File: /api/games.js - Enhanced Entertainment Analysis with CFB Support

import { getGamesForSearch } from './gameDataFetcher.js';
import { analyzeGameEntertainment } from './entertainmentCalculator.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, sport, week, season, seasonType } = req.body;

  console.log('What we received:', req.body);
  console.log('Season is:', season, 'and its type is:', typeof season);

  if (!sport || (['NFL', 'CFB'].includes(sport) && !week) || (sport === 'NBA' && !date)) {
    return res.status(400).json({
      error: ['NFL', 'CFB'].includes(sport) ? 'Week and sport are required' : 'Date and sport are required'
    });
  }

  try {
    let searchParam;
    if (sport === 'NFL' && week) {
      const weekNumber = typeof week === 'number' ? week.toString() : week.toString().replace(/^Week\s*/i, '');
      const typeNumber = seasonType || 2;
      searchParam = { week: weekNumber, season: season ? parseInt(season) : new Date().getFullYear(), seasonType: typeNumber };
      console.log(`Analyzing NFL Week ${weekNumber} (${searchParam.season}) ${typeNumber === 3 ? 'Playoffs' : 'Regular Season'} games...`);
    } else if (sport === 'CFB' && week) {
      let weekNumber;
      let seasonTypeNumber;

      if (week === 'playoff') {
        weekNumber = '1';
        seasonTypeNumber = 4;
      } else if (week === 'bowl') {
        weekNumber = '1';
        seasonTypeNumber = 3;
      } else {
        weekNumber = typeof week === 'number' ? week.toString() : week.toString().replace(/^Week\s*/i, '');
        seasonTypeNumber = 2;
      }

      searchParam = {
        week: weekNumber,
        season: season ? parseInt(season) : new Date().getFullYear(),
        seasonType: seasonTypeNumber
      };

      const gameTypeLabel = week === 'playoff' ? 'Playoff' : week === 'bowl' ? 'Bowl' : `Week ${weekNumber}`;
      console.log(`Analyzing CFB ${gameTypeLabel} (${searchParam.season}) games...`);
    } else {
      searchParam = { date };
      console.log(`Analyzing ${sport} games for ${date}...`);
    }

    const games = await getGamesForSearch(searchParam, sport);

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: true,
        games: [],
        metadata: {
          date: ['NFL', 'CFB'].includes(sport) ? `Week ${week} (${searchParam.season})` : date,
          sport: sport,
          source: 'ESPN Win Probability API',
          analysisType: 'Enhanced Entertainment Analysis',
          gameCount: 0
        }
      });
    }

    const analyzedGames = await Promise.all(
      games.map(async (game) => await analyzeGameEntertainment(game, sport))
    );

    const validGames = analyzedGames.filter(game => game !== null);

    console.log(`Successfully analyzed ${validGames.length} ${sport} games with enhanced metrics`);

    return res.status(200).json({
      success: true,
      games: validGames,
      metadata: {
        date: ['NFL', 'CFB'].includes(sport) ? `Week ${week} (${searchParam.season})` : date,
        sport: sport,
        source: 'ESPN Win Probability API',
        analysisType: 'Enhanced Entertainment Analysis',
        gameCount: validGames.length
      }
    });
  } catch (error) {
    console.error('Error in enhanced analysis:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to analyze game entertainment',
      details: error.message,
      games: []
    });
  }
}
