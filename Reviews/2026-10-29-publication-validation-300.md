# Publication validation — 0.8.62.300

Routine Selection Board context intentionally returns no expensive validation scan. Publication review previously relied on those empty results, so a server rejection could appear only after Publish and leave the client in an unnecessary Unconfirmed save state.

Opening publication review now requests one scoped, read-only validation check for the changed fixtures. It verifies returned revisions before presenting the confirmation. Ordinary board refreshes remain quiet. Server issues, including invalid appointments, remain visible before publication.

An unnamed wicketkeeper is a visible “Wicketkeeper not named” warning. It does not block publication or require a separate acknowledgement, and the successful publication message lists affected grades. No keeper is assigned automatically. Captains, invalid named appointments, availability, overlapping games, excess players, short-team acknowledgement and publishing authority retain their existing checks.

Known server validation rejections release the pending-save lock and explain that teams were not published. Uncertain network responses retain the identical request for safe retry. Atomic publication, notifications and receipt-based deduplication remain unchanged.

## Validation

- 38 focused JavaScript tests passed: publication warning/success, invalid appointment errors, rejection recovery, lost-response retry, failed/stale checks, match roles, transfers, quiet analysis and returning-player reminders.
- Synthetic database transactions passed: unnamed keepers on both playing days, no extra acknowledgement, captain/invalid-keeper blockers, access denial, no writes from review, no messages on rejection and idempotent retry. All synthetic rows and messages were rolled back.
- Existing six-team publication database regression passed, including player messages, Social Graphics and additive usual-grade membership.
- JavaScript syntax, demo generation/freshness and git whitespace checks passed.
- Migration `20261029093235_publication_validation_keeper_warning` applied. Security and performance advisory categories were unchanged; no advisory references the new private helper. Existing advisories remain outside this focused fix ([database linter](https://supabase.com/docs/guides/database/database-linter)).
- Live desktop and phone verification follows deployment; evidence is recorded on the release pull request.

No real teams were published and no real publication messages were sent by the repair. Live publication status was inspected read-only.
