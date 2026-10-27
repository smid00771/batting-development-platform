# Selection Board responsiveness — 0.8.62.285

Opening, switching and closing an ordinary player picker now updates that slot without rebuilding every team card. The picker indexes overlapping games and duplicate names once, then reuses eligibility while typing. Changing the role/day/both-days choice, reopening the picker or redrawing after a data reload rebuilds the index. The actual assignment and server save still check current eligibility and revisions. Cancelling an extra player option retains the full redraw needed to remove its temporary row.

Selector/captain board requests opt out of the old captain-review snapshot collection, which the current board does not display. The default API still returns it. All other response fields are identical, including fixtures, publication state, group permissions, roster and availability. Full authoritative reloads after saving remain; there is no optimistic unconfirmed team update or additional background polling.

Measurements on 27 October 2026:

- Read-only production context, 73 fixtures and 95 roster entries: response 421,437 → 287,050 bytes (31.9% smaller). Three alternating reads: full 1091.9/1023.0/1015.1 ms; compact 848.0/847.6/844.3 ms. Median database execution 1023.0 → 847.6 ms (17.1% lower). These exclude network and rendering time.
- Controlled jsdom demo benchmark, 83 roster entries and 29 fixtures: median ordinary slot opening 335.86 → 240.98 ms; search keystroke 8.66 → 1.84 ms. Five measured runs after two warmups. These are local test measurements, not a prediction for each selector's device. Reproduce with `node Scripts/benchmark-selection-board.cjs /path/to/previous-release`.

Validation: picker DOM identity/no-request and cache invalidation tests; explicit overlap, missing-time, duplicate-name, unavailable and two-day eligibility cases; existing team moves, overflow/Undo and emergency/meeting guards; generated demo, JavaScript syntax and whitespace checks. Database rollback test proves equality of the default and compact responses apart from `reviews`, keeps default/explicit review snapshots, and rejects anonymous access. Synthetic rows rolled back. Migration `20261027120834_skip_unused_board_review_snapshots` applied.

The remaining save round trip still reloads authoritative club state. Incremental server responses are a possible later improvement, but need separate multi-selector consistency work. This release preserves that correctness boundary.
