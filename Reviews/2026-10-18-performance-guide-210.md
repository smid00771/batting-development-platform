# Performance colours and grade comparisons — 0.8.62.210

Selectors need a quick way to spot a weak or strong current record and inspect a plausible adjacent-grade alternative. This trial adds separate Bat and Ball markers to the private Selection Board, Season stats and Compare grades. Tapping a marker opens actual figures, opportunity and rough equivalents. Green is strong, amber is below the guide, grey means more evidence or role information is needed. Ordinary results remain uncoloured. Each person has at most one numbered comparison on the board; other possible comparisons remain inside the detail view. A separate approximate-sign marker identifies a batting/bowling trade-off. No player is moved, selected or published by this feature.

## Rough parameters and meaning

The user expressly approved a practical rough guide without requiring publishable research or perfect opposition adjustment. Historical calibration uses the supplied five NDCA seasons (2021/22–2025/26), grades 1–4, with same-name/same-club links within each season. Historical links are provisional; live player identity still requires confirmed source-to-roster links. Source files remain private and are not committed or imported into the live database.

The earlier runs-per-innings analysis was checked against conventional batting average before implementation. Pooled runs per dismissal among matched records with at least three or five innings in each grade give higher/lower ratios of approximately 0.49–0.51 (first/second), 0.67–0.73 (second/third), and 0.49–0.52 (third/fourth). Rounded starting weights are 0.5, 2/3 and 0.5, equivalent to lower-grade targets of 2×, 1.5× and 2× the incumbent average. Allowing just one innings produces approximately 0.59, 0.81 and 0.61; the opportunity requirement changes the result materially. These are explicit heuristics, not validated individual forecasts or confidence intervals. Not-outs with no dismissals never become an average of zero.

Bowling uses the observed five-season paired-rate summaries: higher-grade wicket-rate weights 0.78, 0.78 and 0.88; economy multipliers 1.25, 1.2 and 1.2. Wickets are compared per 100 balls, never as raw totals. Historical exports mix formats; current records must be in the same known format. NDCA parameters apply only to recognised NDCA aliases and adjacent senior grades; they are not compounded across missing grades or copied to another competition. Opposition is unadjusted.

## Colour and opportunity rules

The reference is the median of at least three current club records in the same recorded batting role or bowling type/workload and the same format. Adjacent NDCA grades may contribute after the rough adjustment; each roster identity contributes at most once, preferring its record in the target grade. Batting colours use approximately 25% above/below that reference. Bowling weighs wicket-taking and economy together, so economical containment is not marked poor solely for low wickets. Unknown roles or too few comparable records stay grey.

Batting needs three innings and two dismissals for comparisons and strong/weak colours. Bowling needs two innings bowled and at least 4/10/20 overs for T20/limited-overs/long-form; part-time thresholds are half those totals. These are visible trial rules, not claimed statistically validated cut-offs. Missing or incomplete figures stay grey; zero wickets with valid exposure remain real results.

## Role and team balance

The proposed batting order is matched tightly near the top (openers with openers; nearby upper-order positions), with wider scope further down. Recorded batting roles must agree. Selected positions are labelled as the proposed order, never as proof of the historical position where runs were earned. Keeper cover is preserved. In the same fixture schedule, a candidate must cover the incumbent's selected days, including brackets. Availability still requires a selector's check.

Quicks cannot be linked as interchangeable with spinners in any format. Long-form requires the same frontline/part-time workload role. In shorter formats a frontline bowler may cover a part-time role, but not the reverse. Observed balls per bowling innings must also be comparable (80% of incumbent workload in long-form; 65% in shorter formats). All-rounders retain both disciplines, with losses in the other discipline explicitly marked as trade-offs. The existing data does not distinguish opening/first-change or off-spin/leg-spin roles, and the UI says so.

## Integration and checks

Uses the existing protected season-stats API and shared scorecards. No database, permission, scorecard import or team mutation is needed. Board reads are cached briefly per user/club scope and refreshed after score changes or a stats refresh. Responses for a departed board or different account/club are ignored. Only the private captain/selector board mounts indicators; ordinary published player teams do not. Compare grades retains the last-published default and immutable published batting order. The parked full demo remains unchanged.

121 targeted Node/DOM checks pass, covering calculation units, thresholds, zero outcomes, type/workload/keeper/day matching, all-rounder trade-offs, escaping, stale responses, access failures, selector/captain access, latest-published defaults, team moves, availability return and navigation. Chromium checks of the real slot renderer, styles, comparison panel and dialogs with fictional data passed at 320, 390 and 1280 pixels: no horizontal overflow, 44-pixel-or-larger marker targets, dialogs open/close, no browser script errors. Phone screenshots were visually checked. This is component/browser verification, not a signed-in live account test.
