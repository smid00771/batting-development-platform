# Selection batch .207

This release addresses the authorised Selection Board batch and the two follow-ups raised during implementation. The full demo rebuild remains parked; `demo.html` is unchanged.

- Fixture bracketing is visible and submitted only for long-form cricket. Existing confirmations still protect changes to two-day fixtures and bracket partners.
- Clear team clears the entire draft lineup and match appointments in one confirmed, undoable save. Fixture details and the published team remain intact. Selector, lock and revision checks apply.
- Moving a player shows both teams' resulting counts. Filling a vacancy is identified explicitly. Moving into a full XI retains 12 players, shows the existing overflow warning, and cannot be published until resolved. Saved production receipts established that the reported 11-player result filled a vacancy; no player was lost.
- The global coloured unfinished-work banner is removed. Draft recovery remains a compact, collapsed collection in its relevant match section, with unconfirmed-save protections retained.
- The availability shortcut remembers the board date, team, slot, search and scroll position. A confirmed save, including an uncertain-save retry, returns there. Ordinary availability editing stays on its own page; checking without changes has a Back to Selection Board action. Returning does not automatically select a player.
- Board status now says **Availability not confirmed**, distinguishing the calendar from player identity confirmation.
- Explicit same-person confirmation now recognises ordinary registration imports as possible duplicate names. For an unclaimed original entry and a registration without a separate batting history, the registration becomes active, the old name entry becomes inactive, and the original batting player ID moves with its history. Existing availability and roles, current fixture references, appointments, follow-up and artwork links are retained; historical publication versions remain unchanged. Explicit unavailability wins over a conflicting available date. Account conflicts, two established batting histories and duplicate selections on the same date are not silently merged. Existing clients retain the previous guarded confirmation path.

## Verification

212 Node/DOM regression cases pass across selection moves, Clear team, fixture formats, draft recovery, availability return, identity confirmation, navigation, captain access, publication, comments, Selection Room and match-entry protections. App JavaScript and changed module syntax checks and `git diff --check` pass.

The production selection-move SQL suite passed with synthetic records rolled back, including 12-player drafts, atomic stale-revision rejection and publication blocks. The two prior identity SQL suites and the new active-registration SQL suite ran inside the new migration transaction; all passed and rolled their synthetic records back. An outdated test fixture omitted required review-list fields; its setup was corrected. A helper qualification error was corrected before the migration succeeded. Failed migration attempts rolled back without changing production records.

Production migration `confirm_active_registration` was applied as version `20261018004337` from `supabase/migrations/20261018004000_confirm_active_registration.sql`. The user's explicitly confirmed duplicate was then corrected through the guarded app confirmation function, with the active name, inactive legacy entry, original batting ID and saved dates verified. Private account IDs, emails and player data are not included in this release report.

Database advisors reported no findings for the changed identity functions. Existing project-wide notices remain outside this batch: [function permissions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function permissions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS planning](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) and [overlapping policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).

These are code, DOM and database checks. A signed-in browser visual review has not been performed. The existing white header, club logo and colour accents are retained.
