# Mirelion .365 — continuous-competition season stats

Season stats now defaults to Competition, pooling limited-overs and long-form innings within the same competition, grade and season. T20-only seasons default to T20. The Stats view selector also retains Limited overs only, Long form only and standalone T20; explicit choices survive local redraws, refresh and navigation.

Batting and bowling totals, match history, scorecard counts, attention notes and grade comparisons use the selected view. Combined averages and rates are calculated from original runs, dismissals, wickets and balls, never from averages of averages. Multiple long-form innings, not-outs, DNBs, source corrections, confirmed identities and incomplete figures retain their existing rules. T20 and unknown formats are excluded; unknown competition labels do not establish a continuous competition. Each match in combined history identifies its actual format.

Last published teams are selected across the continuous competition, once per grade, even when one grade's latest publication is limited overs and another's is long form. Individual format views remain isolated. Combined totals do not inherit a format-specific form rating: the Form guide directs users to an individual format for those existing assessments. Selection Board calculations keep their existing scope.

The same on-demand scorecard payload supplies every view. No database migration, access change, additional filter request or startup download is required. The fictional delivered demo now includes both phases of a long-form competition.

Validation:
- 64 stats model, panel and delivered-demo checks passed, including pooled rates, T20/competition/grade/season boundaries, latest published teams, local switching, navigation and permissions.
- 115 shared selection, evidence, returning-player and startup regression checks passed. One existing delivered-demo returner assertion fails because its expected reminder is absent; this was reproduced unchanged on base commit 98dc856d9efb7f17f04f99b724b6b1c8c2bb0d24. The returning-player model and quiet-board unit checks passed. No returning-player behavior was changed.
- Rebuilt demo verified with `node Scripts/build-demo.mjs --check`; `git diff --check` passed.
- Browser review of the delivered desktop and 390px phone views confirmed the Competition default, combined counts and the limited-overs-only option.

[Phone preview](assets/mirelion-365-competition-stats-phone.jpg)
