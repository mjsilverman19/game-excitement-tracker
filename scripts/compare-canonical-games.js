#!/usr/bin/env node

// Benchmark canonical “great games” against current algorithm outputs.
// Loads a curated list, computes excitement + breakdown via existing calculator,
// and reports rank percentile within the same sport/season using locally cached data when available.

import { readFile, readdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { analyzeGameEntertainment } from '../api/calculator.js';
import { fetchSingleGame } from '../api/fetcher.js';
import { getTier } from '../shared/algorithm-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CANONICAL_PATH = join(ROOT, 'analysis', 'canonical-games.json');
const RESULTS_PATH = join(ROOT, 'analysis', 'canonical-v2.4-results.csv');
const DATA_ROOT = join(ROOT, 'public', 'data');

const seasonCache = new Map();

async function loadCanonicalList() {
  const raw = await readFile(CANONICAL_PATH, 'utf8');
  return JSON.parse(raw);
}

async function loadSeasonScores(sport, season) {
  const cacheKey = `${sport}-${season}`;
  if (seasonCache.has(cacheKey)) return seasonCache.get(cacheKey);

  const dir = join(DATA_ROOT, sport.toLowerCase(), String(season));
  if (!existsSync(dir)) {
    seasonCache.set(cacheKey, null);
    return null;
  }

  const files = (await readdir(dir)).filter(name => name.endsWith('.json'));
  const scores = [];

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const data = JSON.parse(await readFile(filePath, 'utf8'));
      (data.games || []).forEach(g => {
        if (typeof g.excitement === 'number') scores.push(g.excitement);
      });
    } catch (err) {
      console.warn(`⚠️  Skipping ${filePath}: ${err.message}`);
    }
  }

  if (scores.length === 0) {
    seasonCache.set(cacheKey, null);
    return null;
  }

  seasonCache.set(cacheKey, scores);
  return scores;
}

function percentile(score, scores) {
  if (score == null || !scores || scores.length === 0) return null;
  const total = scores.length;
  const higherOrEqual = scores.filter(s => s >= score).length;
  const pct = (higherOrEqual / total) * 100;
  return Math.round(pct * 10) / 10; // one decimal place
}

function formatNumber(value) {
  return typeof value === 'number' ? value.toFixed(2) : '';
}

async function evaluateGame(entry) {
  const row = {
    sport: entry.sport,
    season: entry.season,
    gameId: entry.gameId,
    label: entry.label,
    expectedTier: entry.expectedTier || '',
    excitement: '',
    tension: '',
    drama: '',
    finish: '',
    actualTier: '',
    status: '',
    rankPercentile: '',
    note: ''
  };

  try {
    const baseGame = await fetchSingleGame(entry.sport, entry.gameId);
    const analysis = await analyzeGameEntertainment(baseGame, entry.sport);

    if (!analysis) {
      row.note = 'No probability data (analysis returned null)';
      return row;
    }

    row.excitement = analysis.excitement;
    row.tension = analysis.breakdown?.tension ?? '';
    row.drama = analysis.breakdown?.drama ?? '';
    row.finish = analysis.breakdown?.finish ?? '';
    const actualTier = getTier(analysis.excitement);
    row.actualTier = actualTier?.cssClass || '';
    row.status = row.expectedTier && row.actualTier
      ? row.expectedTier === row.actualTier
        ? 'PASS'
        : 'FAIL'
      : '';

    const seasonScores = await loadSeasonScores(entry.sport, entry.season);
    const pct = percentile(analysis.excitement, seasonScores);
    row.rankPercentile = pct == null ? '' : pct;
    if (pct == null && !seasonScores) {
      row.note = 'Season scores not cached locally';
    }

    return row;
  } catch (err) {
    row.note = err.message;
    return row;
  }
}

function buildCsv(rows) {
  const lines = [];
  lines.push('sport,season,gameId,label,expectedTier,actualTier,status,excitement,tension,drama,finish,rankPercentile,note');
  for (const r of rows) {
    const fields = [
      r.sport,
      r.season,
      r.gameId,
      `"${(r.label || '').replace(/"/g, '""')}"`,
      r.expectedTier,
      r.actualTier,
      r.status,
      r.excitement,
      formatNumber(r.tension),
      formatNumber(r.drama),
      formatNumber(r.finish),
      r.rankPercentile,
      `"${(r.note || '').replace(/"/g, '""')}"`
    ];
    lines.push(fields.join(','));
  }
  return lines.join('\n');
}

function printSummaryTable(rows) {
  const header = [
    'Game',
    'Score',
    'Expected',
    'Actual',
    'Status',
    'Tension',
    'Drama',
    'Finish'
  ];
  const widths = [44, 7, 12, 12, 8, 8, 8, 8];
  const pad = (value, width) => String(value).padEnd(width, ' ');

  const line = header.map((h, i) => pad(h, widths[i])).join(' ');
  console.log(line);
  console.log('-'.repeat(line.length));

  for (const r of rows) {
    const row = [
      (r.label || '').slice(0, 43),
      formatNumber(r.excitement),
      r.expectedTier || '',
      r.actualTier || '',
      r.status || '',
      formatNumber(r.tension),
      formatNumber(r.drama),
      formatNumber(r.finish)
    ];
    console.log(row.map((v, i) => pad(v, widths[i])).join(' '));
  }
}

function summarizeResults(rows) {
  const scored = rows.filter(r => typeof r.excitement === 'number');
  const passes = scored.filter(r => r.status === 'PASS').length;
  const total = scored.length;
  const accuracy = total ? Math.round((passes / total) * 1000) / 10 : 0;

  const discrepancies = rows.filter(r => {
    if (typeof r.excitement !== 'number') return false;
    if (r.expectedTier === 'must-watch' && r.excitement < 7) return true;
    if (r.expectedTier === 'recommended' && r.excitement < 6) return true;
    if (r.expectedTier === 'skip' && r.excitement >= 6) return true;
    return false;
  });

  return { passes, total, accuracy, discrepancies };
}

async function main() {
  const canonical = await loadCanonicalList();
  console.log(`Benchmarking ${canonical.length} canonical games...`);

  const results = [];
  for (const entry of canonical) {
    console.log(`→ ${entry.sport} ${entry.season} ${entry.label}`);
    const row = await evaluateGame(entry);
    results.push(row);
  }

  console.log('\nSummary Table:\n');
  printSummaryTable(results);

  const { passes, total, accuracy, discrepancies } = summarizeResults(results);
  console.log(`\nAccuracy: ${passes}/${total} (${accuracy}%)`);
  if (discrepancies.length > 0) {
    console.log('\nLargest Discrepancies:');
    for (const entry of discrepancies) {
      console.log(`- ${entry.label}: expected ${entry.expectedTier}, got ${formatNumber(entry.excitement)} (${entry.actualTier || 'n/a'})`);
    }
  }

  const csvOutput = buildCsv(results);
  await writeFile(RESULTS_PATH, `${csvOutput}\n`, 'utf8');
  console.log(`\nCSV output saved to ${RESULTS_PATH}`);
  console.log('\nCSV output:\n');
  console.log(csvOutput);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
