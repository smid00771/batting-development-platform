# Two-day scorecards wait until the match finishes

Automatic long-form result checks now start after the expected finish on the final playing day. Day 1 stumps and the interval between playing days no longer trigger repeated scorecard requests. The browser remains .365; this correction is entirely server-side.

The scheduler uses the last recorded playing date, its explicit finish time when present, and the existing start-time estimate in the club timezone. Missing results retain the normal half-hour retries after that final finish. Official early FINAL results, no-play outcomes, completed-scorecard corrections, T20 and limited-overs timing, and explicit manual checks keep their existing paths.

The same pending-result check protects both dispatch and worker claim. A stale queued job, resumed connection, old error retry or date changed after dispatch cannot bypass the final-day boundary. Existing lease, token, batch, entitlement and access checks remain in place. No new browser requests or provider polling were added.

The one-time queue adjustment moved 28 upcoming long-form result jobs to the final playing day's expected finish. Only due_at changed on those 28 jobs; all other jobs and job fields, fixture rows and connection rows were unchanged in the immediate before/after comparison. Later provider backoff remains later and active leases are retained.

Validation:

- 13 local PostgreSQL-model checks passed across the final-day regression, existing T20 timing and bounded dispatch suites. These cover weekly/consecutive days, date order, explicit finishes, daylight saving, missing starts, partial cards, final-day retries, early official finals, no-play, corrections, paused connections, leases, backoff and service-role claims.
- The live-schema SQL integration test passed with synthetic users/fixtures inside a transaction that rolled back. It exercises the actual import, rescheduling, worker completion, scorecard persistence and error paths.
- All three changed functions retained their prior grants and security mode. Security and performance advisor findings were unchanged.

Applied migration: `20261114084136_playhq_final_day_results.sql`. The migration copy and `Database/playhq_final_day_results.sql` are identical.

Deployed definition MD5s:

| Function | Before | After |
| --- | --- | --- |
| playhq_results_due | 34d645b1fd269b37f3c0055daf130203 | 6f41df72ae096b7af7c1fdedaf551076 |
| schedule_playhq_check | 1bbb6416cbcbe7415aad0615475ea48a | d755cbefdbf5bae015ffb3bc4c39f56c |
| playhq_sync_worker | 881c716134a3e8dfbef08cb89a962557 | a6ecd238e0bb1db026fbeaabf4cbc552 |
