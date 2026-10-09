CLUB BATTING 0.8.62.129 — SHARED MATCHES AND RELIABLE REVIEWS

THE DATABASE, NOTIFICATION FIX AND GUIDE UPDATE ARE ALREADY DEPLOYED.
The remaining step is your normal website upload. This cumulative package
includes all previous updates; use this package instead of .128.

UPLOAD
1. Unzip Website_Files. Upload everything INSIDE that folder to your existing
   GitHub Pages root, including videos. Replace matching files.
2. Keep your existing config.js, styles.css and CNAME files.
3. Reopen/refresh the app and confirm version 0.8.62.129.
Do not rerun the supplied database SQL on the live project.

WHAT CHANGED
- Saved Match Reviews keep earlier contributors separately from the current
  selected team. Changing or cancelling a selection does not erase the review.
- Preparation, My Innings and reflection can use the same shared fixture.
  Its date, opposition and format remain together. Standalone entries remain.
- Club Admin can use Correct match details, preview the affected records and
  give a reason. Existing observations retain their IDs. Published Teams
  snapshots remain unchanged until the Head deliberately republishes.
- Unfinished observations, preparation/reflection and Match Review work can
  be restored after reopening. Changed records are checked before restoration;
  uncertain saves retry the same request without creating duplicate records.
- Teams shows publication changes and explains why a player is excluded.
- Help uses shorter steps suited to the product and role. Three new actual-app
  videos cover published Teams, Batting-only match players and observation-first.
  The existing iPhone and Android installation guides remain in their sections.
- Notification routing is completed, including fallback collection when no
  phone is registered. The Guide no longer quotes unsettled public prices.
- New detailed Match Observations require deliberate answers; Mostly is no
  longer preselected.

MATCH PLAYERS
Teams clubs use published selections only. Unpublished selections show no
players. Batting-only clubs explicitly choose the players for each match.
Playing Groups only help find players. An early individual observation joins
the same fixture when the normal selection is later completed.

SAFE CORRECTIONS AND RECOVERY
Conflicting records, published predictions/results/awards and confirmed
scorecard imports can block a correction; the preview explains the reason.
Drafts are local to that browser/device, retained for up to 14 days and cleared
on sign-out/account change. Clearing browser data removes them. They are not
cross-device backups. Correction forms have navigation/retry protection but
do not yet recover their unsaved form after full browser closure.

VERIFIED
58 combined PostgreSQL checks; additional feature, notification and Guide
checks; Australian/Sydney desktop and US/Los Angeles phone-sized browser flows.
Checked original record IDs, date-only handling, permission boundaries,
selection changes, stale edits, lost-response retries and reload recovery.
New videos were fully decoded and visually reviewed.

Live checks confirm all four Newcastle City fixtures are still 10 October
2026 v Toronto Workers, unpublished, with no selected Match Review players.
Existing fixtures, observations, memberships, product access/subscriptions and
platform settings are byte-for-byte unchanged. No new security warning.

Club Batting trial: 60 days. Teams trial: 21 days. Prices remain unsettled.
Stripe remains Prototype. Newcastle City's editable ongoing free terms remain.
Guide version 40 is live. The notification worker schedule is active.

PHONE DELIVERY CHECK
Physical iPhone/Android notification receipt still needs a real-device check
after upload. Automated/server checks do not prove receipt on a phone.
No live test messages, team publication, observation save or payment was made.
Use the normal authorised message workflow and an opted-in test recipient's
phone, then check the alert opens the correct inbox message. Android hardware
was unavailable during development.

Database_Update.sql is an applied record, not a step to run. Source/tests and
the complete project handover are provided separately.
