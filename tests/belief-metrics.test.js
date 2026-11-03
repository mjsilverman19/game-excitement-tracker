import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBeliefMetrics, expectedSwing, gameProgress } from '../shared/belief-metrics.js';
import { calculateExcitement } from '../api/calculator.js';
import { getTier } from '../shared/algorithm-config.js';

const series = (n, f) => Array.from({ length: n }, (_, i) => f(i / (n - 1)));
const items = values => values.map(homeWinPercentage => ({ homeWinPercentage }));

test('suspense rises as a close game runs out of time and vanishes once decided', () => {
  assert.ok(expectedSwing('NFL', 0.5, 0.95) > 3 * expectedSwing('NFL', 0.5, 0.05));
  assert.ok(expectedSwing('NFL', 0.5, 0.9) > expectedSwing('NFL', 0.8, 0.9));
  assert.equal(expectedSwing('NFL', 1, 0.9), 0);
  assert.ok(expectedSwing('CBB', 0.5, 0.5) > 0, 'sports without their own table fall back');
});

test('surprise is total belief movement normalised by the square root of plays', () => {
  const zigzag = series(101, x => (Math.round(x * 100) % 2 ? 0.6 : 0.4));
  const m = computeBeliefMetrics(zigzag, 'NBA');
  assert.ok(Math.abs(m.surprise - (100 * 0.2) / Math.sqrt(100)) < 1e-9);
});

test('a back-and-forth finish outscores an early blowout of the same length', () => {
  const blowout = series(180, x => Math.min(0.99, 0.5 + x * 4));
  const thriller = series(180, x => 0.5 + 0.35 * Math.sin(x * 20) * x);
  const b = calculateExcitement(items(blowout), { homeScore: 35, awayScore: 3 }, 'NFL');
  const t = calculateExcitement(items(thriller), { homeScore: 24, awayScore: 23 }, 'NFL');
  assert.ok(t.score > b.score + 3);
  assert.equal(getTier(b.score, 'NFL').cssClass, 'skip');
  assert.ok(t.breakdown.pacing > b.breakdown.pacing);
  assert.ok(t.breakdown.finish > b.breakdown.finish);
});

test('a comeback from near-certain defeat registers as a twist', () => {
  const comeback = series(180, x => (x < 0.7 ? 0.5 - x * 0.68 : 0.02 + (x - 0.7) * 3.2));
  const wire = series(180, x => 0.5 + x * 0.49);
  const c = calculateExcitement(items(comeback), {}, 'NFL');
  const w = calculateExcitement(items(wire), {}, 'NFL');
  assert.ok(c.metrics.reversal > 0.9);
  assert.ok(c.breakdown.twist > w.breakdown.twist);
});

test('guardrails cap extreme blowouts and floor overtime games', () => {
  const thriller = series(180, x => 0.5 + 0.35 * Math.sin(x * 20) * x);
  const capped = calculateExcitement(items(thriller), { homeScore: 50, awayScore: 10 }, 'NFL');
  assert.ok(capped.score <= 6.5);
  assert.deepEqual(capped.guardrails, ['blowoutCap']);
  const flat = series(180, () => 0.97);
  assert.ok(calculateExcitement(items(flat), { overtime: true }, 'NFL').score >= 6);
});

test('game progress maps the clock onto the share of regulation elapsed', () => {
  assert.equal(gameProgress('NFL', 1, '15:00'), 0);
  assert.equal(gameProgress('NFL', 3, '15:00'), 0.5);
  assert.equal(gameProgress('NBA', 4, '0:00'), 0.99);
  assert.equal(gameProgress('NFL', 5, '8:00'), 0.99);
});
