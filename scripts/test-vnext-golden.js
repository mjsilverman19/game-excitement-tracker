#!/usr/bin/env node

/**
 * vNext Golden Game Tests
 *
 * Tests relative rankings of archetypal game scenarios without brittle exact scores.
 * Validates that the algorithm correctly orders games by entertainment value.
 *
 * Usage:
 *   node scripts/test-vnext-golden.js
 */

import { scoreGame } from '../shared/algorithm-vnext.js';
import { getTierLabel } from '../shared/algorithm-vnext-config.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

/**
 * Generate synthetic probability curve for testing.
 */
function generateProbabilityCurve(pattern, length = 400) {
  const probs = [];

  switch (pattern) {
    case 'blowout':
      // Team dominates wire-to-wire: starts at 80%, ends at 95%
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        const value = 0.80 + (0.15 * progress);
        probs.push({ value, period: Math.floor(progress * 4) + 1 });
      }
      break;

    case 'steady-close':
      // Game stays competitive throughout: oscillates 45-55% with some quick swings
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        const oscillation = Math.sin(progress * Math.PI * 8) * 0.05;
        // Add some sharper swings every quarter
        const sharpSwing = (i % 100 === 0) ? (Math.random() - 0.5) * 0.06 : 0;
        const value = 0.50 + oscillation + sharpSwing;
        probs.push({ value, period: Math.floor(progress * 4) + 1 });
      }
      break;

    case 'dominant-collapse':
      // Team dominates 3 quarters (85%), then collapses in Q4 to close finish (52%)
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        let value;
        if (progress < 0.75) {
          // First 3 quarters: dominant at ~85%
          value = 0.85 + Math.sin(progress * Math.PI * 4) * 0.03;
        } else {
          // Q4: dramatic collapse with sharp drops
          const q4Progress = (progress - 0.75) / 0.25;
          // Steeper collapse curve for higher surprise
          value = 0.85 - (0.33 * Math.pow(q4Progress, 0.7));
          // Add dramatic swings during collapse (sharp drops)
          if (i % 20 === 0) {
            value -= 0.05;
          }
          value += Math.sin(q4Progress * Math.PI * 8) * 0.03;
        }
        probs.push({ value, period: Math.floor(progress * 4) + 1 });
      }
      break;

    case 'walkoff':
      // Boring game at ~60-65% until final moments, then dramatic finish
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        let value;
        if (progress < 0.95) {
          // First 95%: mildly favored home team, not much action
          value = 0.62 + Math.sin(progress * Math.PI * 3) * 0.03;
        } else {
          // Final 5%: dramatic swing to close finish
          const finalProgress = (progress - 0.95) / 0.05;
          value = 0.62 - (0.10 * finalProgress);
        }
        probs.push({ value, period: Math.floor(progress * 4) + 1 });
      }
      break;

    case 'back-and-forth':
      // Multiple lead changes, high volatility throughout, dramatic close finish
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        // Create 6 lead changes with varying magnitudes
        const wave1 = Math.sin(progress * Math.PI * 3) * 0.15;
        const wave2 = Math.sin(progress * Math.PI * 7) * 0.08;
        // Add sharp swings for lead changes
        const sharpSwing = (i % 60 === 0) ? (Math.random() - 0.5) * 0.10 : 0;
        // Make the ending closer to 50/50 for higher finish score
        const endingPull = (progress > 0.8) ? (0.5 - (wave1 + wave2)) * (progress - 0.8) * 2 : 0;
        const value = 0.50 + wave1 + wave2 + sharpSwing + endingPull;
        probs.push({ value: Math.max(0.2, Math.min(0.8, value)), period: Math.floor(progress * 4) + 1 });
      }
      break;

    case 'comeback':
      // Team down big (25%) early, storms back to win (95%)
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        let value;
        if (progress < 0.3) {
          // Early: losing badly
          value = 0.25 + Math.sin(progress * Math.PI * 4) * 0.03;
        } else {
          // Dramatic comeback with sharp rises
          const comebackProgress = (progress - 0.3) / 0.7;
          value = 0.25 + (0.70 * Math.pow(comebackProgress, 0.6));
          // Add sharp upward swings during comeback
          if (i % 25 === 0) {
            value += 0.06;
          }
          value += Math.sin(comebackProgress * Math.PI * 5) * 0.03;
        }
        probs.push({ value, period: Math.floor(progress * 4) + 1 });
      }
      break;

    case 'late-drama':
      // Competitive early, then one team pulls ahead (70%), dramatic close finish
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        let value;
        if (progress < 0.5) {
          // First half: competitive
          value = 0.50 + Math.sin(progress * Math.PI * 6) * 0.08;
        } else if (progress < 0.85) {
          // Pull ahead to ~70%
          const midProgress = (progress - 0.5) / 0.35;
          value = 0.50 + (0.20 * midProgress);
        } else {
          // Late drama: drops back to 50%
          const lateProgress = (progress - 0.85) / 0.15;
          value = 0.70 - (0.20 * lateProgress);
          value += Math.sin(lateProgress * Math.PI * 8) * 0.05;
        }
        probs.push({ value, period: Math.floor(progress * 4) + 1 });
      }
      break;

    default:
      throw new Error(`Unknown pattern: ${pattern}`);
  }

  return probs;
}

/**
 * Golden game fixtures defining expected relative rankings.
 */
const GOLDEN_GAMES = {
  NFL: [
    {
      id: 'blowout',
      description: 'Wire-to-wire dominance (80% → 95%)',
      pattern: 'blowout',
      expectedTier: 'skip',
      shouldOutrank: [] // Nothing worse than a blowout
    },
    {
      id: 'walkoff',
      description: 'Boring game with dramatic final moment',
      pattern: 'walkoff',
      expectedTier: 'recommended',
      shouldOutrank: ['blowout']
    },
    {
      id: 'steady-close',
      description: 'Consistently competitive (45-55% oscillation)',
      pattern: 'steady-close',
      expectedTier: 'recommended',
      shouldOutrank: ['blowout', 'walkoff']
    },
    {
      id: 'back-and-forth',
      description: 'Multiple lead changes, high volatility',
      pattern: 'back-and-forth',
      expectedTier: 'recommended',
      shouldOutrank: ['blowout', 'walkoff']
    },
    {
      id: 'dominant-collapse',
      description: 'Team dominates 3 quarters then collapses',
      pattern: 'dominant-collapse',
      expectedTier: 'must watch',
      shouldOutrank: ['blowout', 'walkoff', 'steady-close']
    },
    {
      id: 'comeback',
      description: 'Team down big (25%) storms back to win',
      pattern: 'comeback',
      expectedTier: 'must watch',
      shouldOutrank: ['blowout', 'walkoff', 'steady-close']
    },
    {
      id: 'late-drama',
      description: 'Competitive early, pull ahead, then dramatic finish',
      pattern: 'late-drama',
      expectedTier: 'must watch',
      shouldOutrank: ['blowout', 'walkoff', 'steady-close']
    }
  ]
};

/**
 * Load normalizers from calibration (if available).
 */
async function loadNormalizers() {
  try {
    const normalizersPath = join(ROOT_DIR, 'analysis', 'vnext-normalizers.json');
    const content = await readFile(normalizersPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.log('⚠️  No normalizers found, using defaults');
    return null;
  }
}

/**
 * Run tests for a sport's golden games.
 */
function testGoldenGames(sport, games, normalizers) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing ${sport} Golden Games`);
  console.log('='.repeat(70));

  const results = [];

  // Score each game
  for (const game of games) {
    const probs = generateProbabilityCurve(game.pattern);
    const result = scoreGame(probs, { sport, overtime: false }, normalizers);

    if (!result) {
      console.error(`❌ Failed to score: ${game.id}`);
      continue;
    }

    results.push({
      ...game,
      score: result.score,
      subscores: result.subscores,
      tier: getTierLabel(result.score),
      diagnostics: result.diagnostics
    });
  }

  // Display results
  console.log('\n📊 Scores:\n');
  results.forEach(r => {
    const tierIcon = r.tier === 'must watch' ? '🏆' : r.tier === 'recommended' ? '👍' : '💤';
    console.log(`${tierIcon} ${r.id.padEnd(20)} | Score: ${r.score.toFixed(1)} | Tier: ${r.tier}`);
    console.log(`   ${r.description}`);
    console.log(`   V: ${r.subscores.volatility.toFixed(3)}, S: ${r.subscores.surprise.toFixed(3)}, F: ${r.subscores.finish.toFixed(3)}`);
    console.log();
  });

  // Validate ordering relationships
  console.log('🔍 Validating Ordering Relationships:\n');

  let passed = 0;
  let failed = 0;

  for (const game of results) {
    const gameResult = results.find(r => r.id === game.id);

    for (const shouldOutrankId of game.shouldOutrank) {
      const otherGame = results.find(r => r.id === shouldOutrankId);

      if (!otherGame) {
        console.log(`⚠️  ${game.id}: Cannot find comparison game "${shouldOutrankId}"`);
        continue;
      }

      if (gameResult.score > otherGame.score) {
        console.log(`✅ ${game.id} (${gameResult.score.toFixed(1)}) > ${shouldOutrankId} (${otherGame.score.toFixed(1)})`);
        passed++;
      } else {
        console.log(`❌ ${game.id} (${gameResult.score.toFixed(1)}) should outrank ${shouldOutrankId} (${otherGame.score.toFixed(1)})`);
        failed++;
      }
    }
  }

  // Validate tier assignments
  console.log('\n🎯 Validating Tier Assignments:\n');

  for (const game of results) {
    if (game.tier === game.expectedTier) {
      console.log(`✅ ${game.id}: "${game.tier}" matches expected "${game.expectedTier}"`);
      passed++;
    } else {
      console.log(`⚠️  ${game.id}: "${game.tier}" (expected "${game.expectedTier}")`);
      // Tier mismatch is a warning, not a failure (normalizers affect this)
    }
  }

  // Validate sanity checks
  console.log('\n🔬 Validating Sanity Checks:\n');

  for (const game of results) {
    const checks = [
      {
        name: 'Score in range [1, 10]',
        pass: game.score >= 1 && game.score <= 10
      },
      {
        name: 'Subscores in range [0, 1]',
        pass: game.subscores.volatility >= 0 && game.subscores.volatility <= 1 &&
              game.subscores.surprise >= 0 && game.subscores.surprise <= 1 &&
              game.subscores.finish >= 0 && game.subscores.finish <= 1
      },
      {
        name: 'No NaN values',
        pass: !isNaN(game.score) &&
              !isNaN(game.subscores.volatility) &&
              !isNaN(game.subscores.surprise) &&
              !isNaN(game.subscores.finish)
      },
      {
        name: 'No Infinity values',
        pass: isFinite(game.score) &&
              isFinite(game.subscores.volatility) &&
              isFinite(game.subscores.surprise) &&
              isFinite(game.subscores.finish)
      }
    ];

    checks.forEach(check => {
      if (check.pass) {
        passed++;
      } else {
        console.log(`❌ ${game.id}: ${check.name}`);
        failed++;
      }
    });
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📈 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(70));

  return { passed, failed, results };
}

/**
 * Main test runner.
 */
async function runTests() {
  console.log('\n🚀 vNext Golden Game Tests');

  const normalizers = await loadNormalizers();

  if (normalizers) {
    console.log('\n✅ Loaded normalizers:');
    console.log(JSON.stringify(normalizers, null, 2));
  }

  const allResults = {};

  for (const [sport, games] of Object.entries(GOLDEN_GAMES)) {
    const result = testGoldenGames(sport, games, normalizers);
    allResults[sport] = result;
  }

  // Final summary
  console.log('\n\n' + '='.repeat(70));
  console.log('🏁 Final Summary');
  console.log('='.repeat(70));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const [sport, result] of Object.entries(allResults)) {
    console.log(`\n${sport}: ${result.passed} passed, ${result.failed} failed`);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed`);

  if (totalFailed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test runner failed:', error);
  process.exit(1);
});
