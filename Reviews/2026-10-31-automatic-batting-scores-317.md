# Automatic shared batting results — 0.8.62.317

Completed PlayHQ results were saved for Select but reached Club Batting only through a separate Match Review score import. Deferred result and identity triggers now populate the canonical batting innings when the existing shared download is saved, or when a missing identity is confirmed later. Match Observation, Match Review and player innings read those records normally; no additional provider request, startup calculation or manual import is needed.

The sync checks the latest completed scorecard, exact source/team/fixture identity, dates, format, product access, active confirmed players and participating teams. It reuses explicit fixture links and older review-to-fixture evidence before considering an unambiguous legacy innings. It preserves comments, reflections, preparations, manually corrected scores, official prediction-result guards and uncertain identity/source conflicts. It does not publish selections, create coaching assessments, or send messages. DNB, zero, not-out and separate innings remain distinct. The private transaction-scoped write ledger cannot be forged through application roles. Unchanged deliveries do not change innings revisions.

The Season stats wrapper was callable by authenticated clients, but its checked private implementation was not. Restore the missing EXECUTE permission while retaining membership, product, role and fixture scope checks. Integration checks now run the public RPC under the actual authenticated database role, including rejected ordinary-player and outsider calls.

Rename the optional Selections reload to **Reload latest changes**. It reloads saved changes made by other staff and does not request PlayHQ downloads. Fix the observation facts row's CSS specificity so the innings choice remains readable at phone width. The generated demo simulates completed-result delivery from its existing fictional scorecards and confirmed identities.

## Verification

- 47 focused delivered-demo/UI checks passed: automatic score display for linked and Batting-only clubs, comment-only saving, fixture identity/retry, multiple videos and shared stats navigation, filters and permissions.
- Real-schema synthetic SQL checks passed and rolled back: deferred delivery, existing comments/legacy review identity, later identity confirmation, source corrections without a signed-in coach, manual correction protection, DNB/zero/not-out, second innings, unfinished results, team opt-out, standalone Batting, Select-only exclusion, private-write protection and normal observation readback.
- Shared Season stats SQL scope suite passed under authenticated client permissions. A real authorised City read returned 29 saved cards and 92 fixtures.
- City's eligible saved results were reconciled: 193 innings are linked to automatic source tracking. Liam's 31 October innings reads 44 from 58 through the authenticated observation API. Existing coach contributions, player reflections, preparations, innings identities and fixture/selection records were hash-checked unchanged. Conflicting historical source links and ambiguous legacy innings remain protected rather than being silently merged.
- Syntax, generated-demo freshness and whitespace checks passed. Desktop and 390px phone views inspected using the delivered shared UI and fictional data; evidence is in `assets/scores-317-*.jpg`.
- Advisory comparison: one expected private RLS table without application policies and one initially unused FK-supporting index; no new unindexed FKs or anonymous executable functions. The ledger denies application-role table access.
- Broader checks found five existing failures in rolling-date availability/drop-reminder demo tests. All five reproduce against the unmodified .316 delivered demo; they are not regressions introduced by this change. The focused release suite is fully passing.

## Database rollout

Applied migrations: `20261031084321_automatic_batting_scores.sql`, `20261031084615_season_stats_rpc_permission.sql`, and `20261031084904_automatic_batting_review_identity.sql`. The last migration adds explicit legacy review fixture evidence without relaxing conflicts. `Database/automatic_batting_scores.sql` contains the resulting implementation; the chronological migration files retain their applied definitions.
