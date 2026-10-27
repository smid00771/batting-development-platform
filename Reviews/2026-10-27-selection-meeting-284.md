# Selection meeting recovery — 0.8.62.284

Start selection meeting is directly on the Selection Board. It never opens Selection Room, starts a call, or requests microphone/camera access. The control replaces the temporarily disabled board stats button in the existing toolbar.

The board remains lightweight before, during and after a meeting. It has no full-board polling, meeting-status polling, automatic evidence calculation, weekly forecast scans after edits, or background coaching/badge refresh while selecting. Meeting status is included in the normal board context; start/end are explicit, small requests. Ending does not restart analysis. Existing availability, overlap, revision, publication and access checks remain authoritative.

Meeting state is shared and persists per Selection Group. Editors may start/end; viewers can see status without gaining edit rights; unassigned admins and outsiders remain denied. Concurrent starts share the current meeting, retries cannot resurrect an ended meeting, and an old end request cannot stop a newer meeting. Optional season analysis is rejected on the server while any meeting is active, including requests from older tabs.

Chat diagnosis found statement timeouts and advisory-lock contention during the reported meeting window, plus a permission error. The identity and exact cause of the individual selector's access failure were not established. Chat context now reads one stable snapshot without acquiring call/billing advisory locks, calculating a wallet or deleting messages. Session cutoffs immediately hide previous chat; the existing worker and post cleanup still delete expired messages. Chat polling skips in-flight reads and backs off after failures. Explicit reconnect and call-session changes can request one fresh read. Call admission, credit accounting and selector boundaries are retained.

Validation:

- 53 focused Node tests: meeting controls and permissions, no automatic meeting requests, delivered demo refresh/navigation, slow/failed chat recovery, scope isolation, team moves, more than eleven draft players and consecutive T20 slots.
- Existing Selection Room and temporary chat UI suites: call continuity, stale session responses, drafts, reconnects, XSS and access cleanup.
- Complete demo board-navigation test, JavaScript syntax, generated-demo consistency and diff whitespace checks.
- Transactional database tests: group scope and roles, shared meeting retries, old-client analysis guard, meeting state in board context, no new advisory locks or wallet work on chat reads, chat expiry, legacy room/call accounting, same-day overlap/save/publication checks. All synthetic rows rolled back.
- Private helper execution and table access remain revoked from client roles; anonymous public room execution remains revoked. Security advisor reviewed.

Applied migrations: `20261027112952`, `20261027113402`, `20261027113752`. No live multi-selector meeting or the affected selector's device/session was reproduced. This release does not establish broader public-launch readiness.
