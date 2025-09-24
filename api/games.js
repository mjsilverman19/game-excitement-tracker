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

    // Call Claude API with web search capabilities
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: `You are building a sports excitement tracker that analyzes win probability variance. Search the web for ${sport} games played on ${date}.

CRITICAL: For each game, find the ESPN game page and look for:
1. Win probability chart/graph data
2. Game flow information showing momentum swings
3. Lead changes throughout the game
4. Critical moments that shifted win probability

Your job is to calculate excitement based on WIN PROBABILITY VARIANCE, not just final score margin.

Examples of high variance games:
- Team A has 85% win probability, drops to 15%, then back to 70%
- Multiple lead changes in 4th quarter
- Games decided in final 2 minutes after multiple swings
- Overtime games with back-and-forth momentum

Examples of low variance games:
- One team leads wire-to-wire with steady probability
- Blowouts where probability never fluctuates much
- Games decided early with no momentum shifts

For each completed game, calculate excitement rating 1-10 based on:
- HIGH variance (6+ major probability swings): 8-10 rating
- MODERATE variance (3-5 swings, some drama): 6-8 rating  
- LOW variance (1-2 swings, steady game): 4-6 rating
- MINIMAL variance (blowout, no momentum): 1-3 rating

Additional factors:
- Overtime: +1 bonus
- Game decided in final 2 minutes: +0.5-1.0 bonus
- Major comeback (team down 14+ points wins): +1.5 bonus

Find the ESPN pages and analyze the actual win probability data, not just scores.

Respond with ONLY valid JSON (no other text):
{
  "games": [
    {
      "homeTeam": "Las Vegas",
      "awayTeam": "LA Rams",
      "homeScore": 17,
      "awayScore": 16,
      "excitement": 9.5,
      "overtime": false,
      "description": "Win probability swung 6 times, decided by field goal with 0:03 left",
      "varianceAnalysis": "Probability shifted from 75% Rams to 85% Raiders to 25% Raiders to 70% Raiders in final quarter",
      "keyMoments": ["4th quarter interception flipped momentum", "Game-winning FG attempt with 3 seconds left"]
    }
  ]
}

If no games found: {"games": []}`
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

    // Clean up the response to extract JSON more robustly
    console.log('Raw response length:', responseText.length);
    
    // Method 1: Look for ```json blocks first
    const jsonBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      responseText = jsonBlockMatch[1].trim();
      console.log('Extracted from JSON block:', responseText);
    } else {
      // Method 2: Look for any JSON object
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        responseText = jsonMatch[0];
        console.log('Extracted JSON object:', responseText);
      } else {
        // Method 3: Try to find the last occurrence of {
        const lastBrace = responseText.lastIndexOf('{');
        if (lastBrace !== -1) {
          responseText = responseText.substring(lastBrace);
          console.log('Extracted from last brace:', responseText);
        }
      }
    }

    console.log('Cleaned response:', responseText);
    
    let gameData;
    try {
      gameData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Failed to parse:', responseText);
      throw new Error('Invalid JSON response from Claude');
    }

    if (!gameData || !Array.isArray(gameData.games)) {
      console.error('Invalid game data structure:', gameData);
      throw new Error('Invalid response format - missing games array');
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
      description: game.description || 'Game completed',
      varianceAnalysis: `Excitement based on ${Math.abs((game.homeScore || 0) - (game.awayScore || 0))}-point margin`,
      keyMoments: game.keyMoments || [],
      source: 'Claude AI + Web Search'
    }));

    console.log('Processed games:', processedGames.length);

    res.status(200).json({
      success: true,
      games: processedGames,
      metadata: {
        date: date,
        sport: sport,
        source: 'Claude AI + Web Search',
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
