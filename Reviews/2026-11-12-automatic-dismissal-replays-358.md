# Automatic dismissal replay imports — 0.8.62.358

Completed PlayHQ fixtures previously imported scores without discovering the matching PlayCricket dismissal clips. Earlier manually linked clips did not establish an automatic path for later fixtures. The existing background results job now discovers and verifies available clips for each completed fixture and saves them into the shared scorecard used by Fixture details & results and Match Review.

Discovery uses official organisation ID mappings, the official grade and fixture catalogue, then checks both clubs, dates, known start times, format, round, innings totals and every batter's position, name, status and figures. Only one fully verified match can supply media. Existing scorecard, player and account identities remain unchanged. Missing clips, ambiguous matches and provider failures leave score imports working. Completed-result correction checks pick up delayed clips; caches and request budgets bound the optional work.

Imports run on the server. Phones retain page-triggered scorecard reads, lazy thumbnails and tap-to-open provider video links. This adds no browser polling, video downloads or AI calls.

Validation:

- 80 automated checks passed across discovery, scheduled Edge execution, native/shared scorecards, link retention, source corrections, result margins, fixture pages and both replay renderers. Covered later fixtures, delayed clips, two-day matches, ambiguity, wrong organisations/figures and provider outages. Fixture-page tests also verify zero scorecard reads before mounting the page; replay tests verify lazy thumbnails and no embedded video.
- Live scheduled worker completed successfully after deployment. The 7 November fixture gained all 14 available dismissal links (five home, nine away). Every non-media scorecard field was identical to the previous snapshot. No manual scorecard edit was used.
- Deployed Edge version 17 read back identically to all 11 local source files; existing authentication configuration retained.
- JavaScript syntax, generated-demo freshness and whitespace checks passed. Rebuilt actual demo inspected at desktop and 390px phone widths.

The provider must publish clips and expose a unique, matching complete scorecard. No link is invented when those conditions are absent.
