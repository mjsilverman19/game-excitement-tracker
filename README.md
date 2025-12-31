# Game Entertainment Index

A web application that ranks NFL, college football, and NBA games by entertainment value using ESPN's win probability data. Find the best games to watch without spoiling the score.

## How It Works

1. **Select** your sport (NFL, CFB, or NBA), season, and week/date
2. **Browse** games ranked by entertainment score (1-10)
3. **Watch** spoiler-free — scores are hidden by default

You can also search by team to find and analyze any specific game from their schedule.

## Entertainment Scoring

Games are scored based on three metrics derived from win probability data:

| Metric | Weight | Description |
|--------|--------|-------------|
| **Outcome Uncertainty** | 30% | How long was the result in doubt? Measures time spent near 50/50 win probability. |
| **Momentum Drama** | 30% | Leverage-weighted swings — big momentum shifts matter more when the game is close. |
| **Finish Quality** | 40% | Did it come down to the wire? Combines late-game volatility, final closeness, and walk-off moments. |

Games are categorized as **must watch** (8+), **recommended** (6-7.9), or **skip** (<6). Overtime games receive a bonus.

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (no build step)
- **Backend**: Vercel serverless functions
- **Data**: ESPN Sports API (win probability data)

## Local Development

1. Install Vercel CLI: `npm i -g vercel`
2. Run locally: `vercel dev`
3. Open `http://localhost:3000`

## Deployment

```bash
vercel --prod
```

## API

### POST /api/games

Analyzes games for a given week (NFL/CFB) or date (NBA). Can also analyze a single game by ID.

**Request (week-based):**
```json
{
  "sport": "NFL",
  "season": 2024,
  "week": 12,
  "seasonType": "2"
}
```

**Request (date-based, NBA):**
```json
{
  "sport": "NBA",
  "date": "2024-12-15"
}
```

**Request (single game):**
```json
{
  "sport": "NFL",
  "gameId": "401671749"
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
      "breakdown": {
        "uncertainty": 7.2,
        "drama": 8.1,
        "finish": 9.4
      },
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

### GET /api/teams

Returns all teams for a given sport.

**Request:**
```
GET /api/teams?sport=NFL
```

**Response:**
```json
{
  "success": true,
  "teams": [
    {
      "id": "1",
      "name": "Falcons",
      "displayName": "Atlanta Falcons",
      "abbreviation": "ATL"
    }
  ],
  "metadata": {
    "sport": "NFL",
    "count": 32
  }
}
```

### GET /api/schedule

Returns completed games for a team's season.

**Request:**
```
GET /api/schedule?sport=NFL&teamId=12&season=2024
```

**Response:**
```json
{
  "success": true,
  "team": {
    "id": "12",
    "displayName": "Kansas City Chiefs"
  },
  "games": [
    {
      "id": "401671749",
      "week": 1,
      "date": "2024-09-05",
      "displayDate": "Sep 5",
      "opponent": "Ravens",
      "homeAway": "home",
      "result": "W 27-20",
      "completed": true,
      "isPostseason": false,
      "bowlName": null
    }
  ],
  "metadata": {
    "sport": "NFL",
    "season": 2024,
    "count": 12
  }
}
```

## File Structure

```
├── index.html           # Frontend application
├── api/
│   ├── games.js         # Main games analysis endpoint
│   ├── calculator.js    # Entertainment scoring algorithm
│   ├── fetcher.js       # ESPN data fetcher
│   ├── teams.js         # Teams list endpoint
│   └── schedule.js      # Team schedule endpoint
├── vercel.json          # Vercel configuration
└── package.json
```

## License

MIT
