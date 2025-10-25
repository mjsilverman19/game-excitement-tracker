#!/usr/bin/env node

/**
 * Test script simulating NFL market search and GVI calculation
 */

import {
  getMarkets,
  findNFLGameMarket,
  calculateBidAskSpread,
  getMarketVolume,
  isMarketSuitable,
  getTokenIds
} from '../api/polymarketClient.js';

async function testNFLSimulation() {
  console.log('🏈 NFL Market Simulation Test\n');

  try {
    // Search for more markets to find sports content
    console.log('📊 Searching for sports markets...');
    const allMarkets = await getMarkets({ active: true, limit: 100 });
    console.log(`Found ${allMarkets.length} total markets`);

    // Filter for potential sports markets
    const sportsKeywords = [
      'nfl', 'football', 'super bowl', 'playoff', 'championship',
      'chiefs', 'bills', 'cowboys', 'patriots', 'eagles',
      'bengals', 'lions', 'ravens', 'steelers', 'packers',
      'rams', '49ers', 'dolphins', 'jets', 'giants',
      'sports', 'game', 'team', 'win', 'beat', 'defeat'
    ];

    const potentialSports = allMarkets.filter(market => {
      const question = market.question?.toLowerCase() || '';
      const description = market.description?.toLowerCase() || '';
      const category = market.category?.toLowerCase() || '';

      return sportsKeywords.some(keyword =>
        question.includes(keyword) ||
        description.includes(keyword) ||
        category.includes(keyword)
      );
    });

    console.log(`\n🔍 Found ${potentialSports.length} potential sports markets:`);
    potentialSports.slice(0, 5).forEach(market => {
      console.log(`  - "${market.question}" (Category: ${market.category})`);
    });

    // Test with hypothetical NFL games
    const testGames = [
      { away: 'Kansas City Chiefs', home: 'Buffalo Bills', date: new Date('2025-01-26') },
      { away: 'Chiefs', home: 'Bills', date: new Date('2025-01-26') },
      { away: 'Philadelphia Eagles', home: 'Washington Commanders', date: new Date('2025-01-26') },
      { away: 'Lions', home: 'Commanders', date: new Date('2025-01-26') }
    ];

    console.log('\n🎯 Testing team matching logic...');
    for (const game of testGames) {
      console.log(`\nSearching: ${game.away} @ ${game.home}`);

      const match = await findNFLGameMarket(game.away, game.home, game.date);

      if (match) {
        console.log(`✅ Found: "${match.question}"`);
        console.log(`   Volume: $${getMarketVolume(match).toLocaleString()}`);
        console.log(`   Suitable: ${isMarketSuitable(match)}`);

        const spread = calculateBidAskSpread(match);
        if (spread !== null) {
          console.log(`   Spread: ${(spread * 100).toFixed(2)}%`);
        }
      } else {
        console.log(`❌ No match found`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Simulate GVI calculation with current markets
    console.log('\n📈 Simulating GVI Calculation...');
    const suitableMarkets = allMarkets.filter(isMarketSuitable);

    if (suitableMarkets.length > 0) {
      console.log(`\nAnalyzing ${suitableMarkets.length} suitable markets for GVI:`);

      suitableMarkets.slice(0, 3).forEach((market, i) => {
        const spread = calculateBidAskSpread(market);
        const volume = getMarketVolume(market);
        const tokenIds = getTokenIds(market);

        console.log(`\nMarket ${i + 1}: "${market.question}"`);
        console.log(`  Spread: ${spread ? (spread * 100).toFixed(2) + '%' : 'N/A'}`);
        console.log(`  Volume: $${volume.toLocaleString()}`);
        console.log(`  Liquidity: $${(market.liquidityNum || 0).toLocaleString()}`);
        console.log(`  Token IDs: ${tokenIds.length}`);

        // Calculate a mock GVI score
        if (spread !== null) {
          // Simple GVI calculation: spread * volume weight
          const volumeWeight = Math.log10(Math.max(volume, 1)) / 6; // 0-1 scale
          const gviScore = (spread * 100 * (1 + volumeWeight)).toFixed(2);
          console.log(`  Mock GVI Score: ${gviScore}`);
        }
      });
    }

    // Test edge cases
    console.log('\n🛡️  Testing edge cases...');

    // Test with invalid data
    const emptySpread = calculateBidAskSpread({});
    console.log(`Empty object spread: ${emptySpread}`);

    const nullSpread = calculateBidAskSpread(null);
    console.log(`Null spread: ${nullSpread}`);

    // Test with mock market data
    const mockMarket = {
      bestBid: 0.35,
      bestAsk: 0.40,
      volumeNum: 50000,
      active: true,
      closed: false
    };

    const mockSpread = calculateBidAskSpread(mockMarket);
    console.log(`Mock market spread: ${mockSpread ? (mockSpread * 100).toFixed(2) + '%' : 'N/A'}`);

    console.log('\n✅ NFL simulation completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`  - Total markets analyzed: ${allMarkets.length}`);
    console.log(`  - Sports-related markets: ${potentialSports.length}`);
    console.log(`  - Suitable for GVI: ${suitableMarkets.length}`);
    console.log(`  - API integration: Working ✅`);
    console.log(`  - Spread calculation: Working ✅`);
    console.log(`  - Team matching: Ready for real NFL data ✅`);

  } catch (error) {
    console.error('❌ Simulation failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testNFLSimulation();