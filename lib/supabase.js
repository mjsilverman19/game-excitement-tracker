import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log for debugging (remove after fixing)
console.log('Supabase init:', { 
  hasUrl: !!supabaseUrl, 
  hasAnonKey: !!supabaseAnonKey,
  urlValue: supabaseUrl
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const supabaseAdmin = (supabaseServiceKey && supabaseUrl)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;

export async function insertGame(gameData) {
  const { data, error } = await supabaseAdmin
    .from('games')
    .upsert({
      id: gameData.id,
      sport: gameData.sport,
      home_team: gameData.homeTeam,
      away_team: gameData.awayTeam,
      home_score: gameData.homeScore,
      away_score: gameData.awayScore,
      game_date: gameData.gameDate,
      season: gameData.season,
      week: gameData.week,
      season_type: gameData.seasonType,
      status: gameData.status,
      overtime: gameData.overtime || false,
      excitement_score: gameData.excitement
    })
    .select();

  if (error) {
    console.error('Error inserting game:', error);
    return null;
  }

  return data[0];
}

export async function insertGameMetrics(gameId, metrics) {
  const { data, error } = await supabaseAdmin
    .from('game_entertainment_metrics')
    .upsert({
      game_id: gameId,
      volatility: metrics.volatility,
      balance: metrics.balance,
      late_game_factor: metrics.lateGameFactor,
      momentum_shifts: metrics.momentumShifts,
      confidence: metrics.confidence,
      narrative: metrics.narrative,
      key_factors: metrics.keyFactors,
      breakdown: metrics.breakdown
    })
    .select();

  if (error) {
    console.error('Error inserting metrics:', error);
    return null;
  }

  return data[0];
}

export async function searchGamesByTeam(teamName, options = {}) {
  const { sport, season, limit = 100 } = options;

  let query = supabase
    .from('games')
    .select(`
      *,
      game_entertainment_metrics (*)
    `)
    .or(`home_team.ilike.%${teamName}%,away_team.ilike.%${teamName}%`)
    .order('game_date', { ascending: false })
    .limit(limit);

  if (sport) {
    query = query.eq('sport', sport);
  }

  if (season) {
    query = query.eq('season', season);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error searching games:', error);
    return [];
  }

  return data;
}

export async function getHighExcitementGames(minScore = 80, limit = 20) {
  const { data, error } = await supabase
    .from('games')
    .select(`
      *,
      game_entertainment_metrics (*)
    `)
    .gte('excitement_score', minScore)
    .order('excitement_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching high excitement games:', error);
    return [];
  }

  return data;
}

export async function getTeamStats(teamName) {
  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .or(`home_team.ilike.%${teamName}%,away_team.ilike.%${teamName}%`);

  if (error) {
    console.error('Error fetching team stats:', error);
    return null;
  }

  const stats = {
    totalGames: games.length,
    wins: 0,
    losses: 0,
    avgExcitement: 0,
    highestExcitement: 0,
    lowestExcitement: 100,
    overtimeGames: 0
  };

  games.forEach(game => {
    const isHome = game.home_team.toLowerCase().includes(teamName.toLowerCase());
    const teamScore = isHome ? game.home_score : game.away_score;
    const opponentScore = isHome ? game.away_score : game.home_score;

    if (teamScore > opponentScore) stats.wins++;
    else if (teamScore < opponentScore) stats.losses++;

    if (game.excitement_score) {
      stats.avgExcitement += game.excitement_score;
      stats.highestExcitement = Math.max(stats.highestExcitement, game.excitement_score);
      stats.lowestExcitement = Math.min(stats.lowestExcitement, game.excitement_score);
    }

    if (game.overtime) stats.overtimeGames++;
  });

  stats.avgExcitement = stats.avgExcitement / games.length;

  return stats;
}

export async function upsertTeam(teamData) {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .upsert({
      name: teamData.name,
      abbreviation: teamData.abbreviation,
      sport: teamData.sport,
      conference: teamData.conference,
      division: teamData.division
    })
    .select();

  if (error) {
    console.error('Error upserting team:', error);
    return null;
  }

  return data[0];
}
