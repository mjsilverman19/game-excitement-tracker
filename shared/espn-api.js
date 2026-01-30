/**
 * Centralized ESPN API probability data fetching.
 * All scripts should use this module instead of constructing ESPN URLs directly.
 */

/**
 * Resolves sport string to ESPN API sport type and league.
 * @param {string} sport - Sport type (NFL, CFB, NBA)
 * @returns {{ sportType: string, league: string }}
 */
export function resolveSportLeague(sport) {
  if (sport === 'NBA') {
    return { sportType: 'basketball', league: 'nba' };
  }
  return {
    sportType: 'football',
    league: sport === 'CFB' ? 'college-football' : 'nfl'
  };
}

/**
 * Builds the ESPN probability API base URL for a game.
 * @param {string} gameId - ESPN game ID
 * @param {string} sport - Sport type (NFL, CFB, NBA)
 * @returns {string} Base URL (without query parameters)
 */
export function buildProbabilityUrl(gameId, sport) {
  const { sportType, league } = resolveSportLeague(sport);
  return `https://sports.core.api.espn.com/v2/sports/${sportType}/leagues/${league}/events/${gameId}/competitions/${gameId}/probabilities`;
}

/**
 * Fetches all probability data for a game, handling pagination if needed.
 * ESPN API typically returns 150-230 data points for NFL/CFB and 400-600 for NBA.
 *
 * @param {string} gameId - ESPN game ID
 * @param {string} sport - Sport type (NFL, CFB, NBA)
 * @returns {Promise<Array|null>} Array of probability items or null on error
 */
export async function fetchAllProbabilities(gameId, sport) {
  const baseUrl = buildProbabilityUrl(gameId, sport);

  // Use limit=1000 to capture all data points
  // This prevents the truncation bug that was causing missing game-ending sequences
  let allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}?limit=1000&page=${page}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (page === 1) return null; // First page failed
        break; // Subsequent pages may not exist
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        break;
      }

      allItems = allItems.concat(data.items);

      // Check if there are more pages
      // ESPN uses pageCount to indicate total pages
      const pageCount = data.pageCount || 1;
      hasMore = page < pageCount;
      page++;

      // Safety limit to prevent infinite loops
      if (page > 10) break;
    } catch (error) {
      if (page === 1) return null;
      break;
    }
  }

  if (allItems.length === 0) return null;

  return filterTrailingNoise(allItems);
}

/**
 * Filters trailing noise from ESPN probability data.
 *
 * Some NBA games have post-game data points where ESPN appends extra entries
 * after the game has ended. These have `period: undefined` and `clock: undefined`
 * and show WP values bouncing back from 0/100% to mid-range values.
 *
 * Detection: Find the last point where WP is decisive (within 5% of 0 or 100%).
 * If any subsequent points bounce back beyond 15% from that decisive value,
 * truncate at the last decisive point.
 *
 * @param {Array} items - Raw probability items from ESPN API
 * @returns {Array} Filtered items with trailing noise removed
 */
export function filterTrailingNoise(items) {
  if (!items || items.length < 2) return items;

  const DECISIVE_THRESHOLD = 0.05; // Within 5% of 0 or 100 = decisive
  const BOUNCE_BACK_THRESHOLD = 0.15; // Bounce >15% from decisive = noise

  // Scan from the end to find the last decisive point
  let lastDecisiveIndex = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    const wp = items[i].homeWinPercentage;
    if (wp <= DECISIVE_THRESHOLD || wp >= (1 - DECISIVE_THRESHOLD)) {
      lastDecisiveIndex = i;
      break;
    }
  }

  // No decisive point found — return as-is (game may be legitimately undecided, e.g., OT)
  if (lastDecisiveIndex === -1) return items;

  // Check if there are noise points after the last decisive point
  const decisiveWP = items[lastDecisiveIndex].homeWinPercentage;
  let hasNoise = false;

  for (let i = lastDecisiveIndex + 1; i < items.length; i++) {
    const wp = items[i].homeWinPercentage;
    const distanceFromDecisive = Math.abs(wp - decisiveWP);
    if (distanceFromDecisive > BOUNCE_BACK_THRESHOLD) {
      hasNoise = true;
      break;
    }
  }

  if (!hasNoise) return items;

  // Truncate at the last decisive point (inclusive)
  return items.slice(0, lastDecisiveIndex + 1);
}
