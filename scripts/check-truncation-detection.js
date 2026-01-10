#!/usr/bin/env node

/**
 * Check if detectAndAdjustForTruncatedData is triggering on canonical games
 * with complete data fetching. Helps determine if the function is still needed.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllProbabilities } from '../api/calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load canonical games
const canonicalPath = path.join(__dirname, '..', 'analysis', 'canonical-games.json');
const canonicalGames = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));

// Replicate the detectAndAdjustForTruncatedData logic to check when it triggers
function checkTruncationDetection(probs) {
  if (probs.length < 20) return { triggers: false, reason: 'too few points' };

  const checkWindow = 10;
  const finalWindow = probs.slice(-checkWindow);
  const extremeThreshold = 0.02;

  const allAtLowExtreme = finalWindow.every(p => p <= extremeThreshold);
  const allAtHighExtreme = finalWindow.every(p => p >= (1 - extremeThreshold));

  if (!allAtLowExtreme && !allAtHighExtreme) {
    return { triggers: false, reason: 'final window not at extreme' };
  }

  // Find where the data became "stuck"
  let cutoffIndex = probs.length - 1;
  for (let i = probs.length - 1; i >= 0; i--) {
    const p = probs[i];
    const isExtreme = p <= extremeThreshold || p >= (1 - extremeThreshold);
    if (!isExtreme) {
      cutoffIndex = i + 1;
      break;
    }
  }

  const minKeep = Math.floor(probs.length * 0.8);
  const wouldTrim = cutoffIndex < probs.length;
  const trimmedPoints = probs.length - Math.max(cutoffIndex, minKeep);

  return {
    triggers: wouldTrim && trimmedPoints > 0,
    reason: wouldTrim ? `would trim ${trimmedPoints} points` : 'no trimming needed',
    cutoffIndex,
    totalPoints: probs.length,
    trimmedPoints
  };
}

async function main() {
  console.log('Checking detectAndAdjustForTruncatedData triggers on canonical games...\n');

  const triggered = [];
  const notTriggered = [];

  for (const game of canonicalGames) {
    process.stdout.write('.');

    try {
      const items = await fetchAllProbabilities(game.gameId, game.sport);
      if (!items || items.length < 10) {
        continue;
      }

      const probs = items.map(p => p.homeWinPercentage);
      const result = checkTruncationDetection(probs);

      if (result.triggers) {
        triggered.push({
          label: game.label,
          sport: game.sport,
          ...result
        });
      } else {
        notTriggered.push({
          label: game.label,
          sport: game.sport,
          totalPoints: probs.length
        });
      }
    } catch (error) {
      // Skip errors
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n\n');
  console.log('='.repeat(80));
  console.log('TRUNCATION DETECTION ANALYSIS');
  console.log('='.repeat(80));

  console.log(`\nGames where detection TRIGGERS: ${triggered.length}`);
  console.log(`Games where detection does NOT trigger: ${notTriggered.length}`);

  if (triggered.length > 0) {
    console.log('\n--- Games that trigger truncation detection ---');
    for (const g of triggered) {
      console.log(`  ${g.label} (${g.sport})`);
      console.log(`    Total: ${g.totalPoints} pts, Would trim: ${g.trimmedPoints} pts`);
    }
  }

  console.log('\n--- Recommendation ---');
  if (triggered.length === 0) {
    console.log('The detectAndAdjustForTruncatedData function is NOT triggering on any games.');
    console.log('With complete data fetching (limit=1000), this function may be unnecessary.');
    console.log('Consider removing it to simplify the algorithm.');
  } else {
    console.log(`The function triggers on ${triggered.length} games.`);
    console.log('Review these cases to determine if trimming is correct or harmful.');
  }
}

main().catch(console.error);
