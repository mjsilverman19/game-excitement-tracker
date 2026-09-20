import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseStatic } from '../src/js/services/api.js';
import { findLatestAvailable } from '../src/js/utils/dates.js';

// NFL week 2 of 2026 runs Thu Sep 17 to Wed Sep 23; kickoff is Thu Sep 10.
const sundayWeek2 = new Date(2026, 8, 20, 12);
const laborDay = new Date(2026, 8, 7, 12);
const october = new Date(2026, 9, 5, 12); // week 4

test('NFL keeps the running week and the one before it live', () => {
  // The generator publishes a week while it is still being played, so the
  // current week and the previous one come from the API, not a snapshot.
  assert.equal(shouldUseStatic('NFL', 2026, 2, sundayWeek2), false);
  assert.equal(shouldUseStatic('NFL', 2026, '2', sundayWeek2), false);
  assert.equal(shouldUseStatic('NFL', 2026, 1, sundayWeek2), false);

  // Settled weeks, past seasons and playoff rounds read from static files.
  assert.equal(shouldUseStatic('NFL', 2026, 1, october), true);
  assert.equal(shouldUseStatic('NFL', 2025, 2, sundayWeek2), true);
  assert.equal(shouldUseStatic('NFL', 2026, 'wild-card', sundayWeek2), true);

  // Between Labor Day and kickoff the week clamps to 1 and is treated as
  // live. Nothing has been played, so the request falls back a week.
  assert.equal(shouldUseStatic('NFL', 2026, 1, laborDay), false);
});

test('NFL discovery lands on the running week before it is published', async () => {
  // Mirrors the deployed layout mid-week: week 1 published, week 2 not yet,
  // and the pointer still parked on week 1.
  const files = {
    '/data/nfl/2026/latest.json': { period: 1 },
    '/data/nfl/2026/week-01.json': { success: true, games: [{ id: '1' }] },
    '/data/nfl/2025/latest.json': { period: 18 },
    '/data/nfl/2025/week-18.json': { success: true, games: [{ id: '2' }] }
  };
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  try {
    // Pin the clock to that Sunday so the expected week never drifts.
    mock.timers.enable({ apis: ['Date'], now: sundayWeek2 });
    globalThis.fetch = async path => {
      const body = files[path];
      if (!body) return { ok: false, status: 404, headers: { get: () => 'text/html' } };
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
    };
    console.log = () => {};

    // The in-progress week wins over the stale pointer; loadGames serves it
    // from the API and falls back a week if nothing is final yet.
    const current = await findLatestAvailable('NFL', 2026);
    assert.equal(current.week, 2);

    // A finished season still resolves through the published pointer.
    const past = await findLatestAvailable('NFL', 2025);
    assert.equal(past.week, 18);
  } finally {
    mock.timers.reset();
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});
