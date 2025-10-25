#!/usr/bin/env node

/**
 * Debug script to examine raw Polymarket API responses
 */

async function debugAPI() {
  console.log('🔍 Debugging Polymarket API Raw Response\n');

  try {
    // Test basic markets endpoint
    const url = 'https://gamma-api.polymarket.com/markets?limit=5';
    console.log(`Fetching: ${url}`);

    const response = await fetch(url);
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers:`, Object.fromEntries(response.headers.entries()));

    const text = await response.text();
    console.log(`Raw response length: ${text.length} characters`);
    console.log(`Raw response (first 500 chars):`);
    console.log(text.substring(0, 500));
    console.log('...\n');

    // Try to parse as JSON
    try {
      const data = JSON.parse(text);
      console.log('✅ Response is valid JSON');
      console.log(`Response structure:`, typeof data);
      console.log(`Response keys:`, Object.keys(data));

      if (data.data) {
        console.log(`data.data type:`, typeof data.data);
        console.log(`data.data length:`, data.data.length);

        if (data.data.length > 0) {
          console.log('First market sample:');
          console.log(JSON.stringify(data.data[0], null, 2));
        }
      }

      if (data.markets) {
        console.log(`data.markets type:`, typeof data.markets);
        console.log(`data.markets length:`, data.markets.length);
      }

    } catch (parseError) {
      console.log('❌ Response is not valid JSON:', parseError.message);
    }

  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }

  // Test alternative endpoints
  console.log('\n🔍 Testing alternative endpoints...');

  const endpoints = [
    'https://gamma-api.polymarket.com/markets',
    'https://gamma-api.polymarket.com/markets?active=true',
    'https://gamma-api.polymarket.com/markets?closed=false',
    'https://gamma-api.polymarket.com/markets?tags=Sports'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\nTesting: ${endpoint}`);
      const response = await fetch(endpoint);
      const data = await response.json();

      const count = data.data?.length || data.markets?.length || 0;
      console.log(`  Status: ${response.status}, Markets: ${count}`);

      if (count > 0) {
        const sample = data.data?.[0] || data.markets?.[0];
        console.log(`  Sample question: "${sample.question?.substring(0, 60)}..."`);
      }

    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }

    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

debugAPI().catch(console.error);