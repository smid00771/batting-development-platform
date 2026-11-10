# Official future forfeits (.355)

PlayHQ's grade feed can mark a future game FINAL with reciprocal WON_BY_FORFEIT / LOST_BY_FORFEIT team outcomes. The importer previously retained FINAL but discarded the outcome, so Check fixture changes left an ordinary selection card and TBA venue. The importer now preserves the exact club-team result and the same result from the summary endpoint.

Selection Board and Fixture details show the result with no playing-time, ground, meeting instructions, team selection or score-entry prompt. Explicit Bye remains distinct. Known no-play fixtures do not reserve players against other games, enter publication review, prompt availability or remain active in subscribed calendars. No new polling is added: the normal fixture check discovers outcomes; exceptional future FINAL summary checks are brought forward within existing queues. Known no-play correction checks use the existing daily cadence.

Saved selections, publication snapshots, scorecards and competition points are preserved. Published fixture changes retain their existing review and unlock requirements. Real figures prevent a provider no-play flag from hiding a played match. Corrections restore fixture use and calendar events with stable identifiers and increasing calendar sequences. Manual forfeits use existing result permissions; staff cannot erase an official source outcome through the manual selector. All existing API grants are preserved; new helpers are private.

Validation:

- 66 focused Node tests passed across parser, worker, scorecards, fixture results, selection refresh, publication review and club-week paths. The final board refinement passed both board tests again.
- Transactional database assertions passed through authenticated public RPCs, including source refresh idempotence, corrections, preserved publication/slots, calendar cancellation/restoration, actual-score protection, another team's player assignment, manual undo, cross-club denial and private-helper access denial. Synthetic data rolled back.
- Desktop and 390-pixel phone demo interactions verified saving a forfeit and the compact result screen. The demo remains simulated and makes no provider calls.
- Syntax checks, generated-demo consistency and git whitespace checks passed.

Deployment: migration playhq_no_play_outcomes_355 and playhq-sync v15 (same authentication configuration and all unchanged dependencies retained). Frontend version 0.8.62.355.
