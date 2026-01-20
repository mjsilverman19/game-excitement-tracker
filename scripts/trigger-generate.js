#!/usr/bin/env node
/**
 * Trigger the generate-static-data GitHub Action by pushing a trigger file.
 *
 * Usage:
 *   node scripts/trigger-generate.js [sport] [--force]
 *   npm run trigger -- [sport] [--force]
 *
 * Examples:
 *   npm run trigger              # Generate all sports with force
 *   npm run trigger CFB          # Generate CFB only
 *   npm run trigger NFL --force  # Generate NFL with force flag
 */

import { writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const triggerFile = join(rootDir, '.github', 'trigger-generate.json');

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let sport = 'all';
  let force = true;

  for (const arg of args) {
    if (arg === '--force') {
      force = true;
    } else if (arg === '--no-force') {
      force = false;
    } else if (['NFL', 'CFB', 'NBA', 'all'].includes(arg.toUpperCase())) {
      sport = arg.toUpperCase();
    }
  }

  const trigger = {
    sport,
    force: force.toString(),
    triggeredAt: new Date().toISOString(),
    triggeredBy: 'trigger-generate.js'
  };

  console.log(`Triggering data generation:`);
  console.log(`  Sport: ${sport}`);
  console.log(`  Force: ${force}`);
  console.log('');

  // Write the trigger file
  await writeFile(triggerFile, JSON.stringify(trigger, null, 2) + '\n');
  console.log(`Created trigger file: .github/trigger-generate.json`);

  // Git operations
  try {
    process.chdir(rootDir);

    // Stage the trigger file
    execSync('git add .github/trigger-generate.json', { stdio: 'inherit' });

    // Commit
    const commitMsg = `Trigger data generation: ${sport}${force ? ' (force)' : ''}`;
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });

    // Push
    console.log('\nPushing to trigger GitHub Action...');
    execSync('git push', { stdio: 'inherit' });

    console.log('\n✓ Successfully triggered data generation!');
    console.log('  Check the Actions tab on GitHub to monitor progress.');
    console.log('  The generated data will be committed automatically when complete.');

  } catch (error) {
    console.error('\nError during git operations:', error.message);
    console.error('You may need to push the changes manually.');
    process.exit(1);
  }
}

main().catch(console.error);
