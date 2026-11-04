# Player identities and usual teams — 0.8.62.341

PlayCricket name variations now suggest an existing player for explicit confirmation. The saved source identity remains linked; a confirmed source spelling also survives providers that issue a new appearance ID for each match. Ambiguous names or conflicting existing identities stay unresolved. Unmatched completed scorecards appear in a compact Selection Board disclosure using the existing context read.

PlayCricket names remain the default. Editing a name in Mirelion marks it as the chosen display name, preserving it on later identity confirmations and registration imports. Multiple usual teams are edited through checkboxes in Playing List and Player details. Search, team filters and availability scope include every saved usual team, without listing the same player twice.

Two specifically requested duplicate pairs were consolidated in a guarded transaction. The canonical batting ID and saved innings were preserved byte-for-byte; the linked account was retained, three existing provider links remain, and all current draft/published selection references now use the retained IDs. The empty batting duplicate is inactive, its future plan date was moved, and the two usual-team assignments were combined. Prior publication versions and before-merge audit records remain available. No player notifications were sent.

## Validation

- 69 passing UI/name-matching/demo/refresh tests across six test files.
- Isolated PGlite integration applies the exact migration to the recorded preceding function definitions. It verifies published/current selections, captain/keeper IDs, availability precedence, retained innings, future plan dates, account protection, established-history rejection, authenticated saves, stale revisions, idempotent retry, duplicate-name rejection, default/imported names, deliberate short names, remembered later appearances, ambiguity and private-table access denial.
- Browser QA at desktop and 390px phone width: choose two usual teams, save, and confirm both displayed together; phone controls remain readable with reachable Save.
- Existing fixture refresh tests verify date/group changes stay local, short returns remain quiet, and stale responses cannot replace edits.
- Demo rebuild and freshness check, JavaScript parsing and git whitespace checks passed.

## Database rollout

Migration `20261104034932_player_identity_preferences_guarded_341` was applied successfully. The deployment adds two optional roster fields and private tables, makes only reviewed function-fragment changes, and leaves existing rows untouched until an authorised save/merge. Every replaced function is guarded by its original and resulting definition hashes. Lock and statement timeouts bound deployment waits; all changes are transactional. Existing API grants are unchanged. No global alias seeding or roster backfill is performed.

Security-advisor warning counts are unchanged. The two new private tables produce the expected informational RLS/no-policy notices: direct client access is revoked and authenticated integration tests verify denial. See [Supabase RLS linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Recovery

The preceding function bodies are in `Tests/fixtures/identity_preferences_before_341.sql`. A reviewed rollback can restore those bodies and the preceding client while retaining added columns/tables and all identity audit records. Do not automatically undo live merges or discard later user edits; inspect their retained audit/publication history first. The migration intentionally aborts if applied to a different function revision.
