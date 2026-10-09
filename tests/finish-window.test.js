import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeGameEntertainmentDetailed } from '../api/calculator.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/texas-ohio-state-2026.json', import.meta.url)));

async function analyze(t, values, game = fixture.game) {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ pageCount: 1, items: values.map(homeWinPercentage => ({ homeWinPercentage })) })
  }));
  return analyzeGameEntertainmentDetailed(game, 'CFB');
}

test('Texas–Ohio State boundary comeback gets credit for its decisive finish', async t => {
  const result = await analyze(t, fixture.homeWinPercentages);
  assert.ok(result.breakdown.finish > 8.5, 'decisive late comeback should have an elite finish');
  assert.equal(result.score, 8.8);
});

test('the same boundary comeback receives equal credit for the away team', async t => {
  const result = await analyze(t, fixture.homeWinPercentages.map(p => 1 - p), {
    ...fixture.game, homeScore: 23, awayScore: 24
  });
  assert.ok(result.breakdown.finish > 8.5);
  assert.equal(result.score, 8.8);
});

test('a stable late lead retains the finish penalty', async t => {
  const values = [...Array(30).fill(0.8), 0.81, 0.83, 0.85, 0.87, 0.89, 0.91, 0.93, 0.95, 0.97, 1];
  const result = await analyze(t, values);
  assert.ok(result.breakdown.finish < 4, 'a pull-away without a late reversal is not an elite finish');
});
