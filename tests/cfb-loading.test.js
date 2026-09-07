import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGames } from '../api/fetcher.js';
import { shouldUseStatic, fetchStaticData } from '../src/js/services/api.js';
import { getSeasonInfo } from '../shared/season-dates.js';

test('CFB requests all FBS games, including unranked games beyond the first 100', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async address => {
      const url = new URL(address);
      assert.equal(url.searchParams.get('groups'), '80');
      assert.equal(url.searchParams.get('limit'), '200');
      assert.equal(url.searchParams.get('dates'), '2026');
      assert.equal(url.searchParams.get('week'), '1');
      return { ok: true, json: async () => ({ events: Array.from({ length: 105 }, (_, i) => ({
        id: String(i), competitions: [{ status: { type: { completed: i < 104 } }, competitors: [] }]
      })) }) };
    };
    const games = await fetchGames('CFB', 2026, 1);
    assert.equal(games.length, 104);
    assert.ok(games.some(game => game.id === '103'));
    assert.ok(!games.some(game => game.id === '104'));
  } finally { globalThis.fetch = originalFetch; }
});

test('NFL requests retain their existing scope', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async address => {
      assert.equal(new URL(address).searchParams.has('groups'), false);
      return { ok: true, json: async () => ({ events: [] }) };
    };
    assert.deepEqual(await fetchGames('NFL', 2026, 1), []);
  } finally { globalThis.fetch = originalFetch; }
});

test('CFB recent weeks stay live across Labor Day and Tuesday rollover', () => {
  const monday = new Date(2026, 8, 7, 12);
  const tuesday = new Date(2026, 8, 8, 12);
  assert.equal(shouldUseStatic('CFB', 2026, 1, monday), false);
  assert.equal(shouldUseStatic('CFB', 2026, '1', tuesday), false);
  assert.equal(shouldUseStatic('CFB', 2026, 2, tuesday), false);
  assert.equal(shouldUseStatic('CFB', 2026, 1, new Date(2026, 8, 15, 12)), true);
  assert.equal(shouldUseStatic('CFB', 2025, 1, monday), true);
  assert.equal(shouldUseStatic('NFL', 2026, 1, monday), true);
  assert.equal(shouldUseStatic('CFB', 2025, 'bowls', monday), true);
});

test('Top Games static loader also bypasses potentially incomplete recent CFB slates', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let requests = 0;
    globalThis.fetch = async () => { requests++; return { ok: false }; };
    const { season, week } = getSeasonInfo('CFB');
    assert.equal(await fetchStaticData('CFB', season, week), null);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});
