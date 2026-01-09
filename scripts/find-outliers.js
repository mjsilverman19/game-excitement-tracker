#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_ROOT = join(ROOT, 'public', 'data');
const OUTPUT_PATH = join(ROOT, 'analysis', 'outliers-report.json');

const SPORT_LINKS = {
  NFL: 'https://www.espn.com/nfl/game/_/gameId/',
  CFB: 'https://www.espn.com/college-football/game/_/gameId/',
  NBA: 'https://www.espn.com/nba/game/_/gameId/'
};

async function collectJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectJsonFiles(fullPath);
      files.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

function buildRecapLink(sport, gameId) {
  const base = SPORT_LINKS[sport] || '';
  return gameId && base ? `${base}${gameId}` : '';
}

async function loadGames() {
  const files = await collectJsonFiles(DATA_ROOT);
  const games = [];

  for (const filePath of files) {
    const relPath = relative(DATA_ROOT, filePath);
    const parts = relPath.split(sep);
    const sport = parts[0] ? parts[0].toUpperCase() : 'UNKNOWN';
    const season = parts[1] || '';

    try {
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      const fileGames = Array.isArray(data.games) ? data.games : [];
      for (const game of fileGames) {
        games.push({ ...game, _sport: sport, _season: season });
      }
    } catch (err) {
      console.warn(`⚠️  Skipping ${filePath}: ${err.message}`);
    }
  }

  return games;
}

async function main() {
  if (!existsSync(DATA_ROOT)) {
    console.error(`Data folder not found: ${DATA_ROOT}`);
    process.exit(1);
  }

  const games = await loadGames();
  const outliers = [];

  for (const game of games) {
    const flags = [];
    const excitement = typeof game.excitement === 'number' ? game.excitement : null;
    const tension = typeof game.breakdown?.tension === 'number' ? game.breakdown.tension : null;
    const drama = typeof game.breakdown?.drama === 'number' ? game.breakdown.drama : null;
    const finish = typeof game.breakdown?.finish === 'number' ? game.breakdown.finish : null;
    const margin =
      typeof game.homeScore === 'number' && typeof game.awayScore === 'number'
        ? Math.abs(game.homeScore - game.awayScore)
        : null;
    const overtime = Boolean(game.overtime);

    if (finish != null && drama != null && finish >= 7 && drama < 4) {
      flags.push('high-finish-low-drama');
    }
    if (tension != null && margin != null && tension >= 7 && margin > 21) {
      flags.push('high-tension-blowout');
    }
    if (excitement != null && excitement < 6 && overtime) {
      flags.push('low-score-overtime');
    }
    if (excitement != null && margin != null && excitement < 5 && margin <= 3) {
      flags.push('low-score-close-margin');
    }

    if (flags.length === 0) continue;

    outliers.push({
      gameId: game.id || game.gameId || '',
      sport: game._sport || '',
      season: game._season || '',
      teams: `${game.awayTeam || ''} @ ${game.homeTeam || ''}`.trim(),
      finalScore: `${game.awayScore ?? ''}-${game.homeScore ?? ''}`,
      excitement,
      breakdown: {
        tension,
        drama,
        finish
      },
      margin,
      overtime,
      flags,
      recapLink: buildRecapLink(game._sport, game.id || game.gameId)
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalGames: games.length,
    flaggedGames: outliers.length,
    flags: {
      'high-finish-low-drama': outliers.filter(g => g.flags.includes('high-finish-low-drama')).length,
      'high-tension-blowout': outliers.filter(g => g.flags.includes('high-tension-blowout')).length,
      'low-score-overtime': outliers.filter(g => g.flags.includes('low-score-overtime')).length,
      'low-score-close-margin': outliers.filter(g => g.flags.includes('low-score-close-margin')).length
    },
    outliers
  };

  console.log('=== Outlier Detection Report ===');
  console.log(`Flagged games: ${report.flaggedGames} / ${report.totalGames}`);
  console.log('');
  console.log(`High Finish / Low Drama: ${report.flags['high-finish-low-drama']} games`);
  console.log(`High Tension / Blowout: ${report.flags['high-tension-blowout']} games`);
  console.log(`Low Score / Overtime: ${report.flags['low-score-overtime']} games`);
  console.log(`Low Score / Close Margin: ${report.flags['low-score-close-margin']} games`);

  await mkdir(join(ROOT, 'analysis'), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
