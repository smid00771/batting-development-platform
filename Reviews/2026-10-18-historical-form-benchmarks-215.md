# Historical form benchmarks · 0.8.62.215

City's small current-season role groups were setting the form colours. This could leave a quick unrated while marking a spinner below guide, despite similar figures. The five NDCA seasons now set one fixed reference for each grade. Current-season records still supply each player's own figures.

## Source and calculation

The retained analysis contains 20 included exports: NDCA first through fourth grade for 2021/22–2025/26. Reuse its exclusions for mismatched/repeated exports, masked names and ambiguous name/club records. Batting includes valid positive-innings records, including ducks and all-not-out records; bowling includes valid positive-ball records, including wicketless spells. No minimum runs, wickets or exposure is applied to this historical population. Invalid denominators are excluded separately by discipline.

Pool totals, not individual averages. Batting average is total runs / total dismissals. Bowling uses total wickets / total balls × 100 and total conceded / total balls × 6. Bowling average is also displayed for context. There are no historical role or format fields, so the reference explicitly combines all recorded roles and formats. It is a broad guide, including all batting positions, not a role-specific prediction.

| Grade | Batting records | Runs / dismissals | Batting average | Bowling records | Wickets / balls | Runs conceded | Economy |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1,099 | 133,474 / 6,530 | 20.44 | 768 | 6,235 / 243,113 | 136,822 | 3.38 |
| 2 | 1,451 | 112,220 / 6,322 | 17.75 | 1,032 | 6,103 / 214,773 | 115,400 | 3.22 |
| 3 | 1,637 | 91,003 / 5,820 | 15.64 | 1,214 | 5,563 / 178,481 | 91,337 | 3.07 |
| 4 | 1,513 | 87,690 / 5,558 | 15.78 | 1,155 | 5,363 / 175,022 | 88,880 | 3.05 |

Records are player/grade/season entries, not distinct players. The four bowling samples retain 151, 212, 268 and 248 wicketless records respectively. Current player identity still relies on confirmed IDs, never name matching.

Reproduce with `python Tools/build_ndca_benchmarks.py /private/path/to/results/analysis.json`. The generated module contains aggregate totals and source hashes, never individual source records. The original exports and processed analysis remain outside the public repository.

## Behaviour

- Existing 25% batting thresholds and wicket-rate/economy balancing rules are unchanged; their reference is now fixed historical grade totals.
- Known current roles, complete figures and minimum innings/overs remain required. Unsupported competitions or grades remain unrated, with no club-peer fallback.
- Fewer than five batting or bowling innings is a simple early-sample label, not a statistical confidence claim or a new eligibility threshold.
- Grade conversion continues to use the separate same-player, same-club, same-season adjacent-grade guides. Population averages do not establish grade conversion.
- Proposed swaps retain batting position, quick/spin, frontline/part-time, keeper and opportunity checks. Teams are never changed automatically.
- One Form guide button presents explicit batting and bowling states; neutral states remain visible. Its dialog shows historical references, their pooled scope and the player's actual sample.

## Verification

Focused engine and UI checks cover independence from club-peer size and results, competition/grade scope, shared quick/spin references, early samples, insufficient figures and role matching. Regression cases include a second-grade 5/35 from 16 overs in two innings (strong), and first-grade 5/82 from 18.5 overs and 3/51 from 12 overs (both within guide). Browser checks cover phone and desktop widths and the shared form dialog.
