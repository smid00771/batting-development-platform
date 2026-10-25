# Shared grade and Masters player identities

The existing **Yes, link player** action rejected a PlayHQ scorecard identity when the chosen playing-list row already had a Club Batting profile but the current team was opted out. This blocked players shared between grade cricket and Masters, while players without a batting profile could still link.

The fix removes that single team opt-in guard from the PlayHQ roster-identity branch. This branch records the club's confirmed roster link and retains the existing player ID; it does not create a coaching identity link or rename the player. The fixture's Club Batting choice, grade memberships, coaching records, source conflicts, club access checks and request receipts remain unchanged. No real player identity was confirmed on the user's behalf.

## Validation

- Reproduced the exact `This team does not use Club Batting` exception using synthetic grade/Masters records against the actual schema before the fix.
- The new SQL regression checks pass for a shared grade/Masters player, a Masters-only player, partial and complete scorecards, season-stat identity reuse, request retries, stale names, conflicting identities, another club's roster, unrelated fixtures, unfinished results and ordinary-member denial. They also verify that grade coaching records and participation settings are preserved and Masters creates no coaching team or score links.
- All three database suites passed after deployment: the new selection-only checks and the existing scorecard-identity and completed-scorecard-team suites. Test transactions and synthetic users/clubs were rolled back.
- All 27 team-link UI checks and 8 of the 9 older scorecard-identity UI checks passed. The remaining old test compares the parked demo's source verbatim with the application; its mismatch was reproduced on untouched main `3c3997b609552aea324664f414549d3002cc2b9b`. No application or demo code changes are part of this fix.
- The current generated demo passes its own freshness check: app 0.8.62.268, 44 shared modules. Whitespace validation passed.
- Security and performance advisor findings are identical to the pre-change baseline. Function grants are unchanged; anonymous execution remains denied.

Applied migration: `20261025102320_selection_only_scorecard_identity.sql`. Its synthetic regression checks run atomically with the function change and roll themselves back. The server assigned the recorded migration version. The app and demo remain 0.8.62.268 because this is a server-only correction.
