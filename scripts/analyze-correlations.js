#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_ROOT = join(ROOT, 'public', 'data');
const OUTPUT_MD = join(ROOT, 'analysis', 'correlation-report.md');
const OUTPUT_JSON = join(ROOT, 'analysis', 'correlation-summary.json');

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

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pearson(valuesX, valuesY) {
  if (valuesX.length !== valuesY.length || valuesX.length < 2) return null;
  const meanX = mean(valuesX);
  const meanY = mean(valuesY);

  let num = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < valuesX.length; i += 1) {
    const dx = valuesX[i] - meanX;
    const dy = valuesY[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return null;
  return num / denom;
}

function format(value, decimals = 3) {
  return typeof value === 'number' ? value.toFixed(decimals) : 'n/a';
}

async function loadMetrics() {
  const files = await collectJsonFiles(DATA_ROOT);
  const metrics = {
    tension: [],
    drama: [],
    finish: [],
    excitement: []
  };

  for (const filePath of files) {
    try {
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      const games = Array.isArray(data.games) ? data.games : [];
      for (const game of games) {
        if (
          typeof game.excitement === 'number' &&
          typeof game.breakdown?.tension === 'number' &&
          typeof game.breakdown?.drama === 'number' &&
          typeof game.breakdown?.finish === 'number'
        ) {
          metrics.excitement.push(game.excitement);
          metrics.tension.push(game.breakdown.tension);
          metrics.drama.push(game.breakdown.drama);
          metrics.finish.push(game.breakdown.finish);
        }
      }
    } catch (err) {
      console.warn(`⚠️  Skipping ${filePath}: ${err.message}`);
    }
  }

  return metrics;
}

function correlationCategory(value) {
  if (value == null) return 'n/a';
  const abs = Math.abs(value);
  if (abs > 0.9) return 'redundant';
  if (abs > 0.7) return 'high';
  if (abs > 0.4) return 'moderate';
  return 'low';
}

async function main() {
  if (!existsSync(DATA_ROOT)) {
    console.error(`Data folder not found: ${DATA_ROOT}`);
    process.exit(1);
  }

  const metrics = await loadMetrics();
  const sampleSize = metrics.excitement.length;
  if (sampleSize < 2) {
    console.error('Not enough games with complete breakdown data to analyze correlations.');
    process.exit(1);
  }

  const correlations = {
    tensionDrama: pearson(metrics.tension, metrics.drama),
    tensionFinish: pearson(metrics.tension, metrics.finish),
    dramaFinish: pearson(metrics.drama, metrics.finish),
    tensionScore: pearson(metrics.tension, metrics.excitement),
    dramaScore: pearson(metrics.drama, metrics.excitement),
    finishScore: pearson(metrics.finish, metrics.excitement)
  };

  const avgCorrelation = {
    tension: mean([
      Math.abs(correlations.tensionDrama ?? 0),
      Math.abs(correlations.tensionFinish ?? 0)
    ]),
    drama: mean([
      Math.abs(correlations.tensionDrama ?? 0),
      Math.abs(correlations.dramaFinish ?? 0)
    ]),
    finish: mean([
      Math.abs(correlations.tensionFinish ?? 0),
      Math.abs(correlations.dramaFinish ?? 0)
    ])
  };

  const mostRedundantMetric = Object.entries(avgCorrelation).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const anyRedundant = [
    correlations.tensionDrama,
    correlations.tensionFinish,
    correlations.dramaFinish
  ].some(value => value != null && Math.abs(value) > 0.9);

  console.log('=== Metric Correlation Analysis (v2.4) ===');
  console.log(`Sample: ${sampleSize} games with complete breakdown data`);
  console.log('');
  console.log('Correlation Matrix:');
  console.log(`  Tension-Drama:  ${format(correlations.tensionDrama)}`);
  console.log(`  Tension-Finish: ${format(correlations.tensionFinish)}`);
  console.log(`  Drama-Finish:   ${format(correlations.dramaFinish)}`);
  console.log('');
  console.log('Correlation with Final Score:');
  console.log(`  Tension: ${format(correlations.tensionScore)}`);
  console.log(`  Drama:   ${format(correlations.dramaScore)}`);
  console.log(`  Finish:  ${format(correlations.finishScore)}`);

  const reportLines = [
    '# Metric Correlation Analysis (v2.4)',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Sample: ${sampleSize} games with complete breakdown data`,
    '',
    '## Correlation Matrix',
    '',
    '| Metric Pair | r | Interpretation |',
    '| --- | --- | --- |',
    `| Tension vs Drama | ${format(correlations.tensionDrama)} | ${correlationCategory(correlations.tensionDrama)} |`,
    `| Tension vs Finish | ${format(correlations.tensionFinish)} | ${correlationCategory(correlations.tensionFinish)} |`,
    `| Drama vs Finish | ${format(correlations.dramaFinish)} | ${correlationCategory(correlations.dramaFinish)} |`,
    '',
    '## Correlation with Final Score',
    '',
    '| Metric | r |',
    '| --- | --- |',
    `| Tension | ${format(correlations.tensionScore)} |`,
    `| Drama | ${format(correlations.dramaScore)} |`,
    `| Finish | ${format(correlations.finishScore)} |`,
    '',
    '## Interpretation Guidelines',
    '- r > 0.9: Metrics are essentially redundant',
    '- r 0.7-0.9: High correlation, some redundancy',
    '- r 0.4-0.7: Moderate correlation, acceptable for complementary metrics',
    '- r < 0.4: Low correlation, independent signals',
    ''
  ];

  if (anyRedundant && mostRedundantMetric) {
    reportLines.push(
      `Most redundant metric by average pairwise correlation: ${mostRedundantMetric} (${format(avgCorrelation[mostRedundantMetric])}).`
    );
  } else {
    reportLines.push('No pairwise correlation exceeds 0.9; redundancy appears reduced.');
  }

  await mkdir(join(ROOT, 'analysis'), { recursive: true });
  await writeFile(OUTPUT_MD, `${reportLines.join('\n')}\n`, 'utf8');
  await writeFile(
    OUTPUT_JSON,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sampleSize,
        correlations,
        avgCorrelation,
        mostRedundantMetric
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
