# Beta 0.8.62.266 — rates within the match

The preceding award guide compared bowling with the rest of the attack, but credited only 60% of the difference and capped it at one wicket's value. Batting pace credit stopped growing at twice the match rate. The shortlist still required runs or wickets, so an exceptional economical spell could miss consideration. The user asked for match-relative economy and strike rate to carry more weight, without automatically preferring senior grades.

Both weekly awards now explain batting strike rate against all other batters across both teams, and bowling economy against the rest of the club's own attack in that innings. Each reference pools recorded runs and balls, excludes the candidate, and uses the saved scorecard's identities. It is never an unweighted average of player rates or a comparison with an unrelated grade. Separate innings keep separate bowling comparisons.

## Changes to the guide

- Base credit remains one point per run and 20 per wicket, counting both skills.
- Limited-overs batting pace: half the runs above the other batters' rate over the candidate's actual balls faced, floored at zero and capped at half their runs. At least 20 runs, 10 balls faced and 30 other-batter balls are required. Twice and six times the match rate now receive different credit. There is no slow-batting penalty or long-form pace bonus.
- Bowling control: one point per run below the other club bowlers' rate over the candidate's actual spell. At least 12 candidate balls and 18 peer balls are required. Credit is capped at six points per over and 60 points per innings to constrain short spells and extreme reference rates. No additional maiden bonus.
- A bowling contribution qualifies for consideration with two wickets **or** at least 20 control points. One- and zero-wicket spells can therefore enter either shortlist and show their bowling figures on the proposed graphic. Qualifying does not guarantee selection.
- Generic format-rate fallbacks have been removed from both skills. Missing peer runs or balls add no rate credit. Missing peer wickets also prevent wicket-rate credit. An absent batting innings cannot be presented as a complete match batting comparison.
- Raw runs conceded no longer break equal overall or bowling ratings across matches when workload/context is absent. Actual tied ratings remain available for a human choice.
- Existing innings-share, chase-completion and wicket-taking-rate components remain. No grade, age, reputation, opposition-ranking or inferred-pitch multiplier is added. Opposition table position remains deferred.

The existing explanation text shows compact comparisons such as `SR 200 vs rest of match 37` and `Econ 4.50 vs team-mates 5.41`. These describe full saved innings; they do not claim knowledge of conditions or phases absent from the scorecard. No new settings or screen rows are added.

This remains a transparent award heuristic, not a calibrated measure of match-winning probability or a promotion model. Human selections, saved editions, artwork, publication review and source scorecards are preserved. No database changes are required.

## Verification

Validation covers higher-scoring versus low-scoring matches, meaningful economical spells with one or no wickets, weighted references, exclusion of the candidate and opposition attack, short-spell bounds, missing context, partial overs, source identity, both award screens and saved-selection recovery. Test fixtures use fictional identities. The private saved-week replay is kept outside the repository.

- All 80 checks passed across scoring, the two award UIs, award scopes, Day 1 scores, publishing, recovery, week navigation and demo roles. Posting was mocked.
- After the final missing-data and manual-pick corrections, all 36 focused scoring and award UI checks passed again. The delivered-screen test selects a qualifying wicketless spell, removes and manually re-adds it, reloads scores and confirms the bowling display survives; Player of the Week also offers it without choosing a winner.
- The actual generated demo was inspected at 1440px and 390px, with both relative-rate explanations visible. No browser errors or whole-page horizontal overflow; the existing ranking table retains its horizontal scroll.
- Syntax, whitespace and generated-demo freshness checks passed. The shared demo includes all 44 modules.
- A read-only replay of the previously saved week retained the fast unbeaten 60 plus 1/5 at #1 and 38 plus 2/22 at #5, while differentiating the three-wicket examples by their own match comparisons. No live results or selections were written.
