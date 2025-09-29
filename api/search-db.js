import { supabase } from '../lib/supabase.js';

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

    // Build the query
    let query = supabase
      .from('games')
      .select(`
        *,
        game_entertainment_metrics (
          volatility,
          balance,
          late_game_factor,
          momentum_shifts,
          confidence,
          narrative,
          key_factors
        )
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

    if (minExcitement) {
      query = query.gte('excitement_score', parseFloat(minExcitement));
    }

    if (maxExcitement) {
      query = query.lte('excitement_score', parseFloat(maxExcitement));
    }

    // Apply sorting
    const orderAscending = sortOrder === 'asc';
    if (sortBy === 'date') {
      query = query.order('game_date', { ascending: orderAscending });
    } else if (sortBy === 'score_diff') {
      // Can't directly sort by score difference in Supabase, will handle client-side
      query = query.order('game_date', { ascending: false });
    } else {
      query = query.order('excitement_score', { ascending: orderAscending });
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

    // Post-process for score difference sorting if needed
    let processedGames = games || [];
    if (sortBy === 'score_diff') {
      processedGames.sort((a, b) => {
        const diffA = Math.abs(a.home_score - a.away_score);
        const diffB = Math.abs(b.home_score - b.away_score);
        return orderAscending ? diffA - diffB : diffB - diffA;
      });
    }

    // Format response
    const formattedGames = processedGames.map(game => ({
      id: game.id,
      sport: game.sport,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      homeScore: game.home_score,
      awayScore: game.away_score,
      excitement: game.excitement_score,
      date: game.game_date,
      season: game.season,
      week: game.week,
      overtime: game.overtime,
      metrics: game.game_entertainment_metrics?.[0] || null,
      description: game.game_entertainment_metrics?.[0]?.narrative ||
                   generateDescription(game),
      keyFactors: game.game_entertainment_metrics?.[0]?.key_factors || []
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
