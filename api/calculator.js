// Simplified Entertainment Calculator
// Focuses on 3 core metrics: Variance, Late-Game Excitement, and Comeback Factor

export async function analyzeGameEntertainment(game, sport = 'NFL') {
  try {
    // Determine sport type and league
    let sportType, league;
    if (sport === 'NBA') {
      sportType = 'basketball';
      league = 'nba';
    } else {
      sportType = 'football';
      league = sport === 'CFB' ? 'college-football' : 'nfl';
    }

    const probUrl = `https://sports.core.api.espn.com/v2/sports/${sportType}/leagues/${league}/events/${game.id}/competitions/${game.id}/probabilities?limit=300`;

    const response = await fetch(probUrl);

    if (!response.ok) {
      return createFallback(game);
    }

    const probData = await response.json();

    if (!probData.items || probData.items.length < 10) {
      return createFallback(game);
    }

    const excitement = calculateExcitement(probData.items, game);

    return {
      id: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      excitement: excitement,
      overtime: game.overtime
    };
  } catch (error) {
    console.error(`Error analyzing game ${game.id}:`, error);
    return createFallback(game);
  }
}

function calculateExcitement(probabilities, game) {
  const probs = probabilities
    .map(p => ({
      value: Math.max(0, Math.min(1, p.homeWinPercentage || 0.5)),
      period: p.period || 1
    }))
    .filter(p => p.value >= 0 && p.value <= 1);

  if (probs.length < 10) {
    return 5.0;
  }

  // Convert probabilities to balance scores (0.5 = perfectly balanced)
  const balances = probs.map(p => 1 - Math.abs(p.value - 0.5) * 2);

  // METRIC 1: Overall Variance (how much the game swung back and forth)
  const variance = calculateVariance(balances);
  const varianceScore = Math.min(10, variance * 40); // Scale to 0-10

  // METRIC 2: Late-Game Excitement (weight last quarter more heavily)
  const lateGameScore = calculateLateGameExcitement(balances);

  // METRIC 3: Comeback Factor (big swings in win probability)
  const comebackScore = calculateComebackFactor(probs);

  // METRIC 4: Persistence (how long the game stayed close)
  const persistenceScore = calculatePersistence(balances);

  // Weighted combination
  const excitement =
    varianceScore * 0.3 +
    lateGameScore * 0.35 +
    comebackScore * 0.25 +
    persistenceScore * 0.10;

  // Add overtime bonus
  const finalScore = game.overtime ? Math.min(10, excitement + 0.5) : excitement;

  return Math.max(1, Math.min(10, Math.round(finalScore * 10) / 10));
}

function calculateVariance(values) {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;

  return Math.sqrt(variance);
}

function calculateLateGameExcitement(balances) {
  if (balances.length < 4) return 5;

  // Look at last quarter of the game
  const lastQuarter = balances.slice(Math.floor(balances.length * 0.75));

  // Average excitement in final quarter
  const avgLateExcitement = lastQuarter.reduce((sum, b) => sum + b, 0) / lastQuarter.length;

  // Variance in late game (more swings = more exciting)
  const lateVariance = calculateVariance(lastQuarter);

  return Math.min(10, (avgLateExcitement * 5) + (lateVariance * 30));
}

function calculateComebackFactor(probs) {
  if (probs.length < 10) return 5;

  let maxSwing = 0;
  let swingCount = 0;

  for (let i = 1; i < probs.length; i++) {
    const change = Math.abs(probs[i].value - probs[i - 1].value);

    if (change > 0.1) { // Significant swing (10%+ change)
      swingCount++;
      maxSwing = Math.max(maxSwing, change);
    }
  }

  const swingScore = Math.min(10, swingCount * 1.5); // More swings = more exciting
  const magnitudeScore = Math.min(10, maxSwing * 15); // Bigger swings = more exciting

  return (swingScore * 0.6) + (magnitudeScore * 0.4);
}

function calculatePersistence(balances) {
  if (balances.length === 0) return 5;

  // Count how many points the game was close (balance > 0.5 means win prob between 40-60%)
  const closePoints = balances.filter(b => b > 0.5).length;
  const closenessRatio = closePoints / balances.length;

  return Math.min(10, closenessRatio * 12);
}

function createFallback(game) {
  // Simple fallback based on score differential
  const scoreDiff = Math.abs((game.homeScore || 0) - (game.awayScore || 0));

  let excitement = 7; // Default for missing data

  if (scoreDiff <= 3) excitement = 8;
  else if (scoreDiff <= 7) excitement = 7;
  else if (scoreDiff <= 14) excitement = 6;
  else if (scoreDiff <= 21) excitement = 5;
  else excitement = 4;

  if (game.overtime) excitement = Math.min(10, excitement + 1);

  return {
    id: game.id,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    excitement: excitement,
    overtime: game.overtime
  };
}
