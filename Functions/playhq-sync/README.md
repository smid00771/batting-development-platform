# Shared PlayHQ scorecards

Deploy `index.ts` with `linked-scorecard.mjs`, `shared-scorecard.mjs`, `result-margin.mjs`, `public-api.mjs`, `team-logos.mjs` and `../playcricket-scorecard/scorecard.mjs`, preserving relative paths.

Preserve the existing `verify_jwt:false` deployment setting: scheduled invocations use a short-lived, single-use database-issued token. User actions still require the existing caller-scoped RPC permission checks before connection access. Do not expose connection keys or relax either path.

Version 0.8.62.290 retains a margin in the shared result text when a completed, two-innings limited-overs summary supports ordinary arithmetic. It uses the provider-declared winner, innings order, complete first innings, equal known over limits and actual totals. Run margins require a completed losing innings. Wicket margins require a successful chase and a unique registered player list, capped at ten possible wickets. The calculation is marked `result_margin_basis:calculated_from_playhq_innings`; it is not represented as a provider-supplied margin string.

Adjusted targets, DLS/VJD, forfeits, super overs, nonzero penalty runs, unfinished games, long-form games and missing or inconsistent records are excluded. Provider-specific junior rules not represented in the summary remain a limitation; registered substitutes do not create an eleventh wicket. No winner is inferred from totals. Source corrections run through the existing import/signature workflow. Linked PlayCricket results retain their existing parser and provider identity checks.

Validation covers conservative exclusions, ordinary margins and corrections, shared and linked scorecards, the public API adapter and Edge router. Run `node --test Tests/playhq_result_margin_test.mjs Tests/playhq_shared_scorecard_test.mjs Tests/playhq_linked_scorecard_test.mjs Tests/playhq_public_api_test.mjs Tests/playhq_edge_test.mjs`.
