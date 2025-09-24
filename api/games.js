export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // Call Claude API with corrected endpoint and headers
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
       model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: `Find ${sport} games played on ${date}. Search for real game results and scores.

For each completed game, provide:
1. Team names (home/away)  
2. Final scores
3. Brief description of game excitement

Calculate excitement rating 1-10 based on:
- Close games (1-7 points): 7-10 rating
- Moderate games (8-14 points): 5-7 rating
- Blowouts (15+ points): 1-5 rating
- Overtime games: +1 bonus

Return ONLY this JSON format:
{
  "games": [
    {
      "homeTeam": "Buffalo",
      "awayTeam": "Miami",
      "homeScore": 31,
      "awayScore": 21,
      "excitement": 7.5,
      "overtime": false,
      "description": "Close fourth quarter battle"
    }
  ]
}

If no ${sport} games on ${date}, return {"games": []}`
          }
        ]
      })
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Claude response received');
    
    let responseText = data.content[0].text;
    console.log('Raw response:', responseText);

    // Clean up JSON
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const gameData = JSON.parse(responseText);

    if (!gameData.games) {
      throw new Error('Invalid response format');
    }

    // Process games
    const processedGames = gameData.games.map((game, index) => ({
      id: `claude-${date}-${index}`,
      homeTeam: game.homeTeam || 'Unknown',
      awayTeam: game.awayTeam || 'Unknown',
      homeScore: parseInt(game.homeScore) || 0,
      awayScore: parseInt(game.awayScore) || 0,
      excitement: Math.round(parseFloat(game.excitement || 5.0) * 10) / 10,
      overtime: Boolean(game.overtime),
      description: game.description || 'Game analysis',
      varianceAnalysis: `Excitement rating: ${game.excitement}/10`,
      keyMoments: [],
      source: 'Claude AI Analysis'
    }));

    console.log('Processed games:', processedGames.length);

    res.status(200).json({
      success: true,
      games: processedGames,
      metadata: {
        date: date,
        sport: sport,
        source: 'Claude AI Analysis',
        analysisType: 'Game Excitement Rating',
        gameCount: processedGames.length
      }
    });

  } catch (error) {
    console.error('Error in games API:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game data',
      details: error.message,
      games: []
    });
  }
}
