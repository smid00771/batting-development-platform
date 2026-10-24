# Fielding in player attributes — 0.8.62.260

Player attributes now has one Fielding dropdown beside the existing roles: Not assessed, Needs work, Reliable and Strong. Existing and newly imported players default to Not assessed. The Form guide and both sides of a selection conversation show the saved value explicitly as a selector rating. It does not change calculated batting or bowling colours, comparison eligibility or team selection.

The field uses the existing club-scoped, permission-checked, revision-checked and idempotent roster save. Invalid values reject the whole batch. Old clients and registration imports preserve existing assessments. Captains receive the value alongside their existing player role context; no permissions or function grants were expanded. Migration `20261024110247_player_fielding_rating` was applied successfully; the post-migration security advisory set is unchanged.

The demo retains explicit named module exports. This fixes an existing missing benchmark constant when its Form guide opened. The full delivered-demo test covers editing the field, saving, navigating away and reopening the Form guide with the saved assessment.

Verification: 134 focused stats, comparison, navigation and fielding checks and all 50 generated-demo regression checks passed. Database checks passed against both the deployed API definition and the repository API fixture: unauthenticated access, player and view-only access, club boundaries, defaults, validation, atomic batches, stale saves, safe retries, old clients and imports. The user's live desktop screenshot confirms the previous release's cross-grade lines and shared comparison numbers. Browser verification of this release follows deployment.

`selection-conversations-preview.html` uses fictional records and the shared comparison, marker, connector and Form guide modules. `selection-conversations-phone.html` displays it and the complete demo at 390px. These review fixtures do not change competition eligibility or live player data.
