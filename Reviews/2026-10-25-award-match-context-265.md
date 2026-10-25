# Beta 0.8.62.265 — award match context

Team of the Week previously scaled each player against the week's highest runs and wickets, took the larger of those two ratings, and added a limited bonus only from 20 runs and two wickets. Balls faced, overs, economy and the innings context were unused. This reproduced the reported #13 for the fast unbeaten 60 plus 1/5, and #15 for 38 plus 2/22.

Both weekly awards now use `award-performance.js`. Batting and bowling are added together, including a single wicket. Saved scorecards supply scoring pace, share of the innings, finishing a chase, bowling workload, economy against the rest of the attack and wicket-taking rate. The same private week replay moves those two performances to #1 and #5. Those are suggestions under this guide, not an automatic award decision.

## Scoring guide

This is a transparent heuristic, not a calibrated prediction of match-winning probability. All grades retain equal weight. Ratings no longer depend on another player's highest score or wicket tally, or on which other grades are included in an award.

| Component | Rule |
| --- | --- |
| Runs and wickets | One point per run plus 20 per wicket; both always contribute. |
| Scoring pace | Limited-overs innings only, at least 20 runs and 10 recorded balls. Up to 25% of runs for scoring faster than the other batters in the match, excluding the candidate. No slow-batting penalty. |
| Innings share | Runs × 30% × fraction of the recorded complete innings total. This recognises an innings that supplies most of a small chase without making tiny scores disproportionately valuable. |
| Completing a chase | Up to six points, scaled at 10% of runs, for remaining not out in an unambiguous completed limited-overs chase. Requires two completed innings and the saved result naming the club as winner. Excludes retired/absent batters and provisional results. No target is invented. |
| Sustained economy | At least 12 recorded balls. 60% of runs saved against the other bowlers' recorded rate in that innings, capped at 20 points per innings. Credit scales with the actual workload. No additional credit for maidens: that would double-count economy. |
| Wicket-taking rate | Up to 15% of wicket points for a faster strike rate than the rest of the attack, requiring at least two peer wickets and 18 peer balls. |

Rate comparisons require complete denominators. Missing balls, zero denominators and incomplete peer figures never become zero-rate facts. Without reliable peers, positive rate credit may use the disclosed format guides: batting 80 SR for limited overs or 125 for T20; bowling 5.0 economy for limited overs, 7.5 for T20 or 3.0 for long form. Unknown formats get no format adjustment. Long form receives no limited-overs pace or chase-finish bonus.

Context joins by snapshot, team, match and player IDs, never names. Bowling overs are converted to legal balls; 7.5 means 47 balls. Separate innings retain their exact figures. Rankings explain recorded rates and significant innings shares in the existing comparison area. The phone table now scrolls horizontally rather than splitting headings and figures into unreadable fragments.

There is no manual opposition rating, inferred pitch rating, table-position multiplier or invented pressure narrative. Opposition table position remains a possible later feature. The club retains final choice; scope settings, recent-winner preference, saved editions and publishing controls remain intact. No scorecards, database schema, saved winners or posted graphics are changed.

## Verification

- Reproduced the two reported ranks from a read-only query of the saved week, then replayed those same candidates and scorecards locally. The source data stays outside the repository; committed fixtures use fictional identities.
- All 30 focused award checks passed. They cover both skills, small chases, workload, economy relative to peers, wicket-taking rate, missing figures, partial overs, provisional games, completed wins, retirements, scope independence and context identity checks.
- The delivered demo integration test checks both award screens and confirms that score reload retains the same context in Team of the Week's shortlist as in its ranking. It also checks that Player of the Week still requires a human choice.
- The broader run passed 52 checks covering award scope, Day 1, refinement, recovery, publishing and demo journeys; the two existing navigation failures are recorded below. Posting was mocked.
- Two broader demo navigation tests fail on a missing `data-stats-compare` control. Both failures were reproduced unchanged on baseline `ade94a4`; they are unrelated to the award changes and were not altered here.
- The generated demo was rebuilt from the app and 44 shared modules. Desktop (1440px) and phone (390px) views were visually inspected in Chromium. Syntax, generated-demo freshness and whitespace checks were run.

The user explicitly authorised publishing these tested changes to the existing GitHub repository and deploying the beta update on 25 October 2026. This release requires no database migration.
