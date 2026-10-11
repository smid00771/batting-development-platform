TEAMS — UPDATE .150
11 October 2026 (Sydney)

CHOOSE THE CLUB'S SOCIALS RESPONSIBILITY
Club Admin can do all social work themselves or appoint one or more Socials
Managers. This is a Teams feature and works for Teams-only subscriptions.
Socials Manager includes Meta setup, artwork, reviewing the blurb and team
images, immediate posting, scheduling, and arranging temporary cover.
New appointments receive an in-app setup notification through the existing
notification system. Copy setup message creates a club sign-in link without
credentials or secret access tokens. It does not send a message for you.
Club Admin always retains access. Only Admin assigns permanent managers.
Each club authorises its own Meta accounts; the platform owner needs no
role on any client club's Facebook Page or Instagram account.

TEMPORARY COVER
Permanent Socials Managers or Admin can assign another current club member
for inclusive From / Until dates in the club time zone. The replacement
gets a Teams notification. Temporary access starts and expires automatically.
The assigning manager, replacement or Admin can hand responsibility back
before the end date. Existing permanent manager/Admin access stays in place.
Cover gives no selection or Club Admin powers. It cannot be re-delegated by
the replacement. Another manager cannot overwrite active cover arranged by
a different manager; Admin can resolve that situation.
All OAuth stages and posting jobs recheck current rights. Removing a manager
or ending cover removes the associated temporary permission; it does not
remove the club's already connected accounts.

SCHEDULED POSTS
Review the exact blurb and selected team images, then choose Post now or
Schedule post. Times use the club's time zone, independent of the phone's
zone. Invalid and repeated/skipped daylight-saving times are rejected.
The durable posting queue waits for the approved time. Delivery is subject
to worker processing and Meta availability, rather than guaranteed to the
second. An open saved post can be rescheduled or cancelled before it is due.
Cancel returns it to draft and releases the earlier posting claim.
Another authorised manager can review the saved output and choose Take
responsibility, keeping its time under their access. This matters before an
early hand-back: if the approver loses access, the worker holds the post.
The worker rechecks published teams, artwork, account and permissions before
sending. Changes hold the post for fresh review. Completed fixtures remain
blocked. Duplicate requests and stale revisions cannot create a second post.
A temporary replacement cannot schedule outside their cover period.

INSTALL / STATUS
Upload Website_Files, preserving config.js, styles.css and CNAME. Check
0.8.62.150 after refreshing. Website files have NOT been uploaded for you.
Database migrations ARE APPLIED. Do not rerun included SQL. Existing Edge
Functions handle the new queue timing; no new deployment is required.
Shared Meta activation remains blocked on owner Facebook sign-in. The last
sign-in was rejected; no club account is connected and no real post was sent.
The team announcement artwork renderer is still 0.8.62.143.

VERIFICATION
60 focused Node checks passed across this and the earlier workflows.
The core database integration test passed with 52 assertions using only
synthetic users, a Teams-only club, fixtures and image metadata. All changes
rolled back; follow-up reads confirmed no synthetic accounts/clubs remained.
Covered Admin access, manager appointment, role notifications, timed cover,
hand-back, all OAuth stages and revocation, schedule approval/deduplication,
future queue exclusion, rescheduling/cancellation, stale revisions, completed
time rejection and holding changed artwork. No real notifications were sent.
The security advisor found no new exposed-function warning. The two new
private tables have RLS and no public policies, producing expected INFO
notices. The unused initial setup-contact table is empty, private and gives
no permissions; the final permission model uses Socials Manager throughout.
Live Meta sign-in/publication, external notification delivery and browser
visual/gesture checks are not verified in this environment.

ALL .149 AND EARLIER CHANGES ARE INCLUDED BELOW

CLUB BATTING / TEAMS — UPDATE .149
11 October 2026 (Sydney)

LATE CHANGES AND REPUBLICATION
Selectors can keep editing a published team until the fixture is completed.
Changes save as a draft. Players and social graphics keep the last published
team until the responsible Head reviews the changes and chooses Republish
teams. A compact notice lists every team awaiting republication, including
teams on other dates. The existing review shows what changed.

The responsible Head gets one in-app alert for an outstanding team change,
using the existing phone/email fallback process. Reading the alert does not
clear the task. Further edits do not repeatedly notify them; republishing or
undoing the changes clears it. Republishing sends the existing updated-team
notifications to affected people, including players coming in and going out.
Existing social posts are updated separately through the reviewed posting flow.

TEMPORARY ACTING HEAD
The Head or Club Admin can choose Delegate publishing, select another
assigned selector, and set From / Through dates in the club's time zone.
The permanent Head assignment stays in place. During the period the Acting
Head publishes/republishes and receives late-change alerts. Either person,
or Club Admin, can choose Hand back early. Publishing automatically returns
to the permanent Head after the final date. Club Admin can change/cancel
cover if either person is unavailable. Delegation changes are audited and
protected against stale settings. No delegation has been assigned for you.

COMPLETED FIXTURES
After the final playing date has passed in the club's time zone, selections
are locked. A two-day fixture remains open through its second date. Unlock
allows a 30-minute correction window; Lock again closes it immediately.
The server enforces this for older screens too.
Completed team announcements cannot be posted or reposted to Meta, even
when selections are temporarily unlocked. An attempted post shows an alert.

FIXTURE DATES IN SOCIAL GRAPHICS
The Fixtures starting list now includes dates with unpublished teams.
They show Awaiting team publication until the Head publishes. Draft players
and team images are not exported as published teams.

INSTALL
Upload the contents of Website_Files as usual. Keep your existing config.js,
styles.css and CNAME; they are excluded. Refresh and check 0.8.62.149.
The website files have NOT been uploaded for you.
The database changes ARE ALREADY APPLIED. Do not rerun the included SQL.
There are no new Edge Function deployments required for these changes.

All earlier player-save fixes, compact posting controls, combined team posts
with a blurb, AI style trial fixes and batting-order controls are included.
The deliberate player-photo marker and artwork renderer are preserved.

VERIFICATION
51 focused Node checks passed against actual app/demo functions, including
late-edit rendering, delegation controls, date validation, hand-back,
fixture locks, order preservation, player edits and completed-post blocks.
App/module syntax and embedded demo script compilation passed.
Database integration checks passed using entirely synthetic users and a
synthetic club inside a rolled-back transaction. Covered replacement-player
save/publish, incoming/outgoing notices, alert deduplication and resolution,
permissions, delegation dates, automatic expiry, hand-back, admin cover,
stale requests and removal of selector access. All synthetic rows were
confirmed removed. Earlier completion/social database checks also passed.
No real teams, player records or assignments were changed by these checks.
Phone/email delivery, browser interaction and a real Meta post were not tested.

META SETUP
The shared Meta app still needs the owner's sign-in/activation. Clubs will
use the existing Connect Facebook / Instagram flow once that is ready.
No real social post has been sent. This is separate from uploading .149.
