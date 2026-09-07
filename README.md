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
| **Tension** | 20% | Was there reason to keep watching? Measures sustained closeness and comeback potential. |
| **Drama** | 45% | Leverage-weighted swings — big momentum shifts matter more when the game is close. |
| **Finish** | 35% | How did it end? Combines late-game volatility, final closeness, and walk-off moments. |

Games use sport-specific rating thresholds from `shared/algorithm-config.js`:

| Sport | Must watch | Recommended | Skip |
|-------|------------|-------------|------|
| NFL | 8.3+ | 6.0–8.2 | Below 6.0 |
| CFB | 7.7+ | 5.8–7.6 | Below 5.8 |
| NBA / MLB / CBB | 8.5+ | 6.5–8.4 | Below 6.5 |

Without a sport, the default thresholds are 8.0 and 6.0. Algorithm v3.5 also applies bonuses and a margin correction; the weighted metrics are the base score. Overtime games receive a bonus.

## CFB Coverage and Refreshes

CFB uses ESPN's full FBS scoreboard (`groups=80`), including games against FCS opponents. Only completed games with enough win-probability data are scored. The current and previous CFB weeks load live so an early static snapshot cannot hide later finals. Scheduled generation refreshes both weeks daily during the regular season.

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

Static JSON datasets can be generated with `scripts/generate-static.js` to populate `public/data/` for offline or faster loads. Pass `current` for the season or week to resolve them from the calendar, which is what the scheduled workflow does. Examples:

```bash
node scripts/generate-static.js --sport NFL --season current --all
node scripts/generate-static.js --sport CFB --season current --week current
node scripts/generate-static.js --sport NFL --season 2025 --week 7
```

Season and week boundaries are defined once in `shared/season-dates.js` and used by the browser, the generator, and the workflow, so nothing needs updating when a new season starts.

To regenerate a whole season after a schema or algorithm change, run the workflow manually with `scope` set to `all`, a `sport`, and a `season`. It overwrites every file for that season and commits the result to the branch it ran on.

To re-score only games already present in static files, preserving slate membership and descriptive metadata:

```bash
node scripts/regenerate-existing-static.js --write --cache-dir /tmp/gei-static-regeneration
```

Omit `--write` to preview. This command caches fetched probabilities, backs up originals in the cache directory, and replaces datasets only after every game has been successfully analyzed. It writes a before-and-after report to `analysis/static-regeneration-report.json`. Regenerated files use algorithm version 3.5.1, which preserves exact zero win probabilities. Comparisons against saved scores can also reflect changes to ESPN's historical data.

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (modular structure, no build step)
- **Backend**: Vercel serverless functions
- **Database**: Supabase (vote storage and analytics)
- **Data**: ESPN Sports API (win probability data)

## Local Development

1. Install Vercel CLI: `npm i -g vercel`
2. Run locally: `vercel dev`
3. Open `http://localhost:3000`

## Tests

Run `npm test` for offline regression tests covering scoring, static paths, overlapping loads, and fallback behavior. Run `npm run lint` to check JavaScript sources.

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
      "homeTeamId": "12",
      "awayTeamId": "2",
      "homeAbbr": "KC",
      "awayAbbr": "BUF",
      "homeLogo": "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",
      "awayLogo": "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
      "date": "2024-11-17T21:25Z",
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
