#!/usr/bin/env node
/**
 * Test CFB Live Game Detection
 */

import { getLiveCFBGames, getAllLiveGames } from './lib/liveGameDetector.js';

async function testCFBDetection() {
  console.log('🏈 Testing CFB Live Game Detection\n');
  console.log('='.repeat(60));
  
  // Test CFB games
  console.log('\n📊 Fetching live CFB games...');
  const cfbGames = await getLiveCFBGames();
  console.log(`✅ Found ${cfbGames.length} live CFB games\n`);
  
  if (cfbGames.length > 0) {
    console.log('CFB Games Currently Live:\n');
    cfbGames.forEach((game, i) => {
      console.log(`${i + 1}. ${game.awayTeamAbbrev} @ ${game.homeTeamAbbrev}`);
      console.log(`   ${game.awayScore} - ${game.homeScore}`);
      console.log(`   Q${game.status.period} ${game.status.displayClock}`);
      console.log(`   Sport: ${game.sport}\n`);
    });
  }
  
  // Test all games
  console.log('\n📊 Fetching ALL live games (NFL + CFB)...');
  const allGames = await getAllLiveGames();
  console.log(`✅ Found ${allGames.length} total live games\n`);
  
  const nflCount = allGames.filter(g => g.sport === 'NFL').length;
  const cfbCount = allGames.filter(g => g.sport === 'CFB').length;
  
  console.log('Summary:');
  console.log(`  NFL: ${nflCount} games`);
  console.log(`  CFB: ${cfbCount} games`);
  console.log(`  Total: ${allGames.length} games`);
  
  console.log('\n✅ CFB detection working!');
}

testCFBDetection().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
