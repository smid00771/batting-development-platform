# Configurable Season stats views — .366

Clubs can now set how Season stats groups Limited overs and Long form, with a shared club default and named-competition overrides. Each policy chooses combined or separate totals and an opening view. Newcastle City's existing combined default is preserved; T20 is always standalone. Setup sits inside the existing season disclosure. A competition filter appears only when more than one competition is present.

The same policy applies to batting, bowling, match history, latest published teams and all-season grade comparisons. Original fixtures and scorecards retain their formats. Mixed policies cannot merge separate-format records or compare lineups across formats. Blank/ambiguous competition identities stay uncombined. Filters remain local, and stats still load only on request.

Club Admin alone saves shared setup. The private table has RLS, no client table privileges and a foreign-key index; the existing public RPC retains its membership/product/staff scopes and private function grants. Scoped staff receive only competition overrides for names already present in their permitted data. Season dates and their usual-team triggers are independent. Revisions guard concurrent edits; request UUIDs make uncertain-response retries idempotent. Unsaved drafts survive redraws, and uncertain saves keep the same payload and block navigation until resolved.

Validation:

- 144 passing tests across Season stats model/UI, shared delivered-demo stats and selection evidence model/UI/snapshot suites.
- Five passing PGlite assertions cover migration against the exact baseline function, authenticated RPC saves, scoped access, invalid settings, revisions, idempotency, unchanged season dates and no direct table access.
- Hosted synthetic-club integration passed through the authenticated public RPC for Batting-only and Select scopes; all synthetic data rolled back. No existing view or date settings were created or modified.
- Existing API execution ACL, SECURITY DEFINER and empty search_path unchanged. No new warning/error advisors. Expected informational notices: private RLS table has no client policies; new FK index is not yet used.
- Demo rebuilt from 82 shared modules; build freshness and diff whitespace checks passed. Browser assets use .366.
- Public browser and deployed-byte verification are recorded in the deployment follow-up.

Migration: `supabase/migrations/20261114090704_season_stats_view_settings.sql`, with reviewable source in `Database/season_stats_view_settings.sql`.
