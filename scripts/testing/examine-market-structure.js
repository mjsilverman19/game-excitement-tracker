#!/usr/bin/env node

/**
 * Examine actual Polymarket data structure
 */

async function examineMarkets() {
  console.log('🔍 Examining Polymarket Market Structure\n');

  try {
    const response = await fetch('https://gamma-api.polymarket.com/markets?limit=5');
    const markets = await response.json();

    console.log(`Found ${markets.length} markets\n`);

    markets.forEach((market, index) => {
      console.log(`Market ${index + 1}:`);
      console.log(`  ID: ${market.id}`);
      console.log(`  Question: "${market.question}"`);
      console.log(`  Condition ID: ${market.conditionId}`);
      console.log(`  Category: ${market.category}`);
      console.log(`  End Date: ${market.endDate}`);
      console.log(`  Liquidity: ${market.liquidity}`);
      console.log(`  Active: ${market.active}`);
      console.log(`  Closed: ${market.closed}`);
      console.log(`  Resolved: ${market.resolved}`);

      // Check for different token structures
      if (market.tokens) {
        console.log(`  Tokens: ${market.tokens.length}`);
      } else if (market.outcomes) {
        console.log(`  Outcomes: ${market.outcomes.length}`);
      } else if (market.markets) {
        console.log(`  Sub-markets: ${market.markets.length}`);
      }

      console.log(`  All keys: ${Object.keys(market).join(', ')}`);
      console.log('');
    });

    // Look for NFL-related content
    console.log('🏈 Searching for NFL content...');
    const nflRelated = markets.filter(market => {
      const question = market.question?.toLowerCase() || '';
      const category = market.category?.toLowerCase() || '';

      return question.includes('nfl') ||
             question.includes('football') ||
             question.includes('chiefs') ||
             question.includes('bills') ||
             question.includes('cowboys') ||
             question.includes('patriots') ||
             category.includes('sports') ||
             category.includes('football');
    });

    console.log(`Found ${nflRelated.length} NFL-related markets`);

    if (nflRelated.length > 0) {
      console.log('\nNFL Markets:');
      nflRelated.forEach(market => {
        console.log(`  "${market.question}" (Category: ${market.category})`);
      });
    }

    // Check recent markets
    console.log('\n📅 Checking for recent markets...');
    const recent = markets.filter(market => {
      if (!market.endDate) return false;
      const endDate = new Date(market.endDate);
      const now = new Date();
      return endDate > now; // Future end date = active
    });

    console.log(`${recent.length} markets with future end dates`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

examineMarkets();