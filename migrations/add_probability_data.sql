-- Migration: Add win probability data storage
-- Purpose: Store raw ESPN probability data so entertainment scores can be recalculated later

-- Add column to games table to store raw probability time series
ALTER TABLE games
ADD COLUMN IF NOT EXISTS probability_data JSONB;

-- Add column to store game context data (labels, seasonType, etc.)
ALTER TABLE games
ADD COLUMN IF NOT EXISTS game_context JSONB;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_games_probability_data 
ON games USING GIN (probability_data);

CREATE INDEX IF NOT EXISTS idx_games_game_context 
ON games USING GIN (game_context);

-- Add comment to explain the schema
COMMENT ON COLUMN games.probability_data IS 'Raw win probability time series from ESPN API. Array of objects with: homeWinPercentage, period, timeRemaining, gameState';
COMMENT ON COLUMN games.game_context IS 'Game context data used in entertainment calculation: labels, seasonType, eventImportance, neutralSite, qualityMetrics, preGameSpread, expectation';