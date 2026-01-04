#!/usr/bin/env node

// Static JSON Generator for Game Excitement Tracker
// Generates pre-computed static JSON files for historical game data

import { fetchGames } from '../api/fetcher.js';
import { analyzeGameEntertainment } from '../api/calculator.js';
import { fetchSoccerGames, fetchSoccerOddsTimeseries, SOCCER_LEAGUES } from '../api/soccer-fetcher.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PUBLIC_DATA_DIR = join(ROOT_DIR, 'public', 'data');

// Command line argument parsing
const args = process.argv.slice(2);
const options = {
  sport: null,
  season: null,
  week: null,
  date: null,
  league: null,
  all: false,
  force: false,
  dryRun: false
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--sport' && i + 1 < args.length) {
    options.sport = args[++i].toUpperCase();
  } else if (arg === '--season' && i + 1 < args.length) {
    options.season = parseInt(args[++i]);
  } else if (arg === '--week' && i + 1 < args.length) {
    const weekValue = args[++i];
    options.week = (weekValue === 'bowls' || weekValue === 'playoffs') ? weekValue : parseInt(weekValue);
  } else if (arg === '--date' && i + 1 < args.length) {
    options.date = args[++i];
  } else if (arg === '--league' && i + 1 < args.length) {
    options.league = args[++i].toUpperCase();
  } else if (arg === '--all') {
    options.all = true;
  } else if (arg === '--force') {
    options.force = true;
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg === '--help' || arg === '-h') {
    printUsage();
    process.exit(0);
  }
}

function printUsage() {
  console.log(`
Usage: node scripts/generate-static.js [options]

Options:
  --sport <NFL|CFB|NBA|SOCCER>    Sport to generate data for (required)
  --season <year>          Season year (required)
  --week <number|bowls|playoffs>    Week number, 'bowls', or 'playoffs' for CFB postseason (required unless --all or NBA)
  --date <YYYY-MM-DD>      Date for NBA games (required for NBA unless --all)
  --league <league>        Soccer league key (required for SOCCER)
  --all                    Generate all weeks/dates for the season
  --force                  Overwrite existing files
  --dry-run                Estimate Soccer credit usage without fetching
  --help, -h               Show this help message

Examples:
  # Generate single week
  node scripts/generate-static.js --sport NFL --season 2025 --week 1

  # Generate all NFL weeks for 2025
  node scripts/generate-static.js --sport NFL --season 2025 --all

  # Generate CFB bowls
  node scripts/generate-static.js --sport CFB --season 2025 --week bowls

  # Generate all CFB weeks including bowls
  node scripts/generate-static.js --sport CFB --season 2025 --all

  # Generate single NBA date
  node scripts/generate-static.js --sport NBA --season 2025 --date 2025-10-22

  # Generate all NBA dates for season (with force overwrite)
  node scripts/generate-static.js --sport NBA --season 2025 --all --force

  # Generate single soccer date
  node scripts/generate-static.js --sport SOCCER --league EPL --season 2024 --date 2024-12-15

  # Generate all EPL dates (dry run)
  node scripts/generate-static.js --sport SOCCER --league EPL --season 2024 --all --dry-run
`);
}

// Validate options
function validateOptions() {
  if (!options.sport || !['NFL', 'CFB', 'NBA', 'SOCCER'].includes(options.sport)) {
    console.error('Error: --sport is required and must be NFL, CFB, NBA, or SOCCER');
    printUsage();
    process.exit(1);
  }

  if (!options.season) {
    console.error('Error: --season is required');
    printUsage();
    process.exit(1);
  }

  if (options.sport === 'SOCCER') {
    if (!options.league || !SOCCER_LEAGUES[options.league]) {
      console.error('Error: SOCCER requires a valid --league value');
      console.error(`Supported leagues: ${Object.keys(SOCCER_LEAGUES).join(', ')}`);
      process.exit(1);
    }

    if (!options.all && !options.date) {
      console.error('Error: SOCCER requires either --date or --all');
      printUsage();
      process.exit(1);
    }
  } else if (options.sport === 'NBA') {
    if (!options.all && !options.date) {
      console.error('Error: NBA requires either --date or --all');
      printUsage();
      process.exit(1);
    }
  } else {
    if (!options.all && !options.week) {
      console.error('Error: NFL/CFB requires either --week or --all');
      printUsage();
      process.exit(1);
    }
  }
}

const SOCCER_SEASONS = {
  EPL: { start: '08-01', end: '05-31' },
  MLS: { start: '02-15', end: '10-31' },
  CHAMPIONS_LEAGUE: { start: '09-01', end: '05-31' }
};

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSoccerLeagueSlug(league) {
  return (league || 'epl').toLowerCase();
}

function getSoccerDateRange(season, league) {
  const config = SOCCER_SEASONS[league] || SOCCER_SEASONS.EPL;
  const [startMonth, startDay] = config.start.split('-').map(Number);
  const [endMonth, endDay] = config.end.split('-').map(Number);

  const startDate = new Date(season, startMonth - 1, startDay);
  const endYear = startMonth > endMonth ? season + 1 : season;
  const endDate = new Date(endYear, endMonth - 1, endDay);

  const dates = [];
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    dates.push(formatDate(date));
  }

  return dates;
}

// Get file path for static JSON
function getStaticFilePath(sport, season, weekOrDate) {
  const sportLower = sport.toLowerCase();
  let dir = join(PUBLIC_DATA_DIR, sportLower, String(season));

  let filename;
  if (sport === 'SOCCER') {
    const leagueSlug = getSoccerLeagueSlug(options.league);
    const year = new Date(weekOrDate).getFullYear();
    dir = join(PUBLIC_DATA_DIR, 'soccer', leagueSlug, String(year));
    filename = `${weekOrDate}.json`;
  } else if (sport === 'NBA') {
    filename = `${weekOrDate}.json`;
  } else {
    let weekStr;
    if (weekOrDate === 'bowls') {
      weekStr = 'bowls';
    } else if (weekOrDate === 'playoffs') {
      weekStr = 'playoffs';
    } else {
      weekStr = `week-${String(weekOrDate).padStart(2, '0')}`;
    }
    filename = `${weekStr}.json`;
  }

  return { dir, filepath: join(dir, filename) };
}

// Generate static JSON for a single week/date
async function generateStatic(sport, season, weekOrDate) {
  try {
    const { dir, filepath } = getStaticFilePath(sport, season, weekOrDate);

    // Check if file already exists
    if (existsSync(filepath) && !options.force) {
      console.log(`⏭️  Skipping ${filepath} (already exists, use --force to overwrite)`);
      return { skipped: true };
    }

    console.log(`📥 Fetching ${sport} data for ${weekOrDate}...`);

    let games;
    const seasonType = sport === 'CFB' && weekOrDate === 'bowls' ? '3' : '2';

    if (sport === 'SOCCER') {
      if (!process.env.ODDS_API_KEY) {
        console.error('Error: ODDS_API_KEY is required for soccer generation');
        return { error: 'missing_api_key' };
      }

      games = await fetchSoccerGames(options.league, weekOrDate);
    } else if (sport === 'NBA') {
      games = await fetchGames(sport, season, null, seasonType, weekOrDate);
    } else {
      games = await fetchGames(sport, season, weekOrDate, seasonType);
    }

    if (!games || games.length === 0) {
      console.log(`⚠️  No completed games found for ${sport} ${season} ${weekOrDate}`);
      return { noGames: true };
    }

    console.log(`🧮 Analyzing ${games.length} games...`);

    let analyzedGames;

    if (sport === 'SOCCER') {
      analyzedGames = [];
      for (const game of games) {
        const oddsTimeseries = await fetchSoccerOddsTimeseries(game.id);
        if (!oddsTimeseries) {
          analyzedGames.push(null);
          continue;
        }

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

        analyzedGames.push(await analyzeGameEntertainment(enrichedGame, sport, oddsTimeseries));

        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } else {
      analyzedGames = await Promise.all(
        games.map(game => analyzeGameEntertainment(game, sport))
      );
    }

    // Filter out null results (games with insufficient data)
    const validGames = analyzedGames.filter(game => game !== null);
    const insufficientDataCount = analyzedGames.length - validGames.length;

    // Sort by excitement score
    validGames.sort((a, b) => (b.excitement || 0) - (a.excitement || 0));

    // Build metadata
    const metadata = {
      sport,
      season,
      count: validGames.length,
      totalGames: analyzedGames.length,
      insufficientData: insufficientDataCount,
      generatedAt: new Date().toISOString(),
      source: sport === 'SOCCER' ? 'The Odds API Historical Data' : 'ESPN Win Probability Analysis'
    };

    if (sport === 'SOCCER') {
      metadata.league = options.league;
      metadata.date = weekOrDate;
    } else if (sport === 'NBA') {
      metadata.date = weekOrDate;
    } else {
      metadata.week = weekOrDate;

      // Add bowl-specific metadata for CFB postseason
      if (sport === 'CFB' && (weekOrDate === 'bowls' || seasonType === '3')) {
        const playoffGames = validGames.filter(g => g.playoffRound !== null).length;
        const bowlGames = validGames.filter(g => g.bowlName !== null && g.playoffRound === null).length;

        metadata.playoffGames = playoffGames;
        metadata.bowlGames = bowlGames;
        metadata.seasonType = '3';
      }
    }

    // Build response object
    const responseData = {
      success: true,
      games: validGames,
      metadata
    };

    // Create directory if it doesn't exist
    await mkdir(dir, { recursive: true });

    // Write JSON file
    await writeFile(filepath, JSON.stringify(responseData, null, 2), 'utf8');

    console.log(`✅ Generated ${filepath} (${validGames.length} games)`);

    return { success: true, count: validGames.length };
  } catch (error) {
    console.error(`❌ Error generating ${sport} ${season} ${weekOrDate}:`, error.message);
    return { error: error.message };
  }
}

// Generate all weeks for NFL (1-18) or CFB (1-15 + bowls)
async function generateAllWeeks(sport, season) {
  const maxWeek = sport === 'NFL' ? 18 : 15;
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);

  // Add bowls and playoffs for CFB
  if (sport === 'CFB') {
    weeks.push('bowls');
    weeks.push('playoffs');
  }

  console.log(`\n🚀 Generating all ${sport} weeks for ${season} season...\n`);

  const results = {
    total: weeks.length,
    successful: 0,
    skipped: 0,
    noGames: 0,
    errors: 0
  };

  for (const week of weeks) {
    const result = await generateStatic(sport, season, week);

    if (result.success) results.successful++;
    else if (result.skipped) results.skipped++;
    else if (result.noGames) results.noGames++;
    else if (result.error) results.errors++;

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total: ${results.total}`);
  console.log(`   ✅ Generated: ${results.successful}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);
  console.log(`   ⚠️  No games: ${results.noGames}`);
  console.log(`   ❌ Errors: ${results.errors}`);
}

// Generate all NBA game dates for a season
async function generateAllNBADates(season) {
  // NBA season runs from October to April (next year)
  // For 2025 season: October 2025 - April 2026
  const startDate = new Date(`${season}-10-01`);
  const endDate = new Date(`${season + 1}-04-30`);

  console.log(`\n🚀 Generating NBA dates from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}...\n`);

  const results = {
    total: 0,
    successful: 0,
    skipped: 0,
    noGames: 0,
    errors: 0
  };

  // Iterate through each date
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    results.total++;

    const result = await generateStatic('NBA', season, dateStr);

    if (result.success) results.successful++;
    else if (result.skipped) results.skipped++;
    else if (result.noGames) results.noGames++;
    else if (result.error) results.errors++;

    // Move to next date
    currentDate.setDate(currentDate.getDate() + 1);

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total: ${results.total}`);
  console.log(`   ✅ Generated: ${results.successful}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);
  console.log(`   ⚠️  No games: ${results.noGames}`);
  console.log(`   ❌ Errors: ${results.errors}`);
}

// Generate all Soccer dates for a season/league
async function generateAllSoccerDates(season, league) {
  const dates = getSoccerDateRange(season, league);

  console.log(`\n⚽ Generating ${league} dates from ${dates[0]} to ${dates[dates.length - 1]}...\n`);

  if (options.dryRun) {
    const baseCredits = dates.length * 10;
    console.log(`Dry run: ${dates.length} dates selected.`);
    console.log(`Estimated credits: at least ${baseCredits} (events queries only).`);
    console.log('Note: Each match odds request costs ~10 credits; total will scale with matches per date.');
    return;
  }

  const results = {
    total: dates.length,
    successful: 0,
    skipped: 0,
    noGames: 0,
    errors: 0
  };

  for (const dateStr of dates) {
    const result = await generateStatic('SOCCER', season, dateStr);

    if (result.success) results.successful++;
    else if (result.skipped) results.skipped++;
    else if (result.noGames) results.noGames++;
    else if (result.error) results.errors++;

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total: ${results.total}`);
  console.log(`   ✅ Generated: ${results.successful}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);
  console.log(`   ⚠️  No games: ${results.noGames}`);
  console.log(`   ❌ Errors: ${results.errors}`);
}

// Main execution
async function main() {
  validateOptions();

  console.log(`\n🏈 Game Excitement Tracker - Static Data Generator\n`);

  if (options.all) {
    if (options.sport === 'NBA') {
      await generateAllNBADates(options.season);
    } else if (options.sport === 'SOCCER') {
      await generateAllSoccerDates(options.season, options.league);
    } else {
      await generateAllWeeks(options.sport, options.season);
    }
  } else {
    const weekOrDate = options.sport === 'NBA' || options.sport === 'SOCCER' ? options.date : options.week;
    await generateStatic(options.sport, options.season, weekOrDate);
  }

  console.log(`\n✨ Done!\n`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
