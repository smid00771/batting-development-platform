# Mirelion Assist — 0.8.62.254

Clubs previously submitted a one-way Guide handoff and Platform Admin offered Reply by email. Mirelion Assist replaces that queue with private, persistent, two-way support conversations. It appears in every signed-in club's main menu, including standalone Mirelion Select and scheduled trials, with Message us in Help & Tutorials. Platform Admin uses the same name and a shared inbox.

The agreed pitch is Personal support for your club. Messaging aims for a live exchange when time zones overlap, without a guaranteed response time. Requested improvements can become shared features when they add to the product, or an agreed option for an individual club. The wording promises assessment and agreed scope/timing, not automatic implementation or unlimited custom development. No prices or trial lengths changed.

## Behaviour

- Help, product enquiries and suggested changes share one conversation interface with subjects, replies, search, open/resolved views and older-message paging.
- Unread badges appear in the main navigation and the collapsed phone Menu. The platform inbox has its own per-person unread count.
- Active conversations refresh every eight seconds; other visible app pages check unread counts every thirty seconds. Hidden tabs pause polling. This is automatic polling, not an online-presence indicator or a promise that a team member is available. Replies are visible when the user returns to the app; no email, SMS or push delivery is added.
- Refresh appends messages without replacing the reply field, focus or cursor. Drafts remain in memory during same-account navigation and are cleared on identity changes. Reloading with a draft invokes the app's existing unsaved-work warning.
- A lost send response retains its command ID for an idempotent retry. A confirmed server rejection releases the draft for correction. Resolve/reopen checks the thread version; a follow-up message reopens a resolved thread.
- A member sees only their own requests within their current club. Existing owner, commercial, support and technical platform roles can read and reply. No club editing, impersonation or additional staff role is granted.
- Guide context is an explicit checkbox. Existing signed-in Guide handoffs are preserved/imported; a trigger keeps older clients' requests visible. Older requests without a signed-in club conversation remain reviewable in an Earlier requests disclosure.
- The demo uses the same interface, with tab-local fictional transport and an explicit Show example reply button. It has no live messaging or external delivery.

## Backend and evidence

`Database/mirelion_assist.sql` mirrors the CLI-created migration, aligned to the recorded database migration version, `20261023091501_mirelion_assist.sql`. The migration was applied to the existing Batting Development Prototype project on 23 October 2026. Four private tables have RLS, no direct authenticated/anonymous table privileges, and an authenticated invoker wrapper over a checked private API. Authorization uses current memberships/platform roles, not client-supplied identity or editable JWT metadata. Audit entries contain references and status, not duplicated message text.

Validation completed before release:

- 29 JavaScript checks passed across Assist UI, the delivered Assist demo, demo navigation and all product/role journeys. Later changes to legacy requests and draft checks passed the ten focused Assist tests again.
- Database assertions passed in local PGlite and against the actual schema in a rollback transaction using synthetic accounts/clubs. They cover cross-club and same-club privacy, forged platform access, membership revocation, retries, unread cursors, thread status/version checks, history, message limits and old-client handoff preservation.
- The first remote test encountered the existing Lead Admin handover protection when testing membership removal. The test was corrected to revoke an ordinary synthetic member; the product protection was preserved.
- Post-test inspection confirmed zero Assist threads/messages remained, anonymous execution was denied, direct table reads were denied and all four tables retained RLS.
- Security advisors added no warnings. Four informational RLS-without-policy notices are expected for the deliberately private RPC-only tables; pre-existing project warnings are unchanged.
- App/module syntax, whitespace checks and the generated demo manifest passed.

The cloud browser cannot open local `file:` previews. Desktop/phone browser acceptance must use the published HTTPS artifact; no visual verification is claimed before that check. This change is an authorized beta addition, not wider public-launch approval. The separate Mirelion website/domain draft and its public support copy were not published by this change.
