# Data Population and Score Recalculation Guide

This guide explains how to populate your database with game data and recalculate entertainment scores when your algorithm changes.

## Overview

The system stores **raw input data** (win probability time series and game context) separately from calculated entertainment scores. This allows you to:

1. **Populate** the database with historical games without worrying about the current algorithm
2. **Recalculate** entertainment scores anytime your algorithm changes, using the stored raw data

## Database Schema

Two new columns have been added to the `games` table:

- **`probability_data`** (JSONB): Raw win probability time series from ESPN API
- **`game_context`** (JSONB): Game context data (labels, playoff status, rivalry info, etc.)

The `excitement_score` column is optional and can be regenerated from the raw data.

## Step 1: Database Migration

First, run the SQL migration to add the new columns to your Supabase database:

```bash
# Connect to your Supabase project dashboard
# Navigate to: SQL Editor
# Copy and paste the contents of: migrations/add_probability_data.sql
# Click "Run"
```

Or use the Supabase CLI:

```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.teiwophkodpqwkmwljzf.supabase.co:5432/postgres" \
  -f migrations/add_probability_data.sql
```

## Step 2: Populate Games

Use `populate-games.js` to fetch games from ESPN and store them with raw data:

### Basic Usage

```bash
# Populate a single week
node populate-games.js --sport NFL --season 2024 --week 1

# Populate multiple weeks
node populate-games.js --sport NFL --season 2024 --weeks 1-18

# Populate specific weeks
node populate-games.js --sport NFL --season 2024 --weeks 1,3,5,10

# Populate CFB playoff games
node populate-games.js --sport CFB --season 2024 --week playoff --season-type 4

# Populate CFB bowl games
node populate-games.js --sport CFB --season 2024 --week bowl --season-type 3
```

### Options

- `--sport <NFL|CFB>` - Sport to fetch (required)
- `--season <year>` - Season year (required)
- `--week <week>` - Single week to fetch
- `--weeks <range>` - Multiple weeks (e.g., `1-5` or `1,3,5`)
- `--season-type <num>` - Season type: 2=regular, 3=postseason, 4=CFB playoff
- `--save-scores` - Also calculate and save excitement scores (not recommended)

### What Gets Stored

For each game, the script stores:

1. **Game metadata**: Teams, scores, date, overtime status
2. **Raw probability data**: Full time series from ESPN (up to 300 data points)
3. **Game context**: Labels, playoff/bowl/rivalry status, season info
4. **NO entertainment score** (by default) - you'll calculate this later

### Example Output

```
🚀 Starting game population...
   Sport: NFL
   Season: 2024
   Weeks: 1, 2, 3
   Season Type: 2
   Save excitement scores: false

═══════════════════════════════════════════
📅 Processing Week 1
═══════════════════════════════════════════

Found 16 games to process

📊 Processing: Kansas City Chiefs @ Baltimore Ravens
  ✅ Stored game data (ID: 401671556)
     📈 287 probability data points saved

📊 Processing: Green Bay Packers @ Philadelphia Eagles
  ✅ Stored game data (ID: 401671557)
     📈 243 probability data points saved

...

═══════════════════════════════════════════
📊 Population Summary
═══════════════════════════════════════════
Total games found: 48
✅ Successfully stored: 47
❌ Errors: 1
```

## Step 3: Recalculate Scores

When your entertainment algorithm changes, use `recalculate-scores.js` to regenerate all scores from the stored raw data:

### Basic Usage

```bash
# Recalculate all games
node recalculate-scores.js --all

# Recalculate specific sport
node recalculate-scores.js --sport NFL

# Recalculate specific season
node recalculate-scores.js --sport NFL --season 2024

# Recalculate single game
node recalculate-scores.js --game-id 401671556

# Dry run (preview changes without saving)
node recalculate-scores.js --all --dry-run
```

### Options

- `--all` - Recalculate all games with probability data
- `--sport <NFL|CFB>` - Recalculate games for specific sport
- `--season <year>` - Recalculate games for specific season
- `--game-id <id>` - Recalculate single game by ID
- `--dry-run` - Preview changes without saving to database

### Example Output

```
🔄 Starting score recalculation...

📥 Fetching games from database...
✅ Found 47 game(s) with probability data

📊 Recalculating: Kansas City Chiefs @ Baltimore Ravens
  📈 Old score: 8.2
  📈 New score: 8.5
  📊 Confidence: 92%
  Δ  Change: +0.3
  ✅ Score updated successfully

📊 Recalculating: Green Bay Packers @ Philadelphia Eagles
  📈 Old score: 6.1
  📈 New score: 6.4
  📊 Confidence: 88%
  Δ  Change: +0.3
  ✅ Score updated successfully

...

═══════════════════════════════════════════
📊 Recalculation Summary
═══════════════════════════════════════════
Total games processed: 47
✅ Successfully recalculated: 47
⚠️  Skipped (no data): 0
❌ Failed: 0
📈 Average score change: 0.24
```

## Workflow Examples

### Scenario 1: Populating Historical Data

You want to add all 2024 NFL regular season games:

```bash
# Populate all 18 weeks
node populate-games.js --sport NFL --season 2024 --weeks 1-18

# Then calculate entertainment scores with your current algorithm
node recalculate-scores.js --sport NFL --season 2024
```

### Scenario 2: Algorithm Update

You've modified your entertainment calculation algorithm:

```bash
# Preview what would change
node recalculate-scores.js --all --dry-run

# If it looks good, recalculate for real
node recalculate-scores.js --all
```

### Scenario 3: Backfilling Old Seasons

You want to add games from previous seasons:

```bash
# Add 2023 season
node populate-games.js --sport NFL --season 2023 --weeks 1-18
node populate-games.js --sport NFL --season 2023 --weeks 19-22 --season-type 3  # Playoffs

# Add 2022 season
node populate-games.js --sport NFL --season 2022 --weeks 1-18
node populate-games.js --sport NFL --season 2022 --weeks 19-22 --season-type 3

# Calculate scores for all
node recalculate-scores.js --all
```

### Scenario 4: CFB Season

College football has different week structures:

```bash
# Regular season (weeks 1-15)
node populate-games.js --sport CFB --season 2024 --weeks 1-15

# Bowl games
node populate-games.js --sport CFB --season 2024 --week bowl --season-type 3

# Playoff games
node populate-games.js --sport CFB --season 2024 --week playoff --season-type 4

# Calculate scores
node recalculate-scores.js --sport CFB --season 2024
```

## Important Notes

### When Probability Data is Missing

Some games may not have win probability data available from ESPN (especially older games or lower-profile matchups). When this happens:

- The game metadata is still stored
- `probability_data` will be `null`
- Entertainment scores can still be calculated using the fallback algorithm (based on final score)
- `recalculate-scores.js` will skip these games

### Environment Variables

Make sure your `.env` file or environment has:

```env
NEXT_PUBLIC_SUPABASE_URL=https://teiwophkodpqwkmwljzf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Rate Limiting

ESPN's API doesn't have strict rate limits, but be considerate:
- The scripts process games sequentially
- There's a small delay between requests
- For large batches (multiple seasons), consider running during off-peak hours

### Storage Considerations

Each game with probability data uses approximately:
- 10-50 KB for probability data (depends on game length)
- 1-5 KB for game context

For 1,000 games: ~10-50 MB total
Supabase free tier includes 500 MB database storage.

## Troubleshooting

### "Supabase not configured"

Make sure environment variables are set. The scripts use the service role key for database access.

### "No games found"

- Check that the week/season combination exists
- Verify games have been played (not future games)
- For old seasons, ESPN data may be limited

### "Failed to store game"

- Check Supabase connection
- Verify the `games` table has the new columns (run migration)
- Check Supabase dashboard logs for detailed error messages

### Scores don't change after recalculation

This is normal if:
- Your algorithm hasn't changed
- The raw data is identical to what was used before
- Use `--dry-run` to preview changes

## Best Practices

1. **Always store raw data**: Use `populate-games.js` without `--save-scores`
2. **Test algorithm changes**: Use `--dry-run` before recalculating all games
3. **Version your algorithm**: Consider git tagging when you make major algorithm changes
4. **Backup before major recalculations**: Supabase has automatic backups, but extra safety never hurts
5. **Monitor storage**: Check your Supabase dashboard if storing many seasons

## Next Steps

- See `README.md` for overall system architecture
- See `DATABASE_SETUP.md` for initial Supabase configuration
- See code comments in `api/entertainmentCalculator.js` for algorithm details