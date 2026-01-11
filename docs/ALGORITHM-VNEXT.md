# vNext Entertainment Scoring Algorithm

**Version:** 4.0.0-alpha
**Status:** Experimental

## Overview

The vNext algorithm represents a ground-up redesign of game entertainment scoring, built on psychology research rather than accumulated heuristics. It replaces the v3.x Tension-Drama-Finish model with a three-metric system:

| Metric | Psychological Basis | Question Answered |
|--------|---------------------|-------------------|
| **Volatility** | Continuous attentional engagement, action density | "Did things happen?" |
| **Surprise** | Expectation violation, belief updating | "Did things happen that shouldn't have?" |
| **Finish** | Peak-end rule, narrative resolution | "Did it end well?" |

## Motivation

### Problems with v3.x

The current algorithm uses Tension (time in competitive band), Drama (weighted win probability swings), and Finish (end-game quality) metrics. Core issues:

1. **Tension rewards stasis.** Measuring "time spent in 30-70% band" penalizes games with dramatic collapses or comebacks that spent most of their duration outside this band.

2. **Doesn't match human memory.** Psychology research (Kahneman's Peak-End Rule) shows people judge experiences by their most intense moments and endings, not sustained averages.

3. **Accumulated complexity.** Decision point adjustments, nail-biter detection, multiple bonus systems, and margin-based floors were added to compensate for edge cases, creating a fragile system that's difficult to reason about.

### Why Three Metrics?

**Volatility** and **Surprise** capture different aspects of engagement:

- A game oscillating 45-55% throughout has **high Volatility** (many swings) but **low Surprise** (belief strength stays moderate, no extreme swings from certainty)
- A game at 90% for three quarters that collapses has **moderate Volatility** (fewer swings) but **high Surprise** (extreme expectation violation)

These are qualitatively different experiences and should score differently.

**Finish** captures the disproportionate weight humans place on endings, regardless of what came before. A boring game with a dramatic final play is memorable; a dramatic game that ends in a blowout leaves viewers disappointed.

## Mathematical Definitions

### Notation

- `p(t)` = home team win probability at time point `t`
- `N` = total number of probability data points
- `W_v`, `W_s`, `W_f` = weights for Volatility, Surprise, Finish
- `ε_p`, `ε_l` = epsilon thresholds for probability and logit deltas

### 1. Volatility

**Definition:** Sum of meaningful probability movements.

```
Volatility = Σ |Δp(t)| + CrossingBonus
             where |Δp(t)| ≥ ε_p
```

Where:
- `Δp(t) = p(t) - p(t-1)`
- Crossing = probability crossing 0.5 threshold (lead change)
- Late crossings (in finish window) receive 1.5x bonus

**Interpretation:** Measures action density. High volatility = lots of back-and-forth play.

### 2. Surprise

**Definition:** Sum of meaningful log-odds movements.

```
Surprise = Σ |Δlogit(t)|
           where |Δlogit(t)| ≥ ε_l

logit(p) = log(p / (1 - p))
```

**Why log-odds?** Linear probability changes don't capture psychological impact:

- 90% → 80% swing: Δp = 0.10, Δlogit = 0.81
- 55% → 45% swing: Δp = 0.10, Δlogit = 0.40

The log-odds transformation naturally weights swings from certainty more heavily, capturing the "the game was over, then it wasn't" phenomenon.

**Interpretation:** Measures expectation violation. High surprise = beliefs were repeatedly challenged.

### 3. Finish

**Definition:** Combination of end-window volatility, closeness, and late drama.

```
Finish = EndVolatility + AvgUncertainty + LateCrossingBonus

EndVolatility = Σ |Δp(t)| for t in end window

AvgUncertainty = mean(1 - 2|p(t) - 0.5|) for t in end window
```

Where:
- End window = last 20-25% of data points (sport-specific)
- Uncertainty function: max (1.0) at p=0.5, min (0.0) at p=0 or p=1
- Late crossing bonus = crossings in end window × bonus × multiplier

**Interpretation:** Measures ending quality. High finish = dramatic, close ending.

### Final Score

Raw subscores are normalized to [0, 1] using sport-specific percentile values (p95 = 1.0), then combined:

```
WeightedSum = (V_norm × W_v) + (S_norm × W_s) + (F_norm × W_f)

FinalScore = 1 + (WeightedSum × 9)  // Maps [0,1] to [1,10]
```

Default weights: `W_v = 0.25, W_s = 0.35, W_f = 0.40`

## Configuration

All parameters are defined in `shared/algorithm-vnext-config.js`:

### Weights

```javascript
weights: {
  volatility: 0.25,
  surprise: 0.35,
  finish: 0.40
}
```

Rationale:
- **Finish (0.40):** Highest weight due to peak-end rule
- **Surprise (0.35):** Memorable moments of expectation violation
- **Volatility (0.25):** Important but captured partly by other metrics

### Epsilon Thresholds

Sport-specific noise filters:

```javascript
epsilon: {
  NFL: { probability: 0.02, logit: 0.15 },
  CFB: { probability: 0.02, logit: 0.15 },
  NBA: { probability: 0.015, logit: 0.12 }  // More granular data
}
```

### End Window

Percentage of data points considered "ending":

```javascript
endWindow: {
  NFL: { percentage: 0.20 },  // ~4th quarter
  CFB: { percentage: 0.20 },
  NBA: { percentage: 0.25 }   // ~4th quarter with more data
}
```

Uses data percentage (not clock time) to handle variable granularity.

### Lead Change Bonuses

```javascript
leadChange: {
  volatilityBonus: 0.1,
  maxCrossings: 10,
  finishWindowMultiplier: 1.5
}
```

## Edge Cases

### Insufficient Data

Games with fewer than 20 probability points return `null`. This is rare; most complete games have 300-600 points.

### Overtime

No special handling. Overtime extends the game, adding more data points (naturally increasing metrics). OT detection is tracked in diagnostics but doesn't affect scoring.

### Missing End-Game Data

If final probability is 0.45-0.55 and game is marked complete, `possibleTruncation` flag is set in diagnostics. Score is still computed but may be unreliable.

### Identical Consecutive Probabilities

Skipped in delta calculations (no movement = zero contribution to all metrics).

## Calibration

Normalizers are derived from percentile analysis of historical games. The calibration process:

1. Score all available games with raw (unnormalized) metrics
2. Calculate percentile distributions (p10, p25, p50, p75, p90, p95, p99)
3. Use p95 as normalization reference: `norm(x) = min(1, x / p95)`
4. Verify top/bottom game rankings for sanity

Run calibration:

```bash
node scripts/calibrate-vnext.js --sport NFL --season 2024
node scripts/calibrate-vnext.js --all
```

Outputs: `analysis/vnext-normalizers.json`

## Testing

Golden game tests verify ordering relationships without brittle exact scores:

```bash
node scripts/test-vnext-golden.js
```

Test fixtures include:
- **Blowout:** Wire-to-wire dominance (should score lowest)
- **Steady Close:** Consistent 45-55% oscillation
- **Dominant Collapse:** 3 quarters at 85%, then collapse to 52%
- **Comeback:** Down 25% early, storm back to 95%
- **Back-and-Forth:** Multiple lead changes
- **Walkoff:** Boring until dramatic final play

Validates:
1. Expected tier assignment (must watch / recommended / skip)
2. Relative ordering (collapse > steady close > blowout)
3. Sanity bounds (scores in [1,10], subscores in [0,1], no NaN/Infinity)

## Known Limitations

### 1. Requires Complete Data

Algorithm assumes probability data spans entire game. Truncated data produces unreliable scores (especially Finish).

### 2. Doesn't Account for Context

- Playoff games vs. regular season
- Rivalry matchups
- Championship implications
- Star player performances

These are contextual factors outside the probability curve.

### 3. Sport-Specific Tuning

Normalizers and epsilons are sport-specific. New sports require calibration data.

### 4. Subjective Weights

The 0.25/0.35/0.40 weights balance different preferences. Tuning may be needed based on user feedback.

### 5. No Special Cases

Unlike v3.x, vNext has no bonuses for upsets, overtime, comebacks, or margins. If these aren't captured organically by the three metrics, that's a signal to adjust the core model—not add patches.

## Comparison to v3.x

| Aspect | v3.x | vNext |
|--------|------|-------|
| **Metrics** | Tension, Drama, Finish | Volatility, Surprise, Finish |
| **Tension/Volatility** | Time in competitive band | Sum of probability movements |
| **Drama/Surprise** | Weighted swings | Log-odds movements |
| **Finish** | Complex with bonuses | End-window composite |
| **Special Cases** | Many (OT, upsets, comebacks) | None |
| **Decision Points** | Explicit thresholds | Organic to metrics |
| **Nail-Biter Bonus** | Explicit | Captured by Volatility + Finish |
| **Configurability** | Scattered constants | Centralized config |

## Usage

### Standalone Scoring

```javascript
import { scoreGame } from './shared/algorithm-vnext.js';

const probabilities = [
  { value: 0.52, period: 1, clock: '15:00' },
  { value: 0.48, period: 1, clock: '14:30' },
  // ... more data points
];

const result = scoreGame(probabilities, { sport: 'NFL', overtime: false });

console.log(result.score);        // 7.8
console.log(result.subscores);    // { volatility: 0.65, surprise: 0.72, finish: 0.85 }
console.log(result.diagnostics);  // Rich debug info
```

### With Normalizers

```javascript
import normalizers from './analysis/vnext-normalizers.json';

const result = scoreGame(probabilities, { sport: 'NFL' }, normalizers);
```

## Future Work

### Phase 2: A/B Comparison

Compare v3.x and vNext on canonical games to validate improvements.

### Phase 3: Integration

Swap scoring backend in API endpoints to use vNext.

### Phase 4: Watchability vs. Memorability

Optional mode toggle that adjusts weights:
- **Watchability:** Higher Volatility weight (action while watching)
- **Memorability:** Higher Surprise weight (story you tell later)

### Phase 5: Deprecation

Remove v3.x algorithm files once vNext is validated.

## References

- **Kahneman, D., Fredrickson, B. L., Schreiber, C. A., & Redelmeier, D. A. (1993).** "When more pain is preferred to less: Adding a better end." *Psychological Science*, 4(6), 401-405.
  - Peak-End Rule: Experiences judged by peak intensity and ending, not duration or average

- **Fischhoff, B., & Beyth, R. (1975).** "I knew it would happen: Remembered probabilities of once-future things." *Organizational Behavior and Human Performance*, 13(1), 1-16.
  - Hindsight bias and belief updating

- **Tversky, A., & Kahneman, D. (1974).** "Judgment under uncertainty: Heuristics and biases." *Science*, 185(4157), 1124-1131.
  - Availability heuristic: Salient moments are overweighted in memory

## License

Same as parent project.
