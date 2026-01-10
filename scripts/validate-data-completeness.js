#!/usr/bin/env node

/**
 * Data Completeness Validator
 *
 * Validates that probability data is being fetched completely for all canonical games.
 * Identifies games with:
 * - Truncated data (missing end-of-game sequences)
 * - Suspicious final probabilities (near 50% instead of decisive)
 * - Low data point counts
 *
 * Usage: node scripts/validate-data-completeness.js [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllProbabilities } from '../api/calculator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

// Load canonical games
const canonicalPath = path.join(__dirname, '..', 'analysis', 'canonical-games.json');
const canonicalGames = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));

async function validateGame(game) {
  const startTime = Date.now();

  try {
    const items = await fetchAllProbabilities(game.gameId, game.sport);
    const fetchTime = Date.now() - startTime;

    if (!items || items.length === 0) {
      return {
        gameId: game.gameId,
        sport: game.sport,
        label: game.label,
        status: 'error',
        error: 'No data returned',
        fetchTime
      };
    }

    const count = items.length;
    const firstProb = items[0].homeWinPercentage;
    const lastProb = items[items.length - 1].homeWinPercentage;

    // Check data quality
    const isDecisive = Math.abs(lastProb - 0.5) > 0.4; // Final should be <10% or >90%
    const isSuspicious = Math.abs(lastProb - 0.5) < 0.1; // Near 50% at end is suspicious
    const isLowCount = count < 100;

    // Determine status
    let status = 'ok';
    let issues = [];

    if (isSuspicious) {
      status = 'suspicious';
      issues.push(`Final WP near 50% (${(lastProb * 100).toFixed(1)}%)`);
    }

    if (isLowCount) {
      status = status === 'suspicious' ? 'suspicious' : 'warning';
      issues.push(`Low data point count (${count})`);
    }

    if (!isDecisive && !isSuspicious) {
      status = 'warning';
      issues.push(`Non-decisive final WP (${(lastProb * 100).toFixed(1)}%)`);
    }

    return {
      gameId: game.gameId,
      sport: game.sport,
      label: game.label,
      status,
      count,
      firstProb: (firstProb * 100).toFixed(1) + '%',
      lastProb: (lastProb * 100).toFixed(1) + '%',
      isDecisive,
      isSuspicious,
      issues,
      fetchTime
    };
  } catch (error) {
    return {
      gameId: game.gameId,
      sport: game.sport,
      label: game.label,
      status: 'error',
      error: error.message,
      fetchTime: Date.now() - startTime
    };
  }
}

async function main() {
  console.log('='.repeat(100));
  console.log('DATA COMPLETENESS VALIDATION');
  console.log('='.repeat(100));
  console.log();
  console.log(`Validating ${canonicalGames.length} canonical games...`);
  console.log();

  const results = [];

  for (const game of canonicalGames) {
    process.stdout.write(`  ${game.label.substring(0, 50).padEnd(50)} `);
    const result = await validateGame(game);
    results.push(result);

    if (result.status === 'error') {
      console.log(`ERROR: ${result.error}`);
    } else if (result.status === 'suspicious') {
      console.log(`SUSPICIOUS (${result.count} pts, final: ${result.lastProb})`);
    } else if (result.status === 'warning') {
      console.log(`WARNING (${result.count} pts, final: ${result.lastProb})`);
    } else {
      console.log(`OK (${result.count} pts, final: ${result.lastProb})`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  // Summary
  console.log();
  console.log('='.repeat(100));
  console.log('SUMMARY');
  console.log('='.repeat(100));
  console.log();

  const ok = results.filter(r => r.status === 'ok');
  const warnings = results.filter(r => r.status === 'warning');
  const suspicious = results.filter(r => r.status === 'suspicious');
  const errors = results.filter(r => r.status === 'error');

  console.log(`Total games: ${results.length}`);
  console.log(`  OK: ${ok.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  console.log(`  Suspicious: ${suspicious.length}`);
  console.log(`  Errors: ${errors.length}`);
  console.log();

  // Data point statistics
  const validResults = results.filter(r => r.count);
  if (validResults.length > 0) {
    const counts = validResults.map(r => r.count);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

    console.log('Data point statistics:');
    console.log(`  Min: ${min}`);
    console.log(`  Max: ${max}`);
    console.log(`  Average: ${avg.toFixed(0)}`);
    console.log();
  }

  // Show suspicious games
  if (suspicious.length > 0) {
    console.log('SUSPICIOUS GAMES (final WP near 50%):');
    for (const r of suspicious) {
      console.log(`  ${r.label}`);
      console.log(`    Game ID: ${r.gameId}, Sport: ${r.sport}`);
      console.log(`    Data points: ${r.count}, Final WP: ${r.lastProb}`);
      console.log(`    Issues: ${r.issues.join(', ')}`);
      console.log();
    }
  }

  // Show warnings
  if (warnings.length > 0) {
    console.log('WARNINGS:');
    for (const r of warnings) {
      console.log(`  ${r.label}`);
      console.log(`    Issues: ${r.issues.join(', ')}`);
    }
    console.log();
  }

  // Show errors
  if (errors.length > 0) {
    console.log('ERRORS:');
    for (const r of errors) {
      console.log(`  ${r.label}: ${r.error}`);
    }
    console.log();
  }

  // Verbose output
  if (verbose) {
    console.log('='.repeat(100));
    console.log('DETAILED RESULTS');
    console.log('='.repeat(100));
    console.log();

    // Group by sport
    const bySport = {};
    for (const r of results) {
      if (!bySport[r.sport]) bySport[r.sport] = [];
      bySport[r.sport].push(r);
    }

    for (const sport of Object.keys(bySport).sort()) {
      console.log(`\n--- ${sport} ---`);
      for (const r of bySport[sport]) {
        const statusIcon = r.status === 'ok' ? '✓' : r.status === 'warning' ? '!' : r.status === 'suspicious' ? '?' : 'X';
        console.log(`${statusIcon} ${r.label.substring(0, 45).padEnd(45)} | ${String(r.count || 0).padStart(4)} pts | ${(r.lastProb || 'N/A').padStart(6)}`);
      }
    }
  }

  // Write results to JSON
  const outputPath = path.join(__dirname, '..', 'analysis', 'data-completeness-report.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nReport written to: ${outputPath}`);
}

main().catch(console.error);
