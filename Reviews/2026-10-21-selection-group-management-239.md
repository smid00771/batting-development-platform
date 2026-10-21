# Incremental Selection Group management — 0.8.62.239

Returning to a saved season now shows its saved state and small Add a team, Add a Selection Group and Manage existing teams actions. Existing choices are not presented as another initial setup. The initial two-step imported-team alignment flow remains available for an unconfigured season.

Groups can be created and reopened with no association connection, season, teams or fixtures. Empty groups can also be saved during initial season setup. Manual grade creation stays in a collapsed fallback. Unassigned existing grades remain visible for allocation.

Adding one team previews its trusted source name, competition and available fixtures; a source without grade metadata is explicitly uncertain but can still be linked. Preferred names and existing grades remain supported. Failed source previews can retry, and uncertain saves reuse the same request ID. Only the added team triggers an immediate fixture import.

Undo imported link requires a fresh server preview. It disconnects the source, stops its jobs and removes only demonstrably untouched future imported drafts. Existing grades, captain appointments, selections, publications, review/scorecard use and history remain. Unchanged pre-existing arrangements can be restored. A persistent import_touched marker prevents a later automatic update from making manually edited work removable. Old links without provenance are kept conservatively. Retained fixtures are explicitly reported for review.

The returning-importer status error caused by an ambiguous f.id reference is fixed. Backend migrations 20261021101206, 20261021101710, 20261021102411 and 20261021102921 are applied. The latter two preserve manual-work provenance and allow empty initial groups.

Validation: 26 focused UI tests pass for initial setup, returning saved setup, incremental add, source review/retry, uncertain-save retry, reviewed undo and empty-group creation/reopening. Three synthetic transaction-rollback database suites pass: automatic fixtures, incremental group management/undo and groups before a season. They include stale undo previews, used/manual fixtures, automatic updates after manual edits, private helper permissions and idempotency. JavaScript syntax and whitespace checks pass. No physical browser/device visual verification was available.

The actual Sabres source currently has no grade metadata. Its identity as Summer Bash has not been independently established. No real group/team was added or disconnected during testing. Per-group selector permissions and invitations remain separate pending work.
