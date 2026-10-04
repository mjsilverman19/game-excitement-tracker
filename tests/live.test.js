import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/live.js';
import { calculateLiveSignal, parseLiveEvent, enrichLiveGame } from '../shared/live-signals.js';

const points = values => values.map((homeWinPercentage, i) => ({ homeWinPercentage, playId: String(i) }));

test('live recommendations prioritize tight finishes over decided games', () => {
  const close = calculateLiveSignal(points([.45, .5, .55]), { period: 4, clock: '2:00' });
  const decided = calculateLiveSignal(points([.9, .95, .99]), { period: 4, clock: '2:00' });
  assert.equal(close.label, 'Tight finish');
  assert.ok(close.priority > decided.priority);
  assert.equal(decided.label, 'One team in control');
});

test('live comeback from an extreme probability is preserved', () => {
  const signal = calculateLiveSignal(points([.99, 1, .7, .55]), { period: 3, clock: '4:00' });
  assert.equal(signal.label, 'Momentum swing');
  assert.ok(signal.recentSwing >= .3);
});

test('early games with one probability point can be recommended', () => {
  assert.equal(calculateLiveSignal(points([.5]), { period: 1 }).label, 'Close game');
  assert.equal(calculateLiveSignal(points([null, NaN, 2])).label, 'Live data pending');
  assert.equal(calculateLiveSignal(points([0])).label, 'One team in control');
});

test('unknown fourth-quarter clock does not claim a tight finish', () => {
  assert.equal(calculateLiveSignal(points([.5]), { period: 4 }).label, 'Close game');
  assert.equal(calculateLiveSignal(points([.5]), { period: 5 }).label, 'Tight finish');
});

const game = { id: '1', state: 'in', period: 4, clock: '2:00', status: '2:00 - 4th' };
function summary({ playId = '2', state = 'in' } = {}) {
  return {
    header: { competitions: [{ status: { type: { state, shortDetail: '1:55 - 4th' }, period: 4, displayClock: '1:55' } }] },
    drives: { current: { plays: [{ id: '2', sequenceNumber: '200', wallclock: '2026-10-04T20:00:00Z' }] } },
    winprobability: [{ homeWinPercentage: .5, playId }]
  };
}

test('lagging probabilities do not produce a misleading live recommendation', () => {
  const result = enrichLiveGame(game, summary({ playId: '1' }));
  assert.equal(result.dataPending, true);
  assert.equal(result.priority, -1);
  assert.equal(result.label, 'Live data pending');
  assert.equal(enrichLiveGame(game, summary()).label, 'Tight finish');
});

test('summary catches a game that finishes during fetch', () => {
  assert.equal(enrichLiveGame(game, summary({ state: 'post' })).state, 'post');
});

function event(id, state) {
  return { id, date: '2026-10-04T20:25Z', competitions: [{ status: { type: { state, shortDetail: '2:00 - 4th' }, period: 4, displayClock: '2:00' },
    competitors: [{ homeAway: 'home', team: { shortDisplayName: 'Home' }, score: '10' }, { homeAway: 'away', team: { shortDisplayName: 'Away' }, score: '7' }] }] };
}

test('live event parsing retains game clock and scores', () => {
  const parsed = parseLiveEvent(event('1', 'in'));
  assert.equal(parsed.clock, '2:00');
  assert.equal(parsed.homeScore, '10');
  assert.equal(parseLiveEvent({}), null);
});

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('live API includes ongoing and upcoming games, excludes finals, tolerates summary failure', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.includes('scoreboard')) return { ok: true, json: async () => ({ events: [event('1', 'in'), event('2', 'pre'), event('3', 'post'), event('4', 'in')] }) };
    if (url.includes('event=4')) throw new Error('ESPN unavailable');
    return { ok: true, json: async () => summary() };
  });
  const res = response();
  await handler({ method: 'GET' }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.games.map(g => g.id), ['1', '4']);
  assert.deepEqual(res.body.upcoming.map(g => g.id), ['2']);
  assert.equal(res.body.metadata.pending, 1);
  assert.match(res.headers['Cache-Control'], /s-maxage=20/);
});

test('live API distinguishes scoreboard failure from an empty slate', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network'); });
  const res = response();
  await handler({ method: 'GET' }, res);
  assert.equal(res.code, 502);
  assert.equal(res.body.success, false);
});

test('live API rejects writes', async () => {
  const res = response();
  await handler({ method: 'POST' }, res);
  assert.equal(res.code, 405);
});
