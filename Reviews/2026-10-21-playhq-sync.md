# PlayHQ season sync — implementation checkpoint

## Approved flow

Import club season fixtures: select season and desired grades, map the club's
teams, review and import. Keep Enter fixtures manually using the existing flow.
Recheck dates, times, per-day grounds and cancellations. Preserve selections,
publication, bracketing, availability and coaching records. Never infer a
cancellation merely because a match disappears from a response.

Download available Day 1 figures as provisional, then update the same match and
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

## Implemented, offline only

`Functions/playhq-sync/public-api.mjs` implements the public client with complete
pagination, club filtering, fixture conversion, separate result conversion,
conservative change planning and a proposed result retry policy. Tests use two
examples extracted from the uploaded specification, plus simulated error and
partial-result responses. Run `node --test Tests/playhq_public_api_test.mjs`.

No database writes, scheduled jobs, connection UI or app controls are activated.
The module does not yet write into the existing scorecard pipeline.

## Remaining integration work

1. Resolve the HTTP 403 Request blocked response from the corrected seasons
   request. Do not retry through alternate routes to bypass an access block.
2. Verify real seasons, team ownership, grade fixtures, statuses, pagination and
   one ongoing two-day summary. Confirm provider polling limits.
3. Add per-club server-only credential storage and authorised connection setup.
4. Add explicit team mappings and a preview with manual-fixture linking to avoid
   duplicates. Preserve source match IDs across date changes.
5. Apply source updates transactionally with revision checks; retain publication
   and selector authority. Notify affected people of material fixture changes.
6. Integrate results with the existing shared scorecard and player-linking flow;
   verify source identifiers before joining existing history. Keep missing names
   unidentified and incomplete figures provisional.
7. Add bounded scheduled jobs with leases, throttling, retry/backoff and visible
   connection errors; auth failures stop polling. Add compact Check now.
8. Verify manual fallback, repeated imports, late scores, venue changes, Day 1/2,
   errors and cross-club isolation before enabling the live workflow.
