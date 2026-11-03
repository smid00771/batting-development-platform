# Mirelion 0.8.62.340

Newly imported fixtures were present in saved club data but absent from an already-open Selection Board. Changing its date or group only redrew the older in-memory context; a browser reload confirmed the cause.

The board now refreshes saved context on explicit board entry only when the last successful read is at least ten minutes old, or after the app has been away for at least ten minutes. There is no interval polling. Date and group controls remain local, including when an earlier refresh has been deferred. A recent confirmed read is reused. Optional statistics, form comparisons and follow-up scans are not requested.

Active edits, player pickers, reordering, saves, publication validation/review, drawers and comments defer automatic refresh. Responses are checked again before application; older reads cannot replace newer data or work in another account, club or view. Failures preserve the usable board and are throttled until a later eligible action.

Removed the duplicate post-publication Create team graphics action. Social Graphics remains the navigation entry.

Validation:

- Eight integration cases exercise local date/group changes, newly imported fixtures, ten-minute gates, brief app switching, deferred refresh, editing during a request, newer reads, hidden/account changes and failure/retry behavior.
- All 27 targeted tests pass across fixture refresh, publication, quiet returning-player reminders, demo navigation and Club Admin availability/publication.
- JavaScript syntax, demo build freshness and whitespace checks pass; demo contains the same 75 shared modules as the application.
- Delivered demo inspected at desktop and 390px phone width.
- No database changes required.
