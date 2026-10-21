# Selection Group permissions — .246 beta release

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

The core migration is live as `20261021202135_selection_group_permissions.sql`, with its companion applied as `20261021202334_selection_video_permission_revocations.sql`. Repository filenames now match the actual migration ledger. The .245 write guard remains live as `20261021125523_batting_group_write_guards.sql`.

The initial public GitHub upload was held by automatic approval review. The user explicitly approved publication and merge on 22 October 2026 (Australia/Sydney). The connected GitHub app uploaded the reviewed source and opened PR #95; the uploaded tree exactly matches the tested local tree. The initial migration request stalled and was cancelled; a ledger/schema/activity check confirmed no change or lingering query before the successful retry. The .245 write guard was already live.

Backend rollout verified on 22 October 2026 (Australia/Sydney): `selection-video` v8 is active with JWT verification; `selection-video-revoke` v1 is active with its custom one-use capability authentication. Two requests using the same capability produced exactly one HTTP 200 and one HTTP 401, with no queued provider work. The worker setting and cron job were then enabled in one transaction. All five database suites passed again against the deployed schema, with synthetic work rolled back. No real club scope, membership, call or publishing state was changed.

The security advisor adds seven informational private RLS-without-policy findings for intentionally RPC-only tables, one anonymous executable-definer finding for token-bound invitation preview, and two authenticated findings for invitation acceptance and admin permissions. These are deliberate API surfaces with server checks; private tables and worker RPCs remain inaccessible to browser roles. The pre-existing leaked-password-protection warning remains. This is a targeted release review, not a full audit of the baseline.

The frontend is published by PR #95 after backend verification. Real Daily active/disconnected rejoin behavior and physical phone/browser layout acceptance remain unverified and are required wider-launch evidence. Capability checks and database mocks do not establish those provider or device behaviors.

Mirelion-led public branding, two product entrances and shared sign-in remain a mandatory wider-launch requirement, as recorded in the launch-readiness checklist. These permission changes are for the continuing beta work and do not complete that public-launch requirement.
