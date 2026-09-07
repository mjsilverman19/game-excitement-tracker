import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadGames, getStaticPath } from '../src/js/services/api.js';
import { beginLoad } from '../src/js/services/load-state.js';
import { analyzeGameEntertainmentDetailed } from '../api/calculator.js';

const reply = data => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => data });
const games = id => ({ success: true, games: [{ id }] });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let rendered, cached, errors;
beforeEach(() => {
    rendered = []; cached = []; errors = [];
    globalThis.window = {
        selectedSport: 'NFL', selectedSeason: 2025, selectedWeek: 1,
        selectedDate: '2025-01-01', viewMode: 'week', rangeMode: 'latest',
        isLoading: false, isInitialLoad: false,
        showLoading() {}, updateUI() {},
        displayResults() { rendered.push(window.currentGames[0].id); },
        showEmpty(message) { errors.push(message); }
    };
    globalThis.localStorage = { setItem: (...args) => cached.push(args) };
});

test('static paths match all NFL postseason filenames and existing period formats', () => {
    for (const round of ['wild-card', 'divisional', 'conference', 'super-bowl']) {
        assert.equal(getStaticPath('NFL', 2025, round), `/data/nfl/2025/${round}.json`);
    }
    assert.equal(getStaticPath('NFL', 2025, 1), '/data/nfl/2025/week-01.json');
    assert.equal(getStaticPath('CFB', 2025, 'bowls'), '/data/cfb/2025/bowls.json');
    assert.equal(getStaticPath('CFB', 2025, 'playoffs'), '/data/cfb/2025/playoffs.json');
    assert.equal(getStaticPath('NBA', 2025, '2025-01-01'), '/data/nba/2025/2025-01-01.json');
});

test('playoff slate loads statically without calling the API', async () => {
    window.selectedWeek = 'wild-card';
    globalThis.fetch = async url => {
        assert.equal(url, '/data/nfl/2025/wild-card.json');
        return reply(games('playoff'));
    };
    await loadGames();
    assert.deepEqual(rendered, ['playoff']);
});

for (const source of ['static', 'api']) {
    test(`late ${source} results cannot overwrite the new sport or cache`, async () => {
        const old = deferred();
        const started = deferred();
        globalThis.fetch = async url => {
            if (source === 'static') return old.promise;
            if (url !== '/api/games') return { ok: false };
            started.resolve();
            return old.promise;
        };
        const first = loadGames();
        if (source === 'api') await started.promise;
        window.selectedSport = 'CFB';
        globalThis.fetch = async () => reply(games('new'));
        await loadGames();
        old.resolve(reply(games('old')));
        await first;
        assert.deepEqual(rendered, ['new']);
        assert.equal(cached.length, 1);
        assert.equal(cached[0][0], 'gei_lastWeek_CFB_2025');
        assert.equal(window.isLoading, false);
    });
}

test('stale API failures do not clear a newer loading state or show errors', async () => {
    const old = deferred(), started = deferred(), current = deferred();
    globalThis.fetch = async url => {
        if (url !== '/api/games') return { ok: false };
        started.resolve();
        return old.promise;
    };
    const first = loadGames();
    await started.promise;
    window.selectedSport = 'CFB';
    globalThis.fetch = () => current.promise;
    const second = loadGames();
    old.reject(new Error('old failure'));
    await first;
    assert.equal(window.isLoading, true);
    assert.deepEqual(errors, []);
    current.resolve(reply(games('new')));
    await second;
    assert.equal(window.isLoading, false);
});

test('ownership invalidates discovery on selection changes and repeated requests', () => {
    const first = beginLoad();
    const second = beginLoad();
    assert.equal(first(), false);
    assert.equal(second(), true);
    window.selectedSport = 'NBA';
    assert.equal(second(), false);
});

test('zero probabilities remain decisive; missing probabilities still default to neutral', async () => {
    const analyze = async value => {
        globalThis.fetch = async () => reply({ items: Array.from({ length: 20 }, () => ({ homeWinPercentage: value, period: 4, clock: { displayValue: '1:00' } })) });
        return analyzeGameEntertainmentDetailed({ id: 'test', homeScore: 0, awayScore: 35 }, 'NFL');
    };
    const zero = await analyze(0);
    const nearZero = await analyze(0.000001);
    const neutral = await analyze(0.5);
    for (const metric of ['tension', 'drama', 'finish']) {
        assert.ok(Math.abs(zero.breakdown[metric] - nearZero.breakdown[metric]) < 0.01);
    }
    assert.ok(zero.breakdown.tension < neutral.breakdown.tension);
    assert.deepEqual((await analyze(null)).breakdown, neutral.breakdown);
    assert.deepEqual((await analyze(undefined)).breakdown, neutral.breakdown);
    assert.ok((await analyze(1)).breakdown.tension < neutral.breakdown.tension);
});

test('an initial week fallback keeps ownership of the child loading state', async () => {
    window.isInitialLoad = true;
    window.selectedWeek = 2;
    const child = deferred(), childStarted = deferred();
    globalThis.fetch = async url => {
        if (url.endsWith('week-01.json')) { childStarted.resolve(); return child.promise; }
        return reply({ success: true, games: [] });
    };
    const loading = loadGames();
    await childStarted.promise;
    assert.equal(window.isLoading, true);
    assert.equal(window.selectedWeek, 1);
    child.resolve(reply(games('previous week')));
    await loading;
    assert.deepEqual(rendered, ['previous week']);
    assert.equal(window.isLoading, false);
});

test('an empty response from an old sport cannot trigger fallback', async () => {
    window.isInitialLoad = true;
    const old = deferred(), started = deferred();
    globalThis.fetch = async url => {
        if (url !== '/api/games') return { ok: false };
        started.resolve(); return old.promise;
    };
    const first = loadGames();
    await started.promise;
    window.selectedSport = 'CFB';
    window.selectedWeek = 3;
    globalThis.fetch = async () => reply(games('current'));
    await loadGames();
    old.resolve(reply({ success: true, games: [] }));
    await first;
    assert.equal(window.selectedWeek, 3);
    assert.deepEqual(rendered, ['current']);
    assert.deepEqual(errors, []);
});

test('superseded season scans stop without changing results or loading messages', async () => {
    const { openTopGames } = await import('../src/js/components/top-games.js');
    globalThis.document = { getElementById: () => ({ hidden: false }) };
    const old = deferred();
    let progress = 0, requests = 0;
    window.showLoading = () => progress++;
    globalThis.fetch = () => { requests++; return old.promise; };
    const first = openTopGames('season');
    window.selectedSport = 'CFB';
    window.viewMode = 'week';
    globalThis.fetch = async () => reply(games('new'));
    await loadGames();
    const latestProgress = progress;
    old.resolve(reply(games('old')));
    await first;
    assert.equal(progress, latestProgress);
    assert.equal(requests, 1);
    assert.deepEqual(rendered, ['new']);
    assert.equal(window.isLoading, false);
});
