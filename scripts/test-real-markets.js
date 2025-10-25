#!/usr/bin/env node

/**
 * Test script for real Polymarket data
 */

import {
  getMarkets,
  calculateBidAskSpread,
  getMarketVolume,
  isMarketSuitable,
  getTokenIds,
  getSpreads
} from '../api/polymarketClient.js';

async function testRealMarkets() {
  console.log('🧪 Testing with Real Polymarket Data\n');

  try {
    // Get some active markets
    const markets = await getMarkets({ active: true, limit: 10 });
    console.log(`Found ${markets.length} markets to test\n`);

    if (markets.length === 0) {
      console.log('❌ No markets found - cannot test');
      return;
    }

    // Test market analysis
    for (let i = 0; i < Math.min(3, markets.length); i++) {
      const market = markets[i];
      console.log(`Market ${i + 1}: "${market.question}"`);
      console.log(`  Volume: $${getMarketVolume(market).toLocaleString()}`);
      console.log(`  Liquidity: $${(market.liquidityNum || 0).toLocaleString()}`);
      console.log(`  Active: ${market.active}, Closed: ${market.closed}`);
      console.log(`  Suitable for GVI: ${isMarketSuitable(market)}`);

      // Test spread calculation from market data
      if (market.bestBid !== undefined && market.bestAsk !== undefined) {
        const spread = calculateBidAskSpread(market);
        if (spread !== null) {
          console.log(`  Spread: ${(spread * 100).toFixed(2)}%`);
        }
      }

      // Test token IDs
      const tokenIds = getTokenIds(market);
      console.log(`  Token IDs: ${tokenIds.length} found`);

      console.log('');
    }

    // Test spreads API with real token IDs
    const suitableMarkets = markets.filter(isMarketSuitable);
    if (suitableMarkets.length > 0) {
      console.log(`\n📊 Testing spreads API with ${suitableMarkets.length} suitable markets...`);

      const allTokenIds = suitableMarkets
        .flatMap(getTokenIds)
        .slice(0, 5); // Test with first 5 tokens

      if (allTokenIds.length > 0) {
        console.log(`Testing spreads for ${allTokenIds.length} tokens`);
        const spreads = await getSpreads(allTokenIds);
        console.log(`Retrieved ${spreads.length} spread records`);

        spreads.slice(0, 3).forEach((spread, i) => {
          console.log(`  Token ${i + 1}: ${JSON.stringify(spread)}`);
        });
      }
    }

    console.log('\n✅ Real market testing completed successfully!');

  } catch (error) {
    console.error('❌ Testing failed:', error.message);
  }
}

testRealMarkets();