# On-demand Selection Board analysis — 0.8.62.287

The emergency Start/End selection meeting control is removed. The board is quiet by default. More offers two independent actions: **Show form indicators** and **Compare returning players**. Each explicit click requests season figures once and builds only its requested result. Opening the board, searching, opening or closing a picker, saving selections, Undo and ordinary refresh do not run analysis automatically.

Results are snapshots scoped to the signed-in person, club, Selection Group and fixture date. Redraws paint the saved snapshot. A moved player's indicators and affected grade-swap links disappear. Relationships involving a changed XI also disappear because bowling and keeper balance may depend on any member of that XI. Unaffected individual form and unrelated teams' relationships remain. Role, availability, fixture-format or season changes invalidate affected results. Undo does not resurrect invalidated comparisons; selectors can request a new calculation. Switching group/date or reloading the browser starts quiet. There is no new polling to discover other selectors' changes; confirmed saves and the existing explicit Refresh provide the authoritative context.

Available-again names and factual availability history remain independently available without scorecards or role comparisons. Returning comparison HTML is cached, including absence-period summaries. Selecting the returner clears the applicable reminder and comparison; Undo restores the reminder alone. Historical match details still load only when explicitly expanded. Existing selection limits, same-day timing, availability, concurrency, permission and publication checks remain unchanged.

Requests are deduplicated and cancelled when a selection mutation begins. Late responses cannot attach to another board or account. Errors are visible with no automatic retry loop. Analysis actions close More through its existing handler. No permanent toolbar button, status row or mode is added.

Migration `20261027201338_selection_analysis_on_demand.sql` is applied. Explicit `on_demand: true` context requests no longer depend on legacy meeting state; unflagged old background requests are rejected. The flag does not grant permission. Existing membership, club access and scoped scorecard checks remain. The ordinary board payload no longer includes retired meeting metadata. Legacy meeting API/data and chat/call behaviour are retained for compatibility; no records are deleted.

Validation:

- 149 focused tests passed: frozen results, per-team invalidation, independent actions, cancellation, access failures, full delivered-demo refresh/search/save/Undo, permanent reminders, cricket evidence and returning rules, picker responsiveness and team moves.
- The delivered-demo selector navigation test passed separately (150 total).
- Synthetic database tests passed for explicit analysis with an old active or ended meeting, blocked automatic requests, boolean validation, ordinary-member/outsider/anonymous denial, returning metadata scopes/seasons and shared scorecard identities. All synthetic data rolled back.
- JavaScript syntax, generated demo freshness and whitespace checks passed.
- The older isolated `selection_board_home_test.cjs` harness has 20 pre-existing failures (obsolete Season stats expectations and missing navigation mocks). The same failures were reproduced against the unmodified .286 base; they are not claimed as passing.
- Supabase security advisors retain the four previously recorded categories. Performance advisors report the existing unindexed-foreign-key, auth-RLS-initplan, unused-index and multiple-permissive-policy categories; this change adds no table, index or policy.

The delivered desktop demo is checked after Pages deployment. Existing compact phone styles and tap targets are retained; the available browser controller has no documented phone viewport control, so phone appearance is not claimed as visually verified.
