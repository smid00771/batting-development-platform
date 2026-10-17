# Recovered .206 package and navigation fixes (.206.1)

**Demo review status, 18 October:** the user reports that the delivered download still shows Teams without Selection Board and the older Social Graphics menu. The demo is not accepted as a faithful preview. Full demo reconstruction and role-flow redesign are parked until closer to product completion. The screenshot also shows excessive vertical gaps, stacked navigation and repeated Refresh controls. Future review must cover distinct role journeys and realistic combined roles, as recorded in `AGENTS.md`, and visually verify the actual delivered artifact. The automated results below do not resolve the user's observed mismatch.

**Live rollout status, 18 October:** the user requested the prepared functional changes and initial aesthetic in the live app. The live page was verified loading `.204`, and GitHub Pages' latest successful deployment is the `.204` commit. A fresh run of 140 targeted Node checks passed. The exact release SQL passed local PGlite compilation and synthetic season-statistics, identity-confirmation and team-reconciliation suites. Production preflight confirmed the existing shared-scorecard dependencies and absence of the new statistics objects. Automatic approval review rejected applying `current_season_stats`, requiring explicit approval of the named production database changes. No migration was applied; `confirm_existing_roster_identity` has not been attempted. Keep the dependent frontend release staged until that approval and database verification. The cloud browser reaches the live sign-in screen; private signed-in screens were not visually inspected.

The unpublished .206 source has been recovered from the previous working tree, including the .205 statistics foundation, identity repair, visual refresh and selection-evidence proposal. The original working tree has been preserved. This package is based on the published .204 commit, 789d8a782b809cb16b6f52a1a22b0a1d6b4d41bb.

## Additional fixes

- Reproduced the exact `Cannot read properties of null (reading 'timezone')` error in the Team of the Week and Player of the Week state constructors. Restoring a saved navigation route invokes these before social settings load. Both now tolerate unloaded settings and preserve the saved week. A configured club timezone remains authoritative. App and demo share the fix.
- Selection Room is offered only to selectors on the Selection Board. Its scope is invalid outside that board or without the loaded access record. Normal section navigation uses the existing leave-call confirmation; board redraws keep the same call and draft. Scope loss removes the room and closes its video connection.
- Bumped entry-point and dependency cache versions to .206.1.

## Demo fidelity correction

The delivered demo still used an older social menu without Socials Awards, and its default administrator persona had no selection role. Component checks had missed both problems in the complete demo.

- The default demo now opens the Selection Board as a selector and nominated Socials Manager. Direct Social Graphics and Socials Awards views are available. The admin-only example is labelled explicitly; ordinary players retain their published-team view.
- Socials Awards uses the current shared UI and navigation, backed by fictional in-memory settings, requests, designs, photos and editions. Clubs can save award choices and try requesting a new type. Requests clearly state that they have not been sent to Club Batting. Reset demo clears the fictional changes.
- `Scripts/sync-demo-socials.mjs` embeds the shared awards sources and navigation. Its `--check` mode detects drift.
- The existing landing-page product links open batting home and the selector board respectively. Complete-file integration checks exercise those links, the default entry, role switching, award choices, request submission and reset.

## Validation

118 targeted Node checks pass, including the complete-demo integration checks above, social permissions and workflows, season calculations and UI, current-season boundaries, corrections/deduplication, identity linking, section and browser navigation, weekly social-page cold reload, room visibility, and call/draft lifecycle. JavaScript syntax and `git diff --check` pass.

The previous .206 reports document synthetic database checks. The two pending SQL migrations have not been applied to production in this continuation. This draft is not a live release.

The cloud browser could not reach the local preview server, and its URL policy rejected local-file navigation. The recovered visual refresh and corrected demo still need rendered desktop/mobile review. The standalone `demo.html` contains fictional data for that review. The complete-demo harness uses JSDOM with browser graphics stubs; these checks do not substitute for visual inspection.

## Release prerequisites

1. Review the demo's desktop and mobile appearance and the Season stats interaction.
2. Review and deploy the two pending migrations with the frontend: `20261017120431_current_season_stats.sql`, then `20261017125457_confirm_existing_roster_identity.sql`.
3. Publish the reviewed frontend together with its styles and statistics modules.

Current-season totals use already-saved scorecards. Automatic historical discovery and source refresh are not implemented by this package. No grade multiplier or promotion recommendation is included. See `2026-10-18-selection-evidence-proposal.md` for the proposed collection and validation sequence.
