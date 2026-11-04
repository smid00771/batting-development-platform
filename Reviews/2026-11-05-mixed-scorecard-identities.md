# Confirming PlayCricket players after PlayHQ results

The November 4 Women's 1st Grade scorecard supplied stable PlayCricket IDs for two existing players. Their previous completed results had confirmed PlayHQ appearance IDs, which identify a single match. The legacy PlayCricket confirmation path treated any other selection-source ID as a second global identity and rejected Yes, link player even when the displayed names matched exactly.

The server now permits a previously confirmed selection link when its UUID is in the PlayHQ appearance namespace and that ID occurs in a saved PlayHQ scorecard for the same club. All earlier links remain attached to the existing roster. Unknown or global identities, an incoming source attached to another batting history, and two appearances within the current scorecard remain conflicts. Club Batting retains its existing one-global-identity constraint. No player is merged merely because names match.

The existing authenticated RPC, staff checks, expected-name check, deliberate display names, receipts, source-name memory and review-queue removal are retained. This is a server change; the .344 interface and its local date/group navigation require no rebuild, polling or additional requests.

## Validation

- Local PostgreSQL and UI coverage: 48 passing checks across player identity preferences, scorecard teams and Match Review identity controls. The database harness now includes the real Club Batting unique constraint and production identity-slot helpers.
- Mixed-provider regression reproduces both a selection-only player and a player with an existing batting profile before applying the fix. It verifies prior appearance links, stable IDs, saved history, selected order, preferred names, retry receipts, removal from the review queue, and no duplicate records.
- Negative cases retain unknown IDs, unproven UUIDv8 values, evidence from another club, a second global batting identity, an incoming source with a different player history, same-scorecard collisions and unauthorized access.
- Live synthetic transaction checks pass through public.confirm_scorecard_player as authenticated, including deferred triggers, and roll back their synthetic data. Existing RPC-permission, identity, roster-consolidation, active-registration and selection-only regression scripts also pass.
- Both reported real confirmations pass in a rollback-only transaction using the existing authorized admin context. Assertions preserve the exact team details, selected order, published team, saved scorecard, earlier source links and existing player IDs; deferred triggers are exercised. These validation calls do not persist the real links.

The two guarded migrations preserve migration history and the final one-global-identity rule. No existing API grants or table constraints change. The final server function is checked against the reviewed source after deployment.
