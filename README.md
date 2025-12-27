# Game Index

A minimalist web application that helps you find the most entertaining NFL and college football games to watch by analyzing ESPN's win probability data.

## How It Works

1. **Select** your sport (NFL/CFB), season, and week
2. **Analyze** - The app fetches completed games from ESPN
3. **Watch** - Games are ranked by entertainment score (0-10)

## Entertainment Scoring

Games are scored based on 4 core metrics:

- **Variance** (30%): How much the game swung back and forth
- **Late-Game Excitement** (35%): Tension in the final quarter
- **Comeback Factor** (25%): Magnitude of win probability swings
- **Persistence** (10%): How long the game stayed competitive

Higher scores = more entertaining games to watch.

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (no build step)
- **Backend**: Vercel serverless functions
- **Data**: ESPN Sports API (win probability data)

## Local Development

1. Install Vercel CLI: `npm i -g vercel`
2. Run locally: `vercel dev`
3. Open `http://localhost:3000`

## Deployment

Deploy to Vercel:

```bash
vercel --prod
```

## API

### POST /api/games

Analyzes games for a given week.

**Request:**
```json
{
  "sport": "NFL",
  "season": 2024,
  "week": 12,
  "seasonType": "2"
}
```

**Response:**
```json
{
  "success": true,
  "games": [
    {
      "id": "401671749",
      "homeTeam": "Chiefs",
      "awayTeam": "Bills",
      "homeScore": 24,
      "awayScore": 20,
      "excitement": 8.7,
      "overtime": false
    }
  ],
  "metadata": {
    "sport": "NFL",
    "season": 2024,
    "week": 12,
    "count": 8
  }
}
```

## File Structure

```
├── index.html           # Frontend application
├── api/
│   ├── games.js         # Main API endpoint
│   ├── calculator.js    # Entertainment scoring algorithm
│   └── fetcher.js       # ESPN data fetcher
├── vercel.json          # Vercel configuration
└── package.json
```

## License

MIT
