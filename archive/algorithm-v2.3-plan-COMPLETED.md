# Algorithm v2.3: Address Metric Redundancy and Finish Calibration
This plan addresses the statistical issues identified in the v2.2 analysis: high metric correlation (r=0.949 between uncertainty/drama) and overly conservative finish scoring (avg 3.37/10).

***
## Issue 1: Metric Redundancy (Uncertainty-Drama r=0.949)
**Problem:** Both metrics use leverage-weighting and correlate so highly they're measuring the same construct.
**Root Cause:** Leverage = p*(1-p), which peaks at 0.5. Games near 0.5 have both high "closeness" (uncertainty) AND high-leverage swings (drama). The metrics are mathematically coupled.
***
## Task 1: Redefine Drama as Detrended Volatility
**Goal**
Make drama measure swing *magnitude* independent of baseline closeness, so a blowout with wild swings can score high drama even with low uncertainty.
**Approach**
Instead of leverage-weighting swings, measure:
1. **Raw swing frequency and magnitude** (how much the line moved, regardless of where it was)
2. **Deviation from expected movement** (did the game have more swings than typical for its closeness level?)
**Implementation**
Modify `calculateMomentumDrama()` in `api/calculator.js`:
```js
// Current: weightedSwing = swing * leverage * timeWeight
// New: weightedSwing = swing * timeWeight (no leverage)
// Then normalize by game length and apply diminishing returns
```
Keep time-weighting (later swings matter more) but remove leverage-weighting entirely.
**Expected Outcome**
* Drama will measure "how wild was the ride" regardless of who was winning
* A game that swings 60%→80%→65%→85% will score high drama even though never near 50%
* Uncertainty-Drama correlation should drop from 0.949 to <0.7
**Files to Modify**
* `api/calculator.js`: `calculateMomentumDrama()` (lines 267-299)
**Testing**
* Verify blowout games with late movement now score higher drama
* Verify correlation drops significantly
* Ensure drama still ranges 0-10
***
## Task 2: Add Lead Changes to Uncertainty (Not Drama)
**Goal**
Move the lead change boost from drama to uncertainty, since lead changes are fundamentally about "who was winning" (uncertainty) not "how much it moved" (drama).
**Implementation**
Modify `calculateExcitement()` in `api/calculator.js`:
```js
// Current:
const dramaScore = Math.min(10, baseDrama + leadChangeBoost);
// New:
const uncertaintyScore = Math.min(10, baseUncertainty + comebackFactor + leadChangeBoost);
const dramaScore = Math.min(10, baseDrama); // No lead change boost
```
**Expected Outcome**
* Lead changes contribute to "outcome was in doubt" (uncertainty)
* Drama purely measures swing magnitude
* Further decorrelates the metrics
**Files to Modify**
* `api/calculator.js`: `calculateExcitement()` (lines 79-98)
***
## Issue 2: Finish Score Too Low (avg 3.37/10)
**Problem:** The false-positive fixes overcorrected. Finish quality now requires movement toward 0.5 in competitive range, which rarely happens in real games.
***
## Task 3: Expand Competitive Range for Finish Volatility
**Goal**
Allow more movement to count toward finish quality by expanding what's considered "competitive."
**Current State**
* Competitive range: 0.3-0.7 (40% of probability space)
* Movement only counts if crossing 0.5 OR moving toward 0.5 while in range
**New State**
* Competitive range: 0.25-0.75 (50% of probability space)
* Movement counts if crossing 0.5, OR in range and moving toward 0.5, OR **any movement in tight competitive range (0.4-0.6)**
**Implementation**
Modify `calculateFinishQuality()` in `api/calculator.js`:
```js
const competitiveRange = { min: 0.25, max: 0.75 };
const tightCompetitiveRange = { min: 0.4, max: 0.6 };
// Count all movement in tight range regardless of direction
const inTightRange = startValue >= tightCompetitiveRange.min && startValue <= tightCompetitiveRange.max;
if (crossedHalf || inTightRange) {
  competitiveMovement += swing;
} else if (inCompetitiveRange && movingTowardUncertainty) {
  competitiveMovement += uncertaintyGain;
}
```
**Expected Outcome**
* Finish average should increase from ~3.4 to ~4.5-5.5
* Games with sustained 40-60% probability in final period now score well
* False positives (0.75→0.95) still don't count
**Files to Modify**
* `api/calculator.js`: `calculateFinishQuality()` (lines 379-414)
***
## Task 4: Reduce Closeness Exponent
**Goal**
The exponent of 1.2 on closeness score may be too aggressive, penalizing games that aren't perfectly at 50%.
**Implementation**
Modify `calculateFinishQuality()` in `api/calculator.js`:
```js
// Current:
const closenessScore = Math.pow(Math.max(0, finalCloseness), 1.2) * 4;
// New:
const closenessScore = Math.pow(Math.max(0, finalCloseness), 1.0) * 4;
```
**Expected Outcome**
* Games averaging 55-45% in final moments get more credit
* Linear relationship between closeness and score component
**Files to Modify**
* `api/calculator.js`: `calculateFinishQuality()` (line 377)
***
## Task 5: Add Partial Credit for Near-Competitive Movement
**Goal**
Movement in the 0.7-0.85 range (not competitive, but not extreme) should get partial credit rather than zero.
**Implementation**
Modify `calculateFinishQuality()` in `api/calculator.js`:
```js
// After checking competitive range, add:
const nearCompetitiveRange = { min: 0.15, max: 0.85 };
const inNearCompetitive = startValue >= nearCompetitiveRange.min && startValue <= nearCompetitiveRange.max;
if (inNearCompetitive && !inCompetitiveRange && crossedHalf) {
  // Partial credit for lead changes outside competitive range
  competitiveMovement += swing * 0.5;
}
```
**Expected Outcome**
* A swing from 0.72→0.48 (crosses 0.5 from near-competitive) gets 50% credit
* Swings at extremes (0.92→0.88) still get nothing
**Files to Modify**
* `api/calculator.js`: `calculateFinishQuality()` (lines 390-414)
***
## Issue 3: Score Clustering at Top (17% score 10+)
**Problem:** 46 games scoring 10+ vs 27 scoring 9-9.9 suggests discontinuity.
***
## Task 6: Investigate and Fix Top-End Clustering
**Goal**
Understand why scores cluster at 10+ and smooth the distribution.
**Investigation Steps**
1. Check what the 10+ games have in common (OT? Comebacks? High all metrics?)
2. Examine raw scores before normalization
3. Check if bonus cap (50%) is being hit frequently
**Likely Fixes**
* Adjust sigmoid steepness parameter (currently 2.5, may need 2.0 or 3.0)
* Tighten bonus cap from 50% to 40%
* Adjust sigmoid midpoint if raw score distribution shifted
**Files to Modify**
* `api/calculator.js`: `normalizeScore()` (lines 577-603)
* `api/calculator.js`: bonus cap in `calculateExcitement()` (line 133)
**Testing**
* Run distribution analysis after changes
* Target: 10+ bucket should be ~10-12%, not 17%
***
## Implementation Order
1. **Task 1** (Detrend drama) - Largest impact on correlation
2. **Task 2** (Move lead changes) - Completes metric separation
3. **Task 3** (Expand competitive range) - Addresses finish avg
4. **Task 4** (Reduce exponent) - Quick calibration
5. **Task 5** (Partial credit) - Nuanced improvement
6. **Task 6** (Top-end clustering) - Final tuning after other changes
***
## Success Criteria
After all tasks:
* Uncertainty-Drama correlation: <0.75 (currently 0.949)
* Finish average: 4.5-5.5 (currently 3.37)
* Score 10+ bucket: 10-12% (currently 17%)
* Overall distribution: mean ~6, std dev ~2.0-2.5
* Tier split: ~25% must-watch, ~25% recommended, ~50% skip
***
## Post-Implementation
1. Regenerate NFL 2025 weeks 1 and 18 with `--force`
2. Run distribution analysis script
3. Re-run canonical games benchmark
4. Bump version to 2.3
5. Update plan with actual results
