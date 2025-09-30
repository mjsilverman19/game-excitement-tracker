# YouTube API Matching Fixes

## Problem
The YouTube API wasn't opening the right videos because:
1. **Team names were ambiguous** - ESPN returns "Los Angeles" or "New York" which could be Rams/Chargers or Giants/Jets
2. **Search wasn't targeting the official NFL channel** - Was searching all of YouTube instead of the reliable official source
3. **Matching logic didn't filter out wrong video types** - Was matching "Recap", "Reaction", "Preview" videos instead of actual highlights
4. **Scoring didn't prioritize NFL conventions** - Wasn't giving extra weight to official NFL channel or "vs." format

## Changes Made

### 1. Fixed Team Name Extraction (`api/gameDataFetcher.js`)
**Before:**
```javascript
homeTeam: homeTeam?.team.location || homeTeam?.team.displayName,
awayTeam: awayTeam?.team.location || awayTeam?.team.displayName,
```

**After:**
```javascript
homeTeam: homeTeam?.team.displayName || homeTeam?.team.location,
awayTeam: awayTeam?.team.displayName || awayTeam?.team.location,
```

**Impact:** Now gets "Los Angeles Chargers" instead of just "Los Angeles"

### 2. Added NFL Channel Priority Search (`api/youtube-highlights.js`)
**New first attempt:**
```javascript
{
  type: 'NFL_channel_only',
  url: `...channelId=UCDVYQ4Zhbm3S2dlz7P1GBDg&videoDuration=medium...`
}
```

**Impact:** 
- Searches only the official NFL channel first (most reliable source)
- Filters to medium-length videos (excludes Shorts)
- Gets ~50 recent videos to find matches

### 3. Improved Search Query Format
**Added new attempt:**
```javascript
{
  type: 'search_full_names_vs',
  url: `...q="${fullAwayTeam}" vs "${fullHomeTeam}" highlights...`
}
```

**Impact:** Matches NFL's title format: "Kansas City Chiefs vs. Buffalo Bills | ..."

### 4. Enhanced Matching Logic with Negative Filters
**Added:**
```javascript
const negativeKeywords = [
  'recap', 'reaction', 'preview', 'news', 'breaking',
  'mic\'d up', 'micd up', 'mic up', 'film room', 'every td',
  'every touchdown', 'top plays', 'analysis', 'fantasy',
  'madden', 'live stream', 'postgame', 'post game'
];

if (negativeKeywords.some(keyword => title.includes(keyword))) {
  console.log(`Skipping "${video.snippet.title}" - contains negative keyword`);
  continue;
}
```

**Impact:** Automatically skips videos that aren't full game highlights

### 5. Improved Scoring System
**New priority bonuses:**
- **+15 points** for official NFL channel (`channelTitle === 'nfl'`)
- **+5 points** for both full team names in title
- **+4 points** for "vs." format (NFL standard)
- **+3 points** for "Game Highlights" phrase
- **+5 points** for "highlights" in title
- **+8 points** if score matches

**Impact:** Official NFL highlights with proper formatting now score ~40-50 points vs ~10-20 for other videos

## How NFL Titles Are Formatted

The official NFL YouTube channel uses consistent conventions:

**Regular Season:**
```
Detroit Lions vs. San Francisco 49ers | 2024 Week 2 Game Highlights
Kansas City Chiefs vs. Buffalo Bills | Week 1 Game Highlights | 2024
```

**Playoffs:**
```
Kansas City Chiefs vs. Baltimore Ravens | AFC Championship Game Highlights
San Francisco 49ers vs. Kansas City Chiefs | Super Bowl LVIII Game Highlights
```

**Key patterns:**
- Always uses full team names (not abbreviations)
- Always "vs." with a period
- Always contains "Highlights" (usually "Game Highlights")
- Published within 24-72 hours of game
- Channel: "NFL" (ID: UCDVYQ4Zhbm3S2dlz7P1GBDg)

## Testing

To test the fixes, you can:

1. **Start your dev environment** (if using Vercel):
   ```bash
   vercel dev
   ```

2. **Test a recent game** (e.g., via your UI or curl):
   ```bash
   curl -X POST http://localhost:3000/api/youtube-highlights \
     -H "Content-Type: application/json" \
     -d '{"awayTeam": "Kansas City Chiefs", "homeTeam": "Buffalo Bills", "awayScore": 32, "homeScore": 29}'
   ```

3. **Check console logs** - The improved matching now logs:
   - Which videos are being skipped (negative keywords)
   - Bonus points for NFL channel
   - Score for each potential match
   - Best match selected

## Expected Results

- **Primary source**: Official NFL channel videos
- **Title format**: Full team names with "vs." separator
- **Video type**: Full game highlights (not recaps, reactions, or analysis)
- **Timing**: Recent uploads (within 14 days)
- **Success rate**: Should now correctly match ~95%+ of games that have official highlights

## API Key Note

If you get 403 errors, your YouTube API key may need to be:
- Regenerated in Google Cloud Console
- Have YouTube Data API v3 enabled
- Not exceeded daily quota limits

Check your `.env` file has:
```
YOUTUBE_API_KEY=your_actual_key_here
```