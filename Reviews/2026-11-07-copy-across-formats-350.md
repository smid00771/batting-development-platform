# Beta 0.8.62.350 — copy the previous team across match formats

Copy previous team now uses the latest earlier line-up for the same saved team, even when its competition switches between limited overs, T20 and long form. Previously the format filter either rejected the copy or skipped the latest round in favour of an older match with the destination format.

The destination retains its round, format, opposition and playing dates. Existing slot mapping checks availability on each target date: an unbracketed two-day team requires the player on both days; a bracketed team can retain a player on one day. Copying into a one-day fixture uses the source's first-day lineup. Existing team identity, overlap, publication, revision, retry and Undo rules apply.

This changes only the local copy-source filter and its empty-state message. It adds no requests, polling, background calculations or database changes.

Verification:

- Four new regression cases failed against the old format filter and passed with the fix. They cover latest-round precedence, both target-day availability/bracketing modes, copying back into limited overs/T20, and fixtures without saved grade IDs.
- 51 focused copy, fixture recovery and availability tests passed, including real demo button/RPC save, destination preservation, day-only availability, Undo, safe retry and concurrent-save rejection.
- 31 board move, publication and role integration tests passed.
- Browser checks at desktop and 390px phone width confirmed copying a limited-overs first-grade lineup into both days of the next long-form round, visible confirmation and desktop Undo. All data was fictional; no club teams or notifications were published.
- Application syntax, generated-demo freshness and whitespace checks passed.

The older copy-feedback harness was updated to include the current player-limit helper and evidence-pause/current-tab dependencies.
