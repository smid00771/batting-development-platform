# Selection follow-up — 0.8.62.222

Explicitly unavailable players no longer appear in the Selection Board's player follow-up. The same filter applies to conversation markers, controls and follow-up-only navigation and dates. If no relevant rows remain, the section disappears. Available and unconfirmed players with genuine selection decisions retain their existing follow-up and spoken-to history.

The withdrawal action and dialog are labelled “Resolve a late withdrawal”. Routine selection continues on the Selection Board.

Validation: 60 targeted UI tests passed across captain follow-up, board navigation, match conversations and club-week workflows. New regression cases cover mixed availability, unavailable-only lists, saved spoken-to status, coach access and a stale conversation button after an availability change. No database changes are required. The demo remains parked.
