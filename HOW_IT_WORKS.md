# How the Raw Data Storage and Recalculation System Works

This project now stores the raw inputs used to compute entertainment scores so scores can be recalculated later if the algorithm changes.

What’s stored per game:
- probability_data (JSON): ESPN win probability time series (up to 300 points)
- game_context (JSON): Context flags (playoff, rivalry, bowl, etc.), labels, spreads, and other metadata
- excitement_score (numeric, optional): Can be regenerated anytime from raw inputs

Key scripts:
- populate-games.js: Fetches games from ESPN and saves metadata + raw probability/context data. By default it does NOT save entertainment scores.
- recalculate-scores.js: Reads probability_data and game_context from the database and recalculates excitement scores using the current algorithm.

Quick usage:
- Populate a week: node populate-games.js --sport NFL --season 2024 --week 4
- Populate multiple weeks: node populate-games.js --sport NFL --season 2024 --weeks 1-18
- Recalculate all scores later: node recalculate-scores.js --all
- Dry run (no DB writes): node recalculate-scores.js --all --dry-run

Details and troubleshooting:
See DATA_POPULATION_GUIDE.md for step-by-step instructions, examples, environment setup, and troubleshooting tips.
