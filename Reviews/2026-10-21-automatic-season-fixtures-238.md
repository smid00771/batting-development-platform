# Automatic season fixtures and saved setup — 0.8.62.238

Status: approved database migration 20261021100007 applied; Edge Function version 4 deployed with existing internal authentication. The initial automatic approval rejection was resolved by the user's explicit approval. Frontend release follows backend validation.

Live pilot: 11 fresh provider checks returned HTTP 200. All 66 available fixtures loaded (50 new, 16 existing linked); no deferred matches. All original selections, published snapshots, review state and season captains compare unchanged. New fixtures are blank unpublished drafts. Last senior playing day is 6 March 2027. Development League currently ends 24 October; two women's teams await source grade metadata. Verified season polling and the five-minute job dispatcher are active.

## Confirmed problem

The club's 12 grade mappings and Selection Groups were saved. The returning importer did not restore the season from the server, making a completed setup look empty. The provider's ordinary UPCOMING status also set requires_review, blocking future fixtures in the checkbox preview. Ten trusted team previews contain 66 games, including senior fixtures beyond 24 October. The Development League previews currently contain only 17 and 24 October; subsequent checks must discover later releases. Women's teams still lack provider grade metadata.

## Prepared changes

- Persist the active season, restore saved groups on return, and display loaded-fixture count/date and automatic-check status.
- Saving setup queues metadata and fixture checks. The browser also imports all fixtures for confirmed saved mappings immediately, with a one-click retry and explicit confirmation that groups remain saved if a download fails.
- Accept valid dated fixtures without a venue, opponent name or recognised provider status. Defer only unsupported schedules/formats and ambiguous existing-fixture matches.
- Reuse a unique existing grade/date/format fixture, with stricter opposition matching for double headers. Match source teams by IDs. Two club teams may have separate fixtures for the same source match.
- Preserve preferred names, grade IDs, picks and later manual overrides. Changes to published fixtures, scorecard-linked fixtures, or selected playing dates retain review. Completed fixtures remain unchanged.
- Scheduled metadata checks can fill a previously missing source grade for an already linked team. Fixture checks discover new games and update safe details. Existing key, club, generation and lease checks remain in place; 401/403 pauses checks.

## Validation

36 focused Node tests pass across PlayHQ parser, Edge handler, import UI and Selection Group setup. New cases cover UPCOMING with no venue, one bad schedule among otherwise valid games, scheduled metadata discovery, new-session restoration, immediate imports and recovery after a fixture fetch failure. JavaScript syntax and git diff whitespace checks pass.

The synthetic transaction-rollback database test in Tests/playhq_automatic_fixtures_test.sql passes, including published arrangements and completed-fixture protection. The existing pending-source-grade database test also passes. It covers matching, idempotency, manual overrides, protected dates, same-match dual club teams, background discovery and stale leases. No physical browser/device verification was available.

## Release sequence

1. Completed: applied migration and validated synthetic database regressions.
2. Completed: deployed Edge Function version 4 with existing verify_jwt=false and internal authentication.
3. Completed: fresh pilot season and all ten ready-team checks; 66 linked fixtures, preserved selections/captains, active scheduling.
4. Merge frontend release, confirm Pages completion and exact live asset contents.

## New requirements retained for the next implementation

- Small Add Selection Group and Add team flows after initial setup, without redoing existing choices.
- Source identity/competition review and an undo operation for an incorrect import/link. Preserve selections, captains and history; remove only demonstrably untouched imported drafts, with clear treatment of anything already used.
- Per-group selector visibility, editing and Head Selector/publication responsibility. A club-wide Head can view all while editing/overseeing only chosen groups. Groups with their own nominated Head operate independently. Relinquishing oversight requires a replacement Head Selector, who receives Publish teams rights for that group; the handover must not leave a publishing vacancy.
- Invite people who do not yet have an account with exact saved group grants. Acceptance must verify the intended account and must not broaden permissions.
- Enforce view/edit/publication boundaries on server endpoints, not only UI controls; preserve other legitimate player/captain roles. No invitations have been sent and no existing permission assignments have been altered.
