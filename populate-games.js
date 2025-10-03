#!/usr/bin/env node
// Script to populate database with games and raw probability data
// Usage: node populate-games.js --sport NFL --season 2024 --week 1
//        node populate-games.js --sport NFL --season 2024 --weeks 1-5
//        node populate-games.js --sport CFB --season 2024 --week playoff

import 'dotenv/config';
import { getGamesForSearch } from './api/gameDataFetcher.js';
import { buildGameContext } from './api/contextAnalyzer.js';
import { insertGame, insertGameMetrics } from './lib/supabase.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sport: 'NFL',
    season: new Date().getFullYear(),
    weeks: null,
    seasonType: 2,
    saveExcitementScore: false // Don't save calculated scores by default
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--sport':
        options.sport = args[++i];
        break;
      case '--season':
        options.season = parseInt(args[++i]);
        break;
      case '--week':
        options.weeks = [args[++i]];
        break;
      case '--weeks':
        const range = args[++i];
        if (range.includes('-')) {
          const [start, end] = range.split('-').map(x => parseInt(x));
          options.weeks = Array.from({ length: end - start + 1 }, (_, i) => (start + i).toString());
        } else {
          options.weeks = range.split(',');
        }
        break;
      case '--season-type':
        options.seasonType = parseInt(args[++i]);
        break;
      case '--save-scores':
        options.saveExcitementScore = true;
        break;
      case '--help':
        console.log(`
Usage: node populate-games.js [options]

Options:
  --sport <NFL|CFB>        Sport to fetch (default: NFL)
  --season <year>          Season year (default: current year)
  --week <week>            Single week to fetch
  --weeks <range>          Week range (e.g., 1-5 or 1,3,5)
  --season-type <num>      Season type: 2=regular, 3=postseason, 4=CFB playoff (default: 2)
  --save-scores            Also save calculated excitement scores (default: false)
  --help                   Show this help message

Examples:
  node populate-games.js --sport NFL --season 2024 --week 1
  node populate-games.js --sport NFL --season 2024 --weeks 1-18
  node populate-games.js --sport CFB --season 2024 --week playoff --season-type 4
        `);
        process.exit(0);
    }
  }

  if (!options.weeks) {
    console.error('Error: --week or --weeks is required');
    process.exit(1);
  }

  return options;
}

// Fetch raw probability data from ESPN
async function fetchProbabilityData(gameId, sport) {
  try {
    const league = sport === 'CFB' ? 'college-football' : 'nfl';
    const probUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/${league}/events/${gameId}/competitions/${gameId}/probabilities?limit=300`;
    
    const response = await fetch(probUrl);
    
    if (!response.ok) {
      console.log(`  ⚠️  No probability data available for game ${gameId}`);
      return null;
    }

    const probData = await response.json();
    
    if (!probData.items || probData.items.length < 10) {
      console.log(`  ⚠️  Insufficient probability data for game ${gameId}`);
      return null;
    }

    return probData.items;
  } catch (error) {
    console.error(`  ❌ Error fetching probability data for game ${gameId}:`, error.message);
    return null;
  }
}

// Process and store a single game
async function processGame(game, sport, options) {
  console.log(`\n📊 Processing: ${game.awayTeam} @ ${game.homeTeam}`);
  
  // Fetch raw probability data
  const probabilityData = await fetchProbabilityData(game.id, sport);
  
  // Build game context
  const gameContext = buildGameContext(game, sport);
  
  // Prepare game data for insertion
  const gameData = {
    id: game.id,
    sport: sport,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    gameDate: game.startDate,
    season: options.season,
    week: game.week,
    seasonType: options.seasonType,
    status: game.status,
    overtime: game.overtime || false,
    probabilityData: probabilityData,
    gameContext: {
      sport: gameContext.sport,
      seasonType: gameContext.seasonType,
      seasonLabel: gameContext.seasonLabel,
      eventImportance: gameContext.eventImportance,
      labels: gameContext.labels,
      neutralSite: gameContext.neutralSite,
      isPlayoff: gameContext.isPlayoff,
      isChampionship: gameContext.isChampionship,
      isBowl: gameContext.isBowl,
      isRivalry: gameContext.isRivalry,
      isElimination: gameContext.isElimination,
      qualityMetrics: gameContext.qualityMetrics,
      preGameSpread: gameContext.preGameSpread,
      expectation: gameContext.expectation
    },
    saveExcitementScore: options.saveExcitementScore
  };

  // Insert game into database
  const insertedGame = await insertGame(gameData);
  
  if (insertedGame) {
    console.log(`  ✅ Stored game data (ID: ${insertedGame.id})`);
    if (probabilityData) {
      console.log(`     📈 ${probabilityData.length} probability data points saved`);
    } else {
      console.log(`     📝 Game metadata saved (no probability data)`);
    }
    return true;
  } else {
    console.log(`  ❌ Failed to store game`);
    return false;
  }
}

// Main execution
async function main() {
  const options = parseArgs();
  
  console.log('\n🚀 Starting game population...');
  console.log(`   Sport: ${options.sport}`);
  console.log(`   Season: ${options.season}`);
  console.log(`   Weeks: ${options.weeks.join(', ')}`);
  console.log(`   Season Type: ${options.seasonType}`);
  console.log(`   Save excitement scores: ${options.saveExcitementScore}`);
  
  let totalGames = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const week of options.weeks) {
    console.log(`\n\n═══════════════════════════════════════════`);
    console.log(`📅 Processing Week ${week}`);
    console.log(`═══════════════════════════════════════════`);

    try {
      // Special handling for CFB playoff/bowl games
      let weekNumber = week;
      let seasonType = options.seasonType;
      
      if (options.sport === 'CFB') {
        if (week === 'playoff') {
          weekNumber = '1';
          seasonType = 4;
        } else if (week === 'bowl') {
          weekNumber = '1';
          seasonType = 3;
        }
      }

      const searchParam = {
        week: weekNumber,
        season: options.season,
        seasonType: seasonType
      };

      const games = await getGamesForSearch(searchParam, options.sport);
      
      if (!games || games.length === 0) {
        console.log(`\n⚠️  No games found for week ${week}`);
        continue;
      }

      console.log(`\nFound ${games.length} games to process`);
      totalGames += games.length;

      for (const game of games) {
        try {
          const success = await processGame(game, options.sport, { ...options, seasonType });
          if (success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`\n❌ Error processing game ${game.id}:`, error.message);
          errorCount++;
        }
      }
    } catch (error) {
      console.error(`\n❌ Error fetching games for week ${week}:`, error.message);
    }
  }

  console.log('\n\n═══════════════════════════════════════════');
  console.log('📊 Population Summary');
  console.log('═══════════════════════════════════════════');
  console.log(`Total games found: ${totalGames}`);
  console.log(`✅ Successfully stored: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log('\n✨ Done!\n');
}

// Run the script
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});