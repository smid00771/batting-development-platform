# Beta 0.8.62.264 — same-day copying and result timing

Copy previous team previously required an earlier calendar date. It now chooses the latest earlier, non-overlapping game for the same competition, format and grade/team, including an unfinished or unpublished morning game. The existing availability, duplicate-player, published-team and revision checks remain; copying never clears another team and retains Undo. The source time appears in the quiet success message.

Automatic PlayHQ results checks now begin at each playing day's expected finish in the club timezone. A recorded finish takes precedence; otherwise the shared selection-duration allowances apply: T20 3 hours 30 minutes, limited overs `overs × 8 + 45` minutes bounded to 3–10 hours, other formats 8 hours. Missing starts use 18:00 local. Two-day fixtures retain checks after Day 1 and start a fresh retry window after Day 2.

While the saved result is pending, successful checks schedule another check in 30 minutes during the first 24 hours, 2 hours during the next six days, and daily thereafter. A FINAL summary without the scorecard does not end these retries. Saved completed results retain correction checks every four hours through three days, daily through fourteen days, then weekly. Provider-error backoff and the existing five-minute scheduler remain. Time/format edits reschedule eligible jobs; the migration also rescheduled existing active-season jobs without changing selections, connection settings or active leases.

## Verification

- 83 focused app/demo checks passed, including copying the actual unfinished morning line-up, ordering three games by time, excluding overlapping/later/unknown-time/other-team sources, availability, Undo, server-rejection recovery and same-day saves/publication.
- `playhq_result_timing_test.sql` passed against the deployed functions. It exercises imports, manual time edits, summer/winter timezone handling, two-day timing, actual worker leases, a missing FINAL scorecard, saved final results and provider backoff. Its assertions also ran atomically inside the migration; synthetic rows were rolled back.
- Existing rollback suites passed: `playhq_automatic_fixtures_test.sql`, `automatic_results_sources_test.sql`, `automatic_results_batting_teams_test.sql`.
- Syntax, `git diff --check` and generated-demo freshness passed. The demo was rebuilt from the app and 43 shared modules.
- Live verification confirmed the 10:00 and 14:00 cup fixtures are due at 13:30 and 17:30 Australia/Sydney. Their selected-player counts and revisions were unchanged, polling remains enabled, and the scheduler queue had no overdue jobs.
- Supabase security/performance advisor findings are unchanged from the pre-migration baseline; no new findings were introduced. Existing findings remain outside this beta fix.

Applied migration: `20261024233132_playhq_expected_finish_results.sql`. Expected finish controls download timing only; it does not declare a match completed. Actual provider publication and scheduler workload determine when results become available.
