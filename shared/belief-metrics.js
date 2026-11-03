// Suspense and surprise from a win-probability path.
//
// Based on Ely, Frankel & Kamenica, "Suspense and Surprise" (JPE 2015). Treat
// the home win probability mu_t as the viewer's belief after play t.
//   Surprise in period t: |mu_t - mu_{t-1}|, how far the belief just moved.
//   Suspense in period t: sigma_t = sqrt(E_t[(mu_{t+1} - mu_t)^2]), how far it
//     is expected to move on the next play.
// Totals are divided by sqrt(T): both grow with the number of periods (paper
// §3.2, Prop. 2), so without it sports with more plays look more exciting.
//
// Squared swings are never summed: in expectation they total mu_0(1-mu_0)
// for every fully revealing game (Lemma 2), so they cannot rank games.

import { SUSPENSE_TABLE } from './suspense-table.js';

const TABLE_SPORT_ALIASES = { CBB: 'NBA' };

function tableFor(sport) {
  return SUSPENSE_TABLE.sports[sport] ||
    SUSPENSE_TABLE.sports[TABLE_SPORT_ALIASES[sport]] ||
    SUSPENSE_TABLE.sports.NFL;
}

/**
 * Expected next-play standard deviation of win probability.
 * @param {string} sport
 * @param {number} mu - current home win probability (0-1)
 * @param {number} progress - share of the game elapsed (0-1)
 * @returns {number}
 */
export function expectedSwing(sport, mu, progress) {
  const table = tableFor(sport);
  const P = SUSPENSE_TABLE.progressBins;
  const W = SUSPENSE_TABLE.closenessBins;
  const x = Math.max(0, Math.min(1, progress)) * P - 0.5;
  const y = Math.max(0, Math.min(0.5, Math.abs(mu - 0.5))) * 2 * W - 0.5;
  const x0 = Math.max(0, Math.min(P - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(W - 1, Math.floor(y)));
  const x1 = Math.min(P - 1, x0 + 1);
  const y1 = Math.min(W - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0));
  const fy = Math.max(0, Math.min(1, y - y0));
  const v = table.variance;
  const variance =
    v[x0][y0] * (1 - fx) * (1 - fy) + v[x1][y0] * fx * (1 - fy) +
    v[x0][y1] * (1 - fx) * fy + v[x1][y1] * fx * fy;
  // A decided game has no suspense left, whatever the table's floor says.
  const residual = mu * (1 - mu);
  return Math.sqrt(Math.min(variance, residual));
}

/**
 * Computes the paper's belief-path measures for a completed game.
 * @param {number[]} values - home win probability per play (0-1)
 * @param {string} sport
 * @param {{ finishShare?: number }} options
 */
export function computeBeliefMetrics(values, sport, { finishShare = 0.2 } = {}) {
  const T = values.length;
  if (T < 2) return null;

  const sigma = new Array(T).fill(0);
  for (let t = 0; t < T; t++) sigma[t] = expectedSwing(sport, values[t], t / (T - 1));

  let suspense = 0;
  let surprise = 0;
  let shock = 0;
  for (let t = 0; t < T - 1; t++) {
    suspense += sigma[t];
    const move = Math.abs(values[t + 1] - values[t]);
    surprise += move;
    // Unexpected moves (§8): the biggest swing relative to what was expected.
    if (sigma[t] > 0) shock = Math.max(shock, Math.min(move, 0.5) / Math.max(sigma[t], 0.02));
  }
  const norm = Math.sqrt(T - 1);

  // Time-dependent significance (§2.2): the closing stretch counts on its own.
  const finishStart = Math.max(0, Math.floor((T - 1) * (1 - finishShare)));
  let lateSuspense = 0;
  let lateSurprise = 0;
  for (let t = finishStart; t < T - 1; t++) {
    lateSuspense += sigma[t];
    lateSurprise += Math.abs(values[t + 1] - values[t]);
  }
  const lateNorm = Math.sqrt(Math.max(1, T - 1 - finishStart));

  // Pacing (Prop. 1): in the suspense-optimal game, residual uncertainty
  // mu(1-mu) falls in a straight line from kickoff to the final play. Measure
  // how much of that ideal uncertainty the game actually kept alive.
  const psi0 = Math.max(values[0] * (1 - values[0]), 0.16);
  let kept = 0;
  let ideal = 0;
  for (let t = 0; t < T; t++) {
    const target = psi0 * (1 - t / (T - 1));
    const psi = values[t] * (1 - values[t]);
    kept += Math.min(psi, target);
    ideal += target;
  }

  // Largest ex-post surprise from any vantage point (§3.4, §8): how far the
  // final result sat from the belief at the moment it looked least likely.
  const final = values[T - 1] >= 0.5 ? 1 : 0;
  let reversal = 0;
  for (let t = 0; t < T; t++) reversal = Math.max(reversal, Math.abs(final - values[t]));

  let leadChanges = 0;
  for (let t = 1; t < T; t++) {
    if ((values[t - 1] - 0.5) * (values[t] - 0.5) < 0) leadChanges++;
  }

  return {
    suspense: suspense / norm,
    surprise: surprise / norm,
    lateSuspense: lateSuspense / lateNorm,
    lateSurprise: lateSurprise / lateNorm,
    pacing: ideal > 0 ? kept / ideal : 0,
    shock,
    reversal,
    leadChanges,
    plays: T
  };
}

/**
 * Converts a clock reading into the share of the game elapsed.
 * Used by live recommendations, where the final play count is unknown.
 */
export function gameProgress(sport, period, clock) {
  const parts = String(clock ?? '').split(':').map(Number);
  const secondsLeft = parts.length === 2 && parts.every(Number.isFinite)
    ? parts[0] * 60 + parts[1]
    : (parts.length === 1 && Number.isFinite(parts[0]) ? parts[0] : null);
  const p = Number(period) || 1;
  if (sport === 'MLB') return Math.min(1, (p - 0.5) / 9);
  const periods = sport === 'CBB' ? 2 : 4;
  const length = sport === 'NBA' ? 720 : sport === 'CBB' ? 1200 : 900;
  if (p > periods) return 0.99;
  const elapsedInPeriod = secondsLeft == null ? length / 2 : length - Math.min(length, secondsLeft);
  return Math.min(0.99, ((p - 1) * length + elapsedInPeriod) / (periods * length));
}
