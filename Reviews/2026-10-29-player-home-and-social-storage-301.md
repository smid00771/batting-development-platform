# Player Home, account matching and image storage — 0.8.62.301

Players now start at Home in either product or both, including playing staff. Home puts Player Plan before Availability, with completion-aware actions, a direct Availability action when the plan is complete, My team and Messages, and a persistent Home control. Product permissions, explicit notification destinations and browser history remain in place. Home uses a small player-link read and existing plan requirements, without loading Selection Board, Socials, predictions or selection analysis.

The existing verified unique-email/name match remains automatic. An unclaimed unique exact name with no saved email now asks “Is this you?” with the usual grade. Confirmation uses the existing batting-history claim, rechecks the account and club under the selection lock, and refuses conflicting established histories. Decline persists. Duplicate names, deliberately unlinked entries, different saved emails, existing owners and unverified accounts require club help.

Saved award graphics offer Delete image. Posting history offers Delete saved post for drafts or completely published deliveries. Both use checked server paths, the Storage API to remove actual files, and resumable confirmation. A deleted latest graphic does not revive its older version. Minimal audit and award facts remain; reusable artwork and remote social posts are unaffected. Scheduled, unfinished and uncertain deliveries remain protected. No existing real files are deleted by this release.

PNG/JPG/WebP photo inputs now accept up to 20 MiB. The shared normalizer resizes to at most 1400 pixels and reduces further if necessary until the PNG is at most 2 MiB. Only the normalized blob is uploaded, including the cut-out preparation path; original camera files are not sent to storage.

Validation:

- Shared demo rebuilt and freshness checked, with the new Home and simulated deletion workflows.
- Onboarding, signup recovery, navigation/role permissions, publication recovery, quiet selection analysis and returning-player checks passed. Existing navigation expectations were updated for the new Home landing.
- Deletion tests cover cancellation, actual object-removal calls, interrupted removal and lost confirmation, all stored post copies, retained templates, and no remote-social deletion call.
- A 20 MiB JPEG was decoded and uploaded only as a 1400 × 933 PNG below 2 MiB; oversized and unreadable files were rejected before upload.
- Both synthetic database suites passed with full rollback: automatic email matching, explicit name confirmation, duplicate names, manual unlink, different email, verified membership, cross-club access, idempotency, private endpoint grants, all award buckets, retry visibility, completed-post removal and pending-delivery protection.
- Migrations applied: `20261029102232_player_home_and_social_storage_301` and `20261029102549_social_history_delete_scope_301`. The second corrects a history-query alias caught by the database test before frontend deployment.
- Advisors checked before and after: the three new private tables intentionally have RLS with no direct client grants/policies; new unused-index notices are expected on fresh empty bookkeeping tables. Existing advisory categories are unchanged.
- Live desktop and 390 px phone checks follow deployment and are recorded on the release pull request.
