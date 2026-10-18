# Shared scorecards and compact layout — 0.8.62.208

Match Review could show a player's score through its preview name match while Season stats could not attach that score to the selected roster entry. Fixture details loaded the same source but displayed no player score table. Phone headers also inherited a 220px vertical flex basis, leaving a large empty band above navigation.

Fixture details now renders batting and bowling directly from the shared saved scorecard. The club's team opens first; opposition details stay collapsed. Unknown figures remain unknown, DNB and not-out remain distinct, and bowling comes from the opposition innings. Refreshing either import location replaces the shared source; clubs do not upload twice. Existing role and selection-lock checks remain intact.

The shared import link action now remembers an identity only when a completed, explicitly linked match has the same dates and format, and the unique full name appears in both the source team and the published club selection. Inactive, ambiguous, abbreviated, unselected or conflicting identities remain for explicit confirmation. No player/account creation, renaming, history merge or selection edit occurs. Season stats invalidates its cache after shared import or identity updates and preserves unsaved season dates.

The phone header uses a compact grid, removing the inherited vertical flex basis. Card padding, section gaps, table rows, selection controls and repeated layouts are tighter; touch controls retain 44px targets. Completed Club Home setup collapses by default. Tutorial video links appear only in Help and App and notifications. Video remakes and full demo reconstruction remain parked. The requested one-line date/format/ground fixture summary is reserved for the next batch.

## Verification

127 Node/DOM cases pass for score rendering, one-upload reuse, season calculations, stats refresh, navigation, identity confirmation, availability return, captain access and fixture locks. JavaScript syntax and whitespace checks pass. Two existing demo parity assertions now explicitly allow live-only stats invalidation and presentation changes; the demo itself is unchanged.

The new identity SQL suite passed inside the migration transaction and rolled back its synthetic records. Existing shared-results, fixture-results and season-stats SQL suites also passed with synthetic changes rolled back. An initial combined regression request returned an expired request-state error; individual suite executions succeeded.

Production migration `shared_scorecard_player_links` was applied as version `20261018011737`, from `supabase/migrations/20261018010853_shared_scorecard_player_links.sql`. Reviewed, eligible existing club imports were linked through the same guarded helper. Fixture and batting-player record hashes remained unchanged. The actual statistics engine then returned the three reported missing players with linked roster IDs and their correct 19, 2 not-out and 3 not-out innings. Private diagnostic data and account identifiers are excluded from this report.

Security advisors found no notices for the changed functions. Existing project notices remain: [anonymous function permissions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function permissions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [private tables with no direct RLS policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Official function-security documentation was checked. The changelog endpoint could not be read because the retrieval tool rejected its text/markdown response.

These are code, DOM and database checks. No signed-in phone browser visual review has been performed; this environment has no signed-in club session or supported viewport-resize control. The new layout should be checked on the user's phone after refresh.
