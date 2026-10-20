# Verified video usage

This server worker settles Newcastle City pilot reservations from Daily's meeting and participant records. It does not activate club billing, change call limits or enable other clubs.

## Accounting

Admission counts `actual_seconds` for verified entries and `reserved_minutes * 60` otherwise. Original reservations remain available for audit. No per-entry rounding is applied to verified usage.

The worker waits until room and token expiry plus two minutes. It reads every meeting and participant page, including reconnects, and requires two identical snapshots at least three minutes apart. The live scheduler runs every minute; the expiry grace period and two matching snapshots normally settle usage about 5–7 minutes after the 90-minute room window closes. Leaving early does not immediately release the hold because its token can still rejoin.

Provider errors, ongoing meetings, unknown token identities and incomplete records keep the reservation. Calls older than 23 hours require review because Daily's shortest analytics retention is one day; a missing or partially purged history must not be interpreted as zero. `usage_error` and `usage_review_required` identify these cases. Review flags do not erase reservations.

## Authentication

The scheduler generates a random single-use capability valid for ten minutes. Only its SHA-256 hash is stored in the private run table. The worker claims it through a service-role-only RPC before contacting Daily. Calls receive a five-minute lease; expired leases can be retried. Settlement uses the same database lock as admission and cannot apply twice.

Deploy this worker with gateway JWT verification **disabled**: the capability supplies its custom authentication. Keep JWT verification enabled for the separate user-facing `selection-video` function. The worker uses the existing `DAILY_API_KEY` and automatically provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; none are exposed to browsers or stored in cron SQL.

## Deployment

1. Apply `supabase/migrations/20261014115509_selection_video_actual_usage.sql`. The usage schedule is installed inactive.
2. Run both Selection Room database tests; their synthetic data rolls back.
3. Deploy `index.ts` and `handler.mjs` as `selection-video-usage`, with the authentication setting above.
4. Enable `selection-video-actual-usage` through `cron.alter_job`. Run `club_selection_private.schedule_video_usage_check()` once and verify its HTTP result and call status. Never print worker tokens or provider secrets.

Node checks: `node --test Tests/selection_video_usage_test.mjs` and `node Tests/selection_video_test.mjs`.
