# Beta 0.8.62.265 — completed-match correction controls

Completed matches with downloaded results previously kept the same prominent unlock panel as upcoming teams. A locked fixture with a saved final scorecard now omits that panel from the Selection Board. Its existing authorised unlock action is under a collapsed **Emergency correction** option below the scorecard in **Fixture details & results**. This removes routine height from completed team cards.

Upcoming games and unfinished scorecards retain the normal controls, including after play begins. An active correction window retains **Lock again** on the board. No lock rules, expiry, publishing authority, player selections or results are changed. A newly loaded final scorecard moves the drawer control immediately; stale responses cannot change another drawer or club.

The guarded selection context adds one boolean per already-visible fixture, using its latest explicitly linked, club-scoped saved scorecard. Match dates and elapsed time do not establish completion. Existing indexes support the lookup, and existing API grants are preserved. The demo supplies the same metadata from its fictional linked scorecards.

## Verification

- All 67 targeted app/demo checks passed across fixture drawers, scorecard loading, emergency handover, previous-team copying and unavailable-player handling.
- The delivered demo integration check opens an actual completed fictional match, expands the emergency option, unlocks through the simulated RPC, and verifies **Lock again** on the board. Network access remains blocked in the test.
- The SQL regression suite passed for today's completed result, an unfinished two-day game, missing and other-club scorecards, no-play status, latest-snapshot changes, outsider access and unchanged fixture records. Assertions also ran atomically during the migration; synthetic records were rolled back.
- Syntax, `git diff --check` and generated-demo freshness passed. The generated demo uses the app and 43 shared modules.
- Supabase security/performance advisor findings match the baseline; no new findings were introduced. Existing findings are outside this UI change.
- The fixture-scorecard test harness now supplies the existing time formatter and published-team renderer used by the real card; its lock/read-only assertions pass.

Applied migration: `20261025001453_completed_fixture_result_state.sql`.
