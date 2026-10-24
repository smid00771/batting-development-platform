# Scorecard statistics and publication recovery — 0.8.62.258

Completed PlayCricket scorecards could arrive before a team was published, leaving player figures disconnected from Season stats. Completed scorecards now link corroborated selected players without requiring publication, and late publication reprocesses an already-saved card. Complete, unambiguous actual teams can be recovered without publishing them or sending retrospective selection notices. Ambiguous identities, withheld players and bracketed playing days still require the existing safeguards.

The PlayHQ parser excludes fielding-only appearances from bowling spells, preserving genuinely partial bowling records. The provider's existing retry conditions produce a useful retry message. Publication batches reuse fixture and recipient facts, and the app distinguishes a confirmed database timeout or stale team from an uncertain network save.

Season stats and grade-comparison names open the existing Playing List attributes for the confirmed roster identity. Back restores the comparison and its filters. Each comparison heading explicitly labels its line-up date; the last published team remains the default and its date does not restrict season totals.

Comparison scorecard counts and warnings now cover the two displayed grades. Other grades remain visible in the all-grades view. Withheld PlayCricket details remain visible as source notes; genuine identity or figures problems retain their attention warning. No figures are inferred and no performance thresholds change.

## Validation

- 90 focused scorecard, statistics, parser, identity and publication UI checks passed.
- All 48 complete-demo integration checks passed.
- 100 related navigation, selection-evidence and provider checks passed. One existing evidence adapter test lacked the already-used `seSelectionFixtures` dependency; its harness now supplies that dependency without weakening its assertions. The affected 19-test suite passed after the harness correction.
- Completed-scorecard and publication database suites passed against the actual schema within a rolled-back transaction. The tests cover unpublished recovery, late-publication reprocessing, source freshness, conflicts, hidden names, idempotency, access restrictions and publication recipients.
- The two recovered migrations are already applied: `20261024083729_completed_scorecard_teams` and `20261024083741_publication_batch_performance`. They must not be replayed. Deployed `playhq-sync` version 7 matches all five local source/dependency files.
- Read-only pilot checks confirm current completed-match figures are present; remaining source/identity gaps remain explicitly reported.
- Demo freshness and whitespace checks passed. The generated demo uses app 0.8.62.258 and 43 shared modules.

The 390px review frame is [scorecard-stats-258-phone.html](scorecard-stats-258-phone.html). Final desktop and phone visual acceptance is performed against the published artifact.

This is a Newcastle City beta repair, not a wider-launch readiness claim.
