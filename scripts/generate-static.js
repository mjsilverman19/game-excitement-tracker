#!/usr/bin/env node

// Static JSON Generator for Game Excitement Tracker
// Generates pre-computed static JSON files for historical game data

import { createRequire } from 'module';
import { fetchGames } from '../api/fetcher.js';
import { analyzeGameEntertainment } from '../api/calculator.js';

const require = createRequire(import.meta.url);
const { ALGORITHM_CONFIG } = require('../js/algorithm-config.js');
import { writeFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PUBLIC_DATA_DIR = join(ROOT_DIR, 'public', 'data');
const FIXTURES_DIR = join(ROOT_DIR, 'fixtures');
const NO_NETWORK = process.env.NO_NETWORK === '1';
const NO_NETWORK_OUTDIR = process.env.NO_NETWORK_OUTDIR;

// Command line argument parsing
const args = process.argv.slice(2);
const options = {
  sport: null,
  season: null,
  week: null,
  date: null,
  all: false,
  force: false
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
  --week <number|bowls|playoffs>    Week number, 'bowls', or 'playoffs' for CFB postseason (required unless --all or NBA)
  --date <YYYY-MM-DD>      Date for NBA games (required for NBA unless --all)
  --all                    Generate all weeks/dates for the season
  --force                  Overwrite existing files
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
    let { dir, filepath } = getStaticFilePath(sport, season, weekOrDate);

    // Check if file already exists
    if (existsSync(filepath) && !options.force) {
      console.log(`⏭️  Skipping ${filepath} (already exists, use --force to overwrite)`);
      return { skipped: true };
    }

    if (NO_NETWORK) {
      console.log(`📦 NO_NETWORK enabled. Writing fixture data for ${sport} ${weekOrDate}...`);
      const fixturePath = join(FIXTURES_DIR, 'offline-static.json');
      const fixtureData = JSON.parse(await readFile(fixturePath, 'utf8'));

      const metadata = {
        ...fixtureData.metadata,
        sport,
        season,
        generatedAt: new Date().toISOString(),
        algorithmVersion: ALGORITHM_CONFIG.version
      };

      if (sport === 'NBA') {
        metadata.date = weekOrDate;
      } else {
        metadata.week = weekOrDate;
      }

      if (NO_NETWORK_OUTDIR) {
        const relativePath = filepath.replace(`${PUBLIC_DATA_DIR}/`, '');
        filepath = join(NO_NETWORK_OUTDIR, relativePath);
        dir = dirname(filepath);
      }

      const responseData = {
        ...fixtureData,
        success: true,
        metadata
      };

      await mkdir(dir, { recursive: true });
      await writeFile(filepath, JSON.stringify(responseData, null, 2), 'utf8');
      console.log(`✅ Generated ${filepath} (fixture data)`);
      return { success: true, count: responseData.games.length };
    }

    console.log(`📥 Fetching ${sport} data for ${weekOrDate}...`);

    // Fetch games from ESPN API
    let games;
    const seasonType = sport === 'CFB' && weekOrDate === 'bowls' ? '3' : '2';

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
      source: 'ESPN Win Probability Analysis',
      algorithmVersion: ALGORITHM_CONFIG.version
    };

    if (sport === 'NBA') {
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
