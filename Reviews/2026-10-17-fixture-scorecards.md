# Fixture scorecards — 0.8.62.201

Fixture details now owns scorecard entry. It stays available when a team is published or completed. Selectors can import results without gaining socials or coaching permissions; existing coaches and socials managers retain their access. Captains can reach their fixture details from Teams. Scorecard entry does not unlock or republish a team. The existing reviewed PlayCricket lineup correction remains separate.

The same stored scorecard is reused by Match Review and every social award. Existing imports appear when Fixture details opens. Failed imports retain the pasted link, and controls show progress and saved state. Fixtures can also record and undo a no-play reason.

Awards show a collapsed alert for missing or incomplete scores, with a direct Fixture details action. Completed scorecards and duplicate import forms no longer fill the awards screens. The shared week control remains.

Validation: 109 targeted UI, navigation, permissions and importer checks passed. New and existing shared-results database tests passed locally and against the live project with synthetic changes rolled back. A read-only check confirmed the pilot club's existing First Grade scorecard is returned through the new fixture endpoint. Security advisor categories are unchanged. The scorecard Edge Function retains JWT verification and checks the specific fixture before importing.

The suggested unified captain/selector board is a separate design discussion; this release retains the existing captain-review workflow.
