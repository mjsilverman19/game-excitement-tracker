# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Language/runtime: Node.js (ES Modules)
- Entry points live under api/, designed as a serverless-style handler plus supporting modules
- No declared npm scripts, tests, or lint configuration present

Common commands
- Run the local debug harness (prints an entertainment analysis for sample data):
```bash path=null start=null
node api/debug-game.js
```
- Ad-hoc module execution (ESM): Node 18+ is recommended for native fetch. For older Node versions, you may need to enable the experimental fetch flag.
```bash path=null start=null
# Example (Node 18+)
node --version
node api/debug-game.js

# If on Node < 18, try enabling experimental fetch support
node --experimental-fetch api/debug-game.js
```

High-level architecture and data flow
- Serverless-style API handler: api/games.js
  - Exports a default async function (req, res) that handles CORS, validates input, and orchestrates analysis.
  - Supports multiple sports:
    - NFL/CFB: requires week; accepts optional season (number) and seasonType; CFB also accepts special weeks "playoff" and "bowl" which map to seasonType 4 and 3 respectively.
    - NBA: requires date (YYYY-MM-DD).
  - For valid requests, it:
    1) Builds a search parameter object from req.body.
    2) Calls getGamesForSearch(searchParam, sport) to fetch completed games for the requested scope.
    3) Runs analyzeGameEntertainment(game, sport) over each returned game.
    4) Responds with { success, games, metadata } including a per-game breakdown and narrative.

- Game fetcher: api/gameDataFetcher.js
  - getGamesForSearch(searchParam, sport): Fetches games from ESPN, normalizes results, filters to completed games.
  - Selects ESPN endpoint based on sport and year:
    - NFL/CFB pre-2025: uses the ESPN Core API (sports.core.api.espn.com), then dereferences item.$ref to fetch per-game details.
    - NFL/CFB current or unspecified year: uses the ESPN Site API (site.web.api.espn.com / site.api.espn.com) scoreboard endpoints.
    - NBA: uses the ESPN site API with the provided date.
  - Normalizes per-game fields: team names, scores, completion status, overtime, venue, weather (when available), season metadata, event importance, labels, neutral site, start date.

- Entertainment analysis pipeline: api/entertainmentCalculator.js
  - analyzeGameEntertainment(game, sport):
    - Builds context with buildGameContext.
    - Fetches win-probability time series for the game from ESPN (probabilities?limit=300).
    - If adequate data is present, calls calculateEnhancedEntertainment; otherwise returns createEnhancedFallback.
    - Returns a normalized object: id, teams, scores, excitement (0–10), overtime, description, varianceAnalysis, keyMoments, breakdown, source.
  - calculateEnhancedEntertainment(probabilities, game, context):
    - Preprocesses probability points (normalizes percentages, estimates time remaining, smoothing).
    - Derives advanced metrics: time-weighted uncertainty, uncertainty persistence, peak uncertainty, comeback dynamics, situational tension, lead-change metrics, probability noise.
    - Merges contextual factors (from contextAnalyzer) and a narrative score, applies adaptive weights, noise penalty, and context multipliers (stakes/quality/expectation) to compute a bounded 0–10 score, confidence, breakdown, narrative, and key factors.
    - Falls back to createContextualFallback if insufficient data.

- Context builder and fallbacks: api/contextAnalyzer.js
  - buildGameContext(game, sport):
    - Normalizes season, importance, labels, scores, and flags (playoff/championship/bowl/rivalry/elimination) and computes convenience fields (totalScore, margin, etc.).
  - calculateContextualFactors(game, context): derives modifiers: scoringContext, competitiveBalance, stakesMultiplier, qualityFactor, expectationAdjustment, and a contextSummary of flags.
  - createContextualFallback(game, context): score heuristic used if probability data is missing or errors occur. Uses final margin, total score, overtime, and context flags to produce an entertainment score, confidence, breakdown, and spoiler-free descriptors.

- Shared utilities: api/utils.js
  - Normalization helpers (normalizeNumericValue, normalizeWinProbability), time estimation, smoothing, balance/volatility transforms, late-game weighting, and noise penalty.

API contract (serverless handler in api/games.js)
- Method: POST (OPTIONS preflight supported)
- Headers set: Access-Control-Allow-Origin: *; Methods: GET, POST, OPTIONS; Headers: Content-Type
- Request body (JSON):
```json path=null start=null
// NFL example
{
  "sport": "NFL",
  "week": 18,
  "season": 2024,
  "seasonType": 2
}
```
```json path=null start=null
// CFB examples
{ "sport": "CFB", "week": 7, "season": 2024 }
{ "sport": "CFB", "week": "playoff", "season": 2024 }
{ "sport": "CFB", "week": "bowl", "season": 2024 }
```
```json path=null start=null
// NBA example
{ "sport": "NBA", "date": "2025-01-15" }
```
- Successful response shape:
```json path=null start=null
{
  "success": true,
  "games": [
    {
      "id": "enhanced-<espn_id>",
      "homeTeam": "...",
      "awayTeam": "...",
      "homeScore": 0,
      "awayScore": 0,
      "excitement": 0.0,
      "overtime": false,
      "description": "...",
      "varianceAnalysis": "...",
      "keyMoments": ["..."],
      "breakdown": {
        "uncertainty": 0,
        "persistence": 0,
        "peaks": 0,
        "comeback": 0,
        "tension": 0,
        "narrative": 0,
        "context": 0,
        "stakes": 0,
        "quality": 0,
        "expectation": 0,
        "noise": 0,
        "leadChanges": 0
      },
      "source": "Enhanced Entertainment Analysis (NFL|CFB|NBA)",
      "keyMoments": ["..."]
    }
  ],
  "metadata": {
    "date": "Week <n> (<season>)" | "<YYYY-MM-DD>",
    "sport": "NFL|CFB|NBA",
    "source": "ESPN Win Probability API",
    "analysisType": "Enhanced Entertainment Analysis",
    "gameCount": 0
  }
}
```
- Error responses:
  - 400 for missing required parameters per sport
  - 405 for non-POST (preflight OPTIONS returns 200)
  - 500 for unexpected errors during fetch/analysis

Development notes for agents
- This repo uses native ESM ("type": "module"). Use import/export and run files directly with node.
- Network calls fetch from ESPN. If running analyses frequently, be mindful of external rate limits and latency.
- The debug harness does not perform network requests; it uses inline probability samples to validate the scoring pipeline locally.

Existing documentation and rules
- README.md currently contains only the project title.
- No CLAUDE, Cursor, or Copilot instruction files were found.
