// ESPN venue image helpers.
// Daytime stadium/arena photos live on ESPN's CDN as:
//   https://a.espncdn.com/i/venues/{slug}/day/{venueId}.jpg
// Prefer an href from ESPN's venue.images when available; otherwise build the URL.

export const VENUE_IMAGE_SLUG = {
  NFL: 'nfl',
  CFB: 'college-football',
  NBA: 'nba',
  MLB: 'mlb',
  CBB: 'mens-college-basketball'
};

export function venueImageUrl(sport, venueId) {
  const slug = VENUE_IMAGE_SLUG[sport];
  if (!slug || venueId == null || venueId === '') return null;
  return `https://a.espncdn.com/i/venues/${slug}/day/${venueId}.jpg`;
}

/**
 * Pick the best daytime exterior shot from an ESPN venue.images array.
 */
export function pickVenueImage(images, sport, venueId) {
  if (Array.isArray(images) && images.length > 0) {
    const dayExterior = images.find(img => {
      const rel = img.rel || [];
      return rel.includes('day') && !rel.includes('interior') && img.href;
    });
    if (dayExterior?.href) return dayExterior.href;
    if (images[0]?.href) return images[0].href;
  }
  return venueImageUrl(sport, venueId);
}

/**
 * Normalize venue fields from an ESPN competition or gameInfo.venue object.
 */
export function parseVenue(venue, sport) {
  if (!venue) {
    return { venueId: null, venueName: null, venueImage: null };
  }
  const venueId = venue.id != null ? String(venue.id) : null;
  const venueName = venue.fullName || venue.name || null;
  const venueImage = pickVenueImage(venue.images, sport, venueId);
  return { venueId, venueName, venueImage };
}
