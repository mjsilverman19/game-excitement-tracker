#!/usr/bin/env node
// Offline comparison of the current scoring model against the archived v3.5.1
// model, using the collected win-probability dataset (no network needed).
//
// Reports per sport: tier rates, rank agreement, guardrail usage, and the
// canonical benchmark accuracy (analysis/canonical-games.json).
// Usage: node scripts/evaluate-model.js [--movers]

import { readFileSync, existsSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { calculateExcitement } from '../api/calculator.js';
import { calculateExcitementDetailed as legacyScore } from '../archive/calculator-v3.5.1.js';
import { getTier } from '../shared/algorithm-config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const canonical = JSON.parse(readFileSync(join(ROOT, 'analysis', 'canonical-games.json'), 'utf8'));
const canonicalByKey = new Map(canonical.map(c => [`${c.sport}:${c.gameId}`, c]));
const TIER_RANK = { skip: 0, recommended: 1, 'must-watch': 2 };
const showMovers = process.argv.includes('--movers');

function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  order.forEach(([, i], r) => { out[i] = r; });
  return out;
}

function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return s / Math.sqrt(sa * sb);
}

const totals = { n: 0, hit: 0, big: 0, legacyHit: 0, legacyBig: 0 };
const misses = [];
for (const sport of ['NFL', 'CFB', 'NBA', 'MLB']) {
  const file = join(ROOT, 'analysis', 'wp-dataset', `${sport.toLowerCase()}.json.gz`);
  if (!existsSync(file)) continue;
  const { games } = JSON.parse(gunzipSync(readFileSync(file)));
  const results = [];
  for (const g of games) {
    const probs = g.p.map(v => ({ homeWinPercentage: v / 10000 }));
    const game = { homeScore: g.hs, awayScore: g.as, overtime: g.ot };
    const now = calculateExcitement(probs, game, sport);
    const before = legacyScore(probs, game, sport);
    if (!now || !before) continue;
    results.push({ g, now, before, canonical: canonicalByKey.get(`${sport}:${g.id}`) });
  }
  const pub = results.filter(r => r.g.file);
  const tierRate = key => {
    const counts = { skip: 0, recommended: 0, 'must-watch': 0 };
    for (const r of pub) counts[getTier(key(r), sport).cssClass]++;
    return Object.entries(counts).map(([k, v]) => `${k} ${(100 * v / pub.length).toFixed(0)}%`).join(', ');
  };
  const rho = pearson(ranks(pub.map(r => r.now.score)), ranks(pub.map(r => r.before.score)));
  const guards = pub.filter(r => r.now.guardrails.length).length;
  console.log(`\n${sport} (${pub.length} published games)`);
  console.log(`  tiers now:    ${tierRate(r => r.now.score)}`);
  console.log(`  tiers v3.5.1: ${tierRate(r => r.before.score)}`);
  console.log(`  rank agreement with v3.5.1 (Spearman): ${rho.toFixed(3)}; guardrails applied: ${guards}`);

  if (showMovers) {
    const moved = pub.map(r => ({ r, d: r.now.score - r.before.score })).sort((a, b) => a.d - b.d);
    const fmt = x => `${x.r.g.id} ${x.r.before.score}→${x.r.now.score}`;
    console.log(`  biggest drops: ${moved.slice(0, 5).map(fmt).join('; ')}`);
    console.log(`  biggest gains: ${moved.slice(-5).map(fmt).join('; ')}`);
  }

  for (const r of results.filter(r => r.canonical && r.canonical.dataQuality !== 'excluded')) {
    const expected = r.canonical.expectedTier;
    const now = getTier(r.now.score, sport).cssClass;
    const before = getTier(r.before.score, sport).cssClass;
    totals.n++;
    if (now === expected) totals.hit++; else misses.push(`${sport} ${r.canonical.label}: expected ${expected}, got ${now} (${r.now.score}; v3.5.1 ${r.before.score})`);
    if (before === expected) totals.legacyHit++;
    if (Math.abs(TIER_RANK[now] - TIER_RANK[expected]) === 2) totals.big++;
    if (Math.abs(TIER_RANK[before] - TIER_RANK[expected]) === 2) totals.legacyBig++;
  }
}

console.log(`\nCanonical benchmark (${totals.n} games)`);
console.log(`  current: ${totals.hit} correct tier, ${totals.big} two-tier misses`);
console.log(`  v3.5.1:  ${totals.legacyHit} correct tier, ${totals.legacyBig} two-tier misses`);
if (misses.length) console.log(`  misses:\n    ${misses.join('\n    ')}`);
