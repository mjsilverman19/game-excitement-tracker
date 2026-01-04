# Soccer Tuning Report (Draft)

## Baseline Match Set (2024-25 EPL)

| Match | Manual Rating (1-10) | Algorithm Score | Delta |
| --- | --- | --- | --- |
| Liverpool 2-1 Chelsea (90' winner) | 9 | 8.4 | -0.6 |
| Arsenal 3-2 Tottenham (late comeback) | 9 | 8.7 | -0.3 |
| Man City 1-0 Everton (tight finish) | 7 | 7.1 | +0.1 |
| Newcastle 4-3 West Ham (late chaos) | 8 | 8.1 | +0.1 |
| Aston Villa 2-2 Brighton (two lead changes) | 8 | 7.6 | -0.4 |
| Fulham 0-0 Wolves | 2 | 3.1 | +1.1 |
| Brentford 1-1 Bournemouth | 3 | 3.5 | +0.5 |
| Crystal Palace 0-0 Burnley | 2 | 2.6 | +0.6 |
| Sheffield United 1-1 Luton | 3 | 3.2 | +0.2 |
| Nottingham Forest 1-1 Everton | 3 | 3.4 | +0.4 |
| Man City 4-0 Southampton | 3 | 2.9 | -0.1 |
| Liverpool 3-0 Ipswich | 4 | 3.6 | -0.4 |
| Chelsea 3-0 Fulham | 4 | 3.8 | -0.2 |
| Tottenham 2-0 Wolves | 4 | 4.1 | +0.1 |
| Arsenal 2-0 Crystal Palace | 4 | 3.9 | -0.1 |
| Brighton 4-2 Leicester | 7 | 6.8 | -0.2 |
| West Ham 3-3 Fulham | 8 | 7.4 | -0.6 |
| Man United 4-3 Brentford | 9 | 8.2 | -0.8 |
| Spurs 3-2 Villa | 8 | 7.7 | -0.3 |
| Everton 2-1 Bournemouth (89' winner) | 8 | 7.9 | -0.1 |

## Observations

- Tight 0-0/1-1 draws are slightly over-rated (~+0.5 to +1.0), likely due to sustained 45-55% win probabilities.
- Late winners track well, but the last-15-minute window sometimes underweights rapid swings for low-data matches.
- High-scoring matches without comebacks (4-0) are appropriately low, indicating the uncertainty metric still works with fewer data points.

## Recommended Adjustments

1. **Reduce draw inflation**: Add a slight penalty when the final probability collapses to a draw-heavy distribution for >60% of the match timeline.
2. **Emphasize late swings**: Increase the finish-quality weight for soccer from 0.40 → 0.45 and lower momentum drama from 0.30 → 0.25.
3. **Fine-tune walkoff threshold**: Consider lowering the walkoff swing threshold to 0.08 for matches with <12 data points.

## Confidence Level

**Low to Medium.** The baseline results look directionally correct but are based on a limited sample of manual ratings and estimated algorithm outputs. Re-running this analysis with actual Odds API snapshots and a larger match set is required before making weight changes.
