// Schedule API Endpoint
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { sport = 'NFL', teamId, season } = req.query;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'teamId is required'
      });
    }

    if (!season) {
      return res.status(400).json({
        success: false,
        error: 'season is required'
      });
    }

    console.log(`Fetching schedule for team ${teamId} in ${sport} ${season}`);

    // Map sport to ESPN API path
    let apiPath;
    if (sport === 'NFL') {
      apiPath = 'football/nfl';
    } else if (sport === 'CFB') {
      apiPath = 'football/college-football';
    } else if (sport === 'NBA') {
      apiPath = 'basketball/nba';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid sport'
      });
    }

    const baseUrl = `https://site.api.espn.com/apis/site/v2/sports/${apiPath}/teams/${teamId}/schedule`;

    let data;

    // For CFB, fetch both regular season and postseason
    if (sport === 'CFB') {
      const regularSeasonUrl = `${baseUrl}?season=${season}&seasontype=2`;
      const postseasonUrl = `${baseUrl}?season=${season}&seasontype=3`;

      const [regularRes, postRes] = await Promise.all([
        fetch(regularSeasonUrl),
        fetch(postseasonUrl)
      ]);

      if (!regularRes.ok && !postRes.ok) {
        throw new Error(`ESPN API error: ${regularRes.status}`);
      }

      const regularData = regularRes.ok ? await regularRes.json() : { events: [] };
      const postData = postRes.ok ? await postRes.json() : { events: [] };

      // Merge events from both season types
      data = {
        team: regularData.team || postData.team,
        events: [
          ...(regularData.events || []),
          ...(postData.events || [])
        ]
      };
    } else {
      // For NFL and NBA, single fetch is sufficient
      const url = `${baseUrl}?season=${season}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`ESPN API error: ${response.status}`);
      data = await response.json();
    }

    // Get team info
    const team = {
      id: data.team?.id || teamId,
      displayName: data.team?.displayName || 'Unknown Team'
    };

    // Parse events
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const games = (data.events || [])
      .map(event => {
        const competition = event.competitions?.[0];
        if (!competition) return null;

        const completed = competition.status?.type?.completed || false;

        // Only return completed games
        if (!completed) return null;

        const competitors = competition.competitors || [];
        const homeTeam = competitors.find(c => c.homeAway === 'home');
        const awayTeam = competitors.find(c => c.homeAway === 'away');

        // Determine if this team is home or away
        const isHome = homeTeam?.team?.id === teamId;
        const opponent = isHome
          ? (awayTeam?.team?.shortDisplayName || awayTeam?.team?.displayName || 'Unknown')
          : (homeTeam?.team?.shortDisplayName || homeTeam?.team?.displayName || 'Unknown');

        // Determine result - handle nested score object
        const homeScore = parseInt(homeTeam?.score?.displayValue || homeTeam?.score?.value || homeTeam?.score || 0);
        const awayScore = parseInt(awayTeam?.score?.displayValue || awayTeam?.score?.value || awayTeam?.score || 0);

        const teamScore = isHome ? homeScore : awayScore;
        const opponentScore = isHome ? awayScore : homeScore;
        const won = teamScore > opponentScore;
        const resultText = `${won ? 'W' : 'L'} ${teamScore}-${opponentScore}`;

        // Parse date
        const eventDate = new Date(event.date);
        const displayDate = `${monthNames[eventDate.getMonth()]} ${eventDate.getDate()}`;

        // Get week number
        const week = event.week?.number || event.seasonType?.week || null;

        return {
          id: event.id,
          week: week,
          date: event.date.split('T')[0],
          displayDate: displayDate,
          opponent: opponent,
          homeAway: isHome ? 'home' : 'away',
          result: resultText,
          completed: true
        };
      })
      .filter(game => game !== null);

    console.log(`Found ${games.length} completed games`);

    return res.status(200).json({
      success: true,
      team: team,
      games: games,
      metadata: {
        sport,
        season,
        count: games.length
      }
    });

  } catch (error) {
    console.error('API Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule',
      details: error.message
    });
  }
}
