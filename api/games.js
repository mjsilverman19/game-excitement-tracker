// UPDATED: Replace the calculateSimpleEntertainment function in your API

function calculateSimpleEntertainment(probabilities, game) {
  // Clean the probability data
  const probs = probabilities
    .map(p => Math.max(1, Math.min(99, p.homeWinPercentage || 50)))
    .filter(p => p !== null);

  if (probs.length < 10) {
    return createScoreBasedAnalysis(game);
  }

  // Core metrics (more refined calculations)
  
  // 1. Average uncertainty - how close to 50/50 throughout game
  const avgUncertainty = probs.reduce((sum, p) => sum + Math.abs(p - 50), 0) / probs.length;
  
  // 2. Late game uncertainty - final 25% of game
  const finalQuarter = probs.slice(-Math.floor(probs.length * 0.25));
  const lateUncertainty = finalQuarter.reduce((sum, p) => sum + Math.abs(p - 50), 0) / finalQuarter.length;
  
  // 3. Peak uncertainty moments
  const maxUncertainty = Math.max(...probs.map(p => Math.abs(p - 50)));
  
  // 4. Biggest momentum swing
  let maxSwing = 0;
  for (let i = 5; i < probs.length; i++) {
    const swing = Math.abs(probs[i] - probs[i-5]);
    maxSwing = Math.max(maxSwing, swing);
  }
  
  // 5. Sustained tension (how long was it uncertain?)
  let tensionPeriods = 0;
  probs.forEach(p => {
    if (Math.abs(p - 50) <= 25) tensionPeriods++; // Within 25% of 50/50
  });
  const sustainedTension = tensionPeriods / probs.length;

  // Refined scoring system (0-10 with more discrimination)
  let baseScore = 3.0; // Start lower to avoid grade inflation
  
  // Uncertainty scoring (more nuanced)
  if (avgUncertainty <= 15) baseScore += 3.0;        // Consistently close
  else if (avgUncertainty <= 20) baseScore += 2.2;   
  else if (avgUncertainty <= 25) baseScore += 1.5;   
  else if (avgUncertainty <= 30) baseScore += 0.8;
  else baseScore += 0.2; // Very predictable game
  
  // Late drama bonus (exponential importance)
  if (lateUncertainty <= 10) baseScore += 2.5;       // Nail-biter finish
  else if (lateUncertainty <= 15) baseScore += 2.0;  
  else if (lateUncertainty <= 20) baseScore += 1.5;  
  else if (lateUncertainty <= 25) baseScore += 1.0;  
  else if (lateUncertainty <= 30) baseScore += 0.5;

  // Peak moments
  if (maxUncertainty >= 45) baseScore += 1.5;        // Truly uncertain moments
  else if (maxUncertainty >= 35) baseScore += 1.0;   
  else if (maxUncertainty >= 25) baseScore += 0.5;

  // Momentum swings
  if (maxSwing >= 40) baseScore += 1.5;              // Huge comeback
  else if (maxSwing >= 30) baseScore += 1.0;         
  else if (maxSwing >= 20) baseScore += 0.5;

  // Sustained tension bonus
  if (sustainedTension >= 0.7) baseScore += 1.0;     // Tense throughout
  else if (sustainedTension >= 0.5) baseScore += 0.5;

  // Final score context adjustments
  const margin = Math.abs(game.homeScore - game.awayScore);
  const totalScore = game.homeScore + game.awayScore;
  
  // Margin penalties/bonuses (more granular)
  if (margin === 0) baseScore += 0.8;                // Tie game
  else if (margin <= 3) baseScore += 0.6;            
  else if (margin <= 7) baseScore += 0.2;            
  else if (margin <= 14) baseScore -= 0.3;           
  else if (margin <= 21) baseScore -= 1.0;           
  else baseScore -= 2.0;                             // Blowout penalty

  // Scoring context
  if (totalScore >= 70) baseScore += 0.4;            // Shootout bonus
  else if (totalScore <= 30) {                       // Low-scoring game
    baseScore += margin <= 3 ? 0.3 : -0.5;          // Good if close, bad if blowout
  }

  // Overtime massive bonus
  if (game.overtime) baseScore += 1.2;

  // Apply more realistic caps and floors
  let finalScore = Math.max(1.0, Math.min(10.0, baseScore));
  
  // Add some randomness for ties (prevent identical scores)
  finalScore += (Math.random() - 0.5) * 0.1;
  
  // Round to one decimal place
  finalScore = Math.round(finalScore * 10) / 10;

  // More nuanced descriptions
  let description = "Average game";
  if (finalScore >= 9.5) description = "Instant classic";
  else if (finalScore >= 9.0) description = "Epic game";
  else if (finalScore >= 8.5) description = "Thriller";
  else if (finalScore >= 8.0) description = "Highly entertaining";
  else if (finalScore >= 7.5) description = "Very good";
  else if (finalScore >= 7.0) description = "Good game";
  else if (finalScore >= 6.5) description = "Solid entertainment";
  else if (finalScore >= 6.0) description = "Decent game";
  else if (finalScore >= 5.5) description = "Watchable";
  else if (finalScore >= 5.0) description = "Mediocre";
  else if (finalScore >= 4.0) description = "Below average";
  else if (finalScore >= 3.0) description = "Boring";
  else description = "Blowout";

  if (game.overtime) description += " (OT)";

  return {
    score: finalScore,
    description: description,
    analysis: `Avg uncertainty: ${Math.round(avgUncertainty)}%, Late drama: ${Math.round(lateUncertainty)}%, Peak tension: ${Math.round(maxUncertainty)}%`,
    moments: findKeyMoments(probs)
  };
}

// UPDATED: Also update the createScoreBasedAnalysis function for more granular fallback scoring

function createScoreBasedAnalysis(game) {
  const margin = Math.abs(game.homeScore - game.awayScore);
  const totalScore = game.homeScore + game.awayScore;
  
  let baseScore = 4.0; // Lower starting point
  
  // More granular margin-based scoring
  if (margin === 0) baseScore = 8.5;               // Tie
  else if (margin === 1) baseScore = 8.2;          
  else if (margin === 2) baseScore = 7.9;          
  else if (margin === 3) baseScore = 7.5;          
  else if (margin <= 6) baseScore = 6.8;           
  else if (margin <= 10) baseScore = 5.8;          
  else if (margin <= 14) baseScore = 4.5;          
  else if (margin <= 21) baseScore = 3.2;          
  else if (margin <= 28) baseScore = 2.5;          
  else baseScore = 1.8;                            // Major blowout
  
  // Scoring context adjustments
  if (totalScore >= 70) baseScore += 0.5;          // High-scoring bonus
  else if (totalScore >= 60) baseScore += 0.3;     
  else if (totalScore <= 30 && margin > 7) baseScore -= 0.5; // Low-scoring blowout penalty
  
  // Overtime
  if (game.overtime) baseScore += 1.2;
  
  // Add slight randomness and cap
  baseScore += (Math.random() - 0.5) * 0.1;
  baseScore = Math.max(1.0, Math.min(10.0, baseScore));
  
  // Round to one decimal
  const finalScore = Math.round(baseScore * 10) / 10;
  
  // Descriptions
  let description = "Moderate game";
  if (finalScore >= 9.0) description = "Classic";
  else if (finalScore >= 8.0) description = "Thriller";
  else if (finalScore >= 7.0) description = "Good game";
  else if (finalScore >= 6.0) description = "Decent";
  else if (finalScore >= 5.0) description = "Average";
  else if (finalScore >= 4.0) description = "Below average";
  else description = "Blowout";
  
  if (game.overtime) description += " (OT)";

  return {
    score: finalScore,
    description: description,
    analysis: `${margin}-point game, ${totalScore} total points`,
    moments: []
  };
}
