#!/usr/bin/env node

/**
 * Test script for Polymarket API integration
 * Validates all core functionality before integration with main system
 */

import 'dotenv/config';
import {
  getMarkets,
  getOrderBook,
  calculateBidAskSpread,
  findNFLGameMarket,
  getMarketVolume,
  isMarketSuitable
} from '../api/polymarketClient.js';

// Test data
const TEST_GAMES = [
  {
    awayTeam: 'Kansas City Chiefs',
    homeTeam: 'Buffalo Bills',
    date: new Date('2025-01-26')
  },
  {
    awayTeam: 'Chiefs',
    homeTeam: 'Bills',
    date: new Date('2025-01-26')
  },
  {
    awayTeam: 'Philadelphia Eagles',
    homeTeam: 'Washington Commanders',
    date: new Date('2025-01-26')
  }
];

async function runTests() {
  console.log('🧪 Testing Polymarket API Integration\n');
  console.log('=' .repeat(60));

  let testsPassed = 0;
  let testsTotal = 0;

  // Helper function to track test results
  function test(name, condition, details = '') {
    testsTotal++;
    if (condition) {
      console.log(`✅ ${name}`);
      if (details) console.log(`   ${details}`);
      testsPassed++;
    } else {
      console.log(`❌ ${name}`);
      if (details) console.log(`   ${details}`);
    }
    console.log();
  }

  try {
    // Test 1: Basic API connectivity
    console.log('📡 Test 1: Basic API Connectivity');
    console.log('-'.repeat(40));

    const markets = await getMarkets({ active: true, limit: 20 });
    test(
      'Fetch markets from Polymarket',
      Array.isArray(markets) && markets.length > 0,
      `Found ${markets.length} active markets`
    );

    if (markets.length === 0) {
      console.log('⚠️  No markets found - cannot continue with remaining tests');
      return;
    }

    // Test 2: Market data structure validation
    console.log('📊 Test 2: Market Data Structure');
    console.log('-'.repeat(40));

    const sampleMarket = markets[0];
    const hasRequiredFields = sampleMarket.question &&
                            sampleMarket.condition_id &&
                            sampleMarket.tokens;

    test(
      'Market has required fields',
      hasRequiredFields,
      `Sample: "${sampleMarket.question?.substring(0, 50)}..."`
    );

    test(
      'Market has tokens array',
      Array.isArray(sampleMarket.tokens) && sampleMarket.tokens.length > 0,
      `${sampleMarket.tokens?.length || 0} tokens found`
    );

    // Test 3: Filter for NFL markets
    console.log('🏈 Test 3: NFL Market Filtering');
    console.log('-'.repeat(40));

    const nflMarkets = markets.filter(market => {
      const question = market.question?.toLowerCase() || '';
      const tags = market.tags || [];

      return question.includes('nfl') ||
             question.includes('chiefs') ||
             question.includes('bills') ||
             question.includes('football') ||
             tags.some(tag => tag.toLowerCase() === 'nfl') ||
             tags.some(tag => tag.toLowerCase() === 'sports');
    });

    test(
      'Found NFL-related markets',
      nflMarkets.length > 0,
      `${nflMarkets.length} NFL markets found`
    );

    if (nflMarkets.length > 0) {
      console.log('   Sample NFL markets:');
      nflMarkets.slice(0, 3).forEach((market, i) => {
        console.log(`   ${i + 1}. "${market.question}"`);
        console.log(`      Volume: $${getMarketVolume(market).toLocaleString()}`);
        console.log(`      Active: ${market.active}, Suitable: ${isMarketSuitable(market)}`);
      });
      console.log();
    }

    // Test 4: Order book functionality
    console.log('📈 Test 4: Order Book Functionality');
    console.log('-'.repeat(40));

    let orderBookTested = false;
    let spread = null;

    // Find a suitable market with tokens
    for (const market of nflMarkets.slice(0, 5)) {
      if (market.tokens?.[0]?.token_id) {
        const tokenId = market.tokens[0].token_id;
        console.log(`   Testing order book for token: ${tokenId}`);

        const orderBook = await getOrderBook(tokenId);

        if (orderBook && orderBook.bids?.length && orderBook.asks?.length) {
          test(
            'Fetch order book data',
            true,
            `${orderBook.bids.length} bids, ${orderBook.asks.length} asks`
          );

          spread = calculateBidAskSpread(orderBook);
          test(
            'Calculate bid-ask spread',
            spread !== null && !isNaN(spread),
            `Spread: ${spread ? (spread * 100).toFixed(2) + '%' : 'N/A'}`
          );

          orderBookTested = true;
          break;
        }
      }
    }

    if (!orderBookTested) {
      test('Fetch order book data', false, 'No suitable markets with order book data found');
      test('Calculate bid-ask spread', false, 'Could not test without order book');
    }

    // Test 5: Team name matching
    console.log('🔍 Test 5: Team Name Matching');
    console.log('-'.repeat(40));

    for (const testGame of TEST_GAMES) {
      console.log(`   Testing: ${testGame.awayTeam} @ ${testGame.homeTeam}`);

      const match = await findNFLGameMarket(
        testGame.awayTeam,
        testGame.homeTeam,
        testGame.date
      );

      if (match) {
        test(
          `Match found for ${testGame.awayTeam} vs ${testGame.homeTeam}`,
          true,
          `"${match.question}"`
        );

        // Test order book for this match
        if (match.tokens?.[0]?.token_id) {
          const orderBook = await getOrderBook(match.tokens[0].token_id);
          const gameSpread = calculateBidAskSpread(orderBook);

          if (gameSpread !== null) {
            console.log(`   Market spread: ${(gameSpread * 100).toFixed(2)}%`);
            console.log(`   Volume: $${getMarketVolume(match).toLocaleString()}`);
          }
        }
      } else {
        test(
          `Match found for ${testGame.awayTeam} vs ${testGame.homeTeam}`,
          false,
          'No matching market found'
        );
      }
    }

    // Test 6: Error handling
    console.log('🛡️  Test 6: Error Handling');
    console.log('-'.repeat(40));

    // Test invalid token ID
    const invalidOrderBook = await getOrderBook('invalid-token-id');
    test(
      'Handle invalid token ID gracefully',
      invalidOrderBook === null,
      'Returns null for invalid token'
    );

    // Test empty order book spread calculation
    const emptySpread = calculateBidAskSpread({ bids: [], asks: [] });
    test(
      'Handle empty order book',
      emptySpread === null,
      'Returns null for empty order book'
    );

    // Test invalid market search
    const noMatch = await findNFLGameMarket('Nonexistent Team', 'Another Fake Team', new Date());
    test(
      'Handle non-existent teams',
      noMatch === null,
      'Returns null when no market matches'
    );

  } catch (error) {
    console.error('💥 Test suite failed with error:', error.message);
    console.error('Stack trace:', error.stack);
    test('Test suite completed without errors', false, error.message);
  }

  // Summary
  console.log('📋 Test Summary');
  console.log('=' .repeat(60));
  console.log(`Tests passed: ${testsPassed}/${testsTotal}`);
  console.log(`Success rate: ${((testsPassed / testsTotal) * 100).toFixed(1)}%`);

  if (testsPassed === testsTotal) {
    console.log('✅ All tests passed! Polymarket integration is ready.');
  } else if (testsPassed / testsTotal >= 0.8) {
    console.log('⚠️  Most tests passed. Some features may have limited functionality.');
  } else {
    console.log('❌ Multiple test failures. Please check Polymarket API connectivity.');
  }

  console.log('\n🚀 Ready for Phase 2: GVI Calculation Implementation');
}

// Additional diagnostic function
async function diagnoseIssues() {
  console.log('\n🔧 Diagnostic Information');
  console.log('-'.repeat(40));

  // Check Node.js version
  console.log(`Node.js version: ${process.version}`);

  // Check network connectivity
  try {
    const response = await fetch('https://gamma-api.polymarket.com/markets?limit=1');
    console.log(`Polymarket API status: ${response.status} ${response.statusText}`);
  } catch (error) {
    console.log(`Polymarket API error: ${error.message}`);
  }

  // Check if running in correct environment
  console.log(`Current working directory: ${process.cwd()}`);
  console.log(`Script location: ${import.meta.url}`);
}

// Run tests
runTests()
  .then(() => diagnoseIssues())
  .catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });