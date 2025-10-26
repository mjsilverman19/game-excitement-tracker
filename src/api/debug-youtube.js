import { config } from 'dotenv';
config();

// Test the YouTube API matching improvements
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { awayTeam, homeTeam, awayScore, homeScore } = req.body;

  if (!awayTeam || !homeTeam) {
    return res.status(400).json({ error: 'Team names are required' });
  }

  console.log('\n=== DEBUG YOUTUBE SEARCH ===');
  console.log('Original Input:', { awayTeam, homeTeam, awayScore, homeScore });

  // Test team name conversion
  const fullAwayTeam = getFullTeamName(awayTeam);
  const fullHomeTeam = getFullTeamName(homeTeam);
  console.log('Full team names:', { fullAwayTeam, fullHomeTeam });

  // Test variations
  const originalVariations = getTeamVariations(awayTeam, homeTeam);
  const fullVariations = getTeamVariations(fullAwayTeam, fullHomeTeam);
  
  console.log('Original variations:', originalVariations);
  console.log('Full variations:', fullVariations);

  // Test search queries
  const searchQueries = [
    `"${fullAwayTeam}" "${fullHomeTeam}" highlights NFL`,
    `${getTeamNickname(fullAwayTeam)} ${getTeamNickname(fullHomeTeam)} highlights NFL`,
    `${awayTeam} ${homeTeam} highlights NFL`
  ];
  console.log('Search queries to try:', searchQueries);

  // If we have API key, try one search
  const API_KEY = process.env.YOUTUBE_API_KEY;
  if (API_KEY) {
    console.log('\nTesting API search...');
    try {
      const testUrl = `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(searchQueries[0])}&` +
        `type=video&order=relevance&maxResults=10&publishedAfter=${getRecentDate()}&key=${API_KEY}`;
      
      console.log('Test URL:', testUrl);
      const response = await fetch(testUrl);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Found ${data.items?.length || 0} videos`);
        
        if (data.items?.length > 0) {
          console.log('Top 3 results:');
          data.items.slice(0, 3).forEach((video, i) => {
            console.log(`${i + 1}: ${video.snippet.title}`);
            console.log(`   Channel: ${video.snippet.channelTitle}`);
            console.log(`   Published: ${video.snippet.publishedAt}`);
          });
          
          // Test matching
          const allVariations = {
            away: [...new Set([...originalVariations.away, ...fullVariations.away])],
            home: [...new Set([...originalVariations.home, ...fullVariations.home])]
          };
          
          const match = findBestMatch(data.items, awayTeam, homeTeam, fullAwayTeam, fullHomeTeam, awayScore, homeScore);
          if (match) {
            console.log('\nBest match found:', match.snippet.title);
            console.log('Video URL:', `https://www.youtube.com/watch?v=${match.id.videoId}`);
          } else {
            console.log('\nNo good match found');
          }
        }
      } else {
        console.log('API request failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.log('API test error:', error.message);
    }
  } else {
    console.log('No YouTube API key found');
  }

  return res.json({
    debug: {
      originalTeams: { awayTeam, homeTeam },
      fullTeams: { fullAwayTeam, fullHomeTeam },
      variations: {
        original: originalVariations,
        full: fullVariations
      },
      searchQueries,
      hasApiKey: !!API_KEY
    }
  });
}

// Copy the utility functions we need for testing
function getFullTeamName(cityOrTeamName) {
  const cityToTeamMap = {
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
    'los angeles': 'Los Angeles Rams',
    'miami': 'Miami Dolphins',
    'minnesota': 'Minnesota Vikings',
    'new england': 'New England Patriots',
    'new orleans': 'New Orleans Saints',
    'new york': 'New York Giants',
    'philadelphia': 'Philadelphia Eagles',
    'pittsburgh': 'Pittsburgh Steelers',
    'san francisco': 'San Francisco 49ers',
    'seattle': 'Seattle Seahawks',
    'tampa bay': 'Tampa Bay Buccaneers',
    'tennessee': 'Tennessee Titans',
    'washington': 'Washington Commanders'
  };

  const input = cityOrTeamName.toLowerCase().trim();
  
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

  if (input === 'la rams' || input === 'l.a. rams') return 'Los Angeles Rams';
  if (input === 'la chargers' || input === 'l.a. chargers') return 'Los Angeles Chargers';
  if (input === 'ny giants' || input === 'n.y. giants') return 'New York Giants';
  if (input === 'ny jets' || input === 'n.y. jets') return 'New York Jets';
  
  return cityToTeamMap[input] || cityOrTeamName;
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
  const words = fullTeamName.toLowerCase().split(' ');
  return words[words.length - 1];
}

function getTeamCity(fullTeamName) {
  const words = fullTeamName.toLowerCase().split(' ');
  if (words.length > 1) {
    return words.slice(0, -1).join(' ');
  }
  return null;
}

function getTeamAbbreviation(fullTeamName) {
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
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return date.toISOString();
}

function findBestMatch(videos, awayTeam, homeTeam, fullAwayTeam, fullHomeTeam, awayScore, homeScore) {
  const originalVariations = getTeamVariations(awayTeam, homeTeam);
  const fullVariations = getTeamVariations(fullAwayTeam, fullHomeTeam);
  
  const allVariations = {
    away: [...new Set([...originalVariations.away, ...fullVariations.away])],
    home: [...new Set([...originalVariations.home, ...fullVariations.home])]
  };
  
  let bestMatch = null;
  let bestScore = 0;

  for (const video of videos) {
    const title = video.snippet.title.toLowerCase();
    const description = video.snippet.description.toLowerCase();
    let matchScore = 0;

    const hasAwayTeam = allVariations.away.some(variant =>
      title.includes(variant) || description.includes(variant));
    const hasHomeTeam = allVariations.home.some(variant =>
      title.includes(variant) || description.includes(variant));

    if (hasAwayTeam && hasHomeTeam) {
      matchScore += 10;

      if (title.includes('highlights') || title.includes('highlight')) {
        matchScore += 5;
      }

      if (awayScore && homeScore &&
        (title.includes(`${awayScore}-${homeScore}`) || title.includes(`${homeScore}-${awayScore}`))) {
        matchScore += 8;
      }

      if (title.includes(' vs ') || title.includes(' vs. ') || title.includes(' @ ')) {
        matchScore += 3;
      }

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