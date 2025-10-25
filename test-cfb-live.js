#!/usr/bin/env node

/**
 * Quick test to see live college football games and Polymarket data
 */

async function fetchLiveCFBGames() {
  try {
    console.log('🏈 Fetching live college football games...\n');

    // Fetch from ESPN CFB scoreboard
    const url = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
    const response = await fetch(url);
    const data = await response.json();

    console.log(`Found ${data.events?.length || 0} CFB games today\n`);

    if (!data.events || data.events.length === 0) {
      console.log('No CFB games found today');
      return;
    }

    // Filter for live or recently completed games
    const liveGames = data.events.filter(event => {
      const status = event.status?.type?.name;
      return status === 'STATUS_IN_PROGRESS' ||
             status === 'STATUS_HALFTIME' ||
             status === 'STATUS_END_PERIOD' ||
             (status === 'STATUS_FINAL' &&
              new Date() - new Date(event.date) < 3 * 60 * 60 * 1000); // Within 3 hours
    });

    console.log(`🔴 ${liveGames.length} live/recent CFB games:\n`);

    for (const game of liveGames.slice(0, 5)) { // Show first 5
      const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === 'home');
      const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === 'away');
      const status = game.status;

      console.log(`📊 ${awayTeam.team.displayName} @ ${homeTeam.team.displayName}`);
      console.log(`   Score: ${awayTeam.score} - ${homeTeam.score}`);
      console.log(`   Status: ${status.type.description}`);
      if (status.displayClock) {
        console.log(`   Time: Q${status.period} ${status.displayClock}`);
      }
      console.log(`   Game ID: ${game.id}`);
      console.log('');
    }

    return liveGames;

  } catch (error) {
    console.error('❌ Error fetching CFB games:', error.message);
    return [];
  }
}

async function testPolymarketCFB() {
  try {
    console.log('🔍 Testing Polymarket CFB integration...\n');

    // Import our Polymarket client
    const { getMarkets, findNFLGameMarket } = await import('./api/polymarketClient.js');

    // Get active markets
    const markets = await getMarkets({ active: true, limit: 50 });
    console.log(`Found ${markets.length} total active markets`);

    // Filter for CFB/college related markets
    const cfbMarkets = markets.filter(market => {
      const question = market.question?.toLowerCase() || '';
      const tags = market.tags || [];

      return question.includes('college') ||
             question.includes('cfb') ||
             question.includes('ncaa') ||
             tags.some(tag => tag.toLowerCase().includes('college')) ||
             tags.some(tag => tag.toLowerCase().includes('cfb'));
    });

    console.log(`📚 Found ${cfbMarkets.length} potential CFB markets:\n`);

    cfbMarkets.slice(0, 3).forEach((market, i) => {
      console.log(`${i + 1}. "${market.question}"`);
      console.log(`   Volume: $${market.volumeNum?.toLocaleString() || 'N/A'}`);
      console.log(`   Tags: ${market.tags?.join(', ') || 'None'}`);
      console.log('');
    });

    return cfbMarkets;

  } catch (error) {
    console.error('❌ Error testing Polymarket CFB:', error.message);
    return [];
  }
}

async function runTest() {
  console.log('🧪 Testing CFB Live GVI System\n');
  console.log('='.repeat(50));

  const liveGames = await fetchLiveCFBGames();
  const cfbMarkets = await testPolymarketCFB();

  console.log('📋 Test Summary');
  console.log('='.repeat(50));
  console.log(`Live CFB Games: ${liveGames.length}`);
  console.log(`CFB Markets: ${cfbMarkets.length}`);

  if (liveGames.length > 0 && cfbMarkets.length > 0) {
    console.log('\n✅ Both live games and markets found - GVI calculation possible!');
  } else if (liveGames.length > 0) {
    console.log('\n⚠️  Live games found but no CFB markets - limited GVI calculation');
  } else {
    console.log('\n❌ No live games found - test during game time');
  }
}

runTest().catch(console.error);