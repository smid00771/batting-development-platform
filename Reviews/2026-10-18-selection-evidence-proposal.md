# Selection evidence: proposal for Teams

18 October 2026 · Proposed product direction, not a fitted statistical model

Give selectors a small number of useful, explainable comparisons inside the Selection Board. Start with the current-season scorecards already held by the app. Add local grade adjustments only when complete historical records support them.

The question should be: **“Is there a strong case for this player to take that player's role?”** Academy status, reputation and lobbying have no place in the statistical calculation. Selectors retain the decision and can consider circumstances the data cannot describe.

## What the club would see

Keep the existing **Season stats** button. It opens on the board, with Batting, Bowling and Compare grades. No new club page and no second scorecard entry job.

Compare grades initially shows the selected batting orders side by side: firsts against seconds, seconds against thirds, and so on. Each player has runs, innings, not-outs and average. Tapping a player reveals their match evidence. The selected slot is labelled separately from actual historical batting position.

Once validated local comparisons are available, an amber, labelled prompt can appear beside a relevant position: **“Review No.4”**. Opening it compares the incumbent with the candidate in the adjacent grade. Do not colour every player or show empty “all good” panels.

The comparison should answer these questions without a long report:

| Question | What appears |
|---|---|
| Who would change places? | The named candidate and incumbent, with the intended role. |
| What have they actually done? | Season runs, innings, dismissals, not-outs and recent innings in each grade. |
| Are the standards comparable? | A local grade-adjusted estimate with its uncertainty range, when validated. Otherwise: “Grade adjustment unavailable”. |
| Did they have similar opportunities? | Verified batting positions and balls faced where available; relevant bowling workload in the bowling view. |
| Why has this appeared? | One factual sentence, with the supporting matches available below it. |

Example interaction, using fictional names: **“No.4: compare Alex in seconds with Sam in firsts.”** This opens the evidence; it does not change either team. A selector can dismiss the prompt for that round. It returns only after materially new evidence, not on every visit.

A lower-grade No.4 is not a promotion candidate for a higher-grade No.7 simply because there is a vacancy. The intended role and opportunity must be comparable. An opening batter competes for an opening role; a bowler for a similar bowling job and workload. Assess all-round contributions explicitly rather than hiding arbitrary batting/bowling weights inside one rating.

## What we have now

The current-season foundation is built locally and included in the pending .206 package. It reuses shared scorecards from Fixture details or Match Review, including Teams-only clubs. Corrected scorecards replace previous figures. It shows unadjusted statistics and selected-order comparisons; it does not yet make promotion recommendations.

“Update totals” currently recalculates saved scorecards. It does not fetch fresh results from PlayCricket. Automatic source refresh is a separate ingestion task, not something we should describe as already working.

The three Newcastle City 2025/26 exports are useful pilot material, but insufficient for a reliable grade conversion:

| Adjacent grades | Provisional same-name players who batted in both | At least three innings in each |
|---|---:|---:|
| Firsts / seconds | 5 | 3 |
| Seconds / thirds | 17 | 2 |

These are provisional research joins, not confirmed player identities. The files lack stable player IDs, match-level opposition, batting positions and format context. No figures from them have been imported into the live app. Their sample sizes do not justify a rule such as “50 in seconds equals 30 in firsts”.

A complete multi-season NDCA dataset has **not** been obtained. The association's published averages tables omit lower-total records, which are essential to understanding unsuccessful moves between grades.

## How to establish a defensible local baseline

1. **Collect complete seasons across the competition.** Start with all adjacent senior grades in one NDCA season, then extend across accessible recent seasons. Include low totals, ducks, DNBs and unsuccessful spells. A 250-run promotion-shortlist requirement must not become a filter on the calibration dataset.
2. **Join by provider player ID and confirmed identity.** Retain match ID, innings, season, competition, actual division, format, opposition, runs, dismissal/not-out status and available opportunity measures. Never treat “First XI” as a universal playing standard, or merge people because their names resemble one another.
3. **Establish the within-player comparison.** Compare the same players across adjacent grades, initially within the same season and format. Show innings and dismissals behind each comparison. Do not average individual batting averages or let one tiny spell determine a grade factor.
4. **Fit and test the model.** A candidate approach is an innings-level model separating player, grade and season effects, with cautious treatment of not-outs and limited samples. Add opposition and role effects only if the data support them. Compare it with simpler within-player estimates. This is a proposed method, not an already validated model.
5. **Test on later, unseen matches.** Train on earlier records and assess predictions after players actually move grades. Compare with simple raw-average and prior-performance baselines. Check the accuracy and coverage of uncertainty ranges, and whether results survive removing individual players or seasons.

Players who move grades are a selected group. Their record is not a controlled experiment or a guarantee for every other player. Job changes, injuries, training and ageing can affect results; do not invent reasons or remove inconvenient seasons. Use season context, sensitivity checks and uncertainty to show the limits.

Opposition strength must come from performance evidence, not a “weak opposition” label supplied by reputation. When coverage is insufficient, leave that adjustment unavailable. Batting, bowling, formats and competitions need separate treatment.

## When a prompt is earned

Historical data estimates the local difference between grades. Current-season data informs how each player is performing now. The mix of recent and established form must be tested against later results rather than chosen to produce attractive recommendations.

Only show a promotion comparison when identity, scorecard coverage, role fit and sample reliability pass their checks, and the candidate's adjusted advantage is both material and sufficiently supported. Set the numerical evidence gates through validation. Do not invent a universal minimum number of runs, a universal grade multiplier or a confidence percentage before testing.

Limited evidence means **insufficient evidence**, not poor ability. Apply the same standard to an established incumbent and a younger challenger. The system can support a selector's development choice, but must distinguish that choice from a statistically supported promotion case.

Until local calibration is reliable, keep the current-season comparisons available and withhold grade-adjusted promotion flags. This remains useful without pretending the two averages are directly equivalent.

## Collection without another volunteer job

Maintain **Competition data** in Platform Admin: authorised source, competition/division mapping, seasons covered, last update and unresolved exceptions. One centrally maintained competition dataset can support its subscribing clubs where the source's permitted scope allows reuse. Private coaching notes and selection discussions stay within each club.

After a one-time connection, background jobs should discover matches, import results, check corrections and rebuild affected totals. Cache and deduplicate shared matches. Use provider change feeds where available and periodic reconciliation for older corrections. Volunteers see only missing scorecards or identity decisions the system cannot resolve.

David's central work can be obtaining a source and approving coverage for a new competition. It should not become weekly collection of hundreds of clubs' spreadsheets. AI assistance can help interpret unusual files and suggest identity matches; routine ingestion and numerical analysis should be deterministic, repeatable software. AI explanations must use the computed evidence and never invent a projection.

The verified access routes have limits:

- Cricket Australia's [statistics-report guide](https://mycricketsupport.cricket.com.au/hc/en-us/articles/6431380979599-How-to-Use-the-PlayHQ-Player-Statistics-Report) documents Cricket ID login, club/association, season, grade and match-type filters, player drill-down and export. That establishes an authorised export route, not a verified unattended whole-competition feed.
- PlayHQ's [API guide](https://support.playhq.com/hc/en-us/articles/23949453276572-How-To-Use-PlayHQ-API-s) distinguishes public-visible data from restricted private access. The supplied key is club-scoped. The documented seasons request previously returned 403; that needs provider resolution before we promise automated historical collection.
- ECB Play-Cricket is a different provider. Its [commercial-project guidance](https://play-cricket.ecb.co.uk/hc/en-us/articles/24640412683037-Play-Cricket-API-Access-for-commercial-non-profit-projects) suggests club-supplied tokens for smaller products. Its [Match Summary API](https://play-cricket.ecb.co.uk/hc/en-us/articles/360000130385-Match-Summary-API) supports season/division filters and updated-date checks. These are promising building blocks, subject to the actual token's scope; they do not grant an unrestricted league archive.

## Recommended sequence

| Step | Deliverable | Release condition |
|---|---|---|
| 1 | Current-season totals and adjacent-grade comparison on the board | Publish the prepared release after review. No promotion flags. |
| 2 | One complete NDCA season, with source and coverage checks | Establish a permitted collection route and verify stable identities. |
| 3 | Multi-season adjacent-grade estimates | Enough connected records; publish the uncertainty and validation results internally first. |
| 4 | Private trial of role-matched prompts with Newcastle City | Demonstrate useful predictions on unseen matches; check the prompts against actual selection opportunities. |
| 5 | More competitions | Validate each local baseline; do not copy Newcastle's factors elsewhere. |

The product value is dependable evidence at the moment selectors need it, with less administration. The current-season feature can move forward now. A credible historical grade adjustment is the next evidence milestone, not a claim we can make yet.
