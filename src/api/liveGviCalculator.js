/**
 * Live Game Volatility Index (GVI) Calculator
 * Real-time metric for identifying which live games are most exciting to watch
 */

import {
  findNFLGameMarket,
  calculateBidAskSpread,
  getMarketVolume,
  isMarketSuitable
} from './polymarketClient.js';

// GVI calculation constants
const GVI_WEIGHTS = {
  CURRENT_SPREAD: 0.35,    // Market uncertainty right now
  MARKET_MOVEMENT: 0.25,   // Recent price volatility
  GAME_SITUATION: 0.25,    // Score closeness, time left
  VOLUME_ACTIVITY: 0.15    // Betting interest
};

const GVI_THRESHOLDS = {
  SPREAD_CAP: 0.12,        // 12% spread = max score
  TIGHT_SPREAD: 0.06,      // 6% = tight game bonus
  MOVEMENT_CAP: 0.05,      // 5% movement = max score
  RAPID_MOVEMENT: 0.03,    // 3% = rapid change bonus
  VOLUME_MULTIPLIER: 3     // 3x volume = max score
};

/**
 * Calculate live GVI score for a game
 * @param {Object} gameData - ESPN game data
 * @param {Object} marketData - Polymarket data
 * @param {Object} options - Calculation options
 * @returns {Object} GVI result with score and breakdown
 */
export async function calculateLiveGVI(gameData, marketData = null, options = {}) {
  try {
    console.log(`🎯 Calculating live GVI for ${gameData.awayTeam} @ ${gameData.homeTeam}`);

    // Find or use provided market data
    let market = marketData;
    if (!market) {
      market = await findNFLGameMarket(
        gameData.awayTeam,
        gameData.homeTeam,
        new Date(gameData.gameDate)
      );
    }

    if (!market || !isMarketSuitable(market)) {
      console.log(`⚠️  No market data for ${gameData.shortName}, using fallback calculation`);
      return calculateFallbackGVI(gameData, options);
    }

    // Calculate individual components
    const spreadComponent = calculateCurrentSpreadComponent(market, options);
    const movementComponent = calculateMarketMovementComponent(market, options);
    const situationComponent = calculateGameSituationComponent(gameData, options);
    const volumeComponent = calculateVolumeActivityComponent(market, options);

    // Calculate final GVI score
    const rawScore = (
      spreadComponent.score * GVI_WEIGHTS.CURRENT_SPREAD +
      movementComponent.score * GVI_WEIGHTS.MARKET_MOVEMENT +
      situationComponent.score * GVI_WEIGHTS.GAME_SITUATION +
      volumeComponent.score * GVI_WEIGHTS.VOLUME_ACTIVITY
    );

    const gviScore = Math.round(rawScore * 100);

    // Generate recommendation
    const recommendation = generateRecommendation(gviScore, {
      spreadComponent,
      movementComponent,
      situationComponent,
      volumeComponent
    });

    const result = {
      success: true,
      gviScore,
      recommendation: recommendation.text,
      priority: recommendation.priority,
      reason: recommendation.reason,
      confidence: calculateConfidence(market, gameData),
      breakdown: {
        currentSpread: {
          score: spreadComponent.score,
          value: spreadComponent.value,
          weight: GVI_WEIGHTS.CURRENT_SPREAD
        },
        marketMovement: {
          score: movementComponent.score,
          value: movementComponent.value,
          weight: GVI_WEIGHTS.MARKET_MOVEMENT
        },
        gameSituation: {
          score: situationComponent.score,
          details: situationComponent.details,
          weight: GVI_WEIGHTS.GAME_SITUATION
        },
        volumeActivity: {
          score: volumeComponent.score,
          value: volumeComponent.value,
          weight: GVI_WEIGHTS.VOLUME_ACTIVITY
        }
      },
      marketData: {
        marketId: market.id,
        question: market.question,
        currentSpread: spreadComponent.value,
        volume: getMarketVolume(market),
        liquidity: market.liquidityNum || 0
      }
    };

    console.log(`✅ GVI calculated: ${gviScore} (${recommendation.text})`);
    return result;

  } catch (error) {
    console.error('❌ Error calculating live GVI:', error.message);
    return {
      success: false,
      gviScore: null,
      reason: `Calculation error: ${error.message}`,
      confidence: 0
    };
  }
}

/**
 * Calculate current spread component (0-1)
 */
function calculateCurrentSpreadComponent(market, options = {}) {
  const spread = calculateBidAskSpread(market);

  if (spread === null) {
    return { score: 0, value: null };
  }

  // Base score from spread magnitude
  let score = Math.min(spread / GVI_THRESHOLDS.SPREAD_CAP, 1.0);

  // Bonus for tight spreads (indicates uncertainty)
  if (spread < GVI_THRESHOLDS.TIGHT_SPREAD) {
    score += 0.2;
  }

  // Apply sigmoid curve for natural scaling
  score = 1 / (1 + Math.exp(-10 * (score - 0.5)));

  return {
    score: Math.min(score, 1.0),
    value: spread
  };
}

/**
 * Calculate market movement component (0-1)
 * Note: This would require historical price data in a real implementation
 */
function calculateMarketMovementComponent(market, options = {}) {
  // For now, use price change indicators from market data
  const priceChange = market.oneDayPriceChange || market.oneHourPriceChange || 0;
  const movement = Math.abs(priceChange);

  let score = Math.min(movement / GVI_THRESHOLDS.MOVEMENT_CAP, 1.0);

  // Bonus for rapid changes
  if (movement > GVI_THRESHOLDS.RAPID_MOVEMENT) {
    score += 0.3;
  }

  return {
    score: Math.min(score, 1.0),
    value: priceChange
  };
}

/**
 * Calculate game situation component (0-1)
 */
function calculateGameSituationComponent(gameData, options = {}) {
  let score = 0;
  const details = {};

  // Parse game status
  const status = parseGameStatus(gameData);

  if (!status.isLive) {
    return {
      score: 0,
      details: { reason: 'Game not live' }
    };
  }

  // Score differential factor
  const scoreDiff = Math.abs((status.homeScore || 0) - (status.awayScore || 0));
  if (scoreDiff <= 3) {
    score += 0.4;
    details.closeGame = '≤3 points';
  } else if (scoreDiff <= 7) {
    score += 0.2;
    details.closeGame = '≤7 points';
  }

  // Time/quarter factor
  if (status.quarter >= 4) {
    score += 0.3;
    details.lateGame = 'Q4+';
  }

  if (status.timeRemaining && status.timeRemaining < 300) {
    score += 0.3;
    details.clutchTime = '<5 minutes';
  }

  // Overtime bonus
  if (status.quarter > 4) {
    score += 0.5;
    details.overtime = true;
  }

  return {
    score: Math.min(score, 1.0),
    details
  };
}

/**
 * Calculate volume activity component (0-1)
 */
function calculateVolumeActivityComponent(market, options = {}) {
  const currentVolume = getMarketVolume(market);

  // Use recent volume indicators
  const volume24h = market.volume24hr || market.volume24hrClob || currentVolume * 0.1;
  const volume1wk = market.volume1wk || market.volume1wkClob || currentVolume * 0.5;

  // Calculate volume ratio (recent vs baseline)
  const baseline = Math.max(volume1wk / 7, 1); // Daily average
  const volumeRatio = volume24h / baseline;

  const score = Math.min(volumeRatio / GVI_THRESHOLDS.VOLUME_MULTIPLIER, 1.0);

  return {
    score,
    value: volumeRatio
  };
}

/**
 * Parse ESPN game status
 */
function parseGameStatus(gameData) {
  const status = {
    isLive: false,
    quarter: 0,
    timeRemaining: null,
    homeScore: 0,
    awayScore: 0
  };

  try {
    // Handle different ESPN status formats
    if (gameData.status) {
      const gameStatus = gameData.status;

      // Check if game is in progress
      status.isLive = gameStatus.type?.name === 'STATUS_IN_PROGRESS' ||
                     gameStatus.type?.state === 'in' ||
                     gameData.gameState === 'live';

      // Extract quarter/period
      if (gameStatus.period) {
        status.quarter = parseInt(gameStatus.period);
      }

      // Extract time remaining
      if (gameStatus.displayClock) {
        status.timeRemaining = parseTimeRemaining(gameStatus.displayClock);
      }
    }

    // Extract scores
    if (gameData.competitors) {
      gameData.competitors.forEach(competitor => {
        const score = parseInt(competitor.score || 0);
        if (competitor.homeAway === 'home') {
          status.homeScore = score;
        } else {
          status.awayScore = score;
        }
      });
    } else {
      status.homeScore = parseInt(gameData.homeScore || 0);
      status.awayScore = parseInt(gameData.awayScore || 0);
    }

  } catch (error) {
    console.warn('⚠️  Error parsing game status:', error.message);
  }

  return status;
}

/**
 * Parse time remaining from display clock
 */
function parseTimeRemaining(displayClock) {
  try {
    const [minutes, seconds] = displayClock.split(':').map(Number);
    return (minutes * 60) + seconds;
  } catch (error) {
    return null;
  }
}

/**
 * Generate recommendation based on GVI score and components
 */
function generateRecommendation(gviScore, components) {
  const { spreadComponent, movementComponent, situationComponent } = components;

  if (gviScore >= 85) {
    return {
      text: '🔥 MUST WATCH',
      priority: 'high',
      reason: 'Extremely high volatility - this game is electric!'
    };
  }

  if (gviScore >= 70) {
    return {
      text: '📈 HIGHLY RECOMMENDED',
      priority: 'medium-high',
      reason: 'High market uncertainty and game excitement'
    };
  }

  if (gviScore >= 50) {
    const reasons = [];
    if (spreadComponent.score > 0.6) reasons.push('tight market');
    if (situationComponent.score > 0.6) reasons.push('close game');
    if (movementComponent.score > 0.6) reasons.push('volatile betting');

    return {
      text: '👀 WORTH WATCHING',
      priority: 'medium',
      reason: reasons.length ? `Interesting due to: ${reasons.join(', ')}` : 'Moderate excitement'
    };
  }

  if (gviScore >= 30) {
    return {
      text: '⚡ SOME INTEREST',
      priority: 'low-medium',
      reason: 'Limited excitement but worth checking'
    };
  }

  return {
    text: '😴 LOW PRIORITY',
    priority: 'low',
    reason: 'Low market confidence and game excitement'
  };
}

/**
 * Calculate confidence score based on data quality
 */
function calculateConfidence(market, gameData) {
  let confidence = 0;

  // Market data quality
  if (market.bestBid !== undefined && market.bestAsk !== undefined) {
    confidence += 0.3;
  }

  if (getMarketVolume(market) > 1000) {
    confidence += 0.3;
  }

  // Game data quality
  if (gameData.status && gameData.competitors) {
    confidence += 0.2;
  }

  if (market.liquidityNum > 1000) {
    confidence += 0.2;
  }

  return Math.min(confidence, 1.0);
}

/**
 * Calculate GVI for multiple live games
 * @param {Array} liveGames - Array of ESPN live game data
 * @returns {Promise<Array>} Sorted array of games with GVI scores
 */
export async function calculateLiveGamesGVI(liveGames) {
  console.log(`🏈 Calculating GVI for ${liveGames.length} live games`);

  const gviResults = [];

  for (const game of liveGames) {
    try {
      const result = await calculateLiveGVI(game);

      if (result.success) {
        gviResults.push({
          ...game,
          gvi: result
        });
      }

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      console.error(`❌ Error calculating GVI for game ${game.id}:`, error.message);
    }
  }

  // Sort by GVI score (highest first)
  gviResults.sort((a, b) => (b.gvi.gviScore || 0) - (a.gvi.gviScore || 0));

  console.log(`✅ Calculated GVI for ${gviResults.length} games`);
  return gviResults;
}

/**
 * Get live games recommendation summary
 * @param {Array} gviGames - Games with GVI scores
 * @returns {Object} Recommendation summary
 */
export function getLiveRecommendations(gviGames) {
  const mustWatch = gviGames.filter(g => g.gvi.gviScore >= 85);
  const recommended = gviGames.filter(g => g.gvi.gviScore >= 70 && g.gvi.gviScore < 85);
  const worthWatching = gviGames.filter(g => g.gvi.gviScore >= 50 && g.gvi.gviScore < 70);

  return {
    summary: {
      totalGames: gviGames.length,
      mustWatch: mustWatch.length,
      recommended: recommended.length,
      worthWatching: worthWatching.length
    },
    topRecommendation: gviGames[0] || null,
    categories: {
      mustWatch,
      recommended,
      worthWatching
    }
  };
}

/**
 * Fallback GVI calculation when no market data is available
 * Uses only game situation factors
 */
function calculateFallbackGVI(gameData, options = {}) {
  console.log(`🔄 Using fallback GVI calculation for ${gameData.shortName}`);

  const { homeScore, awayScore, status } = gameData;
  const scoreDiff = Math.abs(homeScore - awayScore);
  const totalScore = homeScore + awayScore;
  const quarter = status.period || status.quarter || 1;

  // Enhanced game situation analysis (becomes primary factor)
  let situationScore = 0;

  // Score differential impact (most important)
  if (scoreDiff <= 3) situationScore += 0.5;      // Very close
  else if (scoreDiff <= 7) situationScore += 0.4;  // Close
  else if (scoreDiff <= 14) situationScore += 0.3; // Competitive
  else if (scoreDiff <= 21) situationScore += 0.2; // Manageable
  else situationScore += 0.1;                       // Large deficit

  // Game timing impact
  if (quarter >= 4) {
    situationScore += 0.35; // 4th quarter = high drama
  } else if (quarter === 3) {
    situationScore += 0.2;  // 3rd quarter = building tension
  } else if (quarter === 2) {
    situationScore += 0.1;  // 2nd quarter = some interest
  }

  // Scoring pace bonus
  if (totalScore > 50) situationScore += 0.1;      // High scoring
  else if (totalScore > 35) situationScore += 0.05; // Good scoring

  // Special status adjustments
  if (status.type?.name === 'STATUS_HALFTIME') {
    situationScore *= 0.7; // Halftime = less immediate excitement
  } else if (status.type?.name === 'STATUS_END_PERIOD') {
    situationScore += 0.1; // End of period = tension
  }

  // Cap the situation score
  const finalSituationScore = Math.min(situationScore, 1.0);
  const gviScore = Math.round(finalSituationScore * 100);

  // Generate recommendation based on fallback score
  let recommendation, priority, reason;

  if (gviScore >= 70) {
    recommendation = "🔥 MUST WATCH";
    priority = "high";
    reason = `Exciting ${scoreDiff <= 3 ? 'nail-biter' : scoreDiff <= 7 ? 'close game' : 'competitive contest'} in Q${quarter}`;
  } else if (gviScore >= 50) {
    recommendation = "📈 RECOMMENDED";
    priority = "medium-high";
    reason = `${scoreDiff <= 7 ? 'Close' : 'Competitive'} game with ${quarter >= 3 ? 'late-game' : 'building'} tension`;
  } else if (gviScore >= 30) {
    recommendation = "👀 WORTH WATCHING";
    priority = "medium";
    reason = `Some excitement potential in Q${quarter}${totalScore > 35 ? ' with good scoring' : ''}`;
  } else {
    recommendation = "⚡ SOME INTEREST";
    priority = "low";
    reason = `Limited immediate excitement (${scoreDiff}-point differential in Q${quarter})`;
  }

  return {
    success: true,
    gviScore,
    recommendation: recommendation,
    priority,
    reason: reason + " (live analysis - no market data)",
    confidence: 0.6, // Lower confidence without market data
    breakdown: {
      currentSpread: {
        score: 0,
        value: 'N/A',
        weight: 0,
        note: 'No market data available'
      },
      marketMovement: {
        score: 0,
        value: 'N/A',
        weight: 0,
        note: 'No market data available'
      },
      gameSituation: {
        score: finalSituationScore,
        value: `${scoreDiff}pt diff, Q${quarter}`,
        weight: 1.0,
        note: 'Primary analysis factor'
      },
      volumeActivity: {
        score: 0,
        value: 'N/A',
        weight: 0,
        note: 'No market data available'
      }
    },
    fallbackMode: true
  };
}