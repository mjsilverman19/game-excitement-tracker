import { supabase } from '../lib/supabase.js';
import { calculateEnhancedEntertainment } from './entertainmentCalculator.js';
import { buildGameContext } from './contextAnalyzer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if supabase is configured
  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: 'Database search is not configured. Please set up Supabase environment variables on Vercel.'
    });
  }

  const {
    team,
    minExcitement,
    maxExcitement,
    sport = 'NFL',
    season,
    week,
    limit = 50,
    offset = 0,
    sortBy = 'excitement_score',
    sortOrder = 'desc'
  } = req.query;

  try {
    // Validate sport
    if (sport && !['NFL', 'CFB'].includes(sport)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sport. Only NFL and CFB are supported.'
      });
    }

    // Build the query - fetch raw data for on-demand calculation
    let query = supabase
      .from('games')
      .select(`
        id,
        sport,
        home_team,
        away_team,
        home_score,
        away_score,
        game_date,
        season,
        week,
        season_type,
        overtime,
        probability_data,
        game_context,
        excitement_score
      `);

    // Apply filters
    if (sport) {
      query = query.eq('sport', sport);
    }

    if (team) {
      // Search for team in either home or away position
      query = query.or(`home_team.ilike.%${team}%,away_team.ilike.%${team}%`);
    }

    if (season) {
      query = query.eq('season', parseInt(season));
    }

    if (week) {
      query = query.eq('week', parseInt(week));
    }

    // Note: excitement filtering will be done post-calculation
    // since we're calculating scores on-demand

    // Apply basic sorting (excitement sorting will be done post-calculation)
    const orderAscending = sortOrder === 'asc';
    if (sortBy === 'date') {
      query = query.order('game_date', { ascending: orderAscending });
    } else {
      // For excitement and score_diff sorting, we'll handle post-calculation
      query = query.order('game_date', { ascending: false });
    }

    // Apply pagination (offset + limit)
    const lim = parseInt(limit);
    const off = parseInt(offset);
    if (!Number.isNaN(lim) && !Number.isNaN(off)) {
      query = query.range(off, off + lim - 1);
    } else if (!Number.isNaN(lim)) {
      query = query.limit(lim);
    }

    // Execute query
    const { data: games, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate entertainment scores on-demand for each game
    let processedGames = (games || []).map(game => {
      let entertainmentScore = null;
      let confidence = 0;
      let narrative = null;
      let keyFactors = [];

      // Calculate score on-demand if we have probability data
      if (game.probability_data && Array.isArray(game.probability_data)) {
        try {
          const gameObj = {
            id: game.id,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            homeScore: game.home_score,
            awayScore: game.away_score,
            overtime: game.overtime,
            startDate: game.game_date,
            week: game.week,
            seasonType: game.season_type,
            sport: game.sport,
            ...(game.game_context || {})
          };

          const gameContext = game.game_context || buildGameContext(gameObj, game.sport);
          const result = calculateEnhancedEntertainment(game.probability_data, gameObj, gameContext);
          entertainmentScore = result.entertainmentScore;
          confidence = result.confidence;
          narrative = result.narrative;
          keyFactors = result.keyFactors || [];
        } catch (error) {
          console.error(`Error calculating entertainment for game ${game.id}:`, error.message);
          // Fall back to pre-calculated score if available
          entertainmentScore = game.excitement_score;
        }
      } else {
        // Use pre-calculated score if no probability data
        entertainmentScore = game.excitement_score;
      }

      return {
        ...game,
        calculated_excitement: entertainmentScore,
        confidence,
        narrative,
        keyFactors
      };
    });

    // Apply excitement score filtering post-calculation
    if (minExcitement) {
      const minScore = parseFloat(minExcitement);
      processedGames = processedGames.filter(game =>
        game.calculated_excitement !== null && game.calculated_excitement >= minScore
      );
    }

    if (maxExcitement) {
      const maxScore = parseFloat(maxExcitement);
      processedGames = processedGames.filter(game =>
        game.calculated_excitement !== null && game.calculated_excitement <= maxScore
      );
    }

    // Apply sorting post-calculation
    if (sortBy === 'excitement_score') {
      processedGames.sort((a, b) => {
        const scoreA = a.calculated_excitement || 0;
        const scoreB = b.calculated_excitement || 0;
        return orderAscending ? scoreA - scoreB : scoreB - scoreA;
      });
    } else if (sortBy === 'score_diff') {
      processedGames.sort((a, b) => {
        const diffA = Math.abs(a.home_score - a.away_score);
        const diffB = Math.abs(b.home_score - b.away_score);
        return orderAscending ? diffA - diffB : diffB - diffA;
      });
    }

    // Format response with on-demand calculated scores
    const formattedGames = processedGames.map(game => ({
      id: game.id,
      sport: game.sport,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      homeScore: game.home_score,
      awayScore: game.away_score,
      excitement: game.calculated_excitement,
      date: game.game_date,
      season: game.season,
      week: game.week,
      overtime: game.overtime,
      metrics: {
        confidence: game.confidence,
        calculationSource: game.probability_data ? 'live_calculation' : 'pre_calculated'
      },
      description: game.narrative || generateDescription(game),
      keyFactors: game.keyFactors || []
    }));

    // Calculate summary statistics
    const stats = {
      totalResults: formattedGames.length,
      avgExcitement: formattedGames.length > 0
        ? formattedGames.reduce((sum, g) => sum + (g.excitement || 0), 0) / formattedGames.length
        : 0,
      highestExcitement: formattedGames.length > 0
        ? Math.max(...formattedGames.map(g => g.excitement || 0))
        : 0,
      closestGame: formattedGames.length > 0
        ? formattedGames.reduce((closest, game) => {
            const diff = Math.abs(game.homeScore - game.awayScore);
            const closestDiff = Math.abs(closest.homeScore - closest.awayScore);
            return diff < closestDiff ? game : closest;
          })
        : null
    };

    const hasMore = formattedGames.length === (Number.isNaN(lim) ? formattedGames.length : lim);

    return res.status(200).json({
      success: true,
      games: formattedGames,
      stats,
      pagination: {
        limit: Number.isNaN(lim) ? null : lim,
        offset: Number.isNaN(off) ? null : off,
        returned: formattedGames.length,
        hasMore
      },
      query: {
        team,
        sport,
        season,
        week,
        minExcitement,
        maxExcitement,
        limit,
        offset,
        sortBy,
        sortOrder
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to search games',
      details: error.message
    });
  }
}

function generateDescription(game) {
  const scoreDiff = Math.abs(game.home_score - game.away_score);
  const winner = game.home_score > game.away_score ? game.home_team : game.away_team;

  if (game.overtime) {
    return `Overtime thriller decided by ${scoreDiff} points`;
  } else if (scoreDiff <= 3) {
    return `Nail-biter decided by a field goal or less`;
  } else if (scoreDiff <= 7) {
    return `Close game with ${winner} holding on for the win`;
  } else if (scoreDiff <= 14) {
    return `Competitive matchup won by ${winner}`;
  } else {
    return `${winner} dominated in a ${scoreDiff}-point victory`;
  }
}
