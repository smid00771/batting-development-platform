# Results order and automatic draft vacancies — 0.8.62.342

Results keeps the existing team order by default. Selecting at least two teams exposes one compact Re-order teams action beside the heading. It replaces the existing list with the selected teams and accessible 44px up/down controls; Done returns to selection, and Reset order restores the normal sequence. There is no required ordering step or duplicated list. The current draft order drives the actual canvas preview, image batches, labels and ordered source identities. Newly selected teams follow the custom sequence. Week, selection-group and Day 1 changes reset it. An uncertain save retains the exact original images and requests.

The Selection Board contained the existing unavailable-player removal helper but never invoked it. Board rendering now invokes that helper against the already-loaded availability. It clears only affected future playing days in editable displayed drafts, leaves each batting position empty, and preserves other days, unanswered availability and locked publications. Saves retain their existing revision checks, permission checks and identical-request recovery. Active pickers, forms, publication review, comments and drawers defer removal. Unchanged redraws do not make requests; no polling or new date/group refresh was added.

## Validation

- 64 focused checks passed across availability return, automatic draft vacancy/retry, the full demo save-calendar/return-to-board workflow, fixture-refresh quietness, awards week navigation, Day 1 scores, score recovery, publishing, scopes, refinement and demo navigation.
- The expanded awards UI scenario additionally verifies actual rendered grade order, normal defaults, optional controls, boundary buttons, keyboard focus, reset, deselect/reselect, context refresh, batching five teams, locked pending-save controls and identical ordered retry requests. Reordering issues no database requests.
- Browser QA on the delivered demo at desktop and 390px phone width: choose teams, open optional controls, move teams and close controls. Arrow icons are legible, controls are 44px, and the compact closed state adds no extra workflow step.
- Browser QA through the actual calendar save and Selection Board return: a saved withdrawal vacates Day 1 in place, retains the player for Day 2, and leaves the original published team for normal republication.
- JavaScript parsing, demo freshness and git whitespace checks passed.

The older isolated `captain_board_ui_test.cjs` harness remains failing before these changes: 19 failures reproduced against the preceding .341 tree, beginning with its missing `selectionEvidence` stub. It is not a passing release check. The new full-app demo regression covers the missing automatic-removal integration rather than relying only on isolated helper tests.

## Rollout and recovery

No database migration or production-data rewrite is required. The versioned client and rebuilt demo use the same modules. Reload the app once to load this release; opening the relevant draft board then applies saved unavailable dates. A rollback can restore the preceding client files, but it must not restore players into places already cleared by an authorised save.
