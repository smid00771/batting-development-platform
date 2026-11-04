# Same-day scorecards and fixture order — 0.8.62.343

The 25 October morning cup team's saved result was present, but importing the afternoon scorecard had removed ten shared players from the morning selection. Re-importing the morning card then failed because those players were already confirmed in the afternoon game. Both paths treated a shared date as a clash despite the separate 10:00 and 14:00 starts.

## Changes

- `scorecard_team_plan` now uses the existing time-aware selection-overlap helper before transferring players or rejecting an already-confirmed team. Draft and published times are compared independently.
- `recover_completed_scorecard_team` uses the same rule when deciding whether a completed scorecard can recover an unpublished team automatically.
- The Selection Board keeps the established team sequence and sorts each team's same-date games by start time. Equal times retain their order; unknown or invalid starts come last. This uses loaded data only, without requests or polling.
- App cache versions advance to 0.8.62.343. The shared-source demo is rebuilt at that version.

Actual overlaps, unknown times, independent published selections, bracketed dates, source identity, completed/latest-scorecard requirements, revisions and identical-request retry retain their protections. No access grants, scheduling rules or Edge Functions change. The existing three-hour T20 selection allowance remains separate from the earlier automatic-results timing update.

## Production repair

Migration `20261104115641_same_day_scorecard_teams` was applied with guards on the exact previous function definitions. New definition hashes:

| Function | MD5 |
| --- | --- |
| `scorecard_team_plan` | `d44c200de3d59ac9189b72268259cd75` |
| `recover_completed_scorecard_team` | `bc6e6fafb068986dbd7a5c2f35d1108c` |
| `fixture_day_conflict` (unchanged) | `1b0ea1a88d3f8b3abc04929cb65acda1` |

A guarded, locked transaction restored the morning team's original eleven, batting order, captain and keeper from its first publication after verifying the exact same eleven confirmed identities in the latest completed source scorecard. The authenticated public import API created publication version 3; older publications remain in history. All ten pending flags cleared. The afternoon fixture's complete row and both saved scorecards were unchanged. The exact repair first passed with rollback, then committed with the same assertions and an explicit audit record.

## Validation

- 37 scorecard database and UI tests pass, including reproduction of the destructive old behavior, authenticated public API repair, automatic recovery, real and unknown-time clashes, separate draft/published clocks, bracketed dates, stale previews, private helper access and retry.
- 15 Selection Group, fixture-refresh and full-demo unavailable-player tests pass, including chronological ordering, stable team/equal-time order, unchanged source arrays and no extra navigation requests.
- Existing live-schema scorecard SQL regression passes under rollback: published-team correction, three-team chain, gaps, history, retry, stale revisions, new players, permissions and bracketed dates.
- JavaScript parsing, demo build/freshness and whitespace checks pass.
- Browser verification using the rebuilt demo with fictional double-header fixtures: desktop morning card at x=20, afternoon at x=351; 390px phone view morning at y=488, afternoon at y=1402. Both cards retain eleven players and their confirmed status.
- Security and performance advisor counts are unchanged from the pre-migration baseline; this patch adds no findings or privileges.

The production data repair and backend rule are already applied. GitHub Pages serves the versioned frontend through the existing release workflow; publication is verified separately after upload.
