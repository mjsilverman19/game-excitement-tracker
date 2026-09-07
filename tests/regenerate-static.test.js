import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);
const script = resolve('scripts/regenerate-existing-static.js');
for (const fail of [false, true]) {
  test(`regeneration ${fail ? 'preserves originals on missing data' : 'preserves membership and metadata while rescoring'}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'gei-regeneration-test-'));
    try {
      const dir = join(root, 'public/data/nfl/2025');
      await mkdir(dir, { recursive: true });
      await mkdir(join(root, 'analysis'));
      // The script hashes the source modules to invalidate obsolete cached scores.
      for (const file of ['api/calculator.js', 'api/data-quality.js', 'shared/algorithm-config.js', 'shared/espn-api.js']) {
        await mkdir(join(root, file, '..'), { recursive: true });
        await writeFile(join(root, file), await readFile(resolve(file)));
      }
      const game = { id: 'test', homeTeam: 'Home', awayTeam: 'Away', homeScore: 10, awayScore: 24, excitement: 5, customField: 'preserve me', homeLogo: 'logo', overtime: false };
      const original = JSON.stringify({ success: true, games: [game], metadata: { sport: 'NFL', season: 2025, week: 1, count: 1, algorithmVersion: '3.5' } });
      await writeFile(join(dir, 'week-01.json'), original);
      await writeFile(join(dir, 'latest.json'), '{"week":1}');
      const preload = join(root, 'mock.mjs');
      await writeFile(preload, `globalThis.fetch = async () => ({ok: ${!fail}, status: 404, json: async () => ({pageCount:1,items:Array.from({length:12},()=>({homeWinPercentage:0,period:4,clock:{displayValue:'1:00'}}))})});`);
      let failed = false;
      try { await run(process.execPath, ['--import', preload, script, '--write', '--cache-dir', join(root, 'cache')], { cwd: root }); } catch { failed = true; }
      assert.equal(failed, fail);
      const report = JSON.parse(await readFile(join(root, 'analysis/static-regeneration-report.json')));
      assert.equal(report.written, !fail);
      const contents = await readFile(join(dir, 'week-01.json'), 'utf8');
      if (fail) {
        assert.equal(contents, original);
        assert.equal(report.failures.length, 1);
      } else {
        const updated = JSON.parse(contents);
        assert.equal(updated.games.length, 1);
        assert.equal(updated.games[0].id, game.id);
        assert.equal(updated.games[0].customField, game.customField);
        assert.equal(updated.games[0].homeLogo, game.homeLogo);
        assert.ok(updated.games[0].excitement < game.excitement);
        assert.equal(updated.metadata.algorithmVersion, '3.5.1');
        assert.equal(await readFile(join(root, 'cache/originals/nfl/2025/week-01.json'), 'utf8'), original);
      }
      assert.equal(await readFile(join(dir, 'latest.json'), 'utf8'), '{"week":1}');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
