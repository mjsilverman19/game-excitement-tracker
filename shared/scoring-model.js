// Turns belief-path metrics into the published 1-10 score.
// See shared/belief-metrics.js for the measures themselves.

import { SCORE_CALIBRATION } from './score-calibration.js';

export const COMPONENT_KEYS = ['suspense', 'surprise', 'finish', 'twist', 'pacing'];

// Power mean exponent for combining component percentiles. p > 1 rewards a
// game that is exceptional on one dimension (a historic comeback, a wire-to-
// wire nail-biter) over one that is middling on all of them.
export const COMPOSITE_POWER = 2;

const CALIBRATION_ALIASES = { CBB: 'NBA' };

/** Raw component values from computeBeliefMetrics output. */
export function componentValues(metrics) {
  return {
    suspense: metrics.suspense,
    surprise: metrics.surprise,
    finish: (metrics.lateSuspense + metrics.lateSurprise) / 2,
    twist: metrics.reversal,
    pacing: metrics.pacing
  };
}

/** Equal-weight power mean of component percentiles (each 0-1). */
export function compositeFromPercentiles(pct) {
  let total = 0;
  for (const key of COMPONENT_KEYS) total += Math.pow(pct[key], COMPOSITE_POWER);
  return Math.pow(total / COMPONENT_KEYS.length, 1 / COMPOSITE_POWER);
}

export function percentileOf(knots, value) {
  if (!(value > knots[0])) return 0;
  if (value >= knots[knots.length - 1]) return 1;
  let lo = 0, hi = knots.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (knots[mid] <= value) lo = mid; else hi = mid;
  }
  const span = knots[hi] - knots[lo];
  return (lo + (span > 0 ? (value - knots[lo]) / span : 0)) / (knots.length - 1);
}

function valueAt(knots, q) {
  const pos = Math.max(0, Math.min(1, q)) * (knots.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(knots.length - 1, lo + 1);
  return knots[lo] + (knots[hi] - knots[lo]) * (pos - lo);
}

function calibrationFor(sport) {
  return SCORE_CALIBRATION.sports[sport] ||
    SCORE_CALIBRATION.sports[CALIBRATION_ALIASES[sport]] ||
    SCORE_CALIBRATION.sports.NFL;
}

/**
 * @param {object} metrics - computeBeliefMetrics output
 * @param {string} sport
 * @returns {{ score: number, breakdown: object, composite: number, percentile: number }}
 */
export function scoreFromMetrics(metrics, sport) {
  const cal = calibrationFor(sport);
  const raw = componentValues(metrics);
  const pct = {};
  const breakdown = {};
  for (const key of COMPONENT_KEYS) {
    pct[key] = percentileOf(cal.components[key], raw[key]);
    breakdown[key] = Math.round(pct[key] * 1000) / 100;
  }
  const composite = compositeFromPercentiles(pct);
  const percentile = percentileOf(cal.composite, composite);
  return { score: valueAt(cal.score, percentile), breakdown, composite, percentile };
}
