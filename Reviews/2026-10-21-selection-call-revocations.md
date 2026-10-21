# Selection call revocation companion — 21 October 2026

Prepared locally for the scoped Selection Group permission beta. No deployment, provider mutation or persistent database change was made during this implementation.

## Behavior

Permission commits evaluate final membership, group grants and head assignments. A removed right marks the existing call entry revoked and queues a Daily eject with `ban:true` for that exact entry UUID. Atomic delete/reinsert grant saves do not spuriously revoke participants. Scope activation revokes all old club-wide call entries; authorized calls in another group and independent viewer rights remain intact. Player/captain permissions are not changed. Re-granted selectors need a fresh entry UUID; the old provider identity stays revoked.

Both pilot and annual-credit admission reject revoked entries. Admission shares the club permission lock, and the Edge Function rechecks the entry, club, group, room and expiry after minting the provider token, before disclosure. A permission change after that check is handled by the post-commit revocation queue. Audio/video mode, call expiry, reserved credits and actual-usage settlement remain unchanged.

The service-only worker authenticates a one-use capability, claims up to five room jobs, validates room/entry identities and bans up to 100 users per room. Completion/defer require the exact leased identities. Provider errors, malformed responses and HTTP 404 retain work for retry. Failed work becomes eligible after 20 seconds; cron runs each minute; interrupted leases expire after two minutes. Backlog or an outage can extend enforcement delay until a successful ban or existing token expiry (at most 90 minutes). Ejection is asynchronous, not instantaneous.

## Evidence

- Combined local PGlite schema/function snapshot: all four core permission SQL sources plus this companion compile; 38 core permission assertions and 37 revocation assertions pass. Revocation tests cover activation, unchanged atomic grants, exact scope removal, head transfer, membership loss, regrant, pilot/annual stale entry denial, token-confirm race, preserved credits/mode/session, one-use capabilities, exact leases and retry.
- `node Tests/selection_video_test.mjs` passes, including token-disclosure denial after revoked or malformed final confirmation.
- `node --test Tests/selection_video_revoke_test.mjs`: 14 tests pass. Tests mock provider/database responses; no live provider request is made.
- Handler syntax checks and `git diff --check` pass.
- CLI-generated migration `20261021130827_selection_video_permission_revocations.sql` exactly matches `Database/selection_video_revocations.sql`; apply after the core permission migration.

The local schema snapshot omits some deployed constraints/defaults, with the required defaults added in the scratch harness. A full forced-rollback check against the deployed schema is a separate release verification, not claimed by these local results. The SQL suite uses synthetic IDs and an outer rollback. It temporarily enables the worker setting and queues transactional `pg_net` requests; [Supabase documents that HTTP requests start only after commit](https://supabase.com/docs/guides/database/extensions/pg_net), so a guaranteed rollback prevents dispatch.

## Deployment and provider limits

Deploy `selection-video-revoke` with gateway JWT verification disabled (one-use capability authentication), and the updated user-facing `selection-video` with normal JWT verification. The migration leaves the revocation cron job and private `selection_video_revocation_settings.enabled` false. After verifying worker capability/RPC reachability, enable both in one transaction. Until then, scoped calls and permission changes invalidating active tokens fail closed.

[Daily documents](https://docs.daily.co/reference/rest-api/rooms/session/eject) that `ban:true` prevents the supplied `user_ids` rejoining. The implementation relies on that supported contract. Local mocks cannot establish deployed provider behavior: verify active ejection, old-token rejoin denial, disconnected-user rejoin denial and continued access for retained participants as rollout verification, with evidence required before wider public launch. The response contains ejected participant IDs, not a separately documented persisted-ban acknowledgement; an empty array is accepted for disconnected identities. If real verification contradicts Daily's documented contract, keep scoped calls disabled until resolved.
