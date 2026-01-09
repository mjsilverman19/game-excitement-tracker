#!/usr/bin/env node

// Static JSON Generator for Game Excitement Tracker
// Generates pre-computed static JSON files for historical game data

import { fetchGames } from '../api/fetcher.js';
import { analyzeGameEntertainment } from '../api/calculator.js';
import { ALGORITHM_CONFIG, NFL_PLAYOFF_ROUNDS, isNFLPlayoffRound, getNFLPlayoffRoundKeys } from '../shared/algorithm-config.js';
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
  all: false,
  force: false,
  until: null
};

// NFL playoff round values that should be kept as strings
const NFL_PLAYOFF_WEEK_VALUES = ['wild-card', 'divisional', 'conference', 'super-bowl'];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--sport' && i + 1 < args.length) {
    options.sport = args[++i].toUpperCase();
  } else if (arg === '--season' && i + 1 < args.length) {
    options.season = parseInt(args[++i]);
  } else if (arg === '--week' && i + 1 < args.length) {
    const weekValue = args[++i];
    // Keep special values as strings, parse numbers
    if (weekValue === 'bowls' || weekValue === 'playoffs' || NFL_PLAYOFF_WEEK_VALUES.includes(weekValue)) {
      options.week = weekValue;
    } else {
      options.week = parseInt(weekValue);
    }
  } else if (arg === '--date' && i + 1 < args.length) {
    options.date = args[++i];
  } else if (arg === '--until' && i + 1 < args.length) {
    options.until = args[++i];
  } else if (arg === '--all') {
    options.all = true;
  } else if (arg === '--force') {
    options.force = true;
  } else if (arg === '--help' || arg === '-h') {
    printUsage();
    process.exit(0);
  }
}

function printUsage() {
  console.log(`
Usage: node scripts/generate-static.js [options]

Options:
  --sport <NFL|CFB|NBA>    Sport to generate data for (required)
  --season <year>          Season year (required)
  --week <number|round>    Week number or special value:
                           - NFL: 1-18, wild-card, divisional, conference, super-bowl
                           - CFB: 1-15, bowls, playoffs
  --date <YYYY-MM-DD>      Date for NBA games (required for NBA unless --all)
  --until <YYYY-MM-DD>     End date for NBA --all generation
  --all                    Generate all weeks/dates for the season
  --force                  Overwrite existing files
  --help, -h               Show this help message

Examples:
  # Generate single week
  node scripts/generate-static.js --sport NFL --season 2025 --week 1

  # Generate NFL Wild Card round
  node scripts/generate-static.js --sport NFL --season 2024 --week wild-card

  # Generate all NFL weeks including playoffs for 2025
  node scripts/generate-static.js --sport NFL --season 2025 --all

  # Generate CFB bowls
  node scripts/generate-static.js --sport CFB --season 2025 --week bowls

  # Generate all CFB weeks including bowls
  node scripts/generate-static.js --sport CFB --season 2025 --all

  # Generate single NBA date
  node scripts/generate-static.js --sport NBA --season 2025 --date 2025-10-22

  # Generate all NBA dates for season (with force overwrite)
  node scripts/generate-static.js --sport NBA --season 2025 --all --force
`);
}

// Validate options
function validateOptions() {
  if (!options.sport || !['NFL', 'CFB', 'NBA'].includes(options.sport)) {
    console.error('Error: --sport is required and must be NFL, CFB, or NBA');
    printUsage();
    process.exit(1);
  }

  if (!options.season) {
    console.error('Error: --season is required');
    printUsage();
    process.exit(1);
  }

  if (options.sport === 'NBA') {
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

// Get file path for static JSON
function getStaticFilePath(sport, season, weekOrDate) {
  const sportLower = sport.toLowerCase();
  const dir = join(PUBLIC_DATA_DIR, sportLower, String(season));

  let filename;
  if (sport === 'NBA') {
    filename = `${weekOrDate}.json`;
  } else {
    let weekStr;
    if (weekOrDate === 'bowls') {
      weekStr = 'bowls';
    } else if (weekOrDate === 'playoffs') {
      weekStr = 'playoffs';
    } else if (sport === 'NFL' && isNFLPlayoffRound(weekOrDate)) {
      // NFL playoff rounds: wild-card.json, divisional.json, etc.
      weekStr = weekOrDate;
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

    // Fetch games from ESPN API
    let games;
    // Determine seasonType: '3' for postseason, '2' for regular season
    let seasonType = '2';
    if (sport === 'CFB' && (weekOrDate === 'bowls' || weekOrDate === 'playoffs')) {
      seasonType = '3';
    } else if (sport === 'NFL' && isNFLPlayoffRound(weekOrDate)) {
      seasonType = '3';
    }

    if (sport === 'NBA') {
      games = await fetchGames(sport, season, null, seasonType, weekOrDate);
    } else {
      games = await fetchGames(sport, season, weekOrDate, seasonType);
    }

    if (!games || games.length === 0) {
      console.log(`⚠️  No completed games found for ${sport} ${season} ${weekOrDate}`);
      return { noGames: true };
    }

    console.log(`🧮 Analyzing ${games.length} games...`);

    // Analyze each game
    const analyzedGames = await Promise.all(
      games.map(game => analyzeGameEntertainment(game, sport))
    );

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
      algorithmVersion: ALGORITHM_CONFIG.version,
      source: 'ESPN Win Probability Analysis'
    };

    if (sport === 'NBA') {
      metadata.date = weekOrDate;
    } else {
      metadata.week = weekOrDate;

      // Add bowl-specific metadata for CFB postseason
      if (sport === 'CFB' && (weekOrDate === 'bowls' || weekOrDate === 'playoffs' || seasonType === '3')) {
        const playoffGames = validGames.filter(g => g.playoffRound !== null).length;
        const bowlGames = validGames.filter(g => g.bowlName !== null && g.playoffRound === null).length;

        metadata.playoffGames = playoffGames;
        metadata.bowlGames = bowlGames;
        metadata.seasonType = '3';
      }

      // Add NFL playoff-specific metadata
      if (sport === 'NFL' && isNFLPlayoffRound(weekOrDate)) {
        const roundInfo = NFL_PLAYOFF_ROUNDS[weekOrDate];
        metadata.playoffRound = roundInfo.label;
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

// Generate all weeks for NFL (1-18 + playoffs) or CFB (1-15 + bowls + playoffs)
async function generateAllWeeks(sport, season) {
  const maxWeek = sport === 'NFL' ? 18 : 15;
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);

  // Add bowls and playoffs for CFB
  if (sport === 'CFB') {
    weeks.push('bowls');
    weeks.push('playoffs');
  }

  // Add playoff rounds for NFL
  if (sport === 'NFL') {
    weeks.push(...getNFLPlayoffRoundKeys());
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
  const seasonEndDate = options.until
    ? new Date(options.until)
    : new Date(`${season + 1}-04-30`);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const endDate = seasonEndDate < yesterday ? seasonEndDate : yesterday;

  if (startDate > yesterday) {
    console.log(`\n⚠️  NBA ${season} season hasn't started yet (starts ${startDate.toISOString().split('T')[0]})\n`);
    return;
  }

  console.log(`\n🚀 Generating NBA dates from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}...\n`);
  const totalDays = Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1;
  console.log(`📅 Processing ${totalDays} days (skipping future dates)\n`);

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

// Main execution
async function main() {
  validateOptions();

  console.log(`\n🏈 Game Excitement Tracker - Static Data Generator\n`);

  if (options.all) {
    if (options.sport === 'NBA') {
      await generateAllNBADates(options.season);
    } else {
      await generateAllWeeks(options.sport, options.season);
    }
  } else {
    const weekOrDate = options.sport === 'NBA' ? options.date : options.week;
    await generateStatic(options.sport, options.season, weekOrDate);
  }

  console.log(`\n✨ Done!\n`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
