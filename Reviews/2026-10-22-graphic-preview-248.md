# Graphic proposals and shared award weeks — .248 beta

The assistant previously used Apply changes to request an edit and Use this version to accept it. The schema could not change a week label, so it sometimes returned a background instruction without changing the graphic.

Preview changes now prepares and displays the proposal. Apply changes accepts it; Undo changes restores the previous preview. Background requests open preparation and start once automatically. Nothing is saved before acceptance, and an unconfirmed save retains the original retry command.

The final agreed rule distinguishes team lists from awards. Each team list displays its own fixture round from the saved fixture/source. All five awards share one label for their club and awards week. Numbered weeks advance from an explicitly set anchor independently of fixture rounds. Setting Week 2 for one week yields Week 3 seven days later even when teams have different round numbers. Clubs can also choose date labels or round labels; mixed or missing source rounds require an explicit shared label.

The shared preference and per-week overrides use a guarded RPC with club permissions, optimistic revisions and idempotent retry. The two private tables have RLS enabled and no direct anonymous/authenticated grants. Saved images and match facts remain unchanged. Approved styles are reused for their club; this does not add model training or automatic preference learning.

## Validation

- Synthetic canvas checks cover all five awards displaying Week 2, actual pixel changes before Apply, exact restoration with Undo, and separate shared-label acceptance without writing reusable styles.
- Team graphic checks cover fixture-specific round labels without duplicate Round prefixes, with existing photo placement and save recovery retained.
- Shared control tests cover cross-club separation, fresh-session persistence, preview/undo and identical-command retries.
- Database checks passed against the deployed function using synthetic records that were rolled back: permissions, cross-club denial, invalid labels, stale revisions, request-id reuse, week anchors, independent weekly numbering and mixed-round handling.
- Background proposal checks cover automatic start once, the internal navigation handoff, no write before Apply, Undo and unconfirmed-save recovery. Existing generation failures and version-history checks remain passing.
- Service tests preserve authentication, club asset scope, design revision checks, source facts and AI allowances. Provider responses are mocked; tests consume no club AI credits.

Database migration: `20261022005436_social_award_labels_248`. The updated `club-social-style` function is active at version 7 with JWT verification retained. The frontend and dependency URLs use 0.8.62.248.

Focused test files: `social_award_labels_test.mjs`, `social_award_labels_database_test.sql`, `social_graphic_assistant_test.mjs`, `social_awards_refine_service_test.mjs`, `social_awards_refinement_test.mjs`, `social_preparation_iteration_test.cjs`, `social_awards_week_navigation_test.cjs`, `social_photo_position_test.cjs`, `team_of_week_ui_test.mjs`, and `player_of_week_ui_test.mjs`.

The week-navigation test now checks the exported load capability instead of an obsolete exact return-object shape. The photo tests mock the added round lookup and retain their behavioral checks without requiring the parked demo's old context loader to equal current production source.

Physical-phone acceptance and a second real club's full journey remain beta checks. Existing saved image history is immutable; changed labels appear on new previews and newly saved graphics. The public launch and full demo rebuild remain separate work.
