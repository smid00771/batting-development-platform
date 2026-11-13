# Grade bracketing rules — 0.8.62.361

Long-form grades can save generally permitted, representative-duty-only or no-bracketing defaults in the existing Grade & format defaults panel. New imports and unpublished fixtures inherit these settings; deliberate fixture overrides and published teams retain their rules.

A rep-only split now asks which bracketed player is away on rep, inline in the existing player picker. The declaration belongs to the pair and absent playing date. It survives saves, reordering and Undo, is removed when that player is cleared, and expires on fixture-date changes. Publication validates it through the existing authenticated API; ordinary brackets require no extra action.

Copy previous team requires both-day availability in rep-only grades, preserves deliberately entered current brackets, and never imports a previous match's rep declaration. Returning-player reminders and comparisons also distinguish normal bracketing from rep-only permission. No requests or analysis were added to startup or normal board redraws.

## Validation

- 173 focused JavaScript and delivered-demo checks passed, including ordinary and rep-only pairs, available-again format continuity, copying, recovery, moves, unavailable players and saved evidence. The final shorter labels passed all five affected demo integration checks again.
- Authenticated database tests passed for grade-default persistence and inheritance, rep-only publication rejection, valid rep publication, malformed/old declarations, permissions, retry, reordering, Undo, date invalidation and unchanged published snapshots. Synthetic records and messages rolled back.
- Existing database regressions passed for dropped-player format/availability rules, copy-merge recovery and current twelve-player publication behavior. The old board-moves database suite still expects twelve players to be a hard error; that assertion predates the existing twelve-player acknowledgement rule. Its current replacement tests passed.
- A regression exposed empty historical slot arrays becoming null during date cleanup; the follow-up migration preserves the empty array. The dropped-player regression passed after the correction.
- Rebuilt the real downloadable demo; freshness and JavaScript syntax checks passed. Visually checked the actual rep picker at 390px and saved defaults on desktop. Shortened the default label so it fits the desktop row.
- Private helper functions remain invoker functions with no public, anonymous or authenticated execute grant. Existing API permissions, publication locks, request receipts and saved availability checks remain in place. Advisory checks found no new helper exposure.

## Club configuration

Applied the authorised beta-club settings: the two highest grades use rep-only bracketing; the next two use normal bracketing. Added the already-confirmed rep absence to its existing pair. Readback verified all 28 affected upcoming long-form fixtures kept their players and publication numbers, with no publication or player-message action. No club/player identifiers or availability records are included in this release.
