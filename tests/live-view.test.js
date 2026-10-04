import test from 'node:test';
import assert from 'node:assert/strict';

async function setup(t) {
  const elements = Object.fromEntries(['liveArea', 'liveStatus', 'liveRefresh', 'liveShowScores'].map(id => [id, {
    innerHTML: '', textContent: '', disabled: false,
    addEventListener(name, callback) { this[name] = callback; }
  }]));
  const document = { hidden: false, getElementById: id => elements[id],
    addEventListener(name, callback) { this[name] = callback; } };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = { addEventListener() {} };
  t.after(() => { globalThis.document = previousDocument; globalThis.window = previousWindow; });
  const module = await import(`../src/js/components/live-games.js?test=${Math.random()}`);
  module.initLiveGames();
  t.after(module.stopLiveGames);
  return { module, elements, document };
}
const data = () => ({ success: true, games: [{ awayTeam: 'Away <script>', homeTeam: 'Home', awayScore: '17', homeScore: '20', status: '2:00 - 4th', label: 'Tight finish' }], metadata: { fetchedAt: new Date().toISOString(), pending: 0 } });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('live view hides scores, escapes team names, and shows scores only on request', async t => {
  const { module, elements } = await setup(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => data() }));
  module.startLiveGames(); await flush();
  assert.doesNotMatch(elements.liveArea.innerHTML, /class="live-score"/);
  assert.match(elements.liveArea.innerHTML, /Away &lt;script&gt;/);
  elements.liveShowScores.change({ target: { checked: true } });
  assert.match(elements.liveArea.innerHTML, /class="live-score"/);
});

test('leaving the live view aborts requests and blocks late rendering', async t => {
  const { module, elements } = await setup(t);
  let resolve; let signal;
  t.mock.method(globalThis, 'fetch', (_url, options) => {
    signal = options.signal;
    return new Promise(done => { resolve = done; });
  });
  module.startLiveGames(); module.stopLiveGames();
  assert.equal(signal.aborted, true);
  resolve({ ok: true, json: async () => data() }); await flush();
  assert.equal(elements.liveArea.innerHTML, '');
});

test('failed refresh retains existing games with a stale-data message', async t => {
  const { module, elements } = await setup(t);
  let fail = false;
  t.mock.method(globalThis, 'fetch', async () => {
    if (fail) throw new Error('offline');
    return { ok: true, json: async () => data() };
  });
  module.startLiveGames(); await flush();
  const rendered = elements.liveArea.innerHTML;
  fail = true; await elements.liveRefresh.click();
  assert.equal(elements.liveArea.innerHTML, rendered);
  assert.match(elements.liveStatus.textContent, /Refresh failed. Showing data from/);
});

test('live view refreshes after a minute and pauses while hidden', async t => {
  const { module, document } = await setup(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return { ok: true, json: async () => data() }; });
  module.startLiveGames(); await flush();
  assert.equal(requests, 1);
  t.mock.timers.tick(60000); await flush();
  assert.equal(requests, 2);
  document.hidden = true; document.visibilitychange();
  t.mock.timers.tick(120000); await flush();
  assert.equal(requests, 2);
  document.hidden = false; document.visibilitychange(); await flush();
  assert.equal(requests, 3);
});

test('probability chart hides identifying labels until scores are enabled', async t => {
  const { module } = await setup(t);
  const game = { homeTeam: 'Home', awayTeam: 'Away', probabilityHistory: [.2, .6, .54] };
  const hidden = module.renderLiveProbabilityChart(game);
  assert.match(hidden, /<svg/);
  assert.doesNotMatch(hidden, /Home|Away|54%|46%|<text|live-chart-values/);
  const visible = module.renderLiveProbabilityChart(game, true);
  assert.match(visible, /Home 54% · Away 46%/);
  assert.match(visible, /100%/);
});

test('probability chart handles one point, zero probability, invalid data, and pending data', async t => {
  const { module } = await setup(t);
  assert.match(module.renderLiveProbabilityChart({ probabilityHistory: [0] }), /cy="88.0"/);
  assert.match(module.renderLiveProbabilityChart({ probabilityHistory: [1] }), /cy="8.0"/);
  assert.equal(module.renderLiveProbabilityChart({ probabilityHistory: [null, NaN, -1, 2] }), '');
  assert.equal(module.renderLiveProbabilityChart({ probabilityHistory: [.5], dataPending: true }), '');
});


test('game flow shows quarter markers without team or percentage labels', async t => {
  const { module } = await setup(t);
  const chart = module.renderLiveProbabilityChart({ homeTeam: 'Home', awayTeam: 'Away', probabilityHistory: [.4, .6, .5], quarterMarkers: [{ index: 0, period: 1 }, { index: 2, period: 2 }] });
  assert.match(chart, /Game flow/);
  assert.match(chart, />Q1<|>Q2</);
  assert.doesNotMatch(chart, /Home|Away|50%/);
});
