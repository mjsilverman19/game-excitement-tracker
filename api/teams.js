// Teams API Endpoint
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
    const { sport = 'NFL' } = req.query;

    console.log(`Fetching teams for ${sport}`);

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

    // CFB needs higher limit due to large number of teams
    const limit = sport === 'CFB' ? 200 : 50;
    const url = `https://site.api.espn.com/apis/site/v2/sports/${apiPath}/teams?limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`ESPN API error: ${response.status}`);

    const data = await response.json();

    // Parse teams
    const teams = (data.sports?.[0]?.leagues?.[0]?.teams || [])
      .map(teamWrapper => {
        const team = teamWrapper.team;
        return {
          id: team.id,
          name: team.name,
          displayName: team.displayName,
          abbreviation: team.abbreviation
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    console.log(`Found ${teams.length} teams for ${sport}`);

    return res.status(200).json({
      success: true,
      teams: teams,
      metadata: {
        sport,
        count: teams.length
      }
    });

  } catch (error) {
    console.error('API Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch teams',
      details: error.message
    });
  }
}
