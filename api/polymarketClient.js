/**
 * Polymarket API Client
 * Handles fetching market data, order books, and team matching for NFL games
 */

// API endpoints
const POLYMARKET_API = {
  GAMMA: 'https://gamma-api.polymarket.com',
  CLOB: 'https://clob.polymarket.com',
  ENDPOINTS: {
    MARKETS: '/markets',
    BOOK: '/book',
    PRICES: '/prices'
  }
};

// Team name mapping for Polymarket -> ESPN normalization
const TEAM_NAME_MAP = {
  'KC Chiefs': 'Kansas City Chiefs',
  'LA Rams': 'Los Angeles Rams',
  'LA Chargers': 'Los Angeles Chargers',
  'NY Giants': 'New York Giants',
  'NY Jets': 'New York Jets',
  'TB Buccaneers': 'Tampa Bay Buccaneers',
  'LV Raiders': 'Las Vegas Raiders',
  'NE Patriots': 'New England Patriots',
  'SF 49ers': 'San Francisco 49ers',
  'GB Packers': 'Green Bay Packers'
};

// Common team abbreviations
const TEAM_ABBREVIATIONS = {
  'Chiefs': 'Kansas City Chiefs',
  'Bills': 'Buffalo Bills',
  'Dolphins': 'Miami Dolphins',
  'Patriots': 'New England Patriots',
  'Jets': 'New York Jets',
  'Ravens': 'Baltimore Ravens',
  'Bengals': 'Cincinnati Bengals',
  'Browns': 'Cleveland Browns',
  'Steelers': 'Pittsburgh Steelers',
  'Texans': 'Houston Texans',
  'Colts': 'Indianapolis Colts',
  'Jaguars': 'Jacksonville Jaguars',
  'Titans': 'Tennessee Titans',
  'Broncos': 'Denver Broncos',
  'Chargers': 'Los Angeles Chargers',
  'Raiders': 'Las Vegas Raiders',
  'Cowboys': 'Dallas Cowboys',
  'Giants': 'New York Giants',
  'Eagles': 'Philadelphia Eagles',
  'Commanders': 'Washington Commanders',
  'Bears': 'Chicago Bears',
  'Lions': 'Detroit Lions',
  'Packers': 'Green Bay Packers',
  'Vikings': 'Minnesota Vikings',
  'Falcons': 'Atlanta Falcons',
  'Panthers': 'Carolina Panthers',
  'Saints': 'New Orleans Saints',
  'Buccaneers': 'Tampa Bay Buccaneers',
  'Cardinals': 'Arizona Cardinals',
  'Rams': 'Los Angeles Rams',
  '49ers': 'San Francisco 49ers',
  'Seahawks': 'Seattle Seahawks'
};

/**
 * Fetch markets from Polymarket Gamma API
 * @param {Object} filters - Search filters
 * @param {boolean} [filters.active] - Only active markets
 * @param {boolean} [filters.closed] - Include closed markets
 * @param {number} [filters.limit] - Max results
 * @param {number} [filters.offset] - Pagination offset
 * @returns {Promise<Array>} Array of market objects
 */
export async function getMarkets(filters = {}) {
  try {
    const params = new URLSearchParams({
      active: filters.active !== undefined ? filters.active : true,
      closed: filters.closed !== undefined ? filters.closed : false,
      limit: filters.limit || 100,
      offset: filters.offset || 0
    });

    const url = `${POLYMARKET_API.GAMMA}${POLYMARKET_API.ENDPOINTS.MARKETS}?${params}`;
    console.log(`📊 Fetching markets from Polymarket: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Handle both array response and object with data property
    const markets = Array.isArray(data) ? data : (data.data || []);
    console.log(`✅ Found ${markets.length} markets`);

    return markets;

  } catch (error) {
    console.error('❌ Failed to fetch markets:', error.message);
    return [];
  }
}

/**
 * Get order book for a specific token
 * @param {string} tokenId - Token ID to fetch order book for
 * @returns {Promise<Object|null>} Order book with bids and asks arrays
 */
export async function getOrderBook(tokenId) {
  try {
    if (!tokenId) {
      console.warn('⚠️  No token ID provided for order book');
      return null;
    }

    const params = new URLSearchParams({ token_id: tokenId });
    const url = `${POLYMARKET_API.CLOB}${POLYMARKET_API.ENDPOINTS.BOOK}?${params}`;

    console.log(`📈 Fetching order book for token: ${tokenId}`);

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`⚠️  No order book found for token ${tokenId}`);
        return null;
      }
      throw new Error(`Order book API error: ${response.status} ${response.statusText}`);
    }

    const orderBook = await response.json();
    console.log(`✅ Order book: ${orderBook.bids?.length || 0} bids, ${orderBook.asks?.length || 0} asks`);

    return orderBook;

  } catch (error) {
    console.error('❌ Failed to fetch order book:', error.message);
    return null;
  }
}

/**
 * Get spreads for multiple tokens using the batch spreads endpoint
 * @param {Array<string>} tokenIds - Array of token IDs
 * @returns {Promise<Array>} Array of spread data
 */
export async function getSpreads(tokenIds) {
  try {
    if (!tokenIds || !Array.isArray(tokenIds) || tokenIds.length === 0) {
      console.warn('⚠️  No valid token IDs provided for spreads');
      return [];
    }

    const url = `${POLYMARKET_API.CLOB}/spreads`;
    const payload = tokenIds.map(tokenId => ({ token_id: tokenId }));

    console.log(`📊 Fetching spreads for ${tokenIds.length} tokens`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Spreads API error: ${response.status} ${response.statusText}`);
    }

    const spreads = await response.json();

    // Ensure we return an array
    const spreadArray = Array.isArray(spreads) ? spreads : [];
    console.log(`✅ Retrieved ${spreadArray.length} spread records`);

    return spreadArray;

  } catch (error) {
    console.error('❌ Failed to fetch spreads:', error.message);
    return [];
  }
}

/**
 * Calculate bid-ask spread from order book or market data
 * @param {Object} data - Order book with bids/asks OR market with bestBid/bestAsk
 * @returns {number} Spread as decimal (0.01 = 1%)
 */
export function calculateBidAskSpread(data) {
  if (!data) {
    console.warn('⚠️  Cannot calculate spread: no data provided');
    return null;
  }

  try {
    let bestBid, bestAsk;

    // Check if this is a market object with bestBid/bestAsk
    if (data.bestBid !== undefined && data.bestAsk !== undefined) {
      bestBid = parseFloat(data.bestBid);
      bestAsk = parseFloat(data.bestAsk);
    }
    // Check if this is an order book with bids/asks arrays
    else if (data.bids?.length && data.asks?.length) {
      bestBid = parseFloat(data.bids[0].price);
      bestAsk = parseFloat(data.asks[0].price);
    }
    // Check if it's a spreads API response
    else if (data.spread !== undefined) {
      return parseFloat(data.spread);
    }
    else {
      console.warn('⚠️  Cannot calculate spread: invalid data structure');
      return null;
    }

    if (isNaN(bestBid) || isNaN(bestAsk) || bestBid < 0 || bestAsk < 0) {
      console.warn('⚠️  Invalid bid/ask prices:', { bestBid, bestAsk });
      return null;
    }

    // Handle case where bid or ask is 0 (no liquidity on one side)
    if (bestBid === 0 || bestAsk === 0) {
      return 1.0; // 100% spread for illiquid markets
    }

    const midPrice = (bestBid + bestAsk) / 2;
    const spread = (bestAsk - bestBid) / midPrice;

    console.log(`💰 Spread: ${(spread * 100).toFixed(2)}% (Bid: ${bestBid}, Ask: ${bestAsk})`);

    return spread;

  } catch (error) {
    console.error('❌ Error calculating spread:', error.message);
    return null;
  }
}

/**
 * Normalize team name for matching
 * @param {string} teamName - Raw team name
 * @returns {string} Normalized team name
 */
function normalizeTeamName(teamName) {
  if (!teamName) return '';

  const normalized = teamName.trim();

  // Check direct mapping first
  if (TEAM_NAME_MAP[normalized]) {
    return TEAM_NAME_MAP[normalized];
  }

  // Check abbreviations
  if (TEAM_ABBREVIATIONS[normalized]) {
    return TEAM_ABBREVIATIONS[normalized];
  }

  // Return as-is if no mapping found
  return normalized;
}

/**
 * Calculate string similarity using simple token matching
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(str1, str2) {
  const tokens1 = str1.toLowerCase().split(/\s+/);
  const tokens2 = str2.toLowerCase().split(/\s+/);

  let matches = 0;
  const totalTokens = Math.max(tokens1.length, tokens2.length);

  for (const token1 of tokens1) {
    if (tokens2.some(token2 => token2.includes(token1) || token1.includes(token2))) {
      matches++;
    }
  }

  return matches / totalTokens;
}

/**
 * Check if market date matches game date (within 6 hour window)
 * @param {string} marketDateISO - Market date in ISO format
 * @param {Date} gameDate - Game date
 * @returns {boolean} Whether dates match
 */
function isDateMatch(marketDateISO, gameDate) {
  try {
    const marketDate = new Date(marketDateISO);
    const timeDiff = Math.abs(marketDate.getTime() - gameDate.getTime());
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    return hoursDiff <= 6; // 6 hour window

  } catch (error) {
    console.warn('⚠️  Error comparing dates:', error.message);
    return false;
  }
}

/**
 * Find Polymarket market for specific NFL game
 * @param {string} awayTeam - Away team name
 * @param {string} homeTeam - Home team name
 * @param {Date} gameDate - Game date
 * @returns {Promise<Object|null>} Best matching market or null
 */
export async function findNFLGameMarket(awayTeam, homeTeam, gameDate) {
  try {
    console.log(`🔍 Searching for market: ${awayTeam} @ ${homeTeam} on ${gameDate.toISOString()}`);

    // Get all active markets
    const markets = await getMarkets({ active: true, limit: 200 });

    if (!markets.length) {
      console.log('⚠️  No active markets found');
      return null;
    }

    // Filter for NFL markets
    const nflMarkets = markets.filter(market => {
      const question = market.question?.toLowerCase() || '';
      const tags = market.tags || [];

      return question.includes('nfl') ||
             tags.some(tag => tag.toLowerCase() === 'nfl') ||
             tags.some(tag => tag.toLowerCase() === 'sports');
    });

    console.log(`🏈 Found ${nflMarkets.length} NFL markets`);

    if (!nflMarkets.length) {
      return null;
    }

    // Normalize team names
    const normalizedAway = normalizeTeamName(awayTeam);
    const normalizedHome = normalizeTeamName(homeTeam);

    let bestMatch = null;
    let bestScore = 0;

    for (const market of nflMarkets) {
      const question = market.question || '';
      let score = 0;

      // Check if both teams are mentioned
      const awayInQuestion = calculateSimilarity(question, normalizedAway);
      const homeInQuestion = calculateSimilarity(question, normalizedHome);

      if (awayInQuestion > 0.3 && homeInQuestion > 0.3) {
        score = awayInQuestion + homeInQuestion;

        // Bonus for date match
        if (market.game_start_time && isDateMatch(market.game_start_time, gameDate)) {
          score += 0.5;
        } else if (market.end_date_iso && isDateMatch(market.end_date_iso, gameDate)) {
          score += 0.3;
        }

        // Bonus for active market
        if (market.active) {
          score += 0.2;
        }

        // Bonus for volume (indicates liquidity)
        if (market.volume_num && market.volume_num > 1000) {
          score += 0.1;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = market;
        }
      }
    }

    if (bestMatch) {
      console.log(`✅ Found match: "${bestMatch.question}" (score: ${bestScore.toFixed(2)})`);
      return bestMatch;
    } else {
      console.log(`❌ No market found for ${awayTeam} vs ${homeTeam}`);
      return null;
    }

  } catch (error) {
    console.error('❌ Error finding NFL market:', error.message);
    return null;
  }
}

/**
 * Get market volume for engagement metrics
 * @param {Object} market - Market object
 * @returns {number} Trading volume in USD
 */
export function getMarketVolume(market) {
  try {
    return parseFloat(market.volume_num || market.volume || 0);
  } catch (error) {
    console.warn('⚠️  Error parsing market volume:', error.message);
    return 0;
  }
}

/**
 * Check if market is suitable for GVI calculation
 * @param {Object} market - Market object
 * @returns {boolean} Whether market has sufficient liquidity
 */
export function isMarketSuitable(market) {
  const volume = getMarketVolume(market);
  const hasTokens = (market.clobTokenIds && market.clobTokenIds.length > 0) ||
                   (market.outcomes && market.outcomes.length > 0);
  const isActive = market.active;
  const isClosed = market.closed;
  const hasLiquidity = market.liquidityNum > 0 || market.liquidity > 0;

  return hasTokens && isActive && !isClosed && volume >= 100 && hasLiquidity;
}

/**
 * Get token IDs from market (handles both old and new format)
 * @param {Object} market - Market object
 * @returns {Array<string>} Array of token IDs
 */
export function getTokenIds(market) {
  // Handle clobTokenIds (may be JSON string or array)
  if (market.clobTokenIds) {
    try {
      if (Array.isArray(market.clobTokenIds)) {
        return market.clobTokenIds;
      }
      if (typeof market.clobTokenIds === 'string') {
        const parsed = JSON.parse(market.clobTokenIds);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.warn('⚠️  Failed to parse clobTokenIds:', error.message);
    }
  }

  // Handle legacy tokens array
  if (market.tokens && Array.isArray(market.tokens)) {
    return market.tokens.map(token => token.token_id).filter(Boolean);
  }

  return [];
}