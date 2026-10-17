# PlayCricket team corrections — 0.8.62.198

Completed scorecards can correct the selected and published team after a reviewed confirmation, including a locked fixture. The original publication remains in history. A correction removes overlapping selections from other teams atomically and marks their gaps until their own scorecards are confirmed.

The full source team is preserved separately from batting/bowling performances, including players who did not bat. Match Review and the Results/Social awards scorecard panel share the same review component. The panel shows incoming/outgoing names and affected teams; unresolved identities require a choice. Confirmed matches and stable registration IDs are reused. A new source player can be added without inventing an account. Bracketed fixtures require explicit playing dates.

The server uses the club's trusted imported snapshot, club membership and existing coaching/selection/social permissions. Preview and apply use the club advisory lock, a complete plan fingerprint, request receipts and audit records. Incomplete scorecards, foreign records, stale changes and contradictory already-confirmed teams are rejected. Unrelated unpublished fixture details are preserved. The ordinary future-selection locks and publication permissions remain intact.

Validation:

- 84 relevant Node checks passed across import input, player matching, review order, reconciliation UI, the fictional demo, drag transfers and publication flows.
- Both migrations compiled and passed the synthetic database suite locally and on the live project. All synthetic records rolled back.
- Database coverage includes published corrections, a three-team chain, original publication history, no partial stale writes, replayed requests, new players, member/club boundaries, full-lineup checks, two-day conflicts and preservation of unpublished fixture details.
- Security advisor warning counts are unchanged. The one added informational RLS finding is the private, revoked, API-only identity-link table.
- Edge function `playcricket-scorecard` version 9 preserves the full listed team; its existing verified-JWT and service-side staging boundaries remain in place.
- Browser verification uses the fictional demo and sends no club notifications.

Migrations: `20261017013957_playcricket_team_reconciliation`, `20261017015548_playcricket_preserve_published_details`.
