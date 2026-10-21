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

## Implemented

Version 0.8.62.234 adds Import season fixtures and retains Enter fixtures manually.
The import panel loads seasons and club teams, maps selected grades, previews games,
and explicitly links matching manual fixtures before idempotent import.
Credentials stay in Vault; the browser never receives a saved key.

Private RLS tables, explicit RPC grants, membership checks and existing fixture
save guards protect imports. Source changes are staged for review, never silently
applied to published selections. The worker uses leased jobs and one-use scheduler
tokens, bounded retries and stops polling on authentication failures. Future
results are not due before the first playing day plus eight hours. Summary storage
retains provisional results and subsequent updates to the same source match.

The database migrations and edge function are deployed. City’s previously supplied
key was saved with explicit user approval on 21 October. No provider verification,
real fixture import or automatic polling has been completed. The cron is inactive.

## Verification

15 adapter and edge tests pass. Transactional database tests passed and rolled back:
private permissions, draft import, repeat-import idempotency, future result timing,
unverified activation rejection, scheduler token rejection and 403 stopping polling.
Syntax and whitespace checks pass. No browser/physical-phone test was performed.

## Remaining integration work

1. Resolve the environment HTTP 403 Request blocked response without bypassing it;
   verify real seasons, fixtures, provider limits and an ongoing two-day summary.
2. Add review/application of staged fixture changes through existing revision and
   publication guards, with material-change notifications.
3. Feed normalized results into the shared scorecard/player-linking pipeline after
   verifying source IDs. Stored summaries do not yet supply Season Stats or awards.
4. Finish Check now and activation controls after live coverage verification.
5. Validate delayed scores, corrections and Day 1/2 before enabling scheduled sync.
