// File: /api/games.js - Redis caching version

import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

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
    console.log(`Checking Redis cache for ${sport} games on ${date}...`);
    
    // Check cache first
    const cacheKey = `games:${sport}:${date}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      console.log('Cache hit! Serving cached data');
      return res.status(200).json({
        success: true,
        games: cachedData.games,
        metadata: {
          ...cachedData.metadata,
          source: 'Cached Claude Analysis',
          cached: true,
          cacheTime: cachedData.timestamp
        }
      });
    }

    console.log('Cache miss. Running Claude analysis...');
    
    // No cache - run Claude analysis
    const analysisResult = await runClaudeAnalysis(date, sport);
    
    if (analysisResult.success) {
      // Cache the results for 24 hours
      const cacheData = {
        games: analysisResult.games,
        metadata: analysisResult.metadata,
        timestamp: new Date().toISOString()
      };
      
      await redis.setex(cacheKey, 86400, JSON.stringify(cacheData)); // 24 hours
      console.log(`Cached results for ${cacheKey}`);
    }
    
    return res.status(200).json(analysisResult);

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

async function runClaudeAnalysis(date, sport) {
  console.log(`Running Claude analysis for ${sport} games on ${date}...`);

  try {
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
            content: `Analyze ALL ${sport} games played on ${date}. This is for a sports excitement tracking app.

TASK: For each completed game, find ESPN or sports site data and analyze win probability variance throughout the game.

Rate excitement 1-10 based on WIN PROBABILITY VARIANCE:
- HIGH variance (6+ major swings, lead changes): 8-10 rating
- MODERATE variance (3-5 swings): 6-8 rating  
- LOW variance (1-2 swings): 4-6 rating
- MINIMAL variance (blowout): 1-3 rating

Bonuses: Overtime +1, final 2-min drama +0.5-1, major comeback +1.5

For each game, analyze:
1. How many times win probability shifted significantly (20%+ swings)
2. Lead changes throughout the game
3. Critical momentum-shifting moments
4. 4th quarter/final minutes drama

Return comprehensive analysis for ALL games that day.

Respond with ONLY this JSON (no other text):
{
  "games": [
    {
      "homeTeam": "Las Vegas", 
      "awayTeam": "LA Rams",
      "homeScore": 17,
      "awayScore": 16, 
      "excitement": 9.2,
      "overtime": false,
      "description": "6 major probability swings, game-winning FG with 0:03 left",
      "varianceAnalysis": "Win probability: 65% Rams → 25% → 80% → 30% → 75% → 20% → 85% Raiders",
      "keyMoments": ["Pick-6 flipped 40% probability", "Missed FG opened door", "Final drive TD"]
    }
  ]
}

Find ALL games from ${date}. If none: {"games": []}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    let responseText = data.content[0].text;

    // Extract JSON from response
    const jsonBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      responseText = jsonBlockMatch[1].trim();
    } else {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        responseText = jsonMatch[0];
      }
    }

    const gameData = JSON.parse(responseText);

    if (!gameData || !Array.isArray(gameData.games)) {
      throw new Error('Invalid response format');
    }

    // Process games
    const processedGames = gameData.games.map((game, index) => ({
      id: `cached-${date}-${index}`,
      homeTeam: game.homeTeam || 'Unknown',
      awayTeam: game.awayTeam || 'Unknown',
      homeScore: parseInt(game.homeScore) || 0,
      awayScore: parseInt(game.awayScore) || 0,
      excitement: Math.round(parseFloat(game.excitement || 5.0) * 10) / 10,
      overtime: Boolean(game.overtime),
      description: game.description || 'Game completed',
      varianceAnalysis: game.varianceAnalysis || 'Analysis pending',
      keyMoments: game.keyMoments || [],
      source: 'Claude AI + Win Probability Analysis'
    }));

    return {
      success: true,
      games: processedGames,
      metadata: {
        date: date,
        sport: sport,
        source: 'Claude AI + Win Probability Analysis',
        analysisType: 'Cached Win Probability Variance',
        gameCount: processedGames.length,
        analysisTime: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Claude analysis failed:', error);
    throw error;
  }
}
