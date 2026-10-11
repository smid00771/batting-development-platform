CLUB BATTING / TEAMS — UPDATE .148
11 October 2026 (Sydney)

CLEAR PLAYER SAVE FEEDBACK
A duplicate player name now produces a clear warning beside the form.
- Explains which player is being edited and which entry already exists.
- Offers Open existing player, with the usual unsaved-change confirmation.
- Shows Name already exists on a visibly disabled Save button.
- Shows Reactivate player when an inactive entry is being made active.
- Clearing the name clash restores the save action.

Renaming a player to a unique name preserves their registration ID, player
attributes and linked app account. Making an entry inactive does not remove
it from duplicate-name checks. No player records were merged or changed by
this update.

All earlier compact posting controls, combined team posts with a blurb,
AI style trial fixes and batting-order controls are included. The deliberate
player-photo marker and the current artwork renderer are unchanged.

INSTALL
Upload the contents of Website_Files as usual. Keep your existing config.js,
styles.css and CNAME; they are excluded. Refresh and check version 0.8.62.148.
This package has not been uploaded to the website for you.
No database changes, AI allowance changes or real posts were made in .148.

VERIFICATION
9 player-editor checks passed using the actual app functions with an
in-memory form and simulated save endpoint. They cover reactivation,
registration/attribute/account preservation, duplicate-name feedback,
opening the correct entry, unsaved-change cancellation, normalized names,
legacy entries and matching app/demo code. App syntax and demo inline
script compilation passed.
A real browser interaction could not be checked in this environment.
Earlier release verification remains recorded in Tests/README.txt.
