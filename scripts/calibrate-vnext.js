#!/usr/bin/env node

/**
 * vNext Calibration Script
 *
 * Analyzes a corpus of games to establish normalization reference values.
 * Generates percentile distributions for Volatility, Surprise, and Finish metrics.
 *
 * Usage:
 *   node scripts/calibrate-vnext.js --sport NFL --season 2024
 *   node scripts/calibrate-vnext.js --sport NBA --season 2024
 *   node scripts/calibrate-vnext.js --all
 */

import { scoreGame, _testing } from '../shared/algorithm-vnext.js';
import { fetchAllProbabilities } from '../api/calculator.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PUBLIC_DATA_DIR = join(ROOT_DIR, 'public', 'data');
const ANALYSIS_DIR = join(ROOT_DIR, 'analysis');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  sport: null,
  season: null,
  all: false
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--sport' && i + 1 < args.length) {
    options.sport = args[++i].toUpperCase();
  } else if (arg === '--season' && i + 1 < args.length) {
    options.season = parseInt(args[++i]);
  } else if (arg === '--all') {
    options.all = true;
  } else if (arg === '--help' || arg === '-h') {
    printUsage();
    process.exit(0);
  }
}

function printUsage() {
  console.log(`
vNext Calibration Script

Usage: node scripts/calibrate-vnext.js [options]

Options:
  --sport <NFL|CFB|NBA>    Sport to calibrate (required unless --all)
  --season <year>          Season year (required unless --all)
  --all                    Calibrate all available sports and seasons
  --help, -h               Show this help message

Examples:
  node scripts/calibrate-vnext.js --sport NFL --season 2024
  node scripts/calibrate-vnext.js --sport NBA --season 2024
  node scripts/calibrate-vnext.js --all
`);
}

/**
 * Calculate percentiles from a sorted array of values.
 */
function calculatePercentiles(sortedValues) {
  if (sortedValues.length === 0) return {};

  const getPercentile = (p) => {
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  };

  return {
    p10: getPercentile(10),
    p25: getPercentile(25),
    p50: getPercentile(50),
    p75: getPercentile(75),
    p90: getPercentile(90),
    p95: getPercentile(95),
    p99: getPercentile(99),
    min: sortedValues[0],
    max: sortedValues[sortedValues.length - 1]
  };
}

/**
 * Generate a text-based histogram for distribution visualization.
 */
function generateHistogram(values, buckets = 10) {
  if (values.length === 0) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const bucketSize = range / buckets;

  // Initialize buckets
  const histogram = new Array(buckets).fill(0);

  // Fill buckets
  values.forEach(v => {
    let bucketIndex = Math.floor((v - min) / bucketSize);
    if (bucketIndex >= buckets) bucketIndex = buckets - 1;
    histogram[bucketIndex]++;
  });

  // Find max count for scaling
  const maxCount = Math.max(...histogram);
  const barWidth = 50;

  // Generate output
  let output = '\n';
  for (let i = 0; i < buckets; i++) {
    const bucketMin = (min + i * bucketSize).toFixed(2);
    const bucketMax = (min + (i + 1) * bucketSize).toFixed(2);
    const count = histogram[i];
    const barLength = Math.round((count / maxCount) * barWidth);
    const bar = '█'.repeat(barLength);
    output += `${bucketMin.padStart(8)} - ${bucketMax.padEnd(8)} | ${bar} ${count}\n`;
  }

  return output;
}

/**
 * Load all game IDs from static JSON files for a sport/season.
 */
async function loadGameIdsFromStatic(sport, season) {
  const sportDir = join(PUBLIC_DATA_DIR, sport.toLowerCase(), season.toString());

  if (!existsSync(sportDir)) {
    console.log(`  ⚠️  No static data found for ${sport} ${season}`);
    return [];
  }

  const fs = await import('fs/promises');
  const files = await fs.readdir(sportDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const allGames = [];

  for (const file of jsonFiles) {
    try {
      const filePath = join(sportDir, file);
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (data.games && Array.isArray(data.games)) {
        data.games.forEach(game => {
          allGames.push({
            id: game.id,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            overtime: game.overtime || false,
            week: data.metadata?.week || file.replace('.json', '')
          });
        });
      }
    } catch (error) {
      console.error(`  ❌ Error reading ${file}:`, error.message);
    }
  }

  return allGames;
}

/**
 * Score all games for a sport/season and collect raw metric values.
 */
async function scoreGamesForSport(sport, season) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Scoring ${sport} ${season} games...`);
  console.log('='.repeat(60));

  const games = await loadGameIdsFromStatic(sport, season);

  if (games.length === 0) {
    console.log('  No games found.');
    return null;
  }

  console.log(`  Found ${games.length} games`);

  const results = [];
  const rawMetrics = {
    volatility: [],
    surprise: [],
    finish: []
  };

  let scoredCount = 0;
  let failedCount = 0;

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    process.stdout.write(`\r  Progress: ${i + 1}/${games.length} (${scoredCount} scored, ${failedCount} failed)`);

    try {
      // Fetch probabilities
      const probabilities = await fetchAllProbabilities(game.id, sport);

      if (!probabilities || probabilities.length === 0) {
        failedCount++;
        continue;
      }

      // Convert ESPN format to algorithm format
      const probs = probabilities.map(p => ({
        value: p.homeWinPercentage,
        period: p.period,
        clock: p.clock?.displayValue
      }));

      // Score the game (without normalizers to get raw values)
      const result = scoreGame(probs, { sport, overtime: game.overtime }, null);

      if (!result) {
        failedCount++;
        continue;
      }

      // Collect raw metrics
      rawMetrics.volatility.push(result.diagnostics.rawVolatility);
      rawMetrics.surprise.push(result.diagnostics.rawSurprise);
      rawMetrics.finish.push(result.diagnostics.rawFinish);

      results.push({
        id: game.id,
        matchup: `${game.awayTeam} @ ${game.homeTeam}`,
        week: game.week,
        score: result.score,
        rawVolatility: result.diagnostics.rawVolatility,
        rawSurprise: result.diagnostics.rawSurprise,
        rawFinish: result.diagnostics.rawFinish,
        dataPoints: result.diagnostics.dataPoints
      });

      scoredCount++;

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      failedCount++;
      // Continue on error
    }
  }

  console.log(`\n  ✅ Scored ${scoredCount} games (${failedCount} failed)\n`);

  return {
    games: results,
    rawMetrics
  };
}

/**
 * Generate normalizers from raw metric distributions.
 */
function generateNormalizers(sport, rawMetrics) {
  const normalizers = {};

  ['volatility', 'surprise', 'finish'].forEach(metric => {
    const values = [...rawMetrics[metric]].sort((a, b) => a - b);

    if (values.length === 0) {
      console.log(`\n  ${metric.toUpperCase()} Distribution: No data`);
      normalizers[metric] = { p50: 0, p95: 1 };
      return;
    }

    const percentiles = calculatePercentiles(values);

    normalizers[metric] = {
      p50: percentiles.p50,
      p95: percentiles.p95
    };

    console.log(`\n  ${metric.toUpperCase()} Distribution:`);
    console.log(`    Min:  ${percentiles.min.toFixed(3)}`);
    console.log(`    P10:  ${percentiles.p10.toFixed(3)}`);
    console.log(`    P25:  ${percentiles.p25.toFixed(3)}`);
    console.log(`    P50:  ${percentiles.p50.toFixed(3)}`);
    console.log(`    P75:  ${percentiles.p75.toFixed(3)}`);
    console.log(`    P90:  ${percentiles.p90.toFixed(3)}`);
    console.log(`    P95:  ${percentiles.p95.toFixed(3)}`);
    console.log(`    P99:  ${percentiles.p99.toFixed(3)}`);
    console.log(`    Max:  ${percentiles.max.toFixed(3)}`);
    console.log(generateHistogram(values, 12));
  });

  return normalizers;
}

/**
 * Display top and bottom games for sanity checking.
 */
function displayTopBottomGames(sport, games) {
  if (games.length === 0) return;

  // Sort by score
  const sorted = [...games].sort((a, b) => b.score - a.score);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏆 TOP 10 GAMES (${sport})`);
  console.log('='.repeat(60));
  sorted.slice(0, 10).forEach((game, i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${game.matchup.padEnd(30)} | Score: ${game.score.toFixed(1)} | Week: ${game.week}`);
    console.log(`    V: ${game.rawVolatility.toFixed(2)}, S: ${game.rawSurprise.toFixed(2)}, F: ${game.rawFinish.toFixed(2)}`);
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`💤 BOTTOM 10 GAMES (${sport})`);
  console.log('='.repeat(60));
  sorted.slice(-10).reverse().forEach((game, i) => {
    console.log(`${(sorted.length - 9 + i).toString().padStart(2)}. ${game.matchup.padEnd(30)} | Score: ${game.score.toFixed(1)} | Week: ${game.week}`);
    console.log(`    V: ${game.rawVolatility.toFixed(2)}, S: ${game.rawSurprise.toFixed(2)}, F: ${game.rawFinish.toFixed(2)}`);
  });
}

/**
 * Main calibration routine.
 */
async function calibrate() {
  const allNormalizers = {};

  // Determine which sports/seasons to process
  const tasks = [];

  if (options.all) {
    // Process all available data
    console.log('🔄 Calibrating all available sports and seasons...\n');

    // Check what's available in public/data
    const fs = await import('fs/promises');
    const sports = await fs.readdir(PUBLIC_DATA_DIR);

    for (const sport of sports) {
      if (sport === '.gitkeep') continue;

      const sportDir = join(PUBLIC_DATA_DIR, sport);
      const stat = await fs.stat(sportDir);
      if (!stat.isDirectory()) continue;

      const seasons = await fs.readdir(sportDir);
      for (const season of seasons) {
        if (season === '.gitkeep') continue;

        const seasonNum = parseInt(season);
        if (isNaN(seasonNum)) continue;

        tasks.push({ sport: sport.toUpperCase(), season: seasonNum });
      }
    }
  } else {
    // Process specified sport/season
    if (!options.sport || !options.season) {
      console.error('Error: --sport and --season are required unless using --all');
      printUsage();
      process.exit(1);
    }

    tasks.push({ sport: options.sport, season: options.season });
  }

  console.log(`📋 Processing ${tasks.length} sport/season combination(s)\n`);

  // Process each task
  for (const task of tasks) {
    const result = await scoreGamesForSport(task.sport, task.season);

    if (!result) continue;

    const normalizers = generateNormalizers(task.sport, result.rawMetrics);
    allNormalizers[task.sport] = normalizers;

    displayTopBottomGames(task.sport, result.games);
  }

  // Save normalizers
  if (Object.keys(allNormalizers).length > 0) {
    const outputPath = join(ANALYSIS_DIR, 'vnext-normalizers.json');

    // Ensure analysis directory exists
    if (!existsSync(ANALYSIS_DIR)) {
      await mkdir(ANALYSIS_DIR, { recursive: true });
    }

    const output = {
      generated: new Date().toISOString(),
      description: 'Normalizer values for vNext scoring algorithm, derived from percentile analysis',
      ...allNormalizers
    };

    await writeFile(outputPath, JSON.stringify(output, null, 2));

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Normalizers saved to: ${outputPath}`);
    console.log('='.repeat(60));
    console.log('\nGenerated normalizers:');
    console.log(JSON.stringify(allNormalizers, null, 2));
  } else {
    console.log('\n⚠️  No normalizers generated (no data processed)');
  }
}

// Run calibration
calibrate().catch(error => {
  console.error('\n❌ Calibration failed:', error);
  process.exit(1);
});
