/**
 * ESPN Data Quality Detection
 *
 * Detects potential issues with ESPN win probability data that could
 * cause incorrect excitement scores. Flags games for user awareness.
 *
 * Task 3: Add ESPN data quality detection
 */

/**
 * Counts lead changes in probability data
 * @param {Array} probs - Array of probability objects with homeWinPercentage or value
 * @returns {number} Number of lead changes
 */
function countLeadChanges(probs) {
  if (!probs || probs.length < 2) return 0;

  let leadChanges = 0;
  for (let i = 1; i < probs.length; i++) {
    const prev = probs[i - 1].homeWinPercentage ?? probs[i - 1].value ?? 0.5;
    const curr = probs[i].homeWinPercentage ?? probs[i].value ?? 0.5;
    if ((prev - 0.5) * (curr - 0.5) < 0) {
      leadChanges++;
    }
  }
  return leadChanges;
}

/**
 * Detects potential data quality issues in ESPN win probability data
 *
 * @param {Array} probs - Array of probability objects with homeWinPercentage
 * @param {Object} game - Game object with homeScore, awayScore
 * @param {string} sport - Sport type (NFL, CFB, NBA)
 * @returns {Object} { hasIssues, issues[], severity }
 */
export function detectDataQualityIssues(probs, game, sport = 'NFL') {
  const issues = [];

  if (!probs || probs.length < 10) {
    issues.push({
      type: 'insufficient-data',
      severity: 'high',
      message: 'Insufficient probability data points'
    });
    return {
      hasIssues: true,
      issues,
      severity: 'high'
    };
  }

  // Issue 1: Trailing noise - final probability not near 0 or 100%
  // This happens when ESPN data continues after the game ends with noise
  // Example: Heat at Magic (401704977) - final WP shows 61% instead of 0/100%
  const finalProb = probs[probs.length - 1].homeWinPercentage ?? probs[probs.length - 1].value;
  if (finalProb !== undefined && finalProb > 0.05 && finalProb < 0.95) {
    issues.push({
      type: 'trailing-noise',
      severity: 'high',
      message: `Final win probability is ${(finalProb * 100).toFixed(0)}% instead of near 0% or 100% - data may include post-game noise`
    });
  }

  // Issue 2: Missing drama - close final score but 0 lead changes
  // This indicates ESPN may have missed key probability swings
  // Example: Bills at Chiefs (401326594) - 0 lead changes despite famous 13-second finish
  if (game && typeof game.homeScore === 'number' && typeof game.awayScore === 'number') {
    const margin = Math.abs(game.homeScore - game.awayScore);
    const leadChanges = countLeadChanges(probs);

    // Sport-specific thresholds for "close game"
    const closeThreshold = sport === 'NBA' ? 10 : 7;

    if (margin <= closeThreshold && leadChanges === 0) {
      issues.push({
        type: 'missing-drama',
        severity: 'high',
        message: `Close game (${margin}-point margin) but 0 lead changes detected - dramatic moments may be missing from probability data`
      });
    }

    // Also flag if a one-possession game has very few lead changes
    const onePossessionThreshold = sport === 'NBA' ? 3 : 3;
    if (margin <= onePossessionThreshold && leadChanges <= 1) {
      // Only flag if not already flagged for 0 lead changes
      if (leadChanges === 1) {
        issues.push({
          type: 'low-drama-for-margin',
          severity: 'medium',
          message: `One-possession game (${margin} pts) but only ${leadChanges} lead change - data may be incomplete`
        });
      }
    }
  }

  // Issue 3: Monotonic probability in overtime
  // If game went to OT but probability data doesn't show the expected swings
  if (game?.overtime) {
    // Check final 15% of data for any crossing of 50%
    const otWindowStart = Math.floor(probs.length * 0.85);
    const otWindow = probs.slice(otWindowStart);
    let otCrossings = 0;
    for (let i = 1; i < otWindow.length; i++) {
      const prev = otWindow[i - 1].homeWinPercentage ?? otWindow[i - 1].value ?? 0.5;
      const curr = otWindow[i].homeWinPercentage ?? otWindow[i].value ?? 0.5;
      if ((prev - 0.5) * (curr - 0.5) < 0) {
        otCrossings++;
      }
    }
    if (otCrossings === 0) {
      issues.push({
        type: 'ot-no-crossings',
        severity: 'medium',
        message: 'Overtime game but no late lead changes in probability data'
      });
    }
  }

  // Issue 4: Sparse data points
  // Full games typically have 400-600 data points; sparse data may miss drama
  const minExpectedPoints = sport === 'NBA' ? 200 : 150;
  if (probs.length < minExpectedPoints) {
    issues.push({
      type: 'sparse-data',
      severity: 'low',
      message: `Only ${probs.length} data points (expected ${minExpectedPoints}+) - score may not capture all moments`
    });
  }

  // Determine overall severity
  let severity = 'none';
  if (issues.some(i => i.severity === 'high')) {
    severity = 'high';
  } else if (issues.some(i => i.severity === 'medium')) {
    severity = 'medium';
  } else if (issues.length > 0) {
    severity = 'low';
  }

  return {
    hasIssues: issues.length > 0,
    issues,
    severity
  };
}

/**
 * Format data quality issues for display
 * @param {Object} dataQuality - Result from detectDataQualityIssues
 * @returns {string} Human-readable summary
 */
export function formatDataQualityWarning(dataQuality) {
  if (!dataQuality?.hasIssues) return '';

  const messages = dataQuality.issues.map(i => i.message);
  return messages.join('; ');
}

/**
 * Get warning icon based on severity
 * @param {string} severity - 'high', 'medium', 'low', or 'none'
 * @returns {string} Emoji icon
 */
export function getDataQualityIcon(severity) {
  switch (severity) {
    case 'high': return '⚠️';
    case 'medium': return '⚡';
    case 'low': return 'ℹ️';
    default: return '';
  }
}
