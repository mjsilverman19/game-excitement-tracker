#!/usr/bin/env node

/**
 * Purpose: Inspect high-tension blowouts from an outliers report.
 * Usage: node scripts/report-blowout-outliers.js
 * Output: Console report with margins, breakdowns, and diagnostic notes.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { analyzeGameEntertainmentDetailed } from '../api/calculator.js';
import { fetchSingleGame } from '../api/fetcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTLIERS_PATH = join(ROOT, 'analysis', 'outliers-report.json');

function computeLateCloseness(probs) {
  if (!probs.length) return 0;
  const startIndex = Math.floor(probs.length * 0.75);
  const lateProbs = probs.slice(startIndex);
  if (lateProbs.length === 0) return 0;

  let total = 0;
  for (const p of lateProbs) {
    const closeness = 1 - Math.abs(p.value - 0.5) * 2;
    total += Math.max(0, Math.min(1, closeness));
  }

  return total / lateProbs.length;
}

function formatNumber(value, decimals = 2) {
  return typeof value === 'number' ? value.toFixed(decimals) : 'n/a';
}

function summarizeFlag(margin, lateCloseness, breakdown) {
  if (lateCloseness < 0.2) {
    return 'Low late closeness; likely decided early despite swings.';
  }
  if (lateCloseness < 0.3) {
    return 'Late closeness near threshold; borderline blowout penalty.';
  }
  if (breakdown.tension >= 7) {
    return 'High tension with big margin suggests early volatility or garbage-time noise.';
  }
  if (margin >= 25) {
    return 'Large margin; verify if late scoring inflated swings.';
  }
  return 'Needs review; may be legitimate volatility despite margin.';
}

async function fetchProbabilities(gameId, sport) {
  let sportType;
  let league;
  if (sport === 'NBA') {
    sportType = 'basketball';
    league = 'nba';
  } else {
    sportType = 'football';
    league = sport === 'CFB' ? 'college-football' : 'nfl';
  }

  const url = `https://sports.core.api.espn.com/v2/sports/${sportType}/leagues/${league}/events/${gameId}/competitions/${gameId}/probabilities?limit=300`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.items || []).map(p => ({
    value: Math.max(0, Math.min(1, p.homeWinPercentage || 0.5)),
    period: p.period || 1
  }));
}

async function main() {
  if (!existsSync(OUTLIERS_PATH)) {
    console.error(`Missing outliers report: ${OUTLIERS_PATH}`);
    process.exit(1);
  }

  const raw = await readFile(OUTLIERS_PATH, 'utf8');
  const report = JSON.parse(raw);
  const blowouts = report.outliers.filter(item => item.flags?.includes('high-tension-blowout'));

  for (const entry of blowouts) {
    const baseGame = await fetchSingleGame(entry.sport, entry.gameId);
    const analysis = await analyzeGameEntertainmentDetailed(baseGame, entry.sport);
    if (!analysis) {
      console.log(`\n${entry.teams} (${entry.gameId})`);
      console.log('No probability data.');
      continue;
    }

    const probs = await fetchProbabilities(entry.gameId, entry.sport);
    const lateCloseness = computeLateCloseness(probs);
    const breakdown = analysis.breakdown || {};

    const margin = entry.margin ?? Math.abs((analysis.homeScore || 0) - (analysis.awayScore || 0));
    const blowoutThreshold = entry.sport === 'NBA' ? 25 : 28;
    const capTriggered = margin > blowoutThreshold && analysis.finalScore > 6.5 && analysis.score === 6.5;

    console.log(`\n${entry.teams} (${entry.gameId})`);
    console.log(`Margin: ${margin}`);
    console.log(`Final score: ${formatNumber(analysis.score, 2)}`);
    console.log(`Final score (pre-cap): ${formatNumber(analysis.finalScore, 2)}`);
    console.log(`Cap triggered: ${capTriggered ? 'yes' : 'no'}`);
    console.log(`Late closeness: ${formatNumber(lateCloseness, 3)}`);
    console.log(
      `Breakdown: tension ${formatNumber(breakdown.tension)}, drama ${formatNumber(breakdown.drama)}, finish ${formatNumber(breakdown.finish)}`
    );
    console.log(`Flag reason: ${summarizeFlag(margin, lateCloseness, breakdown)}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
