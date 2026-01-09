#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

import { ALGORITHM_CONFIG } from '../shared/algorithm-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_ROOT = join(ROOT, 'public', 'data');
const OUTPUT_PATH = join(ROOT, 'analysis', 'distribution-summary.json');

async function collectJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectJsonFiles(fullPath);
      files.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function stdDev(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function summarize(values) {
  if (!values.length) {
    return {
      count: 0,
      mean: null,
      median: null,
      stdDev: null,
      min: null,
      max: null
    };
  }
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    stdDev: stdDev(values),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function formatNumber(value, decimals = 2) {
  return typeof value === 'number' ? value.toFixed(decimals) : 'n/a';
}

function getTierLabel(score) {
  if (score >= ALGORITHM_CONFIG.tiers.mustWatch.min) return 'must-watch';
  if (score >= ALGORITHM_CONFIG.tiers.recommended.min) return 'recommended';
  return 'skip';
}

function bucketLabel(score) {
  if (score >= 9) return '9-10';
  const bucketStart = Math.max(1, Math.floor(score));
  return `${bucketStart}-${bucketStart + 1}`;
}

function buildHistogram(scores) {
  const labels = [];
  for (let start = 1; start <= 9; start += 1) {
    labels.push(`${start}-${start + 1}`);
  }

  const counts = Object.fromEntries(labels.map(label => [label, 0]));
  for (const score of scores) {
    const label = bucketLabel(score);
    if (counts[label] != null) counts[label] += 1;
  }

  return { labels, counts };
}

async function loadGames() {
  const files = await collectJsonFiles(DATA_ROOT);
  const games = [];

  for (const filePath of files) {
    const relPath = relative(DATA_ROOT, filePath);
    const parts = relPath.split(sep);
    const sport = parts[0] ? parts[0].toUpperCase() : 'UNKNOWN';

    try {
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      const fileGames = Array.isArray(data.games) ? data.games : [];
      for (const game of fileGames) {
        games.push({ ...game, _sport: sport });
      }
    } catch (err) {
      console.warn(`⚠️  Skipping ${filePath}: ${err.message}`);
    }
  }

  return games;
}

async function main() {
  if (!existsSync(DATA_ROOT)) {
    console.error(`Data folder not found: ${DATA_ROOT}`);
    process.exit(1);
  }

  const games = await loadGames();
  const scoredGames = games.filter(g => typeof g.excitement === 'number');

  const excitementScores = scoredGames.map(g => g.excitement);
  const breakdownGames = scoredGames.filter(g => g.breakdown);
  const tensions = breakdownGames.map(g => g.breakdown?.tension).filter(v => typeof v === 'number');
  const dramas = breakdownGames.map(g => g.breakdown?.drama).filter(v => typeof v === 'number');
  const finishes = breakdownGames.map(g => g.breakdown?.finish).filter(v => typeof v === 'number');

  const perSport = {};
  for (const game of scoredGames) {
    const sport = game._sport || 'UNKNOWN';
    perSport[sport] = perSport[sport] || [];
    perSport[sport].push(game.excitement);
  }

  const tiers = { 'must-watch': 0, recommended: 0, skip: 0 };
  for (const score of excitementScores) {
    tiers[getTierLabel(score)] += 1;
  }

  const histogram = buildHistogram(excitementScores);

  const overallStats = summarize(excitementScores);
  const metricStats = {
    tension: summarize(tensions),
    drama: summarize(dramas),
    finish: summarize(finishes)
  };

  const perSportStats = {};
  for (const [sport, scores] of Object.entries(perSport)) {
    perSportStats[sport] = summarize(scores);
  }

  const dataSummary = {
    totalGames: scoredGames.length,
    sports: Object.keys(perSportStats)
  };

  console.log('=== GEI Score Distribution Analysis ===');
  console.log(`Data: ${dataSummary.totalGames} games across ${dataSummary.sports.join('/')}`);
  console.log('');
  console.log('Overall Statistics:');
  console.log(
    `  Mean: ${formatNumber(overallStats.mean)}    Median: ${formatNumber(overallStats.median)}    Std Dev: ${formatNumber(overallStats.stdDev)}`
  );
  console.log(`  Min: ${formatNumber(overallStats.min)}      Max: ${formatNumber(overallStats.max)}`);
  console.log('');
  console.log('Tier Distribution:');
  const total = excitementScores.length || 1;
  const mustWatchPct = (tiers['must-watch'] / total) * 100;
  const recommendedPct = (tiers.recommended / total) * 100;
  const skipPct = (tiers.skip / total) * 100;
  console.log(
    `  Must Watch (≥${ALGORITHM_CONFIG.tiers.mustWatch.min}):   ${tiers['must-watch']} games (${formatNumber(mustWatchPct, 1)}%)`
  );
  console.log(
    `  Recommended (≥${ALGORITHM_CONFIG.tiers.recommended.min}): ${tiers.recommended} games (${formatNumber(recommendedPct, 1)}%)`
  );
  console.log(
    `  Skip (<${ALGORITHM_CONFIG.tiers.recommended.min}):         ${tiers.skip} games (${formatNumber(skipPct, 1)}%)`
  );
  console.log('');
  console.log('Per-Sport:');
  for (const [sport, stats] of Object.entries(perSportStats)) {
    console.log(
      `  ${sport}: ${stats.count} games, mean ${formatNumber(stats.mean)}, std ${formatNumber(stats.stdDev)}`
    );
  }
  console.log('');
  console.log('Metric Averages:');
  console.log(`  Tension: ${formatNumber(metricStats.tension.mean)} (std ${formatNumber(metricStats.tension.stdDev)})`);
  console.log(`  Drama:   ${formatNumber(metricStats.drama.mean)} (std ${formatNumber(metricStats.drama.stdDev)})`);
  console.log(`  Finish:  ${formatNumber(metricStats.finish.mean)} (std ${formatNumber(metricStats.finish.stdDev)})`);
  console.log('');
  console.log('Histogram:');
  const maxCount = Math.max(...Object.values(histogram.counts), 1);
  for (const label of histogram.labels) {
    const count = histogram.counts[label];
    const barLength = Math.round((count / maxCount) * 20);
    const bar = '#'.repeat(barLength);
    const pct = (count / total) * 100;
    console.log(`  ${label}: ${bar} ${count} (${formatNumber(pct, 1)}%)`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    data: dataSummary,
    overall: overallStats,
    tiers: {
      thresholds: {
        mustWatch: ALGORITHM_CONFIG.tiers.mustWatch.min,
        recommended: ALGORITHM_CONFIG.tiers.recommended.min
      },
      counts: tiers,
      percentages: {
        mustWatch: mustWatchPct,
        recommended: recommendedPct,
        skip: skipPct
      }
    },
    perSport: perSportStats,
    metrics: metricStats,
    histogram
  };

  await mkdir(join(ROOT, 'analysis'), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
