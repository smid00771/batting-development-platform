# Automatic season fixtures and saved setup — prepared 0.8.62.238

Status: prepared, not deployed. Supabase apply_migration returned “Migration was declined” during automatic approval review on 21 October. No reason was supplied. Live migration history confirms this migration was not applied. Do not merge the frontend until database integration validation and the matching Edge Function deployment succeed.

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

The synthetic transaction-rollback database test is prepared in Tests/playhq_automatic_fixtures_test.sql but has NOT run because the required migration was declined. It covers matching, idempotency, manual overrides, protected dates, same-match dual club teams, background discovery and stale leases. Database implementation is not yet claimed validated. No physical browser/device verification was available.

## Release sequence after approval

1. Apply the prepared migration; run the synthetic rollback test and relevant existing database tests; correct any failures before release.
2. Deploy the matching playhq-sync Edge Function with its existing verify_jwt=false setting and internal request authentication intact.
3. Run an authorised fresh season check for the pilot's saved mappings; verify all available fixtures, preservation of existing selections and regular scheduled checks.
4. Merge frontend release, confirm Pages completion and exact live asset contents.

## New requirements retained for the next implementation

- Small Add Selection Group and Add team flows after initial setup, without redoing existing choices.
- Source identity/competition review and an undo operation for an incorrect import/link. Preserve selections, captains and history; remove only demonstrably untouched imported drafts, with clear treatment of anything already used.
- Per-group selector visibility, editing and Head Selector/publication responsibility. A club-wide Head can view all while editing/overseeing only chosen groups. Groups with their own nominated Head operate independently. Relinquishing oversight requires a replacement Head Selector, who receives Publish teams rights for that group; the handover must not leave a publishing vacancy.
- Invite people who do not yet have an account with exact saved group grants. Acceptance must verify the intended account and must not broaden permissions.
- Enforce view/edit/publication boundaries on server endpoints, not only UI controls; preserve other legitimate player/captain roles. No invitations have been sent and no existing permission assignments have been altered.
