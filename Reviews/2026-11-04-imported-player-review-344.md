# Imported-player review — 0.8.62.344

The Selection Board counted unresolved imported identities but showed only team/date shortcuts. Volunteers could not see which names remained, and opening a fixture could show no matching question: an exact name on a `playcricket_au` scorecard could be treated as matched locally without the explicit source link required by the review queue. Successful links from fixture details also reloaded context without updating the notice already on screen.

## Result

The compact notice now says how many imported players need matching and offers Review players. Its list names each outstanding player with team, opposition, date and time, explicitly covering all Selection Groups. Match player opens only that person's existing identity-confirmation controls inline. No group/date hunting or scorecard scrolling is required. Missing fixture details in the local view no longer hide a queued name.

The focused mode asks for confirmation of queued exact-name matches as well as shortened names, including identities previously linked only in Club Batting. It retains active-player restrictions, deliberate display names, source/fixture IDs, expected-name checks and the existing server confirmation API. It cannot preview or apply a lineup update. Open match scorecard remains available for a player who needs the full import workflow.

After a confirmed link, one normal context read refreshes the queue and its count; the next name remains available and receives focus. The notice disappears when complete. Fixture-detail confirmations also update the notice. Uncertain confirmations keep the original command and block navigation until retry confirms the outcome. Focused and whole-team checks have separate cached state.

Opening the list and changing the board's date or group use loaded data. A scorecard context is loaded only after Match player is selected. No polling, extra startup imports, database migrations or permission changes are introduced. The three live unresolved records were inspected read-only; their identities remain for the club to confirm.

## Verification

- 48 tests pass: existing scorecard team/identity tests; focused exact-name, batting-link, retry and mode-isolation tests; real rebuilt-demo queue completion, interrupted response, cross-group navigation, missing local fixture and escaping checks; local date/group and stale-context refresh regressions.
- Full-demo checks confirm three names become two, then one, then none; selected date/group and all fixture rows remain unchanged. Queue review makes no team-preview or team-apply request.
- Desktop and 390px browser checks confirm readable names/match details, inline confirmation, immediate count reduction and 44px matching buttons. Phone content width equals its viewport, without horizontal overflow.
- JavaScript parsing, whitespace and rebuilt-demo freshness checks pass. The app entry points, scorecard team module and shared-source demo use 0.8.62.344.

The existing GitHub Pages workflow publishes this release. Live source bytes and workflow success are verified after upload.
