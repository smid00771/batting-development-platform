# Post-match achievement alerts

The user clarified that “immediately” means after the match, without waiting for week-ending awards. This supersedes .304’s extra in-play polling.

The results scheduler is restored exactly to its previous policy: normal expected-finish checks, existing retries and the slower completed-result correction cadence. The alerts preference no longer changes job scheduling. The migration moves any eligible pending live-check due time back to the normal schedule while preserving active leases, provider-error backoff and clubs with alerts disabled.

Achievement collection requires a completed scorecard. In-progress and stumps imports produce no alert. When normal results sync or a manual import supplies the completed scorecard, the existing trigger sends each qualifying century/five-wicket alert once and its link opens the individual award immediately. Weekly award creation remains separate. No additional source download, endpoint, frontend request or polling loop is introduced; the checkbox and staff-only Assist behavior are unchanged.

The isolated database suite verifies migration from the previous schema, exact restoration of the original scheduler, pending-job correction, preserved leases/backoff, opt-in without rescheduling, in-progress/stumps exclusion, completed-import alerts, direct award image creation before the week ends, duplicate suppression and corrected-away delivery cancellation. Existing staff-only Assist and prior migration checks continue to pass. The unchanged generated demo is verified with `--check`. Live verification uses function definitions and read-only candidate evaluation; no real notifications or production fixture writes are used.

The migration is applied. Live read-only checks confirm the original scheduler is restored, changing the alert preference cannot reschedule downloads, in-progress candidates are excluded, and completed centuries/five-wicket hauls remain available. Security and performance advisor findings are unchanged (449 and 287).
