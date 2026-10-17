# .204 — Match Review and player identity

Release .204. Publication approved on 17 October 2026, including the Match Review, navigation, player identity and captain board changes.

Saving a review or importing scores no longer makes its coaching fields read-only. Existing coach/captain permissions and contribution ownership still apply. Match Review has no match-day deadline; the separate Match Conversation deadline is unchanged.

Back restores the previous view, including observations and per-match drafts. Main navigation buttons open their section's home view. Saves do not add artificial Back steps, and late-loading responses cannot reopen a screen the user has left.

PlayCricket name variations now ask “Is this the same player?” Confirming keeps the existing club player and history, adopts the trusted scorecard name, and remembers the source identity for Teams and Match Review. Middle names, initials and common shortened names are suggestions, not automatic merges. Conflicting established identities require account-link review.

An empty roster placeholder created by a previous scorecard import can be repaired without creating another player. Current fixture slots and published names are corrected together; earlier publications remain intact. A genuine cross-team move still uses the explicit team-change confirmation and gap alerts.

Only names requiring a decision are shown. The full matched-player checklist and routine success panel are removed. Buttons show progress, disable during work, and provide a retry using the same request when a response is uncertain.

Captains and selectors now have one Selection Board, without a duplicate Teams tab. Initial loading, Refresh and old Teams links keep them on that board. Match Conversation is a prominent button beneath an authorised published team; it expands in place and changes to Hide conversation. Private Selection comments remain available to the assigned captains and selectors as soon as the fixture exists, including before any players are selected.

Copying the published team list, personal availability and the post-publication graphics shortcut are retained on the board. If a newer draft differs, its last published team can be inspected inline. Copy previous team appears only on an unpublished, unlocked fixture. Ordinary players retain their published-team view without draft access.

## Verification

- 226 targeted Node checks cover navigation, save/permission boundaries, source mapping, team corrections, name confirmations, retries, captain/player routes and conversation buttons. An outdated isolated test harness was updated for the shared published-team controls; its checks pass on rerun.
- The real reconciliation and identity SQL migrations compile and pass both synthetic database test scripts in local PGlite. Assertions cover retained IDs, club boundaries, permissions, published history, stale confirmations, repeated requests, placeholder repair, batting-only accounts and cross-team conflicts.
- Production and demo importer, name helpers, team controller and demo adapter match. App/module syntax and all inline demo scripts parse.
- These checks use local fixtures and simulated browser responses. No live player records were changed and no phone-device visual test is claimed.

## Publication

Publish the database migration `20261017102500_confirm_scorecard_identity.sql` before the .204 app files; the new confirmation action requires it. The migration checks the existing scorecard context definition before changing it and adds no public tables. Deployment must verify the new RPC and the GitHub Pages release.

Standing design rule: keep functionality with a purpose; remove repetition, redundant controls and explanatory filler. The user will separately assign the next whole-site review.
