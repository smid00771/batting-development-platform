# Selection Groups database timeout fix

The v0.8.62.236 group-scoping change caused Teams & availability to fail with
`canceling statement due to statement timeout`. The authenticated RPC limit is
8 seconds. On the affected club's 16 fixtures, `selection_followups` still timed
out with a 20-second diagnostic limit. PostgreSQL identified the nested
`selection_scope` / `fixture_selection_group` / `fixture_group_id` lookup.

Both follow-up queries now materialize each draft and published fixture's scope
before joining fixtures and player slots. The omission query reuses the resolved
draft scopes when checking whether a player was selected elsewhere. Its picked
fixture set still includes no-play fixtures, while candidate and prior fixtures
retain their existing no-play exclusions. Season, format, date, availability,
movement keys and permission rules are unchanged.

## Validation

- The optimized query took 246 ms on the affected club. Its 26 rows matched the
  pre-group competition-scoped query exactly (`EXCEPT ALL` in both directions).
  The club had no groups configured, so this was the applicable legacy behavior.
- After deployment, the full `club_selections_api(..., 'context')` call completed
  in 645 ms under the authenticated database role and a 5-second timeout. The
  diagnostic transaction was rolled back, including any routine context syncs.
- `Tests/selection_groups_database_test.sql` passed: club-defined groups, existing
  grades and captains, trusted discovery, permissions, retries, group movement
  boundaries and club-wide duplicate-date checks.
- `Tests/selection_group_performance_test.sql` passed with 24 populated fixtures,
  six grades, 66 players, explicit and legacy grade mappings, nine grade drops
  and six omitted players. Unconfigured/configured full context took 586/247 ms;
  follow-ups took 415/95 ms. The test enforces budgets below the 8-second RPC limit.
- `Tests/selection_followup_database_test.sql` passed, including private marker
  visibility, spoken-status retries, publication locks and added/removed player
  notification records. Added an explicit outer rollback to its existing
  subtransaction rollback before executing it.
- Confirmed no performance-test users or clubs remained after rollback.
- Reviewed the query diff and checked whitespace. No frontend or browser change
  was needed; the app remains v0.8.62.236. Browser rendering was not retested.

## Deployment

Applied migration `20261021075425_selection_group_query_performance` to the
existing Supabase project. Deployed SQL MD5: `cf6bc3e36a3c3a5b13f12d4eb2b3f927`.
The migration replaces only the two private query functions and preserves their
signatures, privileges and empty search paths. It does not change club data or
increase the request timeout. Retry works with the already-loaded frontend.

Performance advisors still report pre-existing foreign-key/index and RLS policy
findings elsewhere in the project. This migration adds no tables or indexes.
References: [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
and [multiple permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).
