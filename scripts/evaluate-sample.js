#!/usr/bin/env node

// Evaluate a targeted sample of games without regenerating static JSON files.
// Defaults to outlier report; use --source canonical to test canonical list.

import { readFile, readdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { analyzeGameEntertainment } from '../api/calculator.js';
import { fetchSingleGame } from '../api/fetcher.js';
import { getTier } from '../shared/algorithm-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTLIERS_PATH = join(ROOT, 'analysis', 'outliers-report.json');
const CANONICAL_PATH = join(ROOT, 'analysis', 'canonical-games.json');
const DATA_ROOT = join(ROOT, 'public', 'data');
const OUTPUT_PATH = join(ROOT, 'analysis', 'sample-eval.csv');

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { source: 'outliers', limit: null, flag: null };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--source' && args[i + 1]) {
      config.source = args[i + 1];
      i += 1;
    } else if (arg === '--limit' && args[i + 1]) {
      config.limit = Number.parseInt(args[i + 1], 10);
      i += 1;
    } else if (arg === '--flag' && args[i + 1]) {
      config.flag = args[i + 1];
      i += 1;
    }
  }

  return config;
}

async function loadSource(config) {
  if (config.source === 'canonical') {
    if (!existsSync(CANONICAL_PATH)) {
      throw new Error(`Missing canonical list: ${CANONICAL_PATH}`);
    }
    const raw = await readFile(CANONICAL_PATH, 'utf8');
    const items = JSON.parse(raw);
    return items.map(item => ({
      sport: item.sport,
      season: item.season,
      gameId: item.gameId,
      label: item.label,
      expectedTier: item.expectedTier || '',
      prior: null
    }));
  }

  if (!existsSync(OUTLIERS_PATH)) {
    throw new Error(`Missing outliers report: ${OUTLIERS_PATH}`);
  }
  const raw = await readFile(OUTLIERS_PATH, 'utf8');
  const report = JSON.parse(raw);
  let outliers = report.outliers;
  if (config.flag) {
    outliers = outliers.filter(item => Array.isArray(item.flags) && item.flags.includes(config.flag));
  }

  return outliers.map(item => ({
    sport: item.sport,
    season: item.season,
    gameId: item.gameId,
    label: item.teams || item.gameId,
    expectedTier: '',
    prior: {
      excitement: item.excitement,
      breakdown: item.breakdown,
      overtime: item.overtime,
      margin: item.margin,
      flags: item.flags
    }
  }));
}

async function loadSeasonFileScores(sport, season, gameId) {
  const dir = join(DATA_ROOT, String(sport).toLowerCase(), String(season));
  if (!existsSync(dir)) return null;
  const files = (await readdir(dir)).filter(name => name.endsWith('.json'));

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const data = JSON.parse(await readFile(filePath, 'utf8'));
      const games = Array.isArray(data.games) ? data.games : [];
      const match = games.find(g => String(g.id) === String(gameId));
      if (match) {
        return {
          excitement: match.excitement,
          breakdown: match.breakdown,
          overtime: match.overtime,
          margin:
            typeof match.homeScore === 'number' && typeof match.awayScore === 'number'
              ? Math.abs(match.homeScore - match.awayScore)
              : null
        };
      }
    } catch (err) {
      console.warn(`⚠️  Skipping ${filePath}: ${err.message}`);
    }
  }

  return null;
}

function formatNumber(value) {
  return typeof value === 'number' ? value.toFixed(2) : '';
}

function buildCsv(rows) {
  const header = [
    'sport',
    'season',
    'gameId',
    'label',
    'priorExcitement',
    'newExcitement',
    'delta',
    'priorTier',
    'newTier',
    'priorTension',
    'priorDrama',
    'priorFinish',
    'newTension',
    'newDrama',
    'newFinish',
    'note'
  ];
  const lines = [header.join(',')];

  for (const row of rows) {
    const fields = [
      row.sport,
      row.season,
      row.gameId,
      `"${(row.label || '').replace(/"/g, '""')}"`,
      row.priorExcitement ?? '',
      row.newExcitement ?? '',
      row.delta ?? '',
      row.priorTier ?? '',
      row.newTier ?? '',
      formatNumber(row.priorBreakdown?.tension),
      formatNumber(row.priorBreakdown?.drama),
      formatNumber(row.priorBreakdown?.finish),
      formatNumber(row.newBreakdown?.tension),
      formatNumber(row.newBreakdown?.drama),
      formatNumber(row.newBreakdown?.finish),
      `"${(row.note || '').replace(/"/g, '""')}"`
    ];
    lines.push(fields.join(','));
  }

  return lines.join('\n');
}

async function main() {
  const config = parseArgs();
  let sample = await loadSource(config);

  if (config.limit && Number.isFinite(config.limit)) {
    sample = sample.slice(0, config.limit);
  }

  const results = [];
  for (const entry of sample) {
    console.log(`→ ${entry.sport} ${entry.season} ${entry.label}`);

    const baseGame = await fetchSingleGame(entry.sport, entry.gameId);
    const analysis = await analyzeGameEntertainment(baseGame, entry.sport);

    if (!analysis) {
      results.push({
        ...entry,
        note: 'No probability data (analysis returned null)'
      });
      continue;
    }

    const prior = entry.prior || (await loadSeasonFileScores(entry.sport, entry.season, entry.gameId));
    const priorExcitement = prior?.excitement ?? null;
    const delta = typeof priorExcitement === 'number'
      ? Math.round((analysis.excitement - priorExcitement) * 100) / 100
      : null;

    const priorTier = typeof priorExcitement === 'number' ? getTier(priorExcitement)?.cssClass : '';
    const newTier = getTier(analysis.excitement)?.cssClass || '';

    results.push({
      ...entry,
      priorExcitement,
      newExcitement: analysis.excitement,
      delta,
      priorTier,
      newTier,
      priorBreakdown: prior?.breakdown || null,
      newBreakdown: analysis.breakdown,
      note: prior ? '' : 'No prior static score found'
    });
  }

  const csv = buildCsv(results);
  await writeFile(OUTPUT_PATH, `${csv}\n`, 'utf8');

  console.log('\nSample evaluation saved to', OUTPUT_PATH);
  console.log('\nSummary:\n');
  for (const row of results) {
    const deltaText = row.delta == null ? '' : ` (Δ ${row.delta >= 0 ? '+' : ''}${row.delta})`;
    console.log(
      `- ${row.label}: ${row.priorExcitement ?? 'n/a'} → ${row.newExcitement ?? 'n/a'}${deltaText} [${row.priorTier || 'n/a'} → ${row.newTier || 'n/a'}]`
    );
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
