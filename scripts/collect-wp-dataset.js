#!/usr/bin/env node
// Collects raw ESPN win-probability series for every game in public/data plus the
// canonical benchmark set, so the suspense table and scoring weights can be
// calibrated offline. Runs in GitHub Actions (ESPN is reachable there).
//
// Output: analysis/wp-dataset/<sport>.json.gz  { games: [{ id, season, file, ex, br,
//   hs, as, ot, p: [homeWP * 10000 ints], sl: [secondsLeft|null] }] }
//         analysis/wp-dataset/votes.json (if Supabase allows anon reads)

import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { gzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchAllProbabilities } from '../shared/espn-api.js';
import { fetchSingleGame } from '../api/fetcher.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = join(ROOT, 'public', 'data');
const OUT = join(ROOT, 'analysis', 'wp-dataset');
const CONCURRENCY = Number(process.env.CONCURRENCY || 12);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (entry.name.endsWith('.json') && entry.name !== 'latest.json') out.push(p);
  }
  return out;
}

async function loadGames() {
  const games = new Map();
  for (const file of await walk(DATA_ROOT)) {
    const rel = file.slice(DATA_ROOT.length + 1);
    const [sportDir, season] = rel.split('/');
    let data;
    try { data = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
    for (const g of data.games || []) {
      const sport = sportDir.toUpperCase();
      const key = `${sport}:${g.id}`;
      if (games.has(key)) continue;
      games.set(key, {
        sport, id: String(g.id), season: Number(season), file: rel,
        ex: g.excitement ?? null, br: g.breakdown ?? null,
        hs: g.homeScore ?? null, as: g.awayScore ?? null, ot: Boolean(g.overtime)
      });
    }
  }
  const canonical = JSON.parse(await readFile(join(ROOT, 'analysis', 'canonical-games.json'), 'utf8'));
  for (const c of canonical) {
    const key = `${c.sport}:${c.gameId}`;
    if (games.has(key)) { games.get(key).canonical = true; continue; }
    games.set(key, { sport: c.sport, id: String(c.gameId), season: c.season, canonical: true, needsMeta: true });
  }
  return [...games.values()];
}

async function withRetry(fn, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (r) return r;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500 * 2 ** i));
  }
  return null;
}

async function collectOne(g) {
  if (g.needsMeta) {
    const meta = await withRetry(() => fetchSingleGame(g.sport, g.id));
    if (meta) {
      g.hs = meta.homeScore ?? null; g.as = meta.awayScore ?? null; g.ot = Boolean(meta.overtime);
    }
    delete g.needsMeta;
  }
  const items = await withRetry(() => fetchAllProbabilities(g.id, g.sport));
  if (!items) return null;
  g.p = items.map(i => Math.round(Math.max(0, Math.min(1, i.homeWinPercentage ?? 0.5)) * 10000));
  const sl = items.map(i => (typeof i.secondsLeft === 'number' ? i.secondsLeft : null));
  if (sl.some(v => v !== null)) g.sl = sl;
  if (!collectOne.keysLogged) {
    collectOne.keysLogged = true;
    console.log('Sample probability item keys:', Object.keys(items[0]).join(', '));
  }
  return g;
}

async function collectVotes() {
  const url = 'https://teiwophkodpqwkmwljzf.supabase.co/rest/v1/votes?select=game_id,vote,algorithm_score,algorithm_version,sport,season,week';
  const { CONFIG } = await import('../src/js/config.js');
  const headers = { apikey: CONFIG.supabase.key, Authorization: `Bearer ${CONFIG.supabase.key}` };
  const rows = [];
  for (let offset = 0; offset < 200000; offset += 1000) {
    const res = await fetch(url, { headers: { ...headers, Range: `${offset}-${offset + 999}` } });
    if (!res.ok) { console.log(`Votes fetch status ${res.status}`); break; }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const games = await loadGames();
  console.log(`Collecting ${games.length} games with concurrency ${CONCURRENCY}`);
  const results = [];
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < games.length) {
      const g = games[next++];
      const r = await collectOne(g);
      if (r) results.push(r);
      if (++done % 250 === 0) console.log(`  ${done}/${games.length}`);
    }
  }));
  const bySport = {};
  for (const r of results) (bySport[r.sport] ||= []).push(r);
  for (const [sport, list] of Object.entries(bySport)) {
    list.sort((a, b) => a.id.localeCompare(b.id));
    const buf = gzipSync(JSON.stringify({ sport, collectedAt: new Date().toISOString(), games: list }));
    await writeFile(join(OUT, `${sport.toLowerCase()}.json.gz`), buf);
    console.log(`${sport}: ${list.length} games, ${(buf.length / 1e6).toFixed(2)} MB`);
  }
  try {
    const votes = await collectVotes();
    await writeFile(join(OUT, 'votes.json'), JSON.stringify(votes));
    console.log(`Votes: ${votes.length}`);
  } catch (e) {
    console.log(`Votes unavailable: ${e.message}`);
  }
}

if (existsSync(DATA_ROOT)) main().catch(e => { console.error(e); process.exit(1); });
