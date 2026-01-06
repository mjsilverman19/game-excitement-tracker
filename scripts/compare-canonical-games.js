#!/usr/bin/env node

// Benchmark canonical “great games” against current algorithm outputs.
// Loads a curated list, computes excitement + breakdown via existing calculator,
// and reports rank percentile within the same sport/season using locally cached data when available.

import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { analyzeGameEntertainment } from '../api/calculator.js';
import { fetchSingleGame } from '../api/fetcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CANONICAL_PATH = join(ROOT, 'analysis', 'canonical-games.json');
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
    excitement: '',
    uncertainty: '',
    drama: '',
    finish: '',
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
    row.uncertainty = analysis.breakdown?.uncertainty ?? '';
    row.drama = analysis.breakdown?.drama ?? '';
    row.finish = analysis.breakdown?.finish ?? '';

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

function printCsv(rows) {
  console.log('sport,season,gameId,label,excitement,uncertainty,drama,finish,rankPercentile,note');
  for (const r of rows) {
    const fields = [
      r.sport,
      r.season,
      r.gameId,
      `"${(r.label || '').replace(/"/g, '""')}"`,
      r.excitement,
      formatNumber(r.uncertainty),
      formatNumber(r.drama),
      formatNumber(r.finish),
      r.rankPercentile,
      `"${(r.note || '').replace(/"/g, '""')}"`
    ];
    console.log(fields.join(','));
  }
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

  console.log('\nCSV output:\n');
  printCsv(results);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
