# PlayHQ season sync — implementation checkpoint

## Approved flow

Import club season fixtures: select season and desired grades, map the club's
teams, review and import. Keep Enter fixtures manually using the existing flow.
Recheck dates, times, per-day grounds and cancellations. Preserve selections,
publication, bracketing, availability and coaching records. Never infer a
cancellation merely because a match disappears from a response.

Download available Day 1 figures, then update the same match and
innings after Day 2. Retry missing or manually delayed scores; periodically
recheck corrections. Missing scores are not zero. No automatic award publication.
Each subscribing club supplies its own API key. No team-list writeback to PlayHQ.

## Confirmed public contract

Source: user-supplied `playhq-openapi.yml`, 21 October 2026. Requests use GET,
`x-api-key` and `x-phq-tenant: ca`; no Bearer token or private endpoints.

- `/v1/organisations/{id}/seasons` (association organisation)
- `/v1/seasons/{id}/teams` (filter `club.id`, not club name)
- `/v1/seasons/{id}/grades`
- `/v2/grades/{id}/games` (rounds, byes, schedules, teams, playing surfaces)
- `/v2/games/{id}/summary` (individual batting/bowling appearance statistics)

Newcastle City organisation: `2a11b05e-101c-4196-a4ef-8c446635cd8f`.
NDCA organisation: `0f318d4d-b0f1-4251-81e2-f909a2b1b295`.

The specification does not enumerate all cricket game statuses. Only documented
FINAL is treated as complete. Live Day 1 data coverage still needs verification.
Appearance IDs are not assumed to equal existing PlayCricket participant IDs.
Hidden names remain null. The fixture examples show UTC timestamps: convert using
venue/club timezone before assigning dates to availability or selections.

## Implemented through 0.8.62.235

The import panel loads seasons and club teams, maps selected grades, previews games,
and explicitly links matching manual fixtures before idempotent import. Manual
fixture entry remains. Credentials stay in Vault and are never returned to the browser.

Fixture changes have a current/proposed preview and revision-checked apply action.
Existing publication locks and linked-record correction guards remain in force.
Check scores now and Check fixture changes are available on linked fixtures.
Explicit cancellations are retained; a missing match never means cancellation.

The worker now stores a shared scorecard, using separate PlayHQ namespaces for
matches, teams, innings and match-scoped appearances. Fixture results, completed-match
Season Stats and awards consume it. Identified club teams come from the verified
provider filter; player histories still require explicit links. Hidden names stay
unidentified. Known final WON/LOST outcomes come from source outcomes, not totals.

Each award offers Include Day 1 scores only when an unfinished two-day game has
figures after the first day, or reported stumps on that day. The default is off.
Team/Player of the Week, centuries and five wickets use normal figures and graphics.
An optional unfinished Results graphic says MATCH UPDATE and IN PROGRESS. The option
is separate per award; it does not change stored match completion or season totals.
Saved Day 1 graphics remain usable with the checkbox off, subject to score corrections.

Database migrations and both scorecard edge functions are deployed. City's key was
saved with explicit approval. The connection is still unverified, polling is disabled
and the scheduler is inactive. No live provider import or browser/device check is claimed.

## Verification

- 19 PlayHQ adapter/edge tests: public headers, pagination, club filtering, date/time
  conversion, private names, immutable source identities, corrections and error handling.
- 16 season-stat tests: final-only totals, corrected snapshots, no inferred identities,
  batting/bowling averages, roles, grades and unknown figures.
- Fixture/shared results and award UI checks: one scorecard, manual fallback, scoped
  Check now, review/apply, mapping order, compact Day 1 checkbox and normal milestones.
- Real canvas rendering verifies MATCH UPDATE/IN PROGRESS instead of a final WIN.
- Rollback database checks cover Day 1 timing, default-off, all award saves, source
  isolation, saved graphic freshness, import idempotency, throttle, revision checks,
  publication lock, team position preservation, namespace links and cancellations.
- Existing award correction/publishing regression checks passed with synthetic rows
  rolled back. Syntax/whitespace checks pass. No browser or physical-phone test performed.
- Security advisor flags for the PlayHQ private tables are intentional deny-all RLS;
  the authenticated security-definer entry point checks current membership before access.
  Worker/store helpers are not executable by clients. See
  https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.

## Remaining provider verification

Resumed after the interrupted conversation on 21 October: 63 automated checks and
both Day 1 / fixture-review database suites pass. The database suites roll back all
test changes. Deployed edge-function files and the five follow-up migrations match
the recovered source exactly. The missing baseline migration file was restored from
its matching deployed source. Browser layout verification remains unavailable in the
current runtime; the UI checks use a DOM and real canvas rendering, not a phone browser.

Resolve the environment HTTP 403 Request blocked without bypassing it. Then verify real
seasons/fixtures, provider limits, delayed entries, corrections and ongoing Day 1/Day 2
coverage before activating scheduled checks. The current interface deliberately has
no activation button before those checks. Match-scoped appearance IDs cannot establish
cross-match player identity without confirmed links/provider guidance.
