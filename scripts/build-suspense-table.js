#!/usr/bin/env node
// Builds shared/suspense-table.js from the collected win-probability dataset.
//
// Suspense (Ely, Frankel & Kamenica 2015) is the expected size of the next
// belief move: sigma_t = sqrt(E[(mu_{t+1} - mu_t)^2]). ESPN only publishes the
// realized path, so we estimate the "what could have happened" distribution
// the way the paper does for tennis and soccer: pool many games and measure
// the mean squared next-play change conditional on game state, here the
// distance of win probability from 50% and the share of the game elapsed.
//
// Cells are shrunk toward a fitted parametric surface
//   log E[dmu^2] = c + a*log(mu(1-mu)) - b*log(remaining + r0)
// so sparse cells (e.g. 50/50 in the final seconds) stay stable.
//
// Usage: node scripts/build-suspense-table.js

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATASET = join(ROOT, 'analysis', 'wp-dataset');
const OUT = join(ROOT, 'shared', 'suspense-table.js');

export const PROGRESS_BINS = 20;
export const CLOSENESS_BINS = 10;
const SHRINK = 150; // pseudo-count pulling each cell toward the parametric fit
const R0_GRID = [0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12];

function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c <= 3; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((r, i) => r[3] / r[i]);
}

function cellCenter(pb, wb) {
  const closeness = (wb + 0.5) / CLOSENESS_BINS / 2; // |mu - 0.5|
  const mu = 0.5 + closeness;
  return { psi: mu * (1 - mu), remaining: 1 - (pb + 0.5) / PROGRESS_BINS };
}

function buildSport(games) {
  const sum = Array.from({ length: PROGRESS_BINS }, () => Array(CLOSENESS_BINS).fill(0));
  const n = Array.from({ length: PROGRESS_BINS }, () => Array(CLOSENESS_BINS).fill(0));
  for (const g of games) {
    const p = g.p.map(v => v / 10000);
    const T = p.length;
    if (T < 10) continue;
    for (let t = 0; t < T - 1; t++) {
      const pb = Math.min(PROGRESS_BINS - 1, Math.floor((t / (T - 1)) * PROGRESS_BINS));
      const wb = Math.min(CLOSENESS_BINS - 1, Math.floor(Math.abs(p[t] - 0.5) * 2 * CLOSENESS_BINS));
      sum[pb][wb] += (p[t + 1] - p[t]) ** 2;
      n[pb][wb]++;
    }
  }

  let fit = null;
  for (const r0 of R0_GRID) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const b = [0, 0, 0];
    const rows = [];
    for (let pb = 0; pb < PROGRESS_BINS; pb++) {
      for (let wb = 0; wb < CLOSENESS_BINS; wb++) {
        if (n[pb][wb] < 30 || sum[pb][wb] <= 0) continue;
        const { psi, remaining } = cellCenter(pb, wb);
        const x = [1, Math.log(psi), -Math.log(remaining + r0)];
        const y = Math.log(sum[pb][wb] / n[pb][wb]);
        const w = n[pb][wb];
        rows.push({ x, y, w });
        for (let j = 0; j < 3; j++) {
          b[j] += w * x[j] * y;
          for (let k = 0; k < 3; k++) A[j][k] += w * x[j] * x[k];
        }
      }
    }
    const coef = solve3(A, b);
    const mean = rows.reduce((a, r) => a + r.w * r.y, 0) / rows.reduce((a, r) => a + r.w, 0);
    let sse = 0, sst = 0;
    for (const r of rows) {
      const yh = r.x.reduce((a, v, j) => a + v * coef[j], 0);
      sse += r.w * (r.y - yh) ** 2;
      sst += r.w * (r.y - mean) ** 2;
    }
    const r2 = 1 - sse / sst;
    if (!fit || r2 > fit.r2) fit = { c: coef[0], a: coef[1], b: coef[2], r0, r2 };
  }

  const variance = [];
  for (let pb = 0; pb < PROGRESS_BINS; pb++) {
    const row = [];
    for (let wb = 0; wb < CLOSENESS_BINS; wb++) {
      const { psi, remaining } = cellCenter(pb, wb);
      const prior = Math.exp(fit.c + fit.a * Math.log(psi) - fit.b * Math.log(remaining + fit.r0));
      const v = (sum[pb][wb] + SHRINK * prior) / (n[pb][wb] + SHRINK);
      row.push(Number(v.toExponential(4)));
    }
    variance.push(row);
  }
  // Enforce the martingale intuition that a closer game never has less
  // expected movement than a more lopsided one at the same moment.
  for (const row of variance) {
    for (let wb = CLOSENESS_BINS - 2; wb >= 0; wb--) row[wb] = Math.max(row[wb], row[wb + 1]);
  }
  const plays = games.reduce((a, g) => a + g.p.length, 0);
  return {
    games: games.length,
    plays,
    fit: { c: +fit.c.toFixed(4), a: +fit.a.toFixed(4), b: +fit.b.toFixed(4), r0: fit.r0, r2: +fit.r2.toFixed(3) },
    variance
  };
}

const tables = {};
for (const sport of ['NFL', 'CFB', 'NBA', 'MLB']) {
  const file = join(DATASET, `${sport.toLowerCase()}.json.gz`);
  if (!existsSync(file)) continue;
  const { games } = JSON.parse(gunzipSync(readFileSync(file)));
  tables[sport] = buildSport(games);
  console.log(`${sport}: ${tables[sport].games} games, fit R²=${tables[sport].fit.r2}`);
}

const header = `// GENERATED by scripts/build-suspense-table.js — do not edit by hand.
// Expected squared next-play change in home win probability, E[(dmu)^2],
// by game progress (rows, ${PROGRESS_BINS} bins of elapsed share) and distance of
// win probability from 50% (columns, ${CLOSENESS_BINS} bins of |mu - 0.5|).
// Source: ESPN win probability series for games in public/data, built ${new Date().toISOString().slice(0, 10)}.
`;
writeFileSync(OUT, `${header}export const SUSPENSE_TABLE = ${JSON.stringify({
  progressBins: PROGRESS_BINS,
  closenessBins: CLOSENESS_BINS,
  sports: tables
}, null, 0).replace(/\],\[/g, '],\n[')};\n`);
console.log(`Wrote ${OUT}`);
