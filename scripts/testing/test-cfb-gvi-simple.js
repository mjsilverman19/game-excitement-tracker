#!/usr/bin/env node

/**
 * Simple CFB GVI test using game situation data only
 * Tests the core logic without requiring Polymarket data
 */

async function fetchLiveCFBGames() {
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
    const response = await fetch(url);
    const data = await response.json();

    const liveGames = data.events.filter(event => {
      const status = event.status?.type?.name;
      return status === 'STATUS_IN_PROGRESS' ||
             status === 'STATUS_HALFTIME' ||
             status === 'STATUS_END_PERIOD';
    });

    return liveGames.map(game => {
      const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === 'home');
      const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === 'away');
      const status = game.status;

      return {
        id: game.id,
        name: `${awayTeam.team.displayName} at ${homeTeam.team.displayName}`,
        shortName: `${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation}`,
        homeTeam: homeTeam.team.displayName,
        awayTeam: awayTeam.team.displayName,
        homeTeamAbbrev: homeTeam.team.abbreviation,
        awayTeamAbbrev: awayTeam.team.abbreviation,
        homeScore: parseInt(homeTeam.score) || 0,
        awayScore: parseInt(awayTeam.score) || 0,
        gameDate: game.date,
        status: {
          type: status.type,
          period: status.period,
          displayClock: status.displayClock
        },
        gameState: 'live'
      };
    });

  } catch (error) {
    console.error('Error fetching CFB games:', error.message);
    return [];
  }
}

function calculateGameSituationScore(game) {
  const { homeScore, awayScore, status } = game;
  const scoreDiff = Math.abs(homeScore - awayScore);
  const totalScore = homeScore + awayScore;
  const quarter = status.period || 1;

  // Time remaining estimation (rough)
  let timeRemaining = 1.0; // Default to full time remaining
  if (status.displayClock) {
    const timeStr = status.displayClock;
    if (timeStr.includes(':')) {
      const [minutes, seconds] = timeStr.split(':').map(Number);
      const totalSeconds = (minutes * 60) + seconds;
      const quarterLength = 15 * 60; // 15 minutes per quarter
      timeRemaining = totalSeconds / quarterLength;
    }
  }

  // Factors for excitement
  let situationScore = 0;

  // Close game bonus (higher when closer)
  if (scoreDiff <= 3) situationScore += 0.4;
  else if (scoreDiff <= 7) situationScore += 0.3;
  else if (scoreDiff <= 14) situationScore += 0.2;
  else if (scoreDiff <= 21) situationScore += 0.1;

  // Late game tension (higher in later quarters with less time)
  if (quarter >= 4) {
    situationScore += 0.3 * (1 - timeRemaining); // More tension as time runs out
  } else if (quarter === 3) {
    situationScore += 0.1;
  }

  // High scoring game bonus
  if (totalScore > 60) situationScore += 0.1;
  else if (totalScore > 45) situationScore += 0.05;

  // Halftime penalty (less exciting)
  if (status.type.name === 'STATUS_HALFTIME') {
    situationScore *= 0.5;
  }

  return Math.min(situationScore, 1.0);
}

function calculateMockGVI(game) {
  const situationScore = calculateGameSituationScore(game);

  // Mock other components since we don't have market data
  const mockSpreadScore = 0.2; // Assume moderate spread uncertainty
  const mockMovementScore = 0.15; // Assume some price movement
  const mockVolumeScore = 0.1; // Assume low volume

  // Weighted combination (game situation gets higher weight without market data)
  const gviScore = Math.round(
    (situationScore * 0.6 + // Increased weight for game situation
     mockSpreadScore * 0.2 +
     mockMovementScore * 0.15 +
     mockVolumeScore * 0.05) * 100
  );

  // Determine recommendation
  let recommendation, priority;
  if (gviScore >= 85) {
    recommendation = "🔥 MUST WATCH";
    priority = "high";
  } else if (gviScore >= 70) {
    recommendation = "📈 HIGHLY RECOMMENDED";
    priority = "medium-high";
  } else if (gviScore >= 50) {
    recommendation = "👀 WORTH WATCHING";
    priority = "medium";
  } else {
    recommendation = "⚡ SOME INTEREST";
    priority = "low";
  }

  return {
    gviScore,
    recommendation,
    priority,
    breakdown: {
      gameSituation: { score: situationScore, weight: 0.6 },
      currentSpread: { score: mockSpreadScore, weight: 0.2 },
      marketMovement: { score: mockMovementScore, weight: 0.15 },
      volumeActivity: { score: mockVolumeScore, weight: 0.05 }
    },
    reason: `Game situation analysis: ${Math.round(situationScore * 100)}% excitement based on score differential and timing`
  };
}

async function testCFBGVI() {
  console.log('🏈 Testing CFB GVI Calculation\n');
  console.log('='.repeat(60));

  const games = await fetchLiveCFBGames();

  if (games.length === 0) {
    console.log('❌ No live CFB games found');
    return;
  }

  console.log(`📊 Analyzing ${games.length} live CFB games...\n`);

  const gviGames = games.map(game => ({
    ...game,
    gvi: calculateMockGVI(game)
  })).sort((a, b) => b.gvi.gviScore - a.gvi.gviScore);

  // Display results
  gviGames.forEach((game, index) => {
    const { gvi } = game;
    const statusText = game.status.type.name === 'STATUS_HALFTIME' ? 'Halftime' :
                      `Q${game.status.period} ${game.status.displayClock || ''}`;

    console.log(`${index + 1}. ${game.shortName}`);
    console.log(`   ${game.awayScore} - ${game.homeScore} • ${statusText}`);
    console.log(`   GVI: ${gvi.gviScore} • ${gvi.recommendation}`);
    console.log(`   ${gvi.reason}`);
    console.log('');
  });

  // Summary by priority
  const categories = {
    mustWatch: gviGames.filter(g => g.gvi.gviScore >= 85),
    recommended: gviGames.filter(g => g.gvi.gviScore >= 70 && g.gvi.gviScore < 85),
    worthWatching: gviGames.filter(g => g.gvi.gviScore >= 50 && g.gvi.gviScore < 70),
    someInterest: gviGames.filter(g => g.gvi.gviScore < 50)
  };

  console.log('📋 GVI Summary');
  console.log('='.repeat(60));
  console.log(`🔥 Must Watch: ${categories.mustWatch.length} games`);
  console.log(`📈 Highly Recommended: ${categories.recommended.length} games`);
  console.log(`👀 Worth Watching: ${categories.worthWatching.length} games`);
  console.log(`⚡ Some Interest: ${categories.someInterest.length} games`);

  if (categories.mustWatch.length > 0) {
    console.log(`\n🎯 TOP RECOMMENDATION: ${categories.mustWatch[0].shortName} (${categories.mustWatch[0].gvi.gviScore})`);
  } else if (categories.recommended.length > 0) {
    console.log(`\n🎯 TOP RECOMMENDATION: ${categories.recommended[0].shortName} (${categories.recommended[0].gvi.gviScore})`);
  }
}

testCFBGVI().catch(console.error);