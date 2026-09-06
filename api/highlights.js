// ESPN game highlights for the Why-this-game detail panel.

const SPORT_PATH = {
  NFL: 'football/nfl',
  CFB: 'football/college-football',
  NBA: 'basketball/nba',
  MLB: 'baseball/mlb',
  CBB: 'basketball/mens-college-basketball'
};

function normalizeVideo(video) {
  if (!video?.id) return null;

  const id = String(video.id);
  const web =
    video.links?.web?.href ||
    `https://www.espn.com/video/clip/_/id/${id}`;
  const source =
    video.links?.source?.HD?.href ||
    video.links?.source?.href ||
    video.links?.mobile?.source?.href ||
    null;
  const thumbnail =
    video.thumbnail ||
    video.images?.[0]?.url ||
    video.images?.[0]?.href ||
    null;

  return {
    id,
    headline: video.headline || 'Highlight',
    description: video.description || '',
    duration: typeof video.duration === 'number' ? video.duration : null,
    thumbnail,
    url: web,
    source
  };
}

export function parseHighlights(summary) {
  const raw = Array.isArray(summary?.videos) ? summary.videos : [];
  return raw.map(normalizeVideo).filter(Boolean);
}

export async function fetchEspnHighlights(sport, gameId) {
  const apiPath = SPORT_PATH[sport] || SPORT_PATH.NFL;
  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/${apiPath}/summary?event=${gameId}`,
    `https://site.web.api.espn.com/apis/site/v2/sports/${apiPath}/summary?event=${gameId}`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      const highlights = parseHighlights(data);
      if (highlights.length > 0) return highlights;
      // Empty array is a valid ESPN response (no clips for this game)
      return [];
    } catch {
      // try next host
    }
  }

  return [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const sport = String(req.query.sport || 'NFL').toUpperCase();
    const gameId = req.query.gameId;

    if (!gameId) {
      return res.status(400).json({ success: false, error: 'gameId required' });
    }

    if (!SPORT_PATH[sport]) {
      return res.status(400).json({ success: false, error: `Unsupported sport: ${sport}` });
    }

    const highlights = await fetchEspnHighlights(sport, gameId);
    return res.status(200).json({
      success: true,
      gameId: String(gameId),
      sport,
      count: highlights.length,
      highlights
    });
  } catch (error) {
    console.error('highlights error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load highlights' });
  }
}
