# Season team links — v0.8.62.237

The season setup blocked valid club teams when PlayHQ returned no competition
grade. It also encouraged duplicate grades and lost distinctions such as Navy/Sky
when two teams shared a competition grade. The final agreed flow starts with the
imported season structure, then connects existing club records to it.

## Changes

1. Create club-named Selection Groups and place chosen imported teams into them.
   Existing club grades are not assigned separately on this screen.
2. Match each existing club grade to an imported team, with choices grouped by
   Selection Group. The existing grade inherits the imported team's group and
   keeps its ID and preferred name. Clear unique name matches are suggestions
   for review. Preferred names remain editable.
3. Save setup once, then Select Season Captains. Unmatched imported teams create
   new club grades only at this save. An existing grade without an imported match
   can be explicitly kept and assigned to a group. Manual grade creation remains
   a small fallback.

Navy/Sky source team labels remain visible; teams sharing a competition grade
are matched by distinct team IDs. Saved links survive source label changes and
reloads. A verified club team can join a Selection Group without provider grade
metadata. Later metadata enriches the same link; an incomplete refresh does not
erase a known source grade ID.

Existing preferred-name edits retain grade IDs, captain appointments and fixture
records. A private historical-label table preserves unambiguous legacy fixture
resolution after a rename; published snapshots are not rewritten. Explicit IDs
and existing competition-specific links retain priority. Ambiguous historical
names never guess a grade. Names used by another grade's history are not reused
through this setup. Revision checks, Club Admin authority and atomic retries stay
in place; grade rows are locked before checking the current setup snapshot.

Fixture preview skips only teams whose current download lacks grade details,
identifies them and leaves manual fixture entry available. Other grades can still
preview/import. Existing fixture reconciliation remains a separate reviewed step;
linking source teams does not merge fixtures or player identities by name.

## Verification

20 targeted interface tests passed across Selection Groups, fixture importing,
board group scoping and season captains. Coverage includes:

- Imported teams first, with no repeated group assignment for matched grades.
- Exact-name suggestions, unresolved matches, Back preserving names and choices,
  moving an imported team between groups, and no writes before final Save setup.
- Separate Navy/Sky links, visible source labels, and no duplicate new-grade rows
  after matching existing grades.
- Women's teams with missing grade metadata, new clubs with no existing grades,
  retained grades without imports, and duplicate preferred-name rejection.
- Safe uncertain-save retry, confirmed server rejections, mixed ready/pending
  fixture imports, and later metadata enabling preview on the same local grade.

Four rollback-only SQL suites passed: preferred-name history, pending source
grades/shared provider grades, existing group setup/permissions, and populated
performance. They verify original IDs/captains, unchanged draft/published fixture
snapshots, legacy group/captain resolution, ambiguous-label handling, trusted
catalogue membership, private access, idempotent retries, movement scope and
club-wide duplicate-date checks. Populated full context took 587 ms without
groups and 263 ms with groups. No synthetic clubs remained. The pilot club still
had its six existing grades and no saved groups; its choices were not configured
on its behalf.

JavaScript syntax and diff checks passed. Interface behavior was checked through
DOM tests; browser/mobile rendering was not visually retested in this environment.

## Deployment and permissions

Applied migrations:

- `20261021084242_selection_groups_pending_source_grades`
  SQL MD5: `119b060bcaa5ad8622dccb3e5ae3658d`.
- `20261021091104_selection_group_preferred_names`
  SQL MD5: `0dfa233cf2251b89fe7c02f75613e6a1`.

No Edge Function changes or credentials are required. The new aliases table has
RLS and no direct client grants. Security advisors identify intentional private
RLS without policies and the authenticated SECURITY DEFINER setup RPC. The RPC
retains membership/role checks, admin-only writes, trusted catalogue validation
and an empty search path. References: [private RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [RPC exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
