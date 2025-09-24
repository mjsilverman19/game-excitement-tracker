export default async function handler(req, res) {
  // Enable CORS for your frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, sport } = req.body;

  if (!date || !sport) {
    return res.status(400).json({ error: 'Date and sport are required' });
  }

  try {
    console.log(`Fetching ${sport} games for ${date} using Claude API...`);

    // Call Claude API to analyze games and win probability variance
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Find all ${sport} games that were played on ${date}. For each completed game, search for the ESPN game page and analyze the win probability data/chart to calculate an excitement rating.

Here's what I need you to do:

1. Search for actual ${sport} games played on ${date}
2. For each game, look for ESPN's win probability chart or game flow data
3. Analyze the variance in win probability throughout the game
4. Calculate excitement rating 1-10 based on win probability swings:
   - High variance (6+ major swings, especially in 4th quarter): 8-10 rating
   - Moderate variance (3-5 swings, comebacks): 6-8 rating  
   - Low variance (steady game, few lead changes): 4-6 rating
   - Blowouts (minimal variance): 1-3 rating
   - Overtime games: automatic +1 bonus
   - Games decided in final 2 minutes: +0.5-1.0 bonus

5. Focus on win probability momentum swings, not just final score margins

Return ONLY valid JSON in this exact format:
{
  "games": [
    {
      "homeTeam": "Buffalo",
      "awayTeam": "Miami",
      "homeScore": 31,
      "awayScore": 21,
      "excitement": 8.7,
      "overtime": false,
      "description": "Win probability swung from 75% to 25% three times in the 4th quarter",
      "varianceAnalysis": "Major momentum shifts at 8:30, 3:15, and 0:47 remaining",
      "keyMoments": ["Late interception flipped probability", "Two-minute drill comeback attempt"]
    }
  ],
  "source": "ESPN win probability analysis",
  "analysisDate": "${date}"
}

If no ${sport} games were played on ${date}, return {"games": [], "source": "No games found"}.

Focus on finding REAL games with REAL win probability variance data from ESPN. This is for a spoiler-free game discovery app, so accuracy is crucial.`
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let responseText = data.content[0].text;

    // Clean up the response to extract JSON
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse the JSON response
    const gameData = JSON.parse(responseText);

    // Validate the response structure
    if (!gameData.games) {
      throw new Error('Invalid response format from Claude');
    }

    // Transform games to ensure consistent format
    const processedGames = gameData.games.map((game, index) => ({
      id: `claude-${date}-${index}`,
      homeTeam: game.homeTeam || 'Unknown',
      awayTeam: game.awayTeam || 'Unknown', 
      homeScore: parseInt(game.homeScore) || 0,
      awayScore: parseInt(game.awayScore) || 0,
      excitement: Math.round(parseFloat(game.excitement || 5.0) * 10) / 10,
      overtime: Boolean(game.overtime),
      description: game.description || 'Analysis pending',
      varianceAnalysis: game.varianceAnalysis || '',
      keyMoments: game.keyMoments || [],
      source: 'Claude + ESPN Analysis'
    }));

    // Return the processed game data
    res.status(200).json({
      success: true,
      games: processedGames,
      metadata: {
        date: date,
        sport: sport,
        source: gameData.source || 'Claude + ESPN Analysis',
        analysisType: 'Win Probability Variance',
        gameCount: processedGames.length
      }
    });

  } catch (error) {
    console.error('Error in games API:', error);
    
    // Return error response
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game data',
      details: error.message,
      games: []
    });
  }
}
