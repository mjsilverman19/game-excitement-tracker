#!/usr/bin/env node
// Re-score existing slates without changing their membership or descriptive fields.
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeGameEntertainmentDetailed } from '../api/calculator.js';
import { ALGORITHM_CONFIG, getTier } from '../shared/algorithm-config.js';
import { stringifyStaticJson } from '../shared/static-latest.js';

const args = process.argv.slice(2);
const cacheDir = resolve(args.includes('--cache-dir') ? args[args.indexOf('--cache-dir') + 1] : '/tmp/gei-static-regeneration');
const shouldWrite = args.includes('--write');
const dataDir = resolve('public/data');
const reportPath = resolve('analysis/static-regeneration-report.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const scoringHash = hash((await Promise.all(['api/calculator.js', 'api/data-quality.js', 'shared/algorithm-config.js', 'shared/espn-api.js'].map(file => readFile(file, 'utf8')))).join('\n'));
await mkdir(cacheDir, { recursive: true });

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const slates = [];
const jobs = new Map();
for (const path of (await filesUnder(dataDir)).filter(path => path.endsWith('.json')).sort()) {
  const original = await readFile(path, 'utf8');
  const data = JSON.parse(original);
  if (!Array.isArray(data.games)) continue;
  const sport = data.metadata.sport;
  slates.push({ path, original, data });
  for (const game of data.games) {
    // Include all original game fields so different records never share an incompatible result.
    const key = hash(JSON.stringify({ scoringHash, sport, game }));
    jobs.set(key, { key, sport, game });
  }
}

// Cache complete pages, retry transient failures, and reject incomplete pagination.
const nativeFetch = globalThis.fetch;
const failedGameIds = new Set();
globalThis.fetch = async (url, options) => {
  const pagePath = join(cacheDir, `page-${hash(String(url))}.json`);
  const validate = data => {
    if (!Array.isArray(data.items) || !data.items.length || (data.pageCount || 1) > 10) throw new Error('Missing or unsupported probability pages');
    return data;
  };
  try {
    const data = validate(JSON.parse(await readFile(pagePath, 'utf8')));
    return { ok: true, json: async () => data };
  } catch { /* No complete cached page. */ }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await nativeFetch(url, { ...options, signal: globalThis.AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = validate(await response.json());
      await writeFile(pagePath, JSON.stringify(data));
      return { ok: true, json: async () => data };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(done => setTimeout(done, 500 * (attempt + 1)));
    }
  }
  failedGameIds.add(String(url).match(/events\/([^/]+)/)?.[1]);
  throw lastError;
};

const queue = [...jobs.values()];
let completed = 0;
const results = new Map();
const failures = [];
async function worker() {
  while (queue.length) {
    const { key, sport, game } = queue.shift();
    const resultPath = join(cacheDir, `score-${key}.json`);
    try {
      let result;
      try { result = JSON.parse(await readFile(resultPath, 'utf8')); } catch {
        result = await analyzeGameEntertainmentDetailed(game, sport);
        if (!result || failedGameIds.has(String(game.id))) throw new Error('Probability data unavailable or incomplete');
        if (!Number.isFinite(result.score) || !['tension', 'drama', 'finish'].every(metric => Number.isFinite(result.breakdown?.[metric]))) throw new Error('Invalid calculated score');
        await writeFile(resultPath, JSON.stringify(result));
      }
      results.set(key, result);
    } catch (error) {
      failures.push({ sport, id: game.id, error: error.message });
    }
    completed++;
    if (completed % 100 === 0 || completed === jobs.size) console.log(`${completed}/${jobs.size} analyzed; ${failures.length} failures`);
  }
}
console.log(`Re-scoring ${jobs.size} records across ${slates.length} datasets (${shouldWrite ? 'write after validation' : 'preview only'})`);
await Promise.all(Array.from({ length: 8 }, worker));

const report = { generatedAt: new Date().toISOString(), algorithmVersion: ALGORITHM_CONFIG.version, scoringHash, datasets: slates.length, records: jobs.size, failures, written: false, bySport: {}, changes: [] };
for (const { data } of slates) {
  const sport = data.metadata.sport;
  const summary = report.bySport[sport] ||= { gameEntries: 0, changed: 0, increased: 0, decreased: 0, tierChanges: 0, totalDelta: 0 };
  for (const game of data.games) {
    const result = results.get(hash(JSON.stringify({ scoringHash, sport, game })));
    if (!result) continue;
    const delta = result.score - game.excitement;
    summary.gameEntries++;
    summary.totalDelta += delta;
    if (Math.abs(delta) > 1e-9) {
      summary.changed++;
      summary[delta > 0 ? 'increased' : 'decreased']++;
      const oldTier = getTier(game.excitement, sport).label, newTier = getTier(result.score, sport).label;
      if (oldTier !== newTier) summary.tierChanges++;
      report.changes.push({ sport, season: data.metadata.season, period: data.metadata.week ?? data.metadata.date, id: game.id, game: `${game.awayTeam} at ${game.homeTeam}`, before: game.excitement, after: result.score, delta: Math.round(delta * 1000) / 1000, oldTier, newTier });
    }
  }
}
for (const summary of Object.values(report.bySport)) {
  summary.meanDelta = summary.totalDelta / summary.gameEntries;
  delete summary.totalDelta;
}
report.changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
if (shouldWrite && failures.length === 0) {
  // Preserve the originals and verify no slate changed during the network work.
  for (const slate of slates) {
    if (await readFile(slate.path, 'utf8') !== slate.original) throw new Error(`Dataset changed during regeneration: ${slate.path}`);
    const backupPath = join(cacheDir, 'originals', slate.path.slice(dataDir.length + 1));
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, slate.original);
  }
  for (const { path, data } of slates) {
    const sport = data.metadata.sport;
    data.games = data.games.map(game => {
      const result = results.get(hash(JSON.stringify({ scoringHash, sport, game })));
      const updated = { ...game, excitement: result.score, breakdown: result.breakdown, overtime: result.overtimeDetected ?? game.overtime };
      delete updated.dataQuality;
      if (result.dataQuality) updated.dataQuality = result.dataQuality;
      return updated;
    }).sort((a, b) => b.excitement - a.excitement);
    data.metadata.generatedAt = report.generatedAt;
    data.metadata.algorithmVersion = ALGORITHM_CONFIG.version;
    await writeFile(`${path}.tmp`, stringifyStaticJson(data));
    await rename(`${path}.tmp`, path);
  }
  report.written = true;
}
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ written: report.written, failures: failures.length, bySport: report.bySport, reportPath }, null, 2));
if (failures.length) process.exitCode = 1;
