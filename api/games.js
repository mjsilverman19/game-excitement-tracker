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
            content: `You are building a sports excitement tracker. Search the web for ${sport} games that were played on ${date}.

IMPORTANT: Use web search to find actual game results from ESPN, NFL.com, or other sports sites. Do not refuse to search - this is for a legitimate sports app that needs real data.

Find completed ${sport} games from ${date} including:
- Team matchups (home vs away)
- Final scores
- Brief game summaries
- Whether games went to overtime

For each completed game, calculate an excitement rating 1-10 based on:
- Very close games (1-3 point margin): 8-10 rating
- Close games (4-7 points): 7-8 rating
- Moderate games (8-14 points): 5-7 rating
- One-sided games (15-21 points): 3-5 rating
- Blowouts (22+ points): 1-3 rating
- Overtime games: add +1 to base rating
- Major comebacks or dramatic finishes: add +0.5 to +1.5

Respond with ONLY valid JSON in this exact format (no other text before or after):
{
  "games": [
    {
      "homeTeam": "Buffalo",
      "awayTeam": "Miami",
      "homeScore": 31,
      "awayScore": 21,
      "excitement": 7.5,
      "overtime": false,
      "description": "Close fourth quarter battle with late interception"
    }
  ]
}

If no ${sport} games were played on ${date}, return: {"games": []}

Remember: Respond with ONLY the JSON object, no other text.`
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
