# Recovered .206 package and navigation fixes (.206.1)

**Demo review status, 18 October:** the user reports that the delivered download still shows Teams without Selection Board and the older Social Graphics menu. The demo is not accepted as a faithful preview. Full demo reconstruction and role-flow redesign are parked until closer to product completion. The screenshot also shows excessive vertical gaps, stacked navigation and repeated Refresh controls. Future review must cover distinct role journeys and realistic combined roles, as recorded in `AGENTS.md`, and visually verify the actual delivered artifact. The automated results below do not resolve the user's observed mismatch.

**Live rollout, 18 October:** the user requested the prepared functional changes and initial aesthetic, then explicitly approved both production database updates. Both migrations are installed and verified: `current_season_stats` (production version `20261017235243`) and `confirm_existing_roster_identity` (`20261017235256`). Their synthetic production checks pass and roll back all temporary records. The statistics test fixtures now supply the required confirmation actor; the identity fixtures use null for absent email and separate grades to respect the real shared-fixture guard. No production constraint was relaxed. The frontend release is `.206.1`; the previous live page loaded `.204`. The cloud browser reaches the live sign-in screen; private signed-in screens were not visually inspected.

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

140 targeted app Node checks pass, covering social permissions and workflows, season calculations and UI, current-season boundaries, corrections/deduplication, identity linking, section and browser navigation, weekly social-page cold reload, captain conversations, room visibility, and call/draft lifecycle. The earlier 118-check run also included the complete-demo checks described above. JavaScript syntax and `git diff --check` pass.

Local PGlite compilation and synthetic season-statistics, identity-confirmation and team-reconciliation suites passed. Production statistics and existing-roster identity suites now pass too. Security advisor warning categories/counts are unchanged; the new private, directly inaccessible settings table adds one expected RLS-without-policy informational notice.

The cloud browser could not reach the local preview server, and its URL policy rejected local-file navigation. The recovered visual refresh and corrected demo still need rendered desktop/mobile review. The standalone `demo.html` contains fictional data for that review. The complete-demo harness uses JSDOM with browser graphics stubs; these checks do not substitute for visual inspection.

## Release follow-up

1. Verify the published `.206.1` frontend and its styles/statistics modules after GitHub Pages deployment.
2. Review the signed-in desktop and mobile appearance and Season stats interaction as the aesthetic is refined.
3. Keep full demo reconstruction and distinct demo role journeys parked until requested.

Current-season totals use already-saved scorecards. Automatic historical discovery and source refresh are not implemented by this package. No grade multiplier or promotion recommendation is included. See `2026-10-18-selection-evidence-proposal.md` for the proposed collection and validation sequence.
