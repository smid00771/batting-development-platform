# Historical selection data: Newcastle City pilot

Research only; no historical data has been imported into the live app.

The user has Newcastle City as the sole beta club and wants to start with its previous senior season, 2025/26. The user clarified that the product must scale to 1,000 clubs without David or volunteers collecting each club's exports or match URLs. Target a one-time club connection, automatic historical loading and ongoing synchronisation. Existing exports are useful pilot evidence and an optional fallback, not a required recurring job. Only genuinely unresolved identity decisions should reach volunteers; remember confirmed mappings.

## Verified routes and current limitation

- PlayHQ's public API guidance documents the organisation -> seasons -> grades -> fixtures -> game summaries route, with an API key and cricket tenant header. Public visibility settings still apply. The supplied credential is club-scoped; broader competition access must not be assumed.
- A single read-only GET to the documented organisation seasons route on 17 October returned HTTP 403 with a CloudFront request-blocked page. This does not establish whether the key is invalid or whether previous seasons are unavailable. No alternate authenticated route was attempted and no private player records were read.
- The official Advanced Fixture report documentation lists a CSV export for a competition season and all grades, with Game ID, grade, date, teams and format among the columns. One export is a useful fallback for discovering matches. It contains fixture information, not all individual batting/bowling performances; the available public scorecards must still be retrieved and checked.
- The newer Reports documentation describes game-level datasets and CSV/Excel downloads, but availability of the required Cricket Australia batting/bowling fields in this club's account has not been verified. Do not promise a complete player-statistics export on that basis.
- The club's annual-reports page links its 2025/26 report. It was downloaded and sampled as a possible supplementary source; it is not an established replacement for a complete match-by-match dataset.

## Existing implementation

`Functions/playcricket-scorecard/index.ts` currently retrieves a public Cricket Australia match scorecard by UUID, and `scorecard.mjs` normalises both innings and teams. It retains grade, dates, format, venue, player identifiers, runs, not-outs, available balls faced and bowling figures. This is a per-match workflow; a bulk historical loader has not been implemented or validated.

Next investigation: verify a permitted, repeatable discovery and scorecard retrieval route from a club or competition identifier, then test coverage for one historical season before implementing the background loader. Resolve the documented API block with the provider; do not bypass it. An Advanced Fixture CSV can assist optional testing but must not be the required product workflow. Preserve sources and match/innings identities for repeatable imports and corrections. Keep historical ingestion from creating current selection notifications, duplicate players or duplicate reviews. Do not publish actual historical exports or credentials in the public repository.

## Aggregate export inspected

The user supplied a combined batting, bowling and fielding CSV for the club's previous-season second grade. It contains 26 player rows and season totals, with no match IDs, player IDs, opponents, dates, batting positions or season field. It supports historical baseline summaries, not role- and opposition-adjusted recommendations by itself. The season is user-provided provenance. Duplicate Average and Strike Rate column headers require deliberate batting/bowling mappings; the bowling-section Runs scored field reconciles as runs conceded. The source file was read only and was not copied into this repository.

The user subsequently supplied City 2025/26 third-grade (31 rows) and first-grade (19 rows) exports. Exact full names and club, normalised only for case, provide provisional research joins; the files have no stable player IDs, so these joins were not written into the app. There are 20 common names in seconds/thirds, with 17 batting in both, two with at least three innings in each and none with five in each. Firsts/seconds have seven common names, five batting in both, three with at least three innings in each and one with five in each. Batting averages were checked against runs divided by innings minus not-outs. These small samples support descriptive comparisons, not a fitted association-wide conversion. Formats and batting positions are not supplied, and the files are kept outside this public repository.

The public NDCA 2025/26 annual report was retrieved from the association's resources page. Its second-grade batting table is restricted to 250 runs; third and fourth grades use 200 runs. These tables omit important lower-total spells in the other grade and cannot serve as a complete paired calibration dataset. The club annual report is supplementary narrative, not a full statistical export. A full same-player record is needed even when clubs apply a runs threshold to their eventual promotion shortlist. Retain unusual results, compare within-season records where possible, assess sensitivity to small samples and player composition, and quantify uncertainty from unobserved circumstances. No 50-to-30 rule has been fitted or added to the app.

## Automatic collection and agent assistance

Cricket Statz's own import guide documents automatic retrieval of completed Australian PlayCricket matches by grade, optional team restriction, and previous-season imports using the relevant season's grade ID. This is evidence of an existing automation pattern, not proof that our product has the same access, complete cross-club player history or permission to reuse that implementation.

PlayHQ's published season-statistics-for-profile endpoint is private, requires Authorization and lists non-cricket statistics in its schema. It is not evidence of a public cricket career-history endpoint. The supplied public key remains club-scoped. We still need to establish the supported scope for historical cricket scorecards, player identifiers, transfers between clubs and ongoing multi-club operation.

Use scheduled background ingestion for routine fetches, retries, deduplication and updates. AI agents may assist with permitted source discovery, unusual formats and suggested identity mappings. They must not invent missing results, silently merge ambiguous players or overcome unavailable access. Store provider-specific IDs and confirmed links, retaining grade, competition, format and season context. Local grade standards must be estimated from evidence; identical grade names across locations do not establish comparable standards.

Newcastle City is sufficient for an initial product pilot; strong grade translations and opposition adjustments still require enough connected historical evidence and testing against later matches.

## Further access check: 17 October 2026

The user asked whether association history can be collected centrally and whether competition-specific baselines can support subscribing clubs elsewhere, including English leagues. No complete multi-season NDCA dataset was obtained in this check. The association's 2024/25 report announcement points to the resources page, which currently links 2025/26; it did not establish access to a complete historical archive. City's public 2022/23 report contains narrative and selected performance highlights, not an established full player-statistics source. The linked public PlayHQ association page returned 403; it was not retried through alternate routes. The previously blocked authenticated API call was not repeated.

Cricket Australia's official player-statistics reporting guidance documents Cricket ID login, club/association, season, grade and match-type filters, player drill-down and export. The reporting site was not readable through the web retrieval tool. This establishes a possible authorised export source, not current access or a verified single export across all seasons/grades. Complete source records remain the prerequisite for the association-wide calibration dataset.

ECB Play-Cricket is a separate provider from Australian PlayCricket/PlayHQ. Its official commercial-project guidance explicitly suggests smaller products let clubs supply their own API tokens for their specific data, with broader partnerships considered for established products. Its Match Summary API supports season and division filters and last-updated date ranges for changes; Match Detail supplies full scorecards; Divisions & Cups identifies divisions within a league and season. ECB recommends low-traffic collection after matches and overnight caching. No English token was supplied or used. A club token does not establish authority for an unrestricted league archive or cross-club pooling.

Proposed platform-admin workflow, still a design discussion: maintain Competition data centrally, connect an authorised source or upload complete source files, inspect only unresolved identity/coverage/import issues, and approve a version. Corrections replace the corresponding source records. Store provider identifiers, competition, season, division, format and provenance. Use the actual division a team plays in, not its XI label, when comparing standards. Share a competition baseline across subscribers only within the source's permitted reuse scope. Keep each club's private selection/coaching information separate. Initial manual source setup can support the pilot; routine refresh should become automated. Ordinary club users should not acquire a recurring historical-data entry task. A baseline must remain unavailable until coverage and validation support it; subscription alone does not establish statistical sufficiency.

Additional primary sources checked:

- https://newcastlecricket.com.au/ndca-annual-report-2024-2025-now-available/
- https://www.newcastlecitycricket.com.au/wp-content/uploads/2023/07/Annual-Report-2022-23.pdf
- https://mycricketsupport.cricket.com.au/hc/en-us/articles/6431380979599-How-to-Use-the-PlayHQ-Player-Statistics-Report
- https://play-cricket.ecb.co.uk/hc/en-us/articles/115004270145-Do-You-Have-an-API-to-Access-Play-Cricket-Data
- https://play-cricket.ecb.co.uk/hc/en-us/articles/24640412683037-Play-Cricket-API-Access-for-commercial-non-profit-projects
- https://play-cricket.ecb.co.uk/hc/en-us/articles/360000130385-Match-Summary-API
- https://play-cricket.ecb.co.uk/hc/en-us/articles/360000141669-Match-Detail-API
- https://play-cricket.ecb.co.uk/hc/en-us/articles/360000141469-Divisions-Cups-API

## Sources

- https://support.playhq.com/hc/en-us/articles/23949453276572-How-To-Use-PlayHQ-API-s
- https://support.playhq.com/hc/en-us/articles/31053519695516-Download-legacy-reports-in-PlayHQ
- https://support.playhq.com/hc/en-us/articles/23971206715164-Generate-an-Advanced-Fixture-Report (indexed official documentation; direct page returned 404 during this check)
- https://support.playhq.com/hc/en-us/articles/24967819624476-Running-Reports-in-PlayHQ
- https://www.newcastlecitycricket.com.au/annual-reports/
- https://www.cricketstatz.com/importing-matches
- https://docs.playhq.com/tech/api/season-statistics-for-profile-private
- https://newcastlecricket.com.au/resources/
- https://drive.google.com/file/d/1DiuC9x0la0XcDjx3Ez9OIyVrO1ToBPgB/view
