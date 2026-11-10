# Copy previous team preserves current selections (.356)

A selector can place bracketed players into a draft first, then copy the previous team. Previously the copy replaced all current slots and truncated the source at the normal team size. It now retains every current row, including complete and half-filled brackets, and adds eligible source players in batting order around those occupied positions. Copies into an empty team retain the original positions and availability gaps.

The merge deduplicates identities separately for each playing day. It includes eligible source rows beyond eleven and uses the existing oversized-team warning and publication rules. Repeating a completed copy makes no additional save when nothing new can be added. Undo restores the exact preceding selection; uncertain-response retry retains the original request and proposal. Availability, overlap, source-team identity, format transitions and revision checks remain in force. No-play fixtures neither supply a previous lineup nor reserve players against a copied team.

This changes the client-side copy proposal only. It adds no requests, database migration, permission, publication, notification or polling behaviour. The existing server accepts up to 100 draft slots; a merge exceeding that capacity leaves the current team untouched with an explanation.

Validation:

- 69 focused tests passed: copy feedback, recovery, format changes, bracket and duplicate handling, availability return, oversized publication and no-play board behaviour.
- Authenticated public RPC test passed with a synthetic ordinary selector: saved thirteen players per day around an existing bracket, retained safe retry, rejected a stale save, restored the bracket through Undo, and denied an ordinary member. All synthetic data rolled back; nothing was published.
- Browser interaction at 390-pixel width as Selector verified an existing bracket plus all eleven previous players, the twelve-per-day warning, repeat-copy idempotence and Undo retaining the original pair. Fictional preview data only.
- JavaScript syntax, demo build consistency and whitespace checks passed.

Release: frontend 0.8.62.356, based on .355. The existing backend and publication safeguards are unchanged.
