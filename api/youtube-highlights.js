export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { awayTeam, homeTeam, awayScore, homeScore } = req.body;

  if (!awayTeam || !homeTeam) {
    return res.status(400).json({ error: 'Team names are required' });
  }

  try {
    const videoUrl = await findNFLHighlights(awayTeam, homeTeam, awayScore, homeScore);

    if (videoUrl) {
      return res.json({ success: true, videoUrl });
    } else {
      // Fallback to search if no direct video found
      const searchUrl = generateSearchFallback(awayTeam, homeTeam, awayScore, homeScore);
      return res.json({ success: true, videoUrl: searchUrl, fallback: true });
    }
  } catch (error) {
    console.error('YouTube API error:', error);

    // Fallback to search on error
    const searchUrl = generateSearchFallback(awayTeam, homeTeam, awayScore, homeScore);
    return res.json({ success: true, videoUrl: searchUrl, fallback: true });
  }
}

async function findNFLHighlights(awayTeam, homeTeam, awayScore, homeScore) {
  const API_KEY = process.env.YOUTUBE_API_KEY;

  if (!API_KEY) {
    console.log('No YouTube API key found, falling back to search');
    return null;
  }

  // Try both the official NFL channel and a search query
  const attempts = [
    // Attempt 1: Search within NFL channel
    {
      type: 'channel',
      url: `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&channelId=UCDVYQ4Zhbm3S2dlz7P1GBDg&type=video&order=date&maxResults=50&` +
        `publishedAfter=${getRecentDate()}&key=${API_KEY}`
    },
    // Attempt 2: General search with team names and "highlights"
    {
      type: 'search',
      url: `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(`${awayTeam} ${homeTeam} highlights NFL`)}&` +
        `type=video&order=relevance&maxResults=25&publishedAfter=${getRecentDate()}&key=${API_KEY}`
    }
  ];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url);

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      // Find video that matches our teams
      const matchingVideo = findBestMatch(data.items, awayTeam, homeTeam, awayScore, homeScore);

      if (matchingVideo) {
        return `https://www.youtube.com/watch?v=${matchingVideo.id.videoId}`;
      }
    } catch (error) {
      // Continue to next attempt on error
      continue;
    }
  }

  return null;
}

function findBestMatch(videos, awayTeam, homeTeam, awayScore, homeScore) {
  const teamVariations = getTeamVariations(awayTeam, homeTeam);
  let bestMatch = null;
  let bestScore = 0;

  for (const video of videos) {
    const title = video.snippet.title.toLowerCase();
    const description = video.snippet.description.toLowerCase();
    let matchScore = 0;

    // Check if both teams are mentioned in title or description
    const hasAwayTeam = teamVariations.away.some(variant =>
      title.includes(variant) || description.includes(variant));
    const hasHomeTeam = teamVariations.home.some(variant =>
      title.includes(variant) || description.includes(variant));

    if (hasAwayTeam && hasHomeTeam) {
      matchScore += 10; // Base score for having both teams

      // Bonus points if it's specifically labeled as highlights
      if (title.includes('highlights') || title.includes('highlight')) {
        matchScore += 5;
      }

      // Extra bonus if score matches (for games with final scores)
      if (awayScore && homeScore &&
        (title.includes(`${awayScore}-${homeScore}`) || title.includes(`${homeScore}-${awayScore}`))) {
        matchScore += 8;
      }

      // Prefer videos with "vs" format
      if (title.includes(' vs ') || title.includes(' vs. ') || title.includes(' @ ')) {
        matchScore += 3;
      }

      // Prefer more recent videos (published more recently gets higher score)
      const publishedDate = new Date(video.snippet.publishedAt);
      const hoursAgo = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60);
      if (hoursAgo < 24) matchScore += 2;
      if (hoursAgo < 12) matchScore += 1;

      if (matchScore > bestScore) {
        bestScore = matchScore;
        bestMatch = video;
      }
    }
  }

  return bestMatch;
}

function getTeamVariations(awayTeam, homeTeam) {
  return {
    away: [
      awayTeam.toLowerCase(),
      awayTeam.toLowerCase().replace(/\s+/g, ''),
      getTeamNickname(awayTeam),
      getTeamCity(awayTeam),
      getTeamAbbreviation(awayTeam)
    ].filter(Boolean),
    home: [
      homeTeam.toLowerCase(),
      homeTeam.toLowerCase().replace(/\s+/g, ''),
      getTeamNickname(homeTeam),
      getTeamCity(homeTeam),
      getTeamAbbreviation(homeTeam)
    ].filter(Boolean)
  };
}

function getTeamNickname(fullTeamName) {
  // Extract team nickname (last word typically)
  // "Green Bay Packers" -> "packers"
  // "Kansas City Chiefs" -> "chiefs"
  const words = fullTeamName.toLowerCase().split(' ');
  return words[words.length - 1];
}

function getTeamCity(fullTeamName) {
  // Extract team city/location (first part)
  // "Green Bay Packers" -> "green bay"
  // "Kansas City Chiefs" -> "kansas city"
  const words = fullTeamName.toLowerCase().split(' ');
  if (words.length > 1) {
    return words.slice(0, -1).join(' ');
  }
  return null;
}

function getTeamAbbreviation(fullTeamName) {
  // Common NFL team abbreviations
  const abbreviations = {
    'arizona cardinals': 'cards',
    'atlanta falcons': 'falcons',
    'baltimore ravens': 'ravens',
    'buffalo bills': 'bills',
    'carolina panthers': 'panthers',
    'chicago bears': 'bears',
    'cincinnati bengals': 'bengals',
    'cleveland browns': 'browns',
    'dallas cowboys': 'cowboys',
    'denver broncos': 'broncos',
    'detroit lions': 'lions',
    'green bay packers': 'packers',
    'houston texans': 'texans',
    'indianapolis colts': 'colts',
    'jacksonville jaguars': 'jaguars',
    'kansas city chiefs': 'chiefs',
    'las vegas raiders': 'raiders',
    'los angeles chargers': 'chargers',
    'los angeles rams': 'rams',
    'miami dolphins': 'dolphins',
    'minnesota vikings': 'vikings',
    'new england patriots': 'patriots',
    'new orleans saints': 'saints',
    'new york giants': 'giants',
    'new york jets': 'jets',
    'philadelphia eagles': 'eagles',
    'pittsburgh steelers': 'steelers',
    'san francisco 49ers': '49ers',
    'seattle seahawks': 'seahawks',
    'tampa bay buccaneers': 'buccaneers',
    'tennessee titans': 'titans',
    'washington commanders': 'commanders'
  };

  return abbreviations[fullTeamName.toLowerCase()] || null;
}

function getRecentDate() {
  // Get date from 14 days ago for recent videos (extended range)
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return date.toISOString();
}

function generateSearchFallback(awayTeam, homeTeam, awayScore, homeScore) {
  const year = new Date().getFullYear();

  let searchQuery;
  if (awayScore && homeScore) {
    searchQuery = `"${awayTeam} vs. ${homeTeam}" NFL highlights ${year}`;
  } else {
    searchQuery = `"${awayTeam} vs ${homeTeam}" "NFL highlights" ${year}`;
  }

  searchQuery += ` -recap -news -reaction -fantasy -breaking -analysis -preview`;

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
}