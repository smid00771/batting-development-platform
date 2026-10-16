# Selection Board moves — 0.8.62.197

Selectors can drag a whole selection slot between teams, including full teams. A full destination temporarily grows beyond eleven, with a coloured card and a player-count alert. Moving or clearing players resolves the alert. No player is displaced automatically.

The existing handle also opens Team / Batting position / Clear slot controls for touch and keyboard users. Keyboard reordering, cancellation and focus restoration remain available. Vacancies are reused, bracket partners stay together, and moves require matching playing dates. Both fixtures save atomically with revision checks and one shared Undo entry. Draft changes do not publish teams or notify players.

Database drafts accept 11–100 rows; captain checks and publication reject excess players or extra rows. Existing short-team review and explicitly acknowledged short-team publication remain supported. Availability, locks, duplicate checks and publishing authority remain in force.

Validation: 28 move model and interaction tests, 9 demo RPC tests, 36 existing selection/publication/action checks, full inline demo syntax and changed JavaScript syntax pass. Production database tests pass using a synthetic club and rollback, covering move chains, retries, stale revisions, access, locks, brackets, overflow and short teams. Security advisor finding counts are unchanged.
