# Current-season player statistics (.205)

Prepared locally; now included in the pending .206 package. No production migration, repository publication or live deployment has been performed. The live release remains .204.

## Behaviour

One Season stats button opens a panel inside Teams, on the Selection Board or Fixtures view. Club Admin, selectors and captains can view it; this grants no selection-editing permission. Batting and Bowling show current-season figures with expandable match evidence. Compare grades shows the selected XIs side by side in selection order, including Day 1/Day 2 bracketed players. Comparisons stay within one competition and match format. These are season totals in each grade, not statistics at historical batting positions.

The panel reuses the latest shared PlayCricket scorecard snapshots already saved through Fixture details or Match Review. Teams-only clubs use the same flow. Update totals re-reads those saved snapshots; it does not make a fresh PlayCricket network import. Refresh scores in the existing fixture controls when source scores have changed. No CSV entry or second score store is introduced.

Scores are rebuilt from the newest snapshot per match, so corrections replace earlier figures and repeated imports cannot increment totals. The match's start date determines season membership. In-progress, future, cancelled and no-play matches are excluded. Missing or incomplete scores are exposed in a collapsed exception list. Identity uses provider IDs and confirmed links only. Ambiguous identity associations are flagged and excluded; a matching name alone never merges players.

Batting average uses total runs divided by dismissals. DNB, not out, a dismissed duck and zero not out remain distinct. Bowling aggregates use balls, not decimal overs. Missing balls produce an unavailable rate. Incomplete individual figures are labelled and their season rates withheld. Fielding is not inferred from an import that does not provide it.

The visible season window defaults to July-June for Australia/Pacific timezones and calendar year elsewhere. Club Admin can adjust it in place. Saved dates repeat annually, keeping the latest begun season visible during the off-season. Settings are separate from billing dates and guarded by revision checks. The date editor preserves drafts through redraws and errors, and blocks navigation while saving.

Back/Forward restores stats filters and comparison choices without putting scorecards in browser history. Reopening Teams takes users to its home view. Stale responses cannot render into another club or a detached panel. The demo uses fictional shared scorecards, with the same calculations and UI bundled from the modules.

## Evidence limits

This release has no automatic historical discovery, grade conversion, opposition adjustment or promotion rating. Historical CSVs were analysed separately and have not been imported into the live product. The comparison explicitly labels its averages as unadjusted. A grade-adjusted recommendation needs a validated model, sufficient connected history and a comparable role/opportunity for the proposed replacement.

## Implementation

- `season-stats.js`: pure scorecard projection and selected-order comparison.
- `season-stats-panel.js`: inline UI and guarded requests.
- `season-stats-demo.js`: fictional local source adapter.
- `20261017120431_current_season_stats.sql`: private season settings and membership-checked public RPC, using the existing shared result source.
- `app.js`, `app.html`, `demo.html`: integration, now using the .206 cache version.

The new migration is created through Supabase CLI and remains unapplied. It must be deployed with the .206 frontend, which includes the .205 work. It needs the already released shared-scorecard migrations. No Edge Function change is required.

## Verification

Pure calculation tests cover corrected snapshots, duplicate imports, batting/dismissal denominators, DNB, high-score ties, bowling rates and overs, missing data, season boundaries, identity conflicts, grade/format separation and bracketed comparisons. DOM interaction tests cover mode changes, loading/error/retry states, season-save drafts and guards, stale club responses, board-lineup changes, missing-score links and inline opening/closing. Existing navigation, captain board/conversations, shared results, identity confirmation and fixture import tests are run against both app and demo where applicable.

The SQL migration compiles and passes synthetic PostgreSQL tests in PGlite: administrator/selector/captain reads, ordinary/outsider/anonymous/disabled/archived denials, latest shared snapshots, identity bridging/conflicts, restricted payloads, admin-only season edits, revision checks, valid date windows and annual rollover. Every test account and fixture is rolled back. No live private player records were read or altered.

Syntax checks and `git diff --check` pass. Desktop/mobile browser rendering has not been visually inspected in this session; DOM interaction checks do not establish actual iPhone layout.
