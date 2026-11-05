# Championship totals calculated on changes

Opening Club standings previously added up Championship points on the server for each fresh page request. It now reads one saved Championship table. The existing ladder cache and ten-minute browser reuse remain unchanged.

## Behaviour

- Changed source ladders rebuild only the enabled club Championships that use that season and competition. Calculation settings rebuild their own club's table in the same transaction, before the save response is returned.
- Repeated player reads, identical provider responses, identical settings saves and audience-only changes do not invoke the calculator. Provider checks retain their four-hour schedule and result-triggered updates.
- Unchanged checks and provider failures update freshness metadata without recomputing points. Old-data warnings still reflect elapsed time. Missing source data suppresses rankings; disabling Championship removes its saved table, and re-enabling rebuilds from current sources.
- Private tables and calculation helpers have no client grants. Public membership, staff, settings and independent audience checks are unchanged. Readers take no write locks.
- Concurrent writers serialize per club. Existing jobs are excluded before enqueue insertion, so settings saves do not contend with a worker's already leased job rows while holding the totals lock.

The verified Championship formula is copied unchanged into an internal calculator. Existing enabled Championships are populated during migration; there is no calculate-on-read fallback. Frontend files and UI version 0.8.62.345 do not change.

## Verification

- Eight targeted database/demo tests passed. An instrumented calculator proves zero calls during repeated authenticated page requests, unchanged checks, freshness/error updates and identical settings. Tests cover shared-competition updates, disabled clubs, season isolation, changed multipliers, source deletion/recovery, initial population and private helper/table access.
- The live synthetic suite passed through authenticated public RPCs and production triggers. It verified immediate cached settings results, unchanged cache rows on reads, unchanged calculation time after identical checks/saves, correction updates, freshness warnings, incomplete rankings and private-statistics restrictions. All synthetic users, club and data rolled back.
- Existing City standings were identical before and after migration: complete table, 348 points and first place at verification. The live reader contains no calculator call.
- Post-deployment advisors found no new security/performance warnings or unindexed foreign keys. The additional RLS-without-policy notice is intentional for the private cache; its primary key covers the foreign key.

Applied migration: `20261105052012_cache_championship_totals`. No new browser requests, polling, Edge Function changes or scheduled calculation job.
