# Recovered .206 package and navigation fixes (.206.1)

The unpublished .206 source has been recovered from the previous working tree, including the .205 statistics foundation, identity repair, visual refresh and selection-evidence proposal. The original working tree has been preserved. This package is based on the published .204 commit, 789d8a782b809cb16b6f52a1a22b0a1d6b4d41bb.

## Additional fixes

- Reproduced the exact `Cannot read properties of null (reading 'timezone')` error in the Team of the Week and Player of the Week state constructors. Restoring a saved navigation route invokes these before social settings load. Both now tolerate unloaded settings and preserve the saved week. A configured club timezone remains authoritative. App and demo share the fix.
- Selection Room is offered only to selectors on the Selection Board. Its scope is invalid outside that board or without the loaded access record. Normal section navigation uses the existing leave-call confirmation; board redraws keep the same call and draft. Scope loss removes the room and closes its video connection.
- Bumped entry-point and dependency cache versions to .206.1.

## Validation

Targeted Node tests cover season calculations and UI, current-season boundaries, corrections/deduplication, identity linking, section and browser navigation, weekly social-page cold reload, room visibility, and call/draft lifecycle. JavaScript syntax and `git diff --check` pass.

The previous .206 reports document synthetic database checks. The two pending SQL migrations have not been applied to production in this continuation. This draft is not a live release.

The cloud browser cannot reach the local preview server (connection refused); therefore the recovered visual refresh still needs rendered desktop/mobile review. The standalone `demo.html` contains fictional data for that review. DOM tests do not substitute for visual inspection.

## Release prerequisites

1. Review the demo's desktop and mobile appearance and the Season stats interaction.
2. Review and deploy the two pending migrations with the frontend: `20261017120431_current_season_stats.sql`, then `20261017125457_confirm_existing_roster_identity.sql`.
3. Publish the reviewed frontend together with its styles and statistics modules.

Current-season totals use already-saved scorecards. Automatic historical discovery and source refresh are not implemented by this package. No grade multiplier or promotion recommendation is included. See `2026-10-18-selection-evidence-proposal.md` for the proposed collection and validation sequence.
