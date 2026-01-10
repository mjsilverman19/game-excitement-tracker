# Game Entertainment Index

A web application that ranks NFL, college football, and NBA games by entertainment value using ESPN's win probability data. Find the best games to watch without spoiling the score.

## How It Works

1. **Select** your sport (NFL, CFB, or NBA), season, and week/date
2. **Browse** games ranked by entertainment score (1-10)
3. **Vote** on ratings you agree or disagree with (stored in Supabase)
4. **Watch** spoiler-free — scores are hidden by default

You can also search by team to find and analyze any specific game from their schedule.

## Voting System

Each game includes upvote/downvote buttons for users to agree or disagree with the algorithm's rating. Votes are:

- **Stored anonymously** in Supabase with a unique visitor ID (UUID)
- **Tracked per game** with metadata (sport, season, week, algorithm score)
- **Persistent** across sessions via localStorage
- **Upserted** automatically — changing your vote updates the existing record

Vote data enables analysis of where the algorithm aligns or diverges from viewer sentiment.

## Entertainment Scoring

Games are scored based on three metrics derived from win probability data:

| Metric | Weight | Description |
|--------|--------|-------------|
| **Tension** | 30% | Was there reason to keep watching? Measures sustained closeness and comeback potential. |
| **Drama** | 35% | Leverage-weighted swings — big momentum shifts matter more when the game is close. |
| **Finish** | 35% | How did it end? Combines late-game volatility, final closeness, and walk-off moments. |

Games are categorized as **must watch** (8+), **recommended** (6-7.9), or **skip** (<6). Overtime games receive a bonus.

## NFL Playoff Rounds

For NFL postseason queries, the `week` value can be a round name instead of a number:

- `wild-card`
- `divisional`
- `conference`
- `super-bowl`

These map to ESPN's postseason week values in the backend, keeping navigation consistent across playoff rounds.

## Exporting Results

Use the Export Season flow in the UI to download an Excel file for a full season or custom range. The export is generated client-side using SheetJS and includes the ranked games plus score breakdowns.

## Static Data Generation

Static JSON datasets can be generated with `scripts/generate-static.js` to populate `public/data/` for offline or faster loads. Example:

```bash
node scripts/generate-static.js --sport NFL --season 2025 --all
```

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (modular structure, no build step)
- **Backend**: Vercel serverless functions
- **Database**: Supabase (vote storage and analytics)
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
        "tension": 7.2,
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
├── src/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js
│       ├── config.js
│       ├── components/
│       │   ├── date-picker.js
│       │   ├── export-modal.js
│       │   ├── game-list.js
│       │   ├── radar-chart.js
│       │   ├── team-picker.js
│       │   └── week-picker.js
│       ├── services/
│       │   ├── api.js
│       │   ├── storage.js
│       │   └── supabase.js
│       └── utils/
│           └── dates.js
├── api/
│   ├── calculator.js
│   ├── fetcher.js
│   ├── games.js
│   ├── schedule.js
│   └── teams.js
├── shared/
│   └── algorithm-config.js
├── scripts/
│   └── [analysis and generation scripts]
├── public/data/
│   └── [static JSON game data]
└── analysis/
    └── [benchmark results and reports]
```

## License

MIT
