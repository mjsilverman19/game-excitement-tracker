/**
 * Constants for Game Entertainment Index and Polymarket integration
 */

// Polymarket API endpoints
export const POLYMARKET_API = {
  GAMMA: 'https://gamma-api.polymarket.com',
  CLOB: 'https://clob.polymarket.com',
  ENDPOINTS: {
    MARKETS: '/markets',
    BOOK: '/book',
    PRICES: '/prices'
  }
};

// GVI (Game Volatility Index) calculation constants
export const GVI_CONFIG = {
  // Spread thresholds (percentage points)
  SPREAD_LOW: 1.0,      // < 1% = low uncertainty
  SPREAD_MEDIUM: 3.0,   // 1-3% = medium uncertainty
  SPREAD_HIGH: 5.0,     // 3-5% = high uncertainty
  SPREAD_EXTREME: 8.0,  // > 5% = extreme uncertainty

  // Scaling factor (empirically determined)
  GVI_SCALE: 12.5,

  // Market matching thresholds
  MAX_NAME_DISTANCE: 0.3, // Similarity threshold for fuzzy matching
  MAX_DATE_DIFF_HOURS: 6, // Allow 6 hour window for date matching
  MIN_VOLUME: 100,        // Minimum market volume ($100)
  MIN_SIMILARITY: 0.3     // Minimum team name similarity score
};

// Entertainment score constants (existing)
export const ENTERTAINMENT_CONFIG = {
  // Score weights for different factors
  WEIGHTS: {
    UNCERTAINTY: 1.0,
    PERSISTENCE: 0.8,
    PEAKS: 1.2,
    COMEBACK: 1.1,
    TENSION: 1.0,
    NARRATIVE: 0.9
  },

  // Context multipliers
  CONTEXT: {
    PLAYOFF_BONUS: 1.3,
    RIVALRY_BONUS: 1.1,
    PRIMETIME_BONUS: 1.05,
    UPSET_BONUS: 1.15
  }
};

// Rate limiting configuration
export const API_CONFIG = {
  // Request delays (milliseconds)
  POLYMARKET_DELAY: 100,   // 100ms between Polymarket requests
  ESPN_DELAY: 50,          // 50ms between ESPN requests

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,       // 1 second initial retry delay

  // Timeout configuration
  REQUEST_TIMEOUT: 10000   // 10 second timeout
};

// Team name normalization patterns
export const TEAM_PATTERNS = {
  // Common abbreviation patterns
  CITY_ONLY: /^(Los Angeles|New York|Tampa Bay|Kansas City|Green Bay|San Francisco|Las Vegas|New England)$/,

  // Polymarket specific patterns
  POLYMARKET_FORMATS: [
    /^(.+?)\s+(?:will\s+)?(?:beat|defeat|win\s+against)\s+(.+?)$/i,
    /^Will\s+(.+?)\s+(?:beat|defeat|win\s+against)\s+(.+?)\?$/i,
    /^(.+?)\s+vs\.?\s+(.+?)$/i,
    /^(.+?)\s+@\s+(.+?)$/i
  ]
};