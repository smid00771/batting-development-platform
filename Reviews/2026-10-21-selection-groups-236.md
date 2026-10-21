# Club-defined Selection Groups — 0.8.62.236

The old season import repeated a checkbox and an existing-grade dropdown for every provider team. It could not add missing grades and mixed unrelated selection competitions on the board.

The new flow is Choose season → Create Selection Groups → Select Season Captains. Each club supplies its own group names. Existing grades are confirmed and assigned once; other discovered grades are added by choosing a group. Exact unique grade names are review suggestions, while differing or ambiguous names require an explicit match. Confirmed provider IDs are remembered by season. Source matching details and manual grade creation are collapsed secondary controls.

Existing grade IDs, captain appointments, fixtures, publications and player history remain intact. The database migration does not create example groups or assign the beta club's grades. Imported grades use the existing shared grade records, so they appear in both club products. Captains are selected by group and can continue directly to fixture preview; the importer remembers the selected season in the current browser session.

The Selection Board's group dropdown scopes fixtures, dates, comparison line-ups, form comparison teams, publication review and transfer targets. Direct transfers reject another group. Duplicate-date checks and the available-but-unselected list remain club-wide. Grade-drop follow-ups compare within the configured group, retaining format/season rules and the former competition boundary before setup. Legacy unmatched fixtures remain reachable under Grades to organise.

## Validation and rollout

- 111 automated UI, navigation, captain, availability, movement, provider adapter and scorecard checks passed.
- Rolled-back database tests passed for generic setup, source ownership, administrative permission, cross-club isolation, optimistic concurrency, idempotent retry, preserved grade IDs/captains, group-scoped movement and club-wide duplicate dates.
- The existing grade-drop SQL suite passed after correcting its old total-conversation assertion to inspect grade-drop records; the API also returns separate left-out records, which predate this change.
- Applied migrations: `20261021071622_selection_groups` and `20261021072202_selection_group_mapping_index`.
- Deployed `playhq-sync` v3. User membership/selector/admin checks still precede server credential access. Background polling remains unchanged.
- Syntax and whitespace checks passed. Browser installation returned an invalid download archive, so these checks do not establish physical mobile layout or real-device interaction.

## Access review

The new private tables have RLS enabled and no client policies or table grants. The [RLS without policies notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is intentional: access is through guarded functions. Authenticated callers of the [security-definer entry points](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) are checked for membership and role on every call; only Club Admin can change shared grades/groups. Functions use an empty search path and qualified objects, and anonymous execution is revoked. Provider catalogues can only be written by the authenticated server adapter. The [foreign-key index notice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) for provider grade mappings was resolved by the second migration.
