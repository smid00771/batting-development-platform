# Automatic results and Club Batting participation — 0.8.62.245

Club Admin chooses Club Batting once per Selection Group. The checkbox sits in the existing group heading and appears only with an available Club Batting product. New/imported/moved teams inherit their group's choice. Existing groups with coaching memberships remain enabled; newly imported groups start off. Unchecking stops new coaching participation, shared review choices and plan reminders while preserving history and Teams results.

Add or link a team sits immediately after Rename group in the same heading row. Routine management messages use a screen-reader status with no page height. Match Review is available from the existing fixture scorecard heading only for authorised staff and participating teams.

Scheduled PlayHQ checks refresh an already-confirmed PlayCricket source directly, retaining its match/team/player identities. New PlayHQ appearance IDs remain match-scoped. The existing published-XI/full-name/club/date/format checks bridge them to roster records without changing names or the global PlayCricket person mapping. Shared previews reuse the saved scorecard; assessments and score corrections retain their existing explicit save/revision safeguards.

Validation:
- UI and Edge tests cover conditional group controls, identical-request retry, same-row actions, hidden controls without the product, separate provider identities, canonical refresh validation, shared review preservation and importer/demo consistency.
- Rolled-back database tests cover group inheritance, stale requests, role/product isolation, opt-out, retained histories, fixture-to-review navigation, canonical sources and idempotent refresh.
- Independent review found that stale Match Review screens could still save after group opt-out. The follow-up `20261021125523_batting_group_write_guards.sql` checks both the review writer and score importer under the same club lock as group changes. It also rejects fixture-less group/player/source bypasses while retaining history reads, completed-request retries and work in another opted-in group. All 15 SQL regression assertions passed against the current database inside a forced-rollback subtransaction; the helper's absence afterwards confirmed that this verification left no schema changes installed.
- Seven live Newcastle City conflict jobs were retried through the normal authenticated scheduler after Edge deployment: all seven returned HTTP 200 with checked=1 and cleared their result errors. Three prior API scorecards also linked 29 published-XI roster appearances safely.
- City Senior Saturday Teams remains opted in. City Masters and the other five imported groups remain off. No user emails or requests were sent.
- Security advisor categories unchanged; new private helpers are not client executable.
- Resumed verification: 74 focused UI, shared-review, identity and Edge tests passed. The automatic-scorecard action is labelled Reload shared scores because it reloads saved snapshots rather than initiating a provider check.
- Headless screenshot verification was unavailable because the local Chromium executable is absent and its attempted download did not produce a usable archive; DOM tests verify the heading/action structure. Visual acceptance remains outstanding for the public launch.
- No brand/domain change is included in this beta update. Mirelion is now the confirmed umbrella and website structure; only the second product's name remains unresolved. See mirelion-public-launch-readiness.md for the source audit and launch requirements.

Deployment verification: the write guard is applied as migration 20261021125523. Its 15-assertion SQL regression passed again after deployment with synthetic data rolled back. Security advisor categories/counts were unchanged; that comparison does not establish a full audit of pre-existing advisories.
