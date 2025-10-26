#!/usr/bin/env node
// Script to recalculate entertainment scores from stored raw probability data
// Usage: node recalculate-scores.js --all
//        node recalculate-scores.js --sport NFL --season 2024
//        node recalculate-scores.js --game-id 401671681

import 'dotenv/config';
import { supabaseAdmin } from '../../src/lib/supabase.js';
import { calculateEnhancedEntertainment } from '../../src/api/entertainmentCalculator.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: null,
    sport: null,
    season: null,
    gameId: null,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--all':
        options.mode = 'all';
        break;
      case '--sport':
        options.mode = 'filter';
        options.sport = args[++i];
        break;
      case '--season':
        options.mode = 'filter';
        options.season = parseInt(args[++i]);
        break;
      case '--game-id':
        options.mode = 'single';
        options.gameId = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: node recalculate-scores.js [options]

Options:
  --all                    Recalculate all games with probability data
  --sport <NFL|CFB>        Recalculate games for specific sport
  --season <year>          Recalculate games for specific season
  --game-id <id>           Recalculate single game by ID
  --dry-run                Show what would be updated without making changes
  --help                   Show this help message

Examples:
  node recalculate-scores.js --all
  node recalculate-scores.js --sport NFL --season 2024
  node recalculate-scores.js --game-id 401671681
  node recalculate-scores.js --all --dry-run
        `);
        process.exit(0);
    }
  }

  if (!options.mode) {
    console.error('Error: Must specify --all, --sport, --season, or --game-id');
    process.exit(1);
  }

  return options;
}

// Fetch games from database based on options
async function fetchGames(options) {
  if (!supabaseAdmin) {
    throw new Error('Supabase not configured. Check environment variables.');
  }

  let query = supabaseAdmin
    .from('games')
    .select('*')
    .not('probability_data', 'is', null); // Only games with probability data

  if (options.mode === 'single') {
    query = query.eq('id', options.gameId);
  } else if (options.mode === 'filter') {
    if (options.sport) {
      query = query.eq('sport', options.sport);
    }
    if (options.season) {
      query = query.eq('season', options.season);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Database query failed: ${error.message}`);
  }

  return data || [];
}

// Recalculate score for a single game
async function recalculateGame(game, dryRun = false) {
  console.log(`\n📊 Recalculating: ${game.away_team} @ ${game.home_team}`);
  
  if (!game.probability_data || !Array.isArray(game.probability_data)) {
    console.log(`  ⚠️  No probability data available - skipping`);
    return { success: false, reason: 'no_data' };
  }

  try {
    // Reconstruct the game object in the format expected by the calculator
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
      status: game.status,
      // Include context data if available
      ...(game.game_context || {})
    };

    // Calculate new entertainment score
    const result = calculateEnhancedEntertainment(
      game.probability_data,
      gameObj,
      game.game_context || {}
    );

    const newScore = result.entertainmentScore;
    const oldScore = game.excitement_score;

    console.log(`  📈 Old score: ${oldScore?.toFixed(1) || 'N/A'}`);
    console.log(`  📈 New score: ${newScore.toFixed(1)}`);
    console.log(`  📊 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    
    if (oldScore) {
      const diff = newScore - oldScore;
      const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
      console.log(`  Δ  Change: ${diffStr}`);
    }

    if (dryRun) {
      console.log(`  🔍 DRY RUN - No changes made`);
      return { success: true, newScore, oldScore, changed: true };
    }

    // Update the database
    const { error: updateError } = await supabaseAdmin
      .from('games')
      .update({ excitement_score: newScore })
      .eq('id', game.id);

    if (updateError) {
      console.log(`  ❌ Failed to update: ${updateError.message}`);
      return { success: false, reason: 'update_failed', error: updateError.message };
    }

    console.log(`  ✅ Score updated successfully`);
    return { success: true, newScore, oldScore, changed: true };

  } catch (error) {
    console.log(`  ❌ Calculation error: ${error.message}`);
    return { success: false, reason: 'calculation_failed', error: error.message };
  }
}

// Main execution
async function main() {
  const options = parseArgs();
  
  console.log('\n🔄 Starting score recalculation...');
  if (options.dryRun) {
    console.log('   🔍 DRY RUN MODE - No changes will be made');
  }
  if (options.sport) console.log(`   Sport: ${options.sport}`);
  if (options.season) console.log(`   Season: ${options.season}`);
  if (options.gameId) console.log(`   Game ID: ${options.gameId}`);
  
  // Fetch games
  console.log('\n📥 Fetching games from database...');
  const games = await fetchGames(options);
  
  if (games.length === 0) {
    console.log('⚠️  No games found matching criteria');
    return;
  }

  console.log(`✅ Found ${games.length} game(s) with probability data`);

  // Process each game
  const results = {
    total: games.length,
    success: 0,
    failed: 0,
    noData: 0,
    totalScoreChange: 0
  };

  for (const game of games) {
    const result = await recalculateGame(game, options.dryRun);
    
    if (result.success) {
      results.success++;
      if (result.oldScore && result.newScore) {
        results.totalScoreChange += Math.abs(result.newScore - result.oldScore);
      }
    } else if (result.reason === 'no_data') {
      results.noData++;
    } else {
      results.failed++;
    }
  }

  // Summary
  console.log('\n\n═══════════════════════════════════════════');
  console.log('📊 Recalculation Summary');
  console.log('═══════════════════════════════════════════');
  console.log(`Total games processed: ${results.total}`);
  console.log(`✅ Successfully recalculated: ${results.success}`);
  console.log(`⚠️  Skipped (no data): ${results.noData}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.success > 0 && results.totalScoreChange > 0) {
    const avgChange = results.totalScoreChange / results.success;
    console.log(`📈 Average score change: ${avgChange.toFixed(2)}`);
  }
  
  if (options.dryRun) {
    console.log('\n🔍 This was a dry run - no changes were saved');
  }
  
  console.log('\n✨ Done!\n');
}

// Run the script
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});