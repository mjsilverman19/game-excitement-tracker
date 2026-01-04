// Polymarket Soccer Data Fetcher
// Retrieves historical match probability data from Polymarket's free API
// and normalizes it for the entertainment algorithm

import { analyzeGameEntertainmentFromTimeseries } from './calculator.js';

const POLYMARKET_BASE = 'https://gamma-api.polymarket.com';
const POLYMARKET_CLOB = 'https://clob.polymarket.com';

// League/series mappings - using Polymarket series IDs from /sports endpoint
const POLYMARKET_SOCCER_SERIES = {
  'EPL': '10188',
  'PREMIER_LEAGUE': '10188',
  'CHAMPIONS_LEAGUE': '10204',
  'UCL': '10204',
  'LA_LIGA': '10193',
  'BUNDESLIGA': '10194',
  'SERIE_A': '10203',
  'MLS': '10189'
};

// Common team name variations for fuzzy matching
const TEAM_NAME_MAPPINGS = {
  'Man United': 'Manchester United',
  'Man City': 'Manchester City',
  'Spurs': 'Tottenham',
  'Tottenham Hotspur': 'Tottenham',
  'Newcastle': 'Newcastle United',
  'West Ham': 'West Ham United'
};

/**
 * Fetches completed soccer matches from Polymarket for a given league and date
 * @param {string} league - League identifier (EPL, CHAMPIONS_LEAGUE, etc.)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of completed matches with metadata
 */
export async function fetchSoccerGames(league, date) {
  try {
    const seriesId = POLYMARKET_SOCCER_SERIES[league];
    if (!seriesId) {
      throw new Error(`Unknown league: ${league}. Available: ${Object.keys(POLYMARKET_SOCCER_SERIES).join(', ')}`);
    }

    // Fetch events for the series (note: Polymarket only has recent season data)
    // The API doesn't support date filtering, so we fetch all events and filter client-side
    const params = new URLSearchParams({
      series_id: seriesId,
      closed: 'true',
      limit: '500'
    });

    const url = `${POLYMARKET_BASE}/events?${params}`;
    console.log(`🔍 Fetching Polymarket events: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
    }

    const events = await response.json();
    console.log(`📊 Polymarket returned ${Array.isArray(events) ? events.length : 'non-array'} events for ${league} on ${date}`);

    if (!Array.isArray(events) || events.length === 0) {
      console.log(`⚠️ No events found for ${league} on ${date}`);
      return [];
    }

    // Filter events by actual match date (endDate = when match is played, not when market was created)
    console.log(`🔍 Filtering events for match date: ${date}`);

    const dateFilteredEvents = events.filter(event => {
      // Use endDate (actual match time) or eventDate field, NOT startDate (market creation time)
      const matchDate = event.eventDate || (event.endDate ? event.endDate.split('T')[0] : null);

      if (!matchDate) {
        console.log(`⚠️ Event ${event.id} (${event.title}) missing match date`);
        return false;
      }

      return matchDate === date;
    });

    console.log(`📅 After date filtering: ${dateFilteredEvents.length} events (from ${events.length})`);
    if (dateFilteredEvents.length > 0) {
      console.log(`📋 Sample matched events:`, dateFilteredEvents.slice(0, 3).map(e => ({
        title: e.title,
        matchDate: e.eventDate || e.endDate?.split('T')[0]
      })));
    }

    const games = dateFilteredEvents
      .map(event => parsePolymarketEvent(event))
      .filter(game => game !== null);

    console.log(`⚽ Parsed ${games.length} valid games from ${dateFilteredEvents.length} events`);
    return games;
  } catch (error) {
    console.error('Error fetching soccer games:', error);
    throw error;
  }
}

/**
 * Fetches and analyzes completed soccer matches for API consumption
 * @param {string} league - League identifier (EPL, CHAMPIONS_LEAGUE, etc.)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of analyzed matches
 */
export async function fetchSoccerGamesForDate(league, date) {
  const games = await fetchSoccerGames(league, date);

  if (!games.length) {
    return [];
  }

  const analyzedGames = [];

  for (const game of games) {
    const timeseries = await fetchSoccerProbabilityTimeseries(game.id);

    if (timeseries && timeseries.length > 0) {
      const analyzed = analyzeGameEntertainmentFromTimeseries(game, timeseries, 'SOCCER');
      if (analyzed) {
        analyzedGames.push(analyzed);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return analyzedGames;
}

/**
 * Fetches and normalizes probability timeseries for a single match
 * @param {string} matchId - Polymarket event ID
 * @returns {Promise<Array|null>} Normalized probability timeseries or null if insufficient data
 */
export async function fetchSoccerProbabilityTimeseries(matchId) {
  try {
    // First, fetch the event to get market token IDs
    const eventUrl = `${POLYMARKET_BASE}/events/${matchId}`;
    const eventResponse = await fetch(eventUrl);

    if (!eventResponse.ok) {
      console.error(`Failed to fetch event ${matchId}: ${eventResponse.status}`);
      return null;
    }

    const event = await eventResponse.json();

    if (!event.markets || event.markets.length < 2) {
      console.error(`Event ${matchId} has insufficient markets`);
      return null;
    }

    // Identify home and away win markets
    const markets = identifyMarkets(event);
    if (!markets.homeMarket || !markets.awayMarket) {
      console.error(`Could not identify home/away markets for ${matchId}`);
      return null;
    }

    // Parse clobTokenIds (stored as JSON strings) and fetch price history for both markets
    const homeTokenIds = JSON.parse(markets.homeMarket.clobTokenIds);
    const awayTokenIds = JSON.parse(markets.awayMarket.clobTokenIds);

    const [homeHistory, awayHistory] = await Promise.all([
      fetchPriceHistory(homeTokenIds[0]), // Yes token (first in array)
      fetchPriceHistory(awayTokenIds[0])  // Yes token (first in array)
    ]);

    if (!homeHistory || !awayHistory) {
      console.error(`Failed to fetch price histories for ${matchId}`);
      return null;
    }

    // Transform and normalize to format expected by entertainment algorithm
    const timeseries = transformPriceHistory(
      homeHistory,
      awayHistory,
      event.startDate,
      event.endDate
    );

    return timeseries;
  } catch (error) {
    console.error(`Error fetching probability timeseries for ${matchId}:`, error);
    return null;
  }
}

/**
 * Parses a Polymarket event into standardized game format
 * @param {Object} event - Raw Polymarket event
 * @returns {Object|null} Standardized game object or null if parsing fails
 */
function parsePolymarketEvent(event) {
  try {
    // Extract team names from event title
    // Expected formats: "Team A vs Team B - League" or "Team A vs. Team B"
    const title = event.title || '';
    const vsMatch = title.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s+-\s+|$)/i);

    if (!vsMatch) {
      console.warn(`Could not parse team names from title: ${title}`);
      return null;
    }

    const homeTeam = normalizeTeamName(vsMatch[1].trim());
    const awayTeam = normalizeTeamName(vsMatch[2].split('-')[0].trim());

    // Determine scores from final market prices (if available)
    const markets = identifyMarkets(event);
    const finalHomePrice = markets.homeMarket ? parseFloat(JSON.parse(markets.homeMarket.outcomePrices || '[0.5, 0.5]')[0]) : 0.5;
    const finalAwayPrice = markets.awayMarket ? parseFloat(JSON.parse(markets.awayMarket.outcomePrices || '[0.5, 0.5]')[0]) : 0.5;

    // Infer winner from final prices (>0.9 typically means winner)
    let homeScore = 0;
    let awayScore = 0;
    if (finalHomePrice > 0.9) {
      homeScore = 2; // Placeholder score
      awayScore = 1;
    } else if (finalAwayPrice > 0.9) {
      homeScore = 1;
      awayScore = 2;
    } else if (finalHomePrice < 0.15 && finalAwayPrice < 0.15) {
      // Likely a draw
      homeScore = 1;
      awayScore = 1;
    } else {
      // Ambiguous - assign placeholder
      homeScore = 1;
      awayScore = 1;
    }

    return {
      id: event.id,
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      completed: event.closed || false,
      overtime: false, // Soccer doesn't track OT same way
      date: event.startDate,
      league: event.tags?.find(t => t.slug !== 'soccer')?.label || 'Soccer',
      volume: event.volume || '0',
      liquidity: event.liquidity || '0'
    };
  } catch (error) {
    console.error('Error parsing Polymarket event:', error);
    return null;
  }
}

/**
 * Identifies home and away win markets from event markets
 * @param {Object} event - Polymarket event with markets
 * @returns {Object} Object with homeMarket and awayMarket
 */
function identifyMarkets(event) {
  const markets = event.markets || [];

  // Extract team names from event title
  const title = event.title || '';
  const vsMatch = title.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s+-\s+|$)/i);

  if (!vsMatch) {
    return { homeMarket: null, awayMarket: null };
  }

  const homeTeamRaw = vsMatch[1].trim();
  const awayTeamRaw = vsMatch[2].split('-')[0].trim();

  // Find markets by matching team names in questions
  const homeMarket = markets.find(m =>
    m.question?.toLowerCase().includes(homeTeamRaw.toLowerCase()) &&
    m.question?.toLowerCase().includes('win')
  );

  const awayMarket = markets.find(m =>
    m.question?.toLowerCase().includes(awayTeamRaw.toLowerCase()) &&
    m.question?.toLowerCase().includes('win')
  );

  return { homeMarket, awayMarket };
}

/**
 * Fetches price history for a specific market token
 * @param {string} tokenId - Polymarket CLOB token ID
 * @returns {Promise<Array|null>} Array of {t: timestamp, p: price} or null
 */
async function fetchPriceHistory(tokenId) {
  try {
    const params = new URLSearchParams({
      market: tokenId,
      interval: 'max'
    });

    const url = `${POLYMARKET_CLOB}/prices-history?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to fetch price history for ${tokenId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.history || [];
  } catch (error) {
    console.error(`Error fetching price history for ${tokenId}:`, error);
    return null;
  }
}

/**
 * Transforms and normalizes price histories into format for entertainment algorithm
 * @param {Array} homeHistory - Home team price history [{t, p}, ...]
 * @param {Array} awayHistory - Away team price history [{t, p}, ...]
 * @param {string} matchStart - Match start ISO timestamp
 * @param {string} matchEnd - Match end ISO timestamp
 * @returns {Array} Normalized timeseries [{value, period, clock, minute}, ...]
 */
function transformPriceHistory(homeHistory, awayHistory, matchStart, matchEnd) {
  if (!homeHistory.length || !awayHistory.length) {
    return [];
  }

  const startTime = new Date(matchStart).getTime() / 1000;
  const endTime = matchEnd ? new Date(matchEnd).getTime() / 1000 : startTime + 7200; // Default 2 hours

  // Filter to match duration only
  const filteredHome = homeHistory.filter(h => h.t >= startTime && h.t <= endTime);
  const filteredAway = awayHistory.filter(h => h.t >= startTime && h.t <= endTime);

  if (!filteredHome.length || !filteredAway.length) {
    return [];
  }

  // Get all unique timestamps and sort
  const allTimestamps = [
    ...new Set([
      ...filteredHome.map(h => h.t),
      ...filteredAway.map(h => h.t)
    ])
  ].sort((a, b) => a - b);

  // Align data by interpolating prices at common timestamps
  const aligned = allTimestamps.map(timestamp => {
    const homePrice = interpolatePrice(filteredHome, timestamp);
    const awayPrice = interpolatePrice(filteredAway, timestamp);

    // Normalize to two-way probability (collapse draw)
    const { homeWinPercentage } = normalizeToTwoWay(homePrice, awayPrice);

    // Calculate period and clock for soccer (45 min halves)
    const elapsedMinutes = (timestamp - startTime) / 60;
    const period = elapsedMinutes <= 45 ? 1 : 2;
    const minute = period === 1 ? Math.floor(elapsedMinutes) : Math.floor(elapsedMinutes - 45);
    const clock = formatClock(minute, period);

    return {
      value: homeWinPercentage,
      period,
      clock,
      minute: Math.floor(elapsedMinutes)
    };
  });

  // Sample to reasonable density (ESPN typically has 100-300 points)
  // Polymarket may have thousands of trade points
  const maxPoints = 300;
  if (aligned.length > maxPoints) {
    const step = Math.floor(aligned.length / maxPoints);
    return aligned.filter((_, i) => i % step === 0);
  }

  return aligned;
}

/**
 * Interpolates price at a specific timestamp
 * @param {Array} history - Price history [{t, p}, ...]
 * @param {number} timestamp - Target timestamp
 * @returns {number} Interpolated price
 */
function interpolatePrice(history, timestamp) {
  if (!history.length) return 0.5;

  // Find surrounding points
  let before = null;
  let after = null;

  for (let i = 0; i < history.length; i++) {
    if (history[i].t <= timestamp) {
      before = history[i];
    }
    if (history[i].t >= timestamp && !after) {
      after = history[i];
      break;
    }
  }

  // Exact match
  if (before && before.t === timestamp) return before.p;
  if (after && after.t === timestamp) return after.p;

  // Interpolate between points
  if (before && after) {
    const fraction = (timestamp - before.t) / (after.t - before.t);
    return before.p + fraction * (after.p - before.p);
  }

  // Use closest point
  if (before) return before.p;
  if (after) return after.p;

  return 0.5; // Default
}

/**
 * Normalizes separate home/away win probabilities to two-way (no draw)
 * @param {number} homeWinPrice - Home win probability (0-1)
 * @param {number} awayWinPrice - Away win probability (0-1)
 * @returns {Object} {homeWinPercentage, awayWinPercentage}
 */
function normalizeToTwoWay(homeWinPrice, awayWinPrice) {
  // Infer draw probability
  const drawProb = Math.max(0, Math.min(1, 1 - homeWinPrice - awayWinPrice));

  // Collapse draw evenly between home and away
  const homeWinPercentage = homeWinPrice + (drawProb / 2);
  const awayWinPercentage = awayWinPrice + (drawProb / 2);

  // Ensure sum is 1.0 (handle edge cases)
  const sum = homeWinPercentage + awayWinPercentage;
  if (sum > 0) {
    return {
      homeWinPercentage: homeWinPercentage / sum,
      awayWinPercentage: awayWinPercentage / sum
    };
  }

  return {
    homeWinPercentage: 0.5,
    awayWinPercentage: 0.5
  };
}

/**
 * Formats clock display for soccer
 * @param {number} minute - Current minute in period
 * @param {number} period - Period (1 or 2)
 * @returns {string} Formatted clock (e.g., "32'" or "78'")
 */
function formatClock(minute, period) {
  const totalMinute = period === 1 ? minute : minute + 45;
  return `${totalMinute}'`;
}

/**
 * Normalizes team name using common mappings
 * @param {string} teamName - Raw team name
 * @returns {string} Normalized team name
 */
function normalizeTeamName(teamName) {
  return TEAM_NAME_MAPPINGS[teamName] || teamName;
}

/**
 * Handles single market case (when only one team's market exists)
 * @param {number} homeWinPrice - Home win probability
 * @returns {Object} {homeWinPercentage, awayWinPercentage}
 */
function handleSingleMarket(homeWinPrice) {
  // Assume binary outcome (this is simplification - soccer typically has draws)
  // More sophisticated: assume 20% draw baseline
  const drawAssumption = 0.20;
  const homeWinPercentage = homeWinPrice + (drawAssumption / 2);
  const awayWinPercentage = 1 - homeWinPrice - drawAssumption + (drawAssumption / 2);

  return {
    homeWinPercentage: Math.max(0, Math.min(1, homeWinPercentage)),
    awayWinPercentage: Math.max(0, Math.min(1, awayWinPercentage))
  };
}
