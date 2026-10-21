# Selection Group permissions — prepared .246

Club Admin manages each group's Head Selector and no-access/view/edit grants from the existing Settings permissions section. Group and member controls use compact rows; routine status is screen-reader-only. Existing access remains unchanged until a group-permissions save explicitly enables scoped access. Other groups keep their prior selectors during that transition.

A group Head publishes independently. Handing a group to another Head transfers its publication authority atomically; the former club Head may retain view access. Membership removal cannot leave a group without its publishing Head. Invitations retain the chosen group, access level and optional Head responsibility, and require the exact verified email address at acceptance. No invitation is sent by this patch.

Server checks cover fixture reads, saved drafts, comments, results, publication, stale clients and Selection Room scope. Published teams and legitimate player/captain/coaching/socials access remain additive. The old club-wide `selector` predicate is deliberately restricted to people who can edit every group after activation; updated scoped endpoints use separate viewer/editor helpers. This prevents read-only or partial-group access from accidentally inheriting unrelated legacy writes, including global identity consolidation. Manual scorecard staging still works for a group editor's own source and rejects a source spanning unauthorized groups.

The recovered SQL was corrected to preserve the .245 Club Batting participation fields, scorecard filters and `can_review` response. It does not replace .245's new write-time participation guards. A SQL variable collision that made every new invitation appear to be an existing club member was also corrected.

## Verification

- 38 synthetic SQL assertions pass locally against PostgreSQL/PGlite, using captured current schema/function definitions and a rollback transaction. They cover activation, scope, handover, stale revisions/clients, no-access defaults, legacy mutation isolation, room admission/posting, verified-email acceptance, exact invitation grants, scoped scorecard staging and private grants.
- 18 focused UI/navigation tests pass, including eight new editor tests, mixed captain/player/selector/socials roles, additive Workshop access, Selection Group filtering and room boundaries.
- Existing Selection Room UI lifecycle tests pass (access cleanup, call preservation, retries, cancellation and board redraw).
- Combined core and call-revocation migrations pass the 38 permission assertions plus 37 revocation assertions locally. The companion queues exact issued identities for provider bans and fails closed until its worker is enabled.
- JavaScript syntax and whitespace checks pass.
- Root integration passed 60 focused JavaScript/UI/Edge checks. A full-schema transaction temporarily applied both .246 migrations and ran all five suites: permissions, call revocation, .245 group participation, automatic-result sources and stale-review write guards. All passed; the transaction was rolled back. A follow-up read verified that the pending permissions table is absent and the live migration ledger remains at the .245 write guard.
- The existing full demo/social-source equality assertion also fails on the unchanged baseline. The full demo remains parked; this patch does not claim to rebuild it or verify a physical phone/browser layout.

## Release state

Prepared locally; no permissions SQL or frontend was deployed by the permissions agent. The .245 write guard has its actual applied ledger filename `20261021125523_batting_group_write_guards.sql`. The new core migration is `20261021130100_selection_group_permissions.sql`.

Root's public GitHub upload was rejected by automatic approval review because it could not verify authorisation to disclose this batch to the public repository. No workaround or subsequent upload was attempted. The exact existing repository and ownership were verified; explicit batch publication approval remains the final step. The .245 write guard is live, but neither the prepared website update nor .246 permissions/worker has been deployed.

Active provider-call revocation is prepared in the companion migration `20261021130827_selection_video_permission_revocations.sql` and its worker, with separate review evidence. Deploy the companion with the core migration; enable the worker only after the required capability/provider smoke verification. The core migration alone does not invalidate already issued Daily tokens. Provider behavior after disconnection and attempted token reuse remains a deployment verification requirement.

Mirelion-led public branding, two product entrances and shared sign-in remain a mandatory wider-launch requirement, as recorded in the launch-readiness checklist. These permission changes are for the continuing beta work and do not complete that public-launch requirement.
