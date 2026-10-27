# Available-again reminders without analysis — 0.8.62.286

Quiet selection meetings had removed the returning-player list along with optional form analysis. The board now shows compact **Available again** names and expandable factual availability history without loading scorecards, calculating form, or building replacement comparisons.

Reminder results are cached against the authoritative board context, group, date and club-local day. Opening a picker, typing, expanding a name, starting/ending a meeting and redrawing the same board reuse those results. A confirmed selection save, Undo or explicit refresh supplies a new context and updates the reminders. A selected returner disappears from the list. Normal availability, overlap, save and publication checks remain unchanged; optional analysis stays paused, including after a player is selected.

The existing returning-player rules still require a confirmed earlier selection, consecutive explicitly unavailable missed games, the same grade/format/season, current confirmed availability and no conflicting selection. Unknown availability does not establish an absence. No-play and cancelled fixtures do not count. Role matching is skipped for reminders.

The normal authorised context gains only the season window and already-visible no-play fixture IDs. The private stable/invoker helper reads saved settings and result-source flags, takes no advisory locks and cannot be called by anonymous or authenticated clients directly. It uses the existing custom-season rollover rules. There is no extra request or polling. Migration `20261027122822_selection_returning_availability_context.sql` is applied; existing meeting analysis guards remain in force.

Validation:

- 41 focused tests passed across returning-player semantics, quiet reminder caching and permissions, actual demo selection/Undo during a meeting, picker responsiveness, emergency quieting and meeting controls.
- The delivered demo's selector-board navigation test passed separately.
- Database transaction tests verified default/custom season equivalence, annual rollover, scoped no-play IDs, private function ACLs, ordinary-member exclusion and anonymous rejection. Synthetic rows rolled back.
- App/module syntax, demo regeneration/freshness and whitespace checks passed.
- Security advisors retain the four previously recorded categories; no new public function or table was introduced.

The demo includes a fictional returning player, Sam Ellison, with consistent saved historic selections and scorecard identity. Browser verification of the deployed desktop board is performed after Pages deployment. Phone rules retain the existing 44px disclosure target and truncated long names; a phone viewport is not available through the current browser controller, so phone appearance is not claimed as visually verified.
