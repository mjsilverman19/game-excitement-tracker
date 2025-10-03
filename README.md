# Game Entertainment Index

Find the most entertaining games to watch with data. A win probability variance analysis system that calculates entertainment scores for NFL and CFB games using ESPN's real-time data.

## Architecture Overview

### Core System
- **Runtime**: Node.js (ES Modules) on Vercel serverless functions
- **Frontend**: Vanilla React in HTML (no build step)
- **Database**: Supabase PostgreSQL (optional, for search)
- **External APIs**: ESPN sports APIs, YouTube Data API v3

### Data Flow
```
User Request → Serverless Handler (api/games.js)
  ↓
ESPN API Fetch (api/gameDataFetcher.js)
  ↓
Entertainment Analysis (api/entertainmentCalculator.js)
  ├── Win Probability Processing
  ├── Context Analysis (api/contextAnalyzer.js)
  └── Utility Functions (api/utils.js)
  ↓
Enhanced Score + Breakdown → User
```

## Key Files and Responsibilities

### API Handlers (Vercel Serverless Functions)
- **api/games.js** - Main endpoint for game analysis
  - Accepts: `{ sport, week, season, seasonType }`
  - Returns: Entertainment scores for completed games
  - Supports NFL (weeks 1-18, playoffs) and CFB (weeks 1-15, bowl, playoff)

- **api/youtube-highlights.js** - YouTube video matching
  - Accepts: `{ awayTeam, homeTeam, awayScore, homeScore }`
  - Returns: Direct video URL or search fallback
  - Searches official NFL channel first, uses multiple fallback strategies

- **api/search-db.js** - Database search endpoint (requires Supabase)
  - Accepts: Query parameters for team, sport, season, week, excitement range
  - Returns: Paginated game results with metrics

### Core Analysis Modules
- **api/entertainmentCalculator.js** - Entertainment scoring engine
  - `analyzeGameEntertainment(game, sport)` - Main entry point
  - `calculateEnhancedEntertainment(probabilities, game, context)` - Score calculation
  - Uses 12 weighted factors: uncertainty, persistence, peaks, comeback, tension, narrative, context, stakes, quality, expectation, noise, leadChanges

- **api/contextAnalyzer.js** - Game context evaluation
  - `buildGameContext(game, sport)` - Extract contextual metadata
  - `calculateContextualFactors(game, context)` - Compute multipliers
  - `createContextualFallback(game, context)` - Score games without probability data

- **api/gameDataFetcher.js** - ESPN data fetching
  - `getGamesForSearch(searchParam, sport)` - Fetch completed games
  - Handles both ESPN Core API (pre-2025) and Site API (2025+)
  - Filters out Pro Bowl games

- **api/utils.js** - Mathematical utilities
  - Probability normalization, smoothing, volatility calculation
  - Balance transforms, sigmoid scaling, noise penalties

### Database Layer (Optional)
- **lib/supabase.js** - Supabase client and helpers
  - `insertGame(gameData)` - Store game records
  - `insertGameMetrics(gameId, metrics)` - Store entertainment metrics
  - `searchGamesByTeam(teamName, options)` - Team-based queries

## Entertainment Scoring Algorithm

### Input Requirements
- Win probability time series (ESPN API, 10-300 points)
- Game metadata (teams, scores, overtime, season context)
- Contextual data (playoff status, rivalry, bowl game)

### Core Metrics (0-10 scale each)
1. **Time-weighted Uncertainty** - Exponentially weighted balance throughout game
2. **Uncertainty Persistence** - Duration of competitive periods
3. **Peak Uncertainty** - Maximum tension moments with late-game weighting
4. **Comeback Dynamics** - Magnitude and frequency of probability swings
5. **Situational Tension** - High-pressure moments (4th quarter, close games)
6. **Narrative Flow** - Story arc quality (opening, development, climax, resolution)
7. **Context Score** - Scoring environment and competitiveness
8. **Stakes Multiplier** - Playoff/championship/bowl importance (0.85-1.6x)
9. **Quality Factor** - Offensive efficiency and explosive plays (0.7-1.3x)
10. **Expectation Adjustment** - Upset bonus or chalk penalty (0.92-1.15x)
11. **Noise Penalty** - Reduces score for erratic probability data (0.75-1.0x)
12. **Lead Changes** - Frequency of lead changes (both scoreboard and probability)

### Adaptive Weighting
Base weights adjust based on game characteristics:
- High comeback factor → increase comeback weight
- High tension → increase tension weight  
- High noise → decrease peaks weight, increase narrative weight

### Final Score Calculation
```
rawScore = Σ(metric × weight) for metrics 1-6
contextScore = rawScore × context × competitiveBalance × stakes × quality × expectation × noisePenalty
finalScore = clamp(contextScore, 0, 10)
```

## ESPN API Integration

### Endpoints Used
1. **Core API** (pre-2025 seasons)
   - `sports.core.api.espn.com/v2/sports/football/leagues/{league}/seasons/{season}/types/{type}/weeks/{week}/events`
   - Requires dereferencing `$ref` fields for full game data

2. **Site API** (current seasons)
   - NFL: `site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
   - CFB: `site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard`

3. **Win Probability API**
   - `sports.core.api.espn.com/v2/sports/football/leagues/{league}/events/{id}/competitions/{id}/probabilities?limit=300`

### Data Normalization
- Team names: Use `displayName` (falls back to `location`)
- Scores: Parse integers from competitor data
- Season type: Normalize to numeric (2=regular, 3=postseason, 4=CFB playoff)
- Overtime detection: Check status type name for "OT"

## YouTube API Integration

### Search Strategy (5 attempts, in order)
1. **Official NFL channel search** - Most reliable
   - `channelId=UCDVYQ4Zhbm3S2dlz7P1GBDg`
   - Medium duration videos only
   - Recent uploads (14 days)

2. **Full team names with "vs"** - Matches NFL title format
   - Query: `"Full Away Team" vs "Full Home Team" highlights`

3. **Full team names general** - Broader match
   - Query: `"Full Away Team" "Full Home Team" highlights NFL`

4. **Team nicknames** - Fallback to shorter names
   - Query: `Vikings Steelers highlights NFL`

5. **Original team names** - Last resort
   - Uses whatever ESPN provided

### Matching Algorithm
- **Base score**: 10 points for both teams present
- **NFL channel bonus**: +15 points
- **Full team names**: +5 points
- **"vs." format**: +4 points
- **"Game Highlights"**: +3 points
- **Score match**: +8 points
- **Recent upload**: +2 points (last 24h), +1 point (last 12h)
- **Negative filters**: Skip videos with recap, reaction, preview, analysis, etc.

### Team Name Conversion
ESPN often returns city names only (e.g., "Los Angeles"). The system maps these to full team names:
- Los Angeles → Los Angeles Rams (default)
- New York → New York Giants (default)
- Handles LA Chargers, NY Jets as special cases

## Database Schema (Supabase)

### Tables
1. **games** - Core game records
   - `id` (text, primary key) - ESPN game ID
   - `sport` (text) - NFL or CFB
   - `home_team`, `away_team` (text)
   - `home_score`, `away_score` (integer)
   - `excitement_score` (numeric) - 0-10 entertainment score
   - `game_date` (date)
   - `season` (integer)
   - `week` (integer)
   - `season_type` (integer)
   - `overtime` (boolean)

2. **game_entertainment_metrics** - Detailed breakdowns
   - `game_id` (foreign key to games)
   - `volatility`, `balance`, `late_game_factor` (numeric)
   - `momentum_shifts` (integer)
   - `confidence` (numeric)
   - `narrative` (text)
   - `key_factors` (jsonb array)
   - `breakdown` (jsonb object)

3. **teams** - Team metadata (optional)
   - `name`, `abbreviation`, `sport`, `conference`, `division`

## Environment Variables

### Required for Database Search
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
```

### Optional for YouTube Integration
```
YOUTUBE_API_KEY=AIzaSyXxx...
```

Without YouTube API key, system falls back to YouTube search URLs.

## Common Development Tasks

### Quick Reference: Season Population
```bash
# Complete NFL season (replace 2024 with desired year)
node populate-games.js --sport NFL --season 2024 --weeks 1-18
node populate-games.js --sport NFL --season 2024 --week 1 --season-type 3  # Wild Card
node populate-games.js --sport NFL --season 2024 --week 2 --season-type 3  # Divisional
node populate-games.js --sport NFL --season 2024 --week 3 --season-type 3  # Conference Championships
node populate-games.js --sport NFL --season 2024 --week 5 --season-type 3  # Super Bowl
node recalculate-scores.js --sport NFL --season 2024
```

### Data Population and Recalculation

#### Quick Start: Populate a Complete Season
```bash
# 1. Run database migration first (if not done)
# Go to Supabase Dashboard > SQL Editor and run: migrations/add_probability_data.sql

# 2. Populate complete NFL regular season
node populate-games.js --sport NFL --season 2024 --weeks 1-18

# 3. Populate all playoff games (ESPN uses season-type 3 for playoffs)
node populate-games.js --sport NFL --season 2024 --week 1 --season-type 3  # Wild Card
node populate-games.js --sport NFL --season 2024 --week 2 --season-type 3  # Divisional
node populate-games.js --sport NFL --season 2024 --week 3 --season-type 3  # Conference Championships
node populate-games.js --sport NFL --season 2024 --week 5 --season-type 3  # Super Bowl

# 4. Calculate entertainment scores from raw data
node recalculate-scores.js --sport NFL --season 2024
```

#### CFB Season Structure
```bash
# Regular season (weeks 1-15)
node populate-games.js --sport CFB --season 2024 --weeks 1-15

# Bowl games
node populate-games.js --sport CFB --season 2024 --week 1 --season-type 3

# CFB Playoff
node populate-games.js --sport CFB --season 2024 --week 1 --season-type 4
```

#### Key Notes for Season Population
- **ESPN API structure**: Playoffs use `season-type 3`, CFB playoffs use `season-type 4`
- **Week numbering**: Playoff weeks restart at 1 (not 19-22)
- **Super Bowl location**: May be in week 4 or 5 of playoffs depending on year
- **Raw data first**: Scripts store probability data without calculating scores by default
- **Recalculation**: Use `recalculate-scores.js` to generate scores from stored raw data

#### Example: Complete 2024 NFL Season (285 games)
```bash
# Regular season (272 games, weeks 1-18)
node populate-games.js --sport NFL --season 2024 --weeks 1-18

# Playoffs (13 games total)
node populate-games.js --sport NFL --season 2024 --week 1 --season-type 3  # 6 Wild Card games
node populate-games.js --sport NFL --season 2024 --week 2 --season-type 3  # 4 Divisional games
node populate-games.js --sport NFL --season 2024 --week 3 --season-type 3  # 2 Conference Championships
node populate-games.js --sport NFL --season 2024 --week 5 --season-type 3  # 1 Super Bowl

# Result: 285 total games with raw probability data stored
# Generate entertainment scores:
node recalculate-scores.js --sport NFL --season 2024
```

#### Verification Commands
```bash
# Check what's in your database
node -e "
import { supabaseAdmin } from './lib/supabase.js';
const { data } = await supabaseAdmin.from('games').select('season, sport, week, season_type').eq('season', 2024);
console.log(\`Total 2024 games: \${data.length}\`);
"

# Test score recalculation (dry run)
node recalculate-scores.js --sport NFL --season 2024 --dry-run
```

#### Troubleshooting Season Population

**No games found for playoff weeks:**
- Try different week numbers (1, 2, 3, 4, 5) with `--season-type 3`
- Super Bowl may be in week 4 or 5 depending on calendar year
- Use `--season-type 4` for CFB playoffs

**Games stored with `week: null`:**
- This is normal for playoff games where ESPN doesn't provide week numbers
- Games are still properly categorized by `season_type`
- Use season_type to distinguish: 2=regular, 3=postseason, 4=CFB playoff

**Missing probability data:**
- Some games (especially older seasons) may not have ESPN probability data
- The system gracefully handles this and stores game metadata
- Use `recalculate-scores.js` to see which games have usable probability data

**Duplicate games:**
- Scripts use `upsert` to safely re-run commands
- Re-running population commands will update existing records, not create duplicates

#### Production Workflow: On-Demand Calculation

**Recommended Strategy:**
```bash
# 1. Populate raw data (done for 2015-2024)
node populate-games.js --sport NFL --season 2024 --weeks 1-18

# 2. DON'T pre-calculate scores - let search interface calculate on-demand
# This ensures users always get latest algorithm results

# 3. Optional: Bulk recalculation for analysis
node recalculate-scores.js --sport NFL --season 2024 --dry-run
```

**Why On-Demand Calculation?**
- ✅ **Always latest algorithm** - no database migrations needed
- ✅ **Storage efficient** - only store raw ESPN data
- ✅ **Development friendly** - algorithm changes immediately reflected
- ✅ **User-focused** - calculations happen when/where needed

**When to Use Bulk Recalculation:**
- Large-scale analysis across multiple seasons
- Performance testing of algorithm changes
- Generating reports or exports

#### Detailed Documentation
- See HOW_IT_WORKS.md for a concise overview
- See DATA_POPULATION_GUIDE.md for step-by-step usage, examples, and troubleshooting

### Adding a New Sport
1. Update `api/games.js` validation to accept new sport code
2. Add ESPN endpoint logic in `api/gameDataFetcher.js`
3. Update frontend sport selector in `index.html`
4. Add week structure for new sport (if different from NFL/CFB)

### Modifying Entertainment Algorithm

#### Current Architecture (Uses Pre-Calculated Scores)
1. Core logic: `api/entertainmentCalculator.js` → `calculateEnhancedEntertainment()`
2. Context factors: `api/contextAnalyzer.js` → `calculateContextualFactors()`
3. Utilities: `api/utils.js` for mathematical transforms
4. Test changes: `node api/debug-game.js` (uses mock data)

#### For On-Demand Calculation (Recommended)
To implement the optimal on-demand strategy:

1. **Update `api/search-db.js`** to calculate scores dynamically:
   ```javascript
   // Instead of returning pre-calculated excitement_score
   // Fetch probability_data and calculate on-demand:
   import { analyzeGameEntertainment } from './entertainmentCalculator.js';

   const enhancedResults = results.map(game => ({
     ...game,
     excitement_score: game.probability_data
       ? analyzeGameEntertainment(game, game.sport).entertainmentScore
       : null
   }));
   ```

2. **Update `api/games.js`** to calculate scores live for weekly analysis

3. **Remove dependency** on pre-calculated `excitement_score` column

#### Algorithm Update Workflow
```bash
# 1. Modify algorithm files
vim api/entertainmentCalculator.js

# 2. Test with sample data
node api/debug-game.js

# 3. Test with real game
node recalculate-scores.js --game-id 401671556 --dry-run

# 4. Deploy - changes immediately reflected in search results
git push origin main

# No database migration needed! 🎉
```

### Adding New Search Filters
1. Add UI controls in `index.html` database search section
2. Update `api/search-db.js` to accept new query parameters
3. Add filtering logic to Supabase query builder
4. Update `lib/supabase.js` helper functions if needed

### Adjusting YouTube Matching
1. Modify search strategies in `api/youtube-highlights.js` → `findNFLHighlights()`
2. Adjust scoring in `findBestMatch()` function
3. Add/remove negative keywords filter
4. Test with `node api/debug-youtube.js`

## Testing

### Local Development
```bash
# Test entertainment calculation with mock data
node api/debug-game.js

# Test YouTube matching (requires API key in .env)
node api/debug-youtube.js

# Run with Vercel CLI for full environment
vercel dev
```

### Manual API Testing
```bash
# Analyze NFL week
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{"sport":"NFL","week":1,"season":2024,"seasonType":2}'

# Search database
curl "http://localhost:3000/api/search-db?team=Chiefs&minExcitement=7"

# Get YouTube highlights
curl -X POST http://localhost:3000/api/youtube-highlights \
  -H "Content-Type: application/json" \
  -d '{"awayTeam":"Kansas City Chiefs","homeTeam":"Buffalo Bills"}'
```

## Error Handling Patterns

### API Handlers
- Return 400 for missing/invalid parameters
- Return 405 for wrong HTTP method
- Return 500 for unexpected errors
- Always include `{ success: false, error: "message" }` on errors

### Data Fetching
- Gracefully handle missing ESPN data (return empty array)
- Filter out incomplete games
- Skip Pro Bowl games (check team names for NFC/AFC)

### Scoring
- Fallback to context-based scoring when probability data unavailable
- Clamp all scores to 0-10 range
- Handle null/undefined values in calculations

## Performance Considerations

- **ESPN API calls**: Batched per week/date, cached by Vercel
- **Win probability fetches**: Limited to 300 points per game
- **Timeout**: 10 seconds max for serverless functions
- **Database queries**: Use indexes on team names, excitement score
- **YouTube API**: Rate limited to 100 requests/day (free tier)

## Known Limitations

1. **Historical data**: Pre-2025 games use different ESPN API (Core vs Site)
2. **Probability data**: Not available for all games (especially older seasons)
3. **YouTube matching**: ~95% accuracy, some ambiguous games may mismatch
4. **Team name resolution**: LA/NY teams require context to disambiguate
5. **Database**: Search features require Supabase setup

## Deployment (Vercel)

1. Connect GitHub repository to Vercel
2. Configure environment variables in project settings
3. Deploy automatically on push to main branch
4. Functions deploy to `/api/*` routes
5. Static HTML serves from root

### Required Vercel Configuration
- **Framework Preset**: Other
- **Build Command**: (none)
- **Output Directory**: `.`
- **Install Command**: `npm install`

## Debugging Tips

### Entertainment scores seem wrong
- Check `api/debug-game.js` with known game data
- Verify probability data exists for the game
- Review breakdown object for individual metric scores
- Check if fallback scoring is being used (lower confidence)

### YouTube links incorrect
- Verify team names match full NFL team names
- Check console logs for matching scores
- Ensure API key is valid and has quota remaining
- Try manual search with generated query

### Database search not working
- Verify Supabase environment variables are set on Vercel
- Check Supabase project is not paused
- Ensure tables exist with correct schema
- Review `lib/supabase.js` initialization logs

### ESPN API returning no games
- Verify week/season combination exists
- Check if games have completed (status.completed = true)
- For old seasons, confirm Core API is accessible
- Review `api/gameDataFetcher.js` URL construction

## Code Style Conventions

- Use `async/await` for asynchronous operations
- Prefer `const` for immutable bindings
- Use descriptive function names (verbs for actions)
- Keep functions focused on single responsibility
- Comment complex calculations with formulas
- Log key decision points for debugging
- Handle edge cases explicitly (null, undefined, NaN)

## AI Agent Guidelines

When modifying this codebase:

1. **Preserve the entertainment algorithm's core logic** - Changes should be additive or clearly justified
2. **Maintain ESPN API compatibility** - Test with both Core and Site APIs
3. **Keep error handling robust** - All external API calls should gracefully fail
4. **Update corresponding documentation** - If changing behavior, update this README
5. **Test with real data** - Use `vercel dev` with actual ESPN/YouTube APIs
6. **Consider performance** - Serverless functions have 10s timeout
7. **Respect rate limits** - YouTube API has daily quota limits
8. **Maintain backward compatibility** - Historical data queries should still work
