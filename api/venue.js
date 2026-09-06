// Resolve a stadium/arena image for a game from ESPN.
// Used when static JSON predates venue fields — the hero card hydrates via this.

import { parseVenue, venueImageUrl } from '../shared/venue.js';

const SPORT_PATH = {
  NFL: 'football/nfl',
  CFB: 'football/college-football',
  NBA: 'basketball/nba',
  MLB: 'baseball/mlb',
  CBB: 'basketball/mens-college-basketball'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const sport = String(req.query.sport || 'NFL').toUpperCase();
    const gameId = req.query.gameId;
    const venueIdParam = req.query.venueId;

    if (!gameId && !venueIdParam) {
      return res.status(400).json({ success: false, error: 'gameId or venueId required' });
    }

    // Fast path: construct CDN URL when we already know the venue id
    if (venueIdParam && !gameId) {
      const image = venueImageUrl(sport, venueIdParam);
      return res.status(200).json({
        success: Boolean(image),
        venueId: String(venueIdParam),
        venueName: null,
        venueImage: image
      });
    }

    const apiPath = SPORT_PATH[sport];
    if (!apiPath) {
      return res.status(400).json({ success: false, error: 'Invalid sport' });
    }

    const url = `https://site.api.espn.com/apis/site/v2/sports/${apiPath}/summary?event=${gameId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    const venue = data.gameInfo?.venue || data.header?.competitions?.[0]?.venue;
    const parsed = parseVenue(venue, sport);

    return res.status(200).json({
      success: Boolean(parsed.venueImage),
      ...parsed
    });
  } catch (error) {
    console.error('Venue API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to resolve venue image',
      details: error.message
    });
  }
}
