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

  const NFL_CHANNEL_ID = 'UCxOhcZRUrTkmw3hhsE_ivQ'; // Official NFL YouTube channel

  // Search recent videos from NFL channel
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
    `part=snippet&channelId=${NFL_CHANNEL_ID}&type=video&order=date&maxResults=20&` +
    `publishedAfter=${getRecentDate()}&key=${API_KEY}`;

  const response = await fetch(searchUrl);

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data = await response.json();

  // Find video that matches our teams
  const matchingVideo = findBestMatch(data.items, awayTeam, homeTeam, awayScore, homeScore);

  if (matchingVideo) {
    return `https://www.youtube.com/watch?v=${matchingVideo.id.videoId}`;
  }

  return null;
}

function findBestMatch(videos, awayTeam, homeTeam, awayScore, homeScore) {
  const teamVariations = getTeamVariations(awayTeam, homeTeam);

  for (const video of videos) {
    const title = video.snippet.title.toLowerCase();
    const description = video.snippet.description.toLowerCase();

    // Check if both teams are mentioned in title
    const hasAwayTeam = teamVariations.away.some(variant => title.includes(variant));
    const hasHomeTeam = teamVariations.home.some(variant => title.includes(variant));

    if (hasAwayTeam && hasHomeTeam) {
      // Bonus points if it's specifically labeled as highlights
      const isHighlights = title.includes('highlights') || title.includes('highlight');

      // Extra bonus if score matches (for games with final scores)
      const hasScore = awayScore && homeScore &&
        (title.includes(`${awayScore}-${homeScore}`) || title.includes(`${homeScore}-${awayScore}`));

      if (isHighlights || hasScore) {
        return video;
      }

      // Return first team match if no perfect match found
      if (!video.fallbackMatch) {
        video.fallbackMatch = true;
        return video;
      }
    }
  }

  return null;
}

function getTeamVariations(awayTeam, homeTeam) {
  return {
    away: [
      awayTeam.toLowerCase(),
      awayTeam.toLowerCase().replace(/\s+/g, ''),
      getTeamNickname(awayTeam)
    ].filter(Boolean),
    home: [
      homeTeam.toLowerCase(),
      homeTeam.toLowerCase().replace(/\s+/g, ''),
      getTeamNickname(homeTeam)
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

function getRecentDate() {
  // Get date from 7 days ago for recent videos
  const date = new Date();
  date.setDate(date.getDate() - 7);
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