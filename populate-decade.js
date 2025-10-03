#!/usr/bin/env node
// Batch script to populate multiple NFL seasons efficiently
// Usage: node populate-decade.js --start-year 2015 --end-year 2024

import 'dotenv/config';
import { spawn } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    startYear: 2015,
    endYear: 2024,
    parallel: false,
    skipRegular: false,
    skipPlayoffs: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--start-year':
        options.startYear = parseInt(args[++i]);
        break;
      case '--end-year':
        options.endYear = parseInt(args[++i]);
        break;
      case '--parallel':
        options.parallel = true;
        break;
      case '--skip-regular':
        options.skipRegular = true;
        break;
      case '--skip-playoffs':
        options.skipPlayoffs = true;
        break;
      case '--help':
        console.log(`
Usage: node populate-decade.js [options]

Options:
  --start-year <year>      First year to populate (default: 2015)
  --end-year <year>        Last year to populate (default: 2024)
  --parallel               Run multiple years simultaneously (faster but more API load)
  --skip-regular           Skip regular season games (playoffs only)
  --skip-playoffs          Skip playoff games (regular season only)
  --help                   Show this help message

Examples:
  node populate-decade.js --start-year 2015 --end-year 2024
  node populate-decade.js --start-year 2020 --end-year 2023 --parallel
  node populate-decade.js --start-year 2015 --end-year 2024 --skip-regular
        `);
        process.exit(0);
    }
  }

  return options;
}

// Run a command and return a promise
function runCommand(command, args, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 ${description}`);
    console.log(`   Command: node ${command} ${args.join(' ')}`);

    const child = spawn('node', [command, ...args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${description} - SUCCESS`);
        resolve();
      } else {
        console.error(`❌ ${description} - FAILED (code ${code})`);
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error(`💥 ${description} - ERROR:`, error.message);
      reject(error);
    });
  });
}

// Populate a single season
async function populateSeason(year, options) {
  const tasks = [];

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`📅 Populating ${year} NFL Season`);
  console.log(`═══════════════════════════════════════════`);

  try {
    // Regular season
    if (!options.skipRegular) {
      await runCommand('populate-games.js', [
        '--sport', 'NFL',
        '--season', year.toString(),
        '--weeks', '1-18'
      ], `${year} Regular Season (weeks 1-18)`);
    }

    // Playoffs
    if (!options.skipPlayoffs) {
      // Wild Card
      await runCommand('populate-games.js', [
        '--sport', 'NFL',
        '--season', year.toString(),
        '--week', '1',
        '--season-type', '3'
      ], `${year} Wild Card`);

      // Divisional
      await runCommand('populate-games.js', [
        '--sport', 'NFL',
        '--season', year.toString(),
        '--week', '2',
        '--season-type', '3'
      ], `${year} Divisional Round`);

      // Conference Championships
      await runCommand('populate-games.js', [
        '--sport', 'NFL',
        '--season', year.toString(),
        '--week', '3',
        '--season-type', '3'
      ], `${year} Conference Championships`);

      // Super Bowl (try both week 4 and 5)
      try {
        await runCommand('populate-games.js', [
          '--sport', 'NFL',
          '--season', year.toString(),
          '--week', '4',
          '--season-type', '3'
        ], `${year} Super Bowl (week 4)`);
      } catch (error) {
        console.log(`⚠️  No Super Bowl in week 4, trying week 5...`);
        try {
          await runCommand('populate-games.js', [
            '--sport', 'NFL',
            '--season', year.toString(),
            '--week', '5',
            '--season-type', '3'
          ], `${year} Super Bowl (week 5)`);
        } catch (error2) {
          console.log(`⚠️  No Super Bowl found for ${year} in week 4 or 5`);
        }
      }
    }

    console.log(`\n✅ ${year} season population complete!`);
    return { year, success: true };

  } catch (error) {
    console.error(`\n❌ ${year} season population failed:`, error.message);
    return { year, success: false, error: error.message };
  }
}

// Main execution
async function main() {
  const options = parseArgs();
  const years = [];

  for (let year = options.startYear; year <= options.endYear; year++) {
    years.push(year);
  }

  console.log('\n🏈 NFL Decade Population');
  console.log('========================');
  console.log(`Years: ${options.startYear}-${options.endYear} (${years.length} seasons)`);
  console.log(`Mode: ${options.parallel ? 'Parallel' : 'Sequential'}`);
  console.log(`Regular season: ${options.skipRegular ? 'SKIP' : 'INCLUDE'}`);
  console.log(`Playoffs: ${options.skipPlayoffs ? 'SKIP' : 'INCLUDE'}`);

  const startTime = Date.now();
  const results = [];

  if (options.parallel) {
    console.log('\n⚡ Running years in parallel...');
    const promises = years.map(year => populateSeason(year, options));
    const parallelResults = await Promise.allSettled(promises);

    parallelResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({ year: years[index], success: false, error: result.reason.message });
      }
    });
  } else {
    console.log('\n🔄 Running years sequentially...');
    for (const year of years) {
      const result = await populateSeason(year, options);
      results.push(result);

      // Small delay between seasons to be respectful to ESPN API
      if (year < options.endYear) {
        console.log('\n⏱️  Waiting 2 seconds before next season...');
        await sleep(2000);
      }
    }
  }

  // Summary
  const endTime = Date.now();
  const totalTime = Math.round((endTime - startTime) / 1000);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n\n═══════════════════════════════════════════');
  console.log('📊 Decade Population Summary');
  console.log('═══════════════════════════════════════════');
  console.log(`Total seasons: ${years.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total time: ${totalTime} seconds`);

  if (failed > 0) {
    console.log('\n❌ Failed seasons:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`   ${result.year}: ${result.error}`);
    });
  }

  console.log('\n🎯 Next step: Calculate entertainment scores');
  console.log(`node recalculate-scores.js --sport NFL --dry-run`);
  console.log('\n✨ Done!\n');
}

// Run the script
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});