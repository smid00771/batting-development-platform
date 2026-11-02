# Mirelion 0.8.62.339

Availability keeps the fast whole-club **Everyone available, except…** workflow as its default. Staff can instead choose one or more usual teams, or players from completed scorecards and past published teams. Existing unavailable choices remain checked. Searching names never reduces the group that will be saved.

**Choose individual players** is an optional second mode with Select all shown and individual deselection. Only selected players are marked available. The existing individual calendar and Selection Board return path remain available.

Scoped batches validate active club identities, roster and selected-calendar revisions, and exact request receipts. They leave other players and dates unchanged. Past-team history loads only when explicitly requested; it reuses confirmed scorecard identities, excludes unpublished drafts and upcoming teams, and explains the published-team fallback.

Club Admin can view drafts, review, publish and unlock teams across the club's Selection Groups. Admin status does not grant selector editing. Both the main publishing permission checks and shared Playing Group synchronisation recognise Admin authority. Team validation, existing group-head authority, revision checks, publication locks and receipt handling remain enforced. The Admin's read-only team sheet includes its unlock action.

Validation:

- 61 focused application/demo checks passed across availability, individual calendar search, board return, publication, women’s team sizes and role journeys. Six targeted checks passed again after the final read-only Admin unlock control was added.
- `admin_publication_team_availability_339` applied to the live Supabase project with rollback-only synthetic tests in the same transaction. Public RPCs ran as the authenticated role and verified Admin publication across independent groups, 13-player women’s publication, review/unlock access, denied selector editing, availability blockers, exact scoped updates, preserved exceptions, stale-write rejection, foreign/inactive identity rejection and receipt retry.
- Existing women’s/12-player publication and availability-preservation database suites passed in that transaction. Synthetic clubs, users and messages were rolled back. Readback confirmed the migration and private helper permissions; security-advisor counts were unchanged.
- Browser checks at 390px verified the whole-group default, multi-team selection, optional Select all, readable checklists and sticky save actions. Desktop Admin checks verified publication and lock controls.
- JavaScript syntax, generated-demo consistency and `git diff --check` passed.

Release includes the database source, synthetic access tests, application changes and rebuilt demo. Existing unrelated workspace edits are excluded.
