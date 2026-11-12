# Shared PlayHQ scorecards

Deploy `index.ts` with `linked-scorecard.mjs`, `shared-scorecard.mjs`, `result-margin.mjs`, `public-api.mjs`, `team-logos.mjs`, `standings.mjs`, `dismissal-replays.mjs`, `dismissal-links.mjs`, `../../scorecard-replays.js` and `../playcricket-scorecard/scorecard.mjs`, preserving relative paths.

Preserve the existing `verify_jwt:false` deployment setting: scheduled invocations use a short-lived, single-use database-issued token. User actions still require the existing caller-scoped RPC permission checks before connection access. Do not expose connection keys or relax either path.

Version 0.8.62.290 retains a margin in the shared result text when a completed, two-innings limited-overs summary supports ordinary arithmetic. It uses the provider-declared winner, innings order, complete first innings, equal known over limits and actual totals. Run margins require a completed losing innings. Wicket margins require a successful chase and a unique registered player list, capped at ten possible wickets. The calculation is marked `result_margin_basis:calculated_from_playhq_innings`; it is not represented as a provider-supplied margin string.

Adjusted targets, DLS/VJD, forfeits, super overs, nonzero penalty runs, unfinished games, long-form games and missing or inconsistent records are excluded. Provider-specific junior rules not represented in the summary remain a limitation; registered substitutes do not create an eleventh wicket. No winner is inferred from totals. Source corrections run through the existing import/signature workflow. Linked PlayCricket results retain their existing parser and provider identity checks.

Validation covers conservative exclusions, ordinary margins and corrections, shared and linked scorecards, the public API adapter and Edge router. Run `node --test Tests/playhq_result_margin_test.mjs Tests/playhq_shared_scorecard_test.mjs Tests/playhq_linked_scorecard_test.mjs Tests/playhq_public_api_test.mjs Tests/playhq_edge_test.mjs`.


Version 0.8.62.358 enriches completed PlayHQ scorecards with provider dismissal viewing links during the existing results job. Official PlayCricket organisation search supplies the exact PlayHQ organisation ID; current grade/team fixture catalogues find candidates. Both clubs, dates, known start times, format, round, every innings and every batter/order/figure are verified before a unique candidate can supply media. This does not switch scorecard providers, confirm player accounts, infer bowling changes or copy video. Native PlayCricket imports keep their existing direct clip parsing.

Public metadata has bounded in-worker caches (one hour; five minutes for fixture lists). Each enrichment has a 30-second overall request budget, bounded response size and candidate counts, and no forwarded club key. Delayed clips are rechecked using the existing completed-result correction schedule. Missing clips, mismatches, ambiguous candidates or provider outages leave score imports working. Source corrections retain the existing per-batter link safeguards.

Run `node --experimental-strip-types --test Tests/automatic_dismissal_replays_test.mjs Tests/individual_dismissal_links_test.cjs Tests/playhq_edge_test.mjs Tests/playhq_linked_scorecard_test.mjs Tests/scorecard_replays_test.mjs` alongside the existing shared-scorecard checks. The retention tests require `@electric-sql/pglite`.
