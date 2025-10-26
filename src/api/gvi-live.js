/**
 * Live GVI API Endpoint
 * Provides real-time Game Volatility Index for live NFL and CFB games
 */

import { calculateLiveGVI, calculateLiveGamesGVI, getLiveRecommendations } from './liveGviCalculator.js';
import { getLiveNFLGames, getLiveCFBGames, getAllLiveGames, getLiveGameById, getLiveGamesSummary, getGameStatus } from '../lib/liveGameDetector.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { method } = req;
    const { action, gameId, sport } = req.query;

    console.log(`🎯 GVI Live API: ${method} ${action || 'default'} ${sport || 'ALL'} ${gameId || ''}`);

    switch (action) {
      case 'games':
        return await handleLiveGamesGVI(req, res);

      case 'game':
        return await handleSingleGameGVI(req, res);

      case 'summary':
        return await handleLiveGamesSummary(req, res);

      case 'recommendations':
        return await handleRecommendations(req, res);

      default:
        return await handleDefaultLiveGVI(req, res);
    }

  } catch (error) {
    console.error('❌ GVI Live API error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

/**
 * Handle default live GVI request - returns all live games with GVI scores
 */
async function handleDefaultLiveGVI(req, res) {
  try {
    const { sport = 'ALL' } = req.query;
    console.log(`📊 Fetching live ${sport} games with GVI scores...`);

    let liveGames;
    if (sport === 'CFB') {
      liveGames = await getLiveCFBGames();
    } else if (sport === 'NFL') {
      liveGames = await getLiveNFLGames();
    } else {
      liveGames = await getAllLiveGames();
    }

    if (liveGames.length === 0) {
      return res.json({
        success: true,
        message: `No live ${sport} games found`,
        liveGames: [],
        timestamp: new Date().toISOString()
      });
    }

    // Calculate GVI for all live games
    const gviGames = await calculateLiveGamesGVI(liveGames);
    const recommendations = getLiveRecommendations(gviGames);

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: recommendations.summary,
      topRecommendation: recommendations.topRecommendation,
      liveGames: gviGames.map(formatGameResponse)
    });

  } catch (error) {
    console.error('❌ Error in default live GVI:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate live GVI',
      message: error.message
    });
  }
}

/**
 * Handle live games GVI request
 */
async function handleLiveGamesGVI(req, res) {
  try {
    const { includeDetails = 'false', sport = 'ALL' } = req.query;

    let liveGames;
    if (sport === 'CFB') {
      liveGames = await getLiveCFBGames();
    } else if (sport === 'NFL') {
      liveGames = await getLiveNFLGames();
    } else {
      liveGames = await getAllLiveGames();
    }
    
    const gviGames = await calculateLiveGamesGVI(liveGames);

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      totalGames: gviGames.length,
      games: gviGames.map(game => {
        const formatted = formatGameResponse(game);

        if (includeDetails === 'false') {
          // Simplified response
          delete formatted.gvi.breakdown;
          delete formatted.gvi.marketData;
        }

        return formatted;
      })
    };

    return res.json(response);

  } catch (error) {
    console.error('❌ Error in live games GVI:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch live games GVI'
    });
  }
}

/**
 * Handle single game GVI request
 */
async function handleSingleGameGVI(req, res) {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      return res.status(400).json({
        success: false,
        error: 'Game ID is required'
      });
    }

    const game = await getLiveGameById(gameId);

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found or not currently live'
      });
    }

    const gviResult = await calculateLiveGVI(game);

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      game: formatGameResponse({ ...game, gvi: gviResult })
    });

  } catch (error) {
    console.error('❌ Error in single game GVI:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate game GVI'
    });
  }
}

/**
 * Handle live games summary
 */
async function handleLiveGamesSummary(req, res) {
  try {
    const summary = await getLiveGamesSummary();

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...summary
    });

  } catch (error) {
    console.error('❌ Error in live games summary:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get live games summary'
    });
  }
}

/**
 * Handle recommendations request
 */
async function handleRecommendations(req, res) {
  try {
    const { threshold = 50, sport = 'ALL' } = req.query;
    const minThreshold = parseInt(threshold);

    let liveGames;
    if (sport === 'CFB') {
      liveGames = await getLiveCFBGames();
    } else if (sport === 'NFL') {
      liveGames = await getLiveNFLGames();
    } else {
      liveGames = await getAllLiveGames();
    }

    if (liveGames.length === 0) {
      return res.json({
        success: true,
        message: 'No live games found',
        recommendations: {
          summary: { totalGames: 0, mustWatch: 0, recommended: 0, worthWatching: 0 },
          topRecommendation: null,
          categories: { mustWatch: [], recommended: [], worthWatching: [] }
        }
      });
    }

    const gviGames = await calculateLiveGamesGVI(liveGames);

    // Filter by threshold
    const filteredGames = gviGames.filter(game =>
      game.gvi.success && game.gvi.gviScore >= minThreshold
    );

    const recommendations = getLiveRecommendations(filteredGames);

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      threshold: minThreshold,
      recommendations: {
        summary: recommendations.summary,
        topRecommendation: recommendations.topRecommendation ?
          formatGameResponse(recommendations.topRecommendation) : null,
        categories: {
          mustWatch: recommendations.categories.mustWatch.map(formatGameResponse),
          recommended: recommendations.categories.recommended.map(formatGameResponse),
          worthWatching: recommendations.categories.worthWatching.map(formatGameResponse)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error in recommendations:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations'
    });
  }
}

/**
 * Format game response for API
 */
function formatGameResponse(game) {
  const status = getGameStatus(game);

  return {
    id: game.id,
    name: game.name || `${game.awayTeam} @ ${game.homeTeam}`,
    shortName: game.shortName,

    // Teams and scores
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    awayTeamAbbrev: game.awayTeamAbbrev,
    homeTeamAbbrev: game.homeTeamAbbrev,
    awayScore: game.awayScore,
    homeScore: game.homeScore,

    // Game status
    status: {
      quarter: status.quarter,
      timeRemaining: status.timeRemaining,
      description: status.description,
      isLive: status.isLive
    },

    // Game info
    gameDate: game.gameDate,
    venue: game.venue,
    broadcast: game.broadcast,

    // GVI data
    gvi: game.gvi ? {
      score: game.gvi.gviScore,
      recommendation: game.gvi.recommendation,
      priority: game.gvi.priority,
      reason: game.gvi.reason,
      confidence: game.gvi.confidence,
      ...(game.gvi.breakdown && { breakdown: game.gvi.breakdown }),
      ...(game.gvi.marketData && { marketData: game.gvi.marketData })
    } : null
  };
}

/**
 * Utility function to validate request parameters
 */
function validateRequest(req, requiredParams = []) {
  const errors = [];

  for (const param of requiredParams) {
    if (!req.query[param] && !req.body[param]) {
      errors.push(`Missing required parameter: ${param}`);
    }
  }

  return errors;
}