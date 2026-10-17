# Shared match results — 0.8.62.199

Clubs using Teams alone need every team's results for weekly awards. Imports were buried in Team of the Week, and Match Review did not automatically reuse a scorecard imported there.

One “This week’s results” checklist now serves all award screens. It compares shared scorecards with the club's fixtures and shows missing links, unfinished games, incomplete scores and no-play fixtures. The week, import and refresh controls appear once. Team selection graphics remain independent of results. Saving awards checks completeness and highlights any missing teams before the volunteer chooses whether to continue.

Teams and Match Review reuse the existing scorecard store. The new private table holds fixture associations and no-play reasons only. Match Review finds a linked scorecard automatically, or asks which match when more than one is plausible. Newer imports become the current version in both products. Coaching observations and score confirmations retain their existing explicit save step. Post-game team corrections retain the reviewed confirmation introduced in .198.

Validation:

- 48 relevant Node checks passed, including shared imports, award refresh, lost-response recovery, post collection, navigation, match-input handling and post-game lineup review.
- The migration compiled locally. Synthetic database checks passed locally and on the live project; all test records were rolled back.
- Database checks cover a Teams-only socials manager, coaching permissions, same-snapshot reuse in both directions, latest-source selection, all four award APIs, fixture identity, no-play undo and club/member boundaries.
- Security advisor warning counts are unchanged. The added informational RLS entry is the private, revoked, API-only fixture-association table.
- The public demo uses fictional shared scorecards and performs no external scorecard requests or real club changes.

Migration: `20261017054427_shared_weekly_results`.
