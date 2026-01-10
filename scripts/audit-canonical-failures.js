#!/usr/bin/env node

/**
 * Canonical Game Failure Audit
 *
 * For each game that failed tier classification, fetches complete probability data
 * and provides detailed analysis to determine whether the algorithm or expected tier is wrong.
 *
 * Usage: node scripts/audit-canonical-failures.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllProbabilities } from '../api/calculator.js';
import { analyzeGameEntertainmentDetailed } from '../api/calculator.js';
import { fetchSingleGame } from '../api/fetcher.js';
import { getTier } from '../shared/algorithm-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load canonical games
const canonicalPath = path.join(__dirname, '..', 'analysis', 'canonical-games.json');
const canonicalGames = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));

// List of games that failed in the comparison (from the run output)
const FAILING_GAMES = [
  // Under-scoring (expected higher than actual)
  { gameId: '401326594', sport: 'NFL', label: 'Bills at Chiefs (AFC Divisional)', expected: 'must-watch', actual: 6.0, issue: 'under-scored' },
  { gameId: '401671668', sport: 'NFL', label: 'Week 2: Steelers at Broncos', expected: 'recommended', actual: 4.6, issue: 'under-scored' },
  { gameId: '401671492', sport: 'NFL', label: 'Thanksgiving: Bears at Lions', expected: 'recommended', actual: 5.8, issue: 'under-scored' },
  { gameId: '401442016', sport: 'CFB', label: 'Fiesta Bowl TCU vs Michigan', expected: 'must-watch', actual: 5.8, issue: 'under-scored' },
  { gameId: '401677179', sport: 'CFB', label: 'CFP First Round: Indiana at Notre Dame', expected: 'recommended', actual: 2.3, issue: 'under-scored' },
  { gameId: '401677176', sport: 'CFB', label: 'CFP First Round: Clemson at Texas', expected: 'recommended', actual: 2.4, issue: 'under-scored' },
  { gameId: '401628374', sport: 'CFB', label: 'Georgia at Alabama', expected: 'must-watch', actual: 5.2, issue: 'under-scored' },
  { gameId: '401644683', sport: 'CFB', label: 'Miami (OH) at Northwestern', expected: 'recommended', actual: 4.3, issue: 'under-scored' },

  // Over-scoring (expected lower than actual)
  { gameId: '401671622', sport: 'NFL', label: 'Week 4: Broncos at Jets', expected: 'recommended', actual: 9.2, issue: 'over-scored' },
  { gameId: '401671702', sport: 'NFL', label: 'Week 2: Seahawks at Patriots', expected: 'recommended', actual: 9.3, issue: 'over-scored' },
  { gameId: '401671869', sport: 'NFL', label: 'Week 11: Packers at Bears', expected: 'recommended', actual: 9.1, issue: 'over-scored' },
  { gameId: '401671784', sport: 'NFL', label: 'Week 5 (MNF): Cowboys at Steelers', expected: 'recommended', actual: 9.4, issue: 'over-scored' },
  { gameId: '401671883', sport: 'NFL', label: 'Wild Card: Commanders at Buccaneers', expected: 'recommended', actual: 9.0, issue: 'over-scored' },
  { gameId: '401628464', sport: 'CFB', label: 'Rivalry: Iowa State at Iowa', expected: 'recommended', actual: 9.0, issue: 'over-scored' },
  { gameId: '401704973', sport: 'NBA', label: 'Christmas Day: 76ers at Celtics', expected: 'recommended', actual: 8.8, issue: 'over-scored' },
  { gameId: '401704693', sport: 'NBA', label: 'Trail Blazers at Clippers', expected: 'recommended', actual: 9.2, issue: 'over-scored' },
  { gameId: '401704711', sport: 'NBA', label: 'Cavaliers at Bucks', expected: 'recommended', actual: 8.9, issue: 'over-scored' },
  { gameId: '401704977', sport: 'NBA', label: 'Heat at Magic', expected: 'recommended', actual: 9.3, issue: 'over-scored' },
  { gameId: '401766462', sport: 'NBA', label: 'Play-In: Heat at Hawks', expected: 'recommended', actual: 8.9, issue: 'over-scored' },
];

async function analyzeGame(game) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`GAME: ${game.label}`);
  console.log(`Sport: ${game.sport} | Game ID: ${game.gameId}`);
  console.log(`Expected: ${game.expected} | Actual Score: ${game.actual} | Issue: ${game.issue}`);
  console.log('='.repeat(80));

  try {
    // Fetch probability data
    const items = await fetchAllProbabilities(game.gameId, game.sport);
    if (!items || items.length === 0) {
      console.log('ERROR: No probability data available');
      return { ...game, verdict: 'NO_DATA' };
    }

    const probs = items.map(p => p.homeWinPercentage);

    // Basic statistics
    const firstWP = probs[0];
    const lastWP = probs[probs.length - 1];
    const minWP = Math.min(...probs);
    const maxWP = Math.max(...probs);
    const avgWP = probs.reduce((a, b) => a + b, 0) / probs.length;

    // Count time in competitive band (30-70%)
    const inBand = probs.filter(p => p >= 0.30 && p <= 0.70).length;
    const bandPct = (inBand / probs.length * 100).toFixed(1);

    // Count lead changes (crossings of 50%)
    let leadChanges = 0;
    for (let i = 1; i < probs.length; i++) {
      if ((probs[i-1] - 0.5) * (probs[i] - 0.5) < 0) leadChanges++;
    }

    // Find decision point (last time in competitive band)
    let decisionPointIdx = probs.length - 1;
    for (let i = probs.length - 1; i >= 0; i--) {
      if (probs[i] >= 0.25 && probs[i] <= 0.75) {
        decisionPointIdx = i;
        break;
      }
    }
    const decisionLateness = (decisionPointIdx / (probs.length - 1) * 100).toFixed(1);

    // Find max deficit overcome by winner
    const homeWon = lastWP > 0.5;
    let maxDeficit = 0;
    for (const p of probs) {
      if (homeWon && p < 0.5) maxDeficit = Math.max(maxDeficit, 0.5 - p);
      if (!homeWon && p > 0.5) maxDeficit = Math.max(maxDeficit, p - 0.5);
    }

    console.log(`\nDATA SUMMARY:`);
    console.log(`  Data points: ${probs.length}`);
    console.log(`  First WP: ${(firstWP * 100).toFixed(1)}%`);
    console.log(`  Final WP: ${(lastWP * 100).toFixed(1)}%`);
    console.log(`  WP Range: ${(minWP * 100).toFixed(1)}% - ${(maxWP * 100).toFixed(1)}%`);
    console.log(`  Average WP: ${(avgWP * 100).toFixed(1)}%`);
    console.log(`  Time in competitive band (30-70%): ${bandPct}%`);
    console.log(`  Lead changes: ${leadChanges}`);
    console.log(`  Decision point: ${decisionLateness}% through game`);
    console.log(`  Max deficit overcome: ${(maxDeficit * 100).toFixed(1)}%`);

    // Get full analysis
    const gameData = await fetchSingleGame(game.sport, game.gameId);
    const analysis = await analyzeGameEntertainmentDetailed(gameData, game.sport);

    if (analysis) {
      console.log(`\nALGORITHM BREAKDOWN:`);
      console.log(`  Tension: ${analysis.breakdown.tension.toFixed(2)}`);
      console.log(`  Drama: ${analysis.breakdown.drama.toFixed(2)}`);
      console.log(`  Finish: ${analysis.breakdown.finish.toFixed(2)}`);
      console.log(`  Raw Score: ${analysis.rawScore?.toFixed(2) || 'N/A'}`);
      console.log(`  Final Score: ${analysis.score}`);
      if (analysis.decisionPointInfo) {
        console.log(`  Decision Multiplier: ${analysis.decisionPointInfo.multiplier?.toFixed(3) || 'N/A'}`);
      }
    }

    // Determine verdict
    let verdict = '';
    let reasoning = '';

    if (game.issue === 'under-scored') {
      // Was this game actually boring based on data?
      if (bandPct < 20 && leadChanges < 3) {
        verdict = 'EXPECTED_WRONG';
        reasoning = 'Game was never truly competitive (low time in band, few lead changes)';
      } else if (decisionLateness < 50 && maxDeficit < 0.15) {
        verdict = 'EXPECTED_WRONG';
        reasoning = 'Game was decided early with no significant comeback threat';
      } else if (leadChanges >= 5 || (bandPct > 40 && decisionLateness > 70)) {
        verdict = 'ALGORITHM_WRONG';
        reasoning = 'Game was competitive with drama but algorithm under-scored it';
      } else {
        verdict = 'NEEDS_REVIEW';
        reasoning = 'Mixed signals - requires human judgment';
      }
    } else {
      // Over-scored - was this game actually exciting based on data?
      if (bandPct > 50 && leadChanges >= 4 && decisionLateness > 80) {
        verdict = 'EXPECTED_WRONG';
        reasoning = 'Game was highly competitive throughout with late drama - should be must-watch';
      } else if (bandPct > 40 && decisionLateness > 70) {
        verdict = 'EXPECTED_WRONG';
        reasoning = 'Game stayed competitive and was decided late - deserves higher tier';
      } else if (bandPct < 30 && leadChanges < 3) {
        verdict = 'ALGORITHM_WRONG';
        reasoning = 'Game lacked sustained competition but scored too high';
      } else {
        verdict = 'NEEDS_REVIEW';
        reasoning = 'Mixed signals - requires human judgment';
      }
    }

    console.log(`\nVERDICT: ${verdict}`);
    console.log(`Reasoning: ${reasoning}`);

    return {
      ...game,
      verdict,
      reasoning,
      dataPoints: probs.length,
      bandPct: parseFloat(bandPct),
      leadChanges,
      decisionLateness: parseFloat(decisionLateness),
      maxDeficit: maxDeficit * 100
    };

  } catch (error) {
    console.log(`ERROR: ${error.message}`);
    return { ...game, verdict: 'ERROR', reasoning: error.message };
  }
}

async function main() {
  console.log('CANONICAL GAME FAILURE AUDIT');
  console.log('Analyzing each failing game to determine correct verdict\n');

  const results = [];

  for (const game of FAILING_GAMES) {
    const result = await analyzeGame(game);
    results.push(result);
    await new Promise(r => setTimeout(r, 200)); // Rate limiting
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(80));

  const expectedWrong = results.filter(r => r.verdict === 'EXPECTED_WRONG');
  const algorithmWrong = results.filter(r => r.verdict === 'ALGORITHM_WRONG');
  const needsReview = results.filter(r => r.verdict === 'NEEDS_REVIEW');
  const errors = results.filter(r => r.verdict === 'ERROR' || r.verdict === 'NO_DATA');

  console.log(`\nTotal failures analyzed: ${results.length}`);
  console.log(`  Expected tier is wrong: ${expectedWrong.length}`);
  console.log(`  Algorithm is wrong: ${algorithmWrong.length}`);
  console.log(`  Needs human review: ${needsReview.length}`);
  console.log(`  Errors/No data: ${errors.length}`);

  if (expectedWrong.length > 0) {
    console.log(`\n--- Games where EXPECTED TIER should change ---`);
    for (const r of expectedWrong) {
      const canonical = canonicalGames.find(g => g.gameId === r.gameId);
      const suggestedTier = r.issue === 'under-scored' ? 'skip' : 'must-watch';
      console.log(`  ${r.label}`);
      console.log(`    Current expected: ${r.expected} -> Suggested: ${suggestedTier}`);
      console.log(`    Reason: ${r.reasoning}`);
    }
  }

  if (algorithmWrong.length > 0) {
    console.log(`\n--- Games where ALGORITHM needs fixing ---`);
    for (const r of algorithmWrong) {
      console.log(`  ${r.label}`);
      console.log(`    Expected: ${r.expected}, Got: ${r.actual}`);
      console.log(`    Reason: ${r.reasoning}`);
    }
  }

  if (needsReview.length > 0) {
    console.log(`\n--- Games requiring HUMAN REVIEW ---`);
    for (const r of needsReview) {
      console.log(`  ${r.label}`);
      console.log(`    Expected: ${r.expected}, Got: ${r.actual}`);
      console.log(`    Stats: ${r.bandPct}% in band, ${r.leadChanges} lead changes, decision at ${r.decisionLateness}%`);
    }
  }

  // Save results
  const outputPath = path.join(__dirname, '..', 'analysis', 'canonical-failure-audit.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to: ${outputPath}`);
}

main().catch(console.error);
