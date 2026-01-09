#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DISTRIBUTION_PATH = join(ROOT, 'analysis', 'distribution-summary.json');
const CANONICAL_RESULTS_PATH = join(ROOT, 'analysis', 'canonical-v2.4-results.csv');
const OUTLIERS_PATH = join(ROOT, 'analysis', 'outliers-report.json');
const CORRELATION_PATH = join(ROOT, 'analysis', 'correlation-summary.json');
const OUTPUT_PATH = join(ROOT, 'analysis', 'health-report-v2.4.md');

function parseCsv(content) {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function expectedMinTierScore(expectedTier) {
  if (expectedTier === 'must-watch') return 8;
  if (expectedTier === 'recommended') return 6;
  return 0;
}

function formatNumber(value, decimals = 2) {
  return typeof value === 'number' ? value.toFixed(decimals) : 'n/a';
}

async function main() {
  const distribution = existsSync(DISTRIBUTION_PATH)
    ? JSON.parse(await readFile(DISTRIBUTION_PATH, 'utf8'))
    : null;
  const outliers = existsSync(OUTLIERS_PATH) ? JSON.parse(await readFile(OUTLIERS_PATH, 'utf8')) : null;
  const correlations = existsSync(CORRELATION_PATH)
    ? JSON.parse(await readFile(CORRELATION_PATH, 'utf8'))
    : null;

  let canonicalRows = [];
  if (existsSync(CANONICAL_RESULTS_PATH)) {
    const csvContent = await readFile(CANONICAL_RESULTS_PATH, 'utf8');
    canonicalRows = parseCsv(csvContent);
  }

  const canonicalScored = canonicalRows.filter(row => row.excitement);
  const canonicalPasses = canonicalScored.filter(row => row.status === 'PASS').length;
  const canonicalTotal = canonicalScored.length;
  const canonicalAccuracy = canonicalTotal
    ? Math.round((canonicalPasses / canonicalTotal) * 1000) / 10
    : null;

  const canonicalFailures = canonicalScored
    .filter(row => row.status === 'FAIL')
    .map(row => {
      const excitement = parseNumber(row.excitement);
      const expectedMin = expectedMinTierScore(row.expectedTier);
      const gap = excitement != null ? expectedMin - excitement : null;
      return { label: row.label, expectedTier: row.expectedTier, excitement, gap };
    })
    .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))
    .slice(0, 5);

  let overallHealth = 'Needs Attention';
  if (canonicalAccuracy != null) {
    if (canonicalAccuracy >= 80) {
      overallHealth = 'Good';
    } else if (canonicalAccuracy < 60) {
      overallHealth = 'Poor';
    }
  }

  const tierSummary = distribution?.tiers?.percentages || null;
  const keyFindings = [];
  if (tierSummary) {
    keyFindings.push(
      `Must-watch share: ${formatNumber(tierSummary.mustWatch, 1)}%, recommended: ${formatNumber(
        tierSummary.recommended,
        1
      )}%, skip: ${formatNumber(tierSummary.skip, 1)}%`
    );
  }
  if (canonicalAccuracy != null) {
    keyFindings.push(`Canonical accuracy: ${canonicalPasses}/${canonicalTotal} (${canonicalAccuracy}%)`);
  }
  if (outliers) {
    keyFindings.push(
      `Outliers flagged: ${outliers.flaggedGames} of ${outliers.totalGames} games`
    );
  }
  if (correlations) {
    const td = formatNumber(correlations.correlations?.tensionDrama, 3);
    keyFindings.push(`Tension-Drama correlation: ${td}`);
  }

  const lines = [
    '# Algorithm Health Report - v2.4',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Executive Summary',
    `- Overall health: ${overallHealth}`,
    ...keyFindings.map(finding => `- ${finding}`),
    '',
    '## Distribution Analysis'
  ];

  if (distribution) {
    lines.push(
      `- Total games: ${distribution.data?.totalGames ?? 'n/a'}`,
      `- Mean score: ${formatNumber(distribution.overall?.mean)}, std dev: ${formatNumber(distribution.overall?.stdDev)}`,
      `- Must-watch (>=${distribution.tiers?.thresholds?.mustWatch ?? 'n/a'}): ${formatNumber(
        distribution.tiers?.percentages?.mustWatch,
        1
      )}%`
    );
  } else {
    lines.push('- Distribution summary missing (run scripts/analyze-distribution.js).');
  }

  lines.push('', '## Canonical Games Benchmark');
  if (canonicalTotal) {
    lines.push(`- Accuracy: ${canonicalPasses}/${canonicalTotal} (${canonicalAccuracy}%)`);
    if (canonicalFailures.length > 0) {
      lines.push('- Notable failures:');
      for (const failure of canonicalFailures) {
        lines.push(
          `  - ${failure.label}: expected ${failure.expectedTier}, got ${formatNumber(failure.excitement)}`
        );
      }
    }
  } else {
    lines.push('- Canonical results missing (run scripts/compare-canonical-games.js).');
  }

  lines.push('', '## Outlier Analysis');
  if (outliers) {
    lines.push(
      `- False positive candidates: ${outliers.flags?.['high-finish-low-drama'] ?? 0} finish, ${
        outliers.flags?.['high-tension-blowout'] ?? 0
      } tension`,
      `- False negative candidates: ${outliers.flags?.['low-score-overtime'] ?? 0} OT, ${
        outliers.flags?.['low-score-close-margin'] ?? 0
      } close margin`
    );
  } else {
    lines.push('- Outlier report missing (run scripts/find-outliers.js).');
  }

  lines.push('', '## Metric Correlations');
  if (correlations) {
    lines.push(
      `- Tension vs Drama: ${formatNumber(correlations.correlations?.tensionDrama, 3)}`,
      `- Tension vs Finish: ${formatNumber(correlations.correlations?.tensionFinish, 3)}`,
      `- Drama vs Finish: ${formatNumber(correlations.correlations?.dramaFinish, 3)}`
    );
  } else {
    lines.push('- Correlation report missing (run scripts/analyze-correlations.js).');
  }

  lines.push('', '## Recommended Actions');
  if (!distribution) {
    lines.push('- Run distribution analysis to establish baseline score spread.');
  }
  if (!canonicalTotal) {
    lines.push('- Run canonical benchmark to validate must-watch expectations.');
  }
  if (!outliers) {
    lines.push('- Run outlier detection and review 5-10 flagged games.');
  }
  if (!correlations) {
    lines.push('- Run correlation analysis to verify metric independence.');
  }
  if (distribution && canonicalTotal && outliers && correlations) {
    lines.push(
      '- Prioritize fixes for canonical failures with the largest score gaps.',
      '- Review outlier flags to identify false positives/negatives and align thresholds.'
    );
  }

  await mkdir(join(ROOT, 'analysis'), { recursive: true });
  await writeFile(OUTPUT_PATH, `${lines.join('\n')}\n`, 'utf8');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
