# Shared innings reviews, scorecard order and dismissal links — 0.8.62.323

Match Review and Match Observation use the same saved innings and attributed contributions. A captain can complete the team’s quick assessments; a coach then sees a collapsed summary in the individual observation form and adds their own note, assessment or video. Reopening the team review shows both contributions without borrowing another author’s editable fields. Existing revision checks, save receipts, draft recovery and independent player reflection remain in place. The existing Date/Team/Match chooser retains distinct same-day fixtures; other coaching conversations and innings history stay collapsed while editing. The demo now mirrors the existing fixture-specific server resolver when another match exists on the same day.

The team review has three columns: Player, Batted to their plan?, and Score. Dismissal assessment, observation actions, notes and videos sit under the plan choices. Runs, balls, strike rate and boundaries form a compact score. Phone rows place the player and score together, followed by the five assessment choices. The loaded-fixture Help binding now tolerates its intentionally absent button.

Provider imports preserve explicit batting and bowling order. PlayHQ fielding-only appearances remain excluded from bowling. A guarded repair reordered existing saved cards using exact provider appearance/innings identities; comparisons confirmed that figures, identity links and other saved content were preserved. Unidentified rows were left unchanged.

PlayCricket wicket highlights become safe links to the provider’s own dismissal player. Saved score links obtain the clip only through the exact source match, innings and player IDs. PlayHQ’s summary does not expose these highlights, and its identifiers differ from PlayCricket’s. A separately verified whole-match replay link can be retained across refreshes; the app never guesses per-player cross-provider links. Playback follows PlayCricket’s CricketPlus access requirements. No extraction, rehosting or paid video analysis is added.

Validation:

- Parser and repair tests cover numbered/missing/tied positions, bowling-only filtering, unchanged figures, withheld identities, repeated repair and atomic update guards.
- Database tests run as the actual authenticated role with synthetic records rolled back. They cover captain review → coach observation → both readback routes, shared innings identity, separate authorship, videos, playing-staff reflection gating, outsider denial and exact source clip matching.
- Delivered-demo integration covers switching captain/coach, independent assessments, editing and reopening notes and clips from either route. Existing observation/video retry and draft tests, shared review history, late arrivals, navigation, roles and scorecard tests passed.
- All 18 inspected saved scorecards match the intended repair; 17 required reordering. Deployed Edge Function sources match the checked files, with existing JWT settings preserved.
- Security and performance advisory findings are unchanged. Generated demo/source consistency and syntax/diff checks passed.
- Desktop and 390px phone screens were inspected in the browser, including the collapsed captain summary in the coach’s individual entry. Proof screenshots remain private.

No new startup data queries, provider polling, paid analysis or broadcast messages are introduced.
