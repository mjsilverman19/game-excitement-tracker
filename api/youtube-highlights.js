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
      console.log(`✅ Found direct video for ${awayTeam} vs ${homeTeam}`);
      return res.json({ success: true, videoUrl });
    } else {
      console.log(`❌ No direct video found for ${awayTeam} vs ${homeTeam}, using fallback`);
      // Fallback to search if no direct video found
      const searchUrl = generateSearchFallback(awayTeam, homeTeam, awayScore, homeScore);
      return res.json({ success: true, videoUrl: searchUrl, fallback: true });
    }
  } catch (error) {
    console.error('YouTube API error:', error);
    console.error('Error details:', {
      message: error.message,
      awayTeam,
      homeTeam,
      hasApiKey: !!process.env.YOUTUBE_API_KEY
    });

    // Fallback to search on error
    const searchUrl = generateSearchFallback(awayTeam, homeTeam, awayScore, homeScore);
    return res.json({ success: true, videoUrl: searchUrl, fallback: true });
  }
}

async function findNFLHighlights(awayTeam, homeTeam, awayScore, homeScore) {
  const API_KEY = process.env.YOUTUBE_API_KEY;

  console.log('YouTube API Key present:', !!API_KEY);
  console.log('Original team names:', `${awayTeam} vs ${homeTeam}`);
  
  // Convert to full team names if needed
  const fullAwayTeam = getFullTeamName(awayTeam);
  const fullHomeTeam = getFullTeamName(homeTeam);
  console.log('Full team names:', `${fullAwayTeam} vs ${fullHomeTeam}`);

  if (!API_KEY) {
    console.log('No YouTube API key found, falling back to search');
    return null;
  }

  // Try multiple search strategies with improved queries
  const attempts = [
    // Attempt 1: Search within official NFL channel only - most reliable
    {
      type: 'NFL_channel_only',
      url: `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&channelId=UCDVYQ4Zhbm3S2dlz7P1GBDg&type=video&order=date&maxResults=50&` +
        `videoDuration=medium&publishedAfter=${getRecentDate()}&key=${API_KEY}`
    },
    // Attempt 2: Search with full team names and "vs" to match NFL title format
    {
      type: 'search_full_names_vs',
      url: `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(`"${fullAwayTeam}" vs "${fullHomeTeam}" highlights`)}&` +
        `type=video&order=relevance&videoDuration=medium&maxResults=25&publishedAfter=${getRecentDate()}&key=${API_KEY}`
    },
    // Attempt 3: General search with full team names
    {
      type: 'search_full_names',
      url: `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(`"${fullAwayTeam}" "${fullHomeTeam}" highlights NFL`)}&` +
        `type=video&order=relevance&maxResults=25&publishedAfter=${getRecentDate()}&key=${API_KEY}`
    },
    // Attempt 4: Search with team nicknames (e.g., "Vikings Steelers")
    {
      type: 'search_nicknames',
      url: `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(`${getTeamNickname(fullAwayTeam)} ${getTeamNickname(fullHomeTeam)} highlights NFL`)}&` +
        `type=video&order=relevance&maxResults=25&publishedAfter=${getRecentDate()}&key=${API_KEY}`
    },
    // Attempt 5: Fallback to original team names
    {
      type: 'search_original',
      url: `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(`${awayTeam} ${homeTeam} highlights NFL`)}&` +
        `type=video&order=relevance&maxResults=25&publishedAfter=${getRecentDate()}&key=${API_KEY}`
    }
  ];

  for (const attempt of attempts) {
    console.log(`Trying ${attempt.type} search...`);
    try {
      const response = await fetch(attempt.url);

      if (!response.ok) {
        console.log(`${attempt.type} search failed: ${response.status}`);
        continue;
      }

      const data = await response.json();
      console.log(`Found ${data.items?.length || 0} videos from ${attempt.type} search`);

      if (data.items?.length > 0) {
        console.log('Sample titles:');
        data.items.slice(0, 3).forEach((video, i) => {
          console.log(`${i + 1}: ${video.snippet.title}`);
        });
      }

      // Find video that matches our teams (use both original and full team names)
      const matchingVideo = findBestMatch(data.items, awayTeam, homeTeam, fullAwayTeam, fullHomeTeam, awayScore, homeScore);

      if (matchingVideo) {
        console.log(`✅ Found match: ${matchingVideo.snippet.title}`);
        return `https://www.youtube.com/watch?v=${matchingVideo.id.videoId}`;
      } else {
        console.log(`No match found in ${attempt.type} search`);
      }
    } catch (error) {
      console.log(`${attempt.type} search error:`, error.message);
      continue;
    }
  }

  return null;
}

function findBestMatch(videos, awayTeam, homeTeam, fullAwayTeam, fullHomeTeam, awayScore, homeScore) {
  // Get variations for both original and full team names
  const originalVariations = getTeamVariations(awayTeam, homeTeam);
  const fullVariations = getTeamVariations(fullAwayTeam, fullHomeTeam);
  
  // Combine all variations
  const allVariations = {
    away: [...new Set([...originalVariations.away, ...fullVariations.away])],
    home: [...new Set([...originalVariations.home, ...fullVariations.home])]
  };
  
  console.log('All team variations:', allVariations);
  let bestMatch = null;
  let bestScore = 0;

  // Negative filters - avoid these types of videos
  const negativeKeywords = [
    'recap', 'reaction', 'preview', 'news', 'breaking',
    'mic\'d up', 'micd up', 'mic up', 'film room', 'every td',
    'every touchdown', 'top plays', 'analysis', 'fantasy',
    'madden', 'live stream', 'postgame', 'post game'
  ];

  for (const video of videos) {
    const title = video.snippet.title.toLowerCase();
    const description = video.snippet.description.toLowerCase();
    const channelTitle = video.snippet.channelTitle.toLowerCase();
    let matchScore = 0;

    // Skip videos with negative keywords in the title
    if (negativeKeywords.some(keyword => title.includes(keyword))) {
      console.log(`Skipping "${video.snippet.title}" - contains negative keyword`);
      continue;
    }

    // Check if both teams are mentioned in title or description
    const hasAwayTeam = allVariations.away.some(variant =>
      title.includes(variant) || description.includes(variant));
    const hasHomeTeam = allVariations.home.some(variant =>
      title.includes(variant) || description.includes(variant));

    if (hasAwayTeam && hasHomeTeam) {
      matchScore += 10; // Base score for having both teams

      // HIGH PRIORITY: Official NFL channel
      if (channelTitle === 'nfl') {
        matchScore += 15;
        console.log(`Bonus for official NFL channel: "${video.snippet.title}"`);
      }

      // Bonus points if it's specifically labeled as highlights
      if (title.includes('highlights') || title.includes('highlight')) {
        matchScore += 5;
      }

      // Extra bonus for "Game Highlights" (NFL's standard format)
      if (title.includes('game highlights')) {
        matchScore += 3;
      }

      // Extra bonus if score matches (for games with final scores)
      if (awayScore && homeScore &&
        (title.includes(`${awayScore}-${homeScore}`) || title.includes(`${homeScore}-${awayScore}`))) {
        matchScore += 8;
      }

      // Prefer videos with "vs." format (NFL standard)
      if (title.includes(' vs. ')) {
        matchScore += 4;
      } else if (title.includes(' vs ') || title.includes(' @ ')) {
        matchScore += 2;
      }

      // Bonus for titles containing both full team names (not just nicknames)
      const hasFullAwayName = title.includes(fullAwayTeam.toLowerCase());
      const hasFullHomeName = title.includes(fullHomeTeam.toLowerCase());
      if (hasFullAwayName && hasFullHomeName) {
        matchScore += 5;
      }

      // Prefer more recent videos (published more recently gets higher score)
      const publishedDate = new Date(video.snippet.publishedAt);
      const hoursAgo = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60);
      if (hoursAgo < 24) matchScore += 2;
      if (hoursAgo < 12) matchScore += 1;

      if (matchScore > bestScore) {
        bestScore = matchScore;
        bestMatch = video;
        console.log(`New best match (score: ${bestScore}): "${video.snippet.title}"`);
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

// New function to convert ESPN city names to full team names
function getFullTeamName(cityOrTeamName) {
  const cityToTeamMap = {
    // City name -> Full team name mapping
    'arizona': 'Arizona Cardinals',
    'atlanta': 'Atlanta Falcons',
    'baltimore': 'Baltimore Ravens',
    'buffalo': 'Buffalo Bills',
    'carolina': 'Carolina Panthers',
    'chicago': 'Chicago Bears',
    'cincinnati': 'Cincinnati Bengals',
    'cleveland': 'Cleveland Browns',
    'dallas': 'Dallas Cowboys',
    'denver': 'Denver Broncos',
    'detroit': 'Detroit Lions',
    'green bay': 'Green Bay Packers',
    'houston': 'Houston Texans',
    'indianapolis': 'Indianapolis Colts',
    'jacksonville': 'Jacksonville Jaguars',
    'kansas city': 'Kansas City Chiefs',
    'las vegas': 'Las Vegas Raiders',
    'los angeles': 'Los Angeles Rams', // Default to Rams, will handle Chargers separately
    'miami': 'Miami Dolphins',
    'minnesota': 'Minnesota Vikings',
    'new england': 'New England Patriots',
    'new orleans': 'New Orleans Saints',
    'new york': 'New York Giants', // Default to Giants, will handle Jets separately
    'philadelphia': 'Philadelphia Eagles',
    'pittsburgh': 'Pittsburgh Steelers',
    'san francisco': 'San Francisco 49ers',
    'seattle': 'Seattle Seahawks',
    'tampa bay': 'Tampa Bay Buccaneers',
    'tennessee': 'Tennessee Titans',
    'washington': 'Washington Commanders'
  };

  const input = cityOrTeamName.toLowerCase().trim();
  
  // If it's already a full team name, return it
  if (input.includes('cardinals') || input.includes('falcons') || input.includes('ravens') ||
      input.includes('bills') || input.includes('panthers') || input.includes('bears') ||
      input.includes('bengals') || input.includes('browns') || input.includes('cowboys') ||
      input.includes('broncos') || input.includes('lions') || input.includes('packers') ||
      input.includes('texans') || input.includes('colts') || input.includes('jaguars') ||
      input.includes('chiefs') || input.includes('raiders') || input.includes('chargers') ||
      input.includes('rams') || input.includes('dolphins') || input.includes('vikings') ||
      input.includes('patriots') || input.includes('saints') || input.includes('giants') ||
      input.includes('jets') || input.includes('eagles') || input.includes('steelers') ||
      input.includes('49ers') || input.includes('seahawks') || input.includes('buccaneers') ||
      input.includes('titans') || input.includes('commanders')) {
    return cityOrTeamName;
  }

  // Handle special cases
  if (input === 'la rams' || input === 'l.a. rams') return 'Los Angeles Rams';
  if (input === 'la chargers' || input === 'l.a. chargers') return 'Los Angeles Chargers';
  if (input === 'ny giants' || input === 'n.y. giants') return 'New York Giants';
  if (input === 'ny jets' || input === 'n.y. jets') return 'New York Jets';
  
  // Look up in city mapping
  return cityToTeamMap[input] || cityOrTeamName;
}

function getRecentDate() {
  // Get date from 14 days ago for recent videos (extended range)
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return date.toISOString();
}

function generateSearchFallback(awayTeam, homeTeam, awayScore, homeScore) {
  const year = new Date().getFullYear();
  
  // Try to use full team names for better search results
  const fullAwayTeam = getFullTeamName(awayTeam);
  const fullHomeTeam = getFullTeamName(homeTeam);

  let searchQuery;
  if (awayScore && homeScore) {
    searchQuery = `"${fullAwayTeam} vs. ${fullHomeTeam}" NFL highlights ${year}`;
  } else {
    searchQuery = `"${fullAwayTeam} vs ${fullHomeTeam}" "NFL highlights" ${year}`;
  }

  searchQuery += ` -recap -news -reaction -fantasy -breaking -analysis -preview`;

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
}
