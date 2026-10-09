CLUB BATTING 0.8.62.122 — SHORT HELP VIDEOS

Upload the CONTENTS of Website_Files to the existing GitHub Pages root,
including the new videos folder. Replace matching files. Keep config.js,
styles.css and CNAME. This is cumulative and includes .121, .120 and .119.

App & notifications now offers the relevant iPhone or Android setup video.
Desktop users can choose either. The clips cover installing the app, opening
its icon, Enable notifications, the phone's Allow prompt, and the final
Notifications on check. They explicitly say email notifications continue
until alerts are enabled. Each phone clip is about 42 seconds / 1.3 MB.

Help & Tutorials contains all 11 clips. Relevant screens also have Watch links:
Teams availability and selection, Workshop, Player Plan, match preparation and
predictions, training, Match Review, Coach Conversations, and club messages.
Videos load only after Watch. They have visible captions, written steps,
native full-screen controls and a download link. Total video size is 14.5 MB;
individual clips are 18–48 seconds and 0.4–2.5 MB.

All records and actions in the recordings are fictional. No messages were
sent to real members. The phone screens use fictional device APIs; actual
phone installation and the OS permission prompt are explained rather than
recorded on a physical device. Receipt of a real push remains unverified.

COMMITTEE DEMO
Unzip Committee_Demo and open index.html for the video menu. Keep videos beside
it. demo.html is the interactive fictional club and needs no account.
Allow about five minutes of playback if showing only one phone setup clip.
The demo performs no live database writes, invitations or message sends.

NOTIFICATION AUDIT — TWO FIXES STILL NEED BACKEND DEPLOYMENT
The member-message routes are app-first with phone alerts and email fallback,
except two gaps found in the audit: admin-handover confirmations to existing
members still use direct email; the worker can skip fallback collection when
there are no registered phones. The prepared migration passed 21 isolated
checks, but Supabase rejected both deployment attempts with an expired-session
error. Read-only checks confirmed that it has NOT been installed.
The Website upload adds videos but does not install these database fixes.

COMMERCIAL STATUS
Stripe account security review is in progress according to David; this session
has not verified a working payment connection. The 21-day Teams trial default,
updated promo journey, payment fulfilment, trial-end warnings and complete
read-only expiry are still outstanding. Both live trial defaults remain 60 days.
Prices are provisional. Newcastle City remains permanently free for both products.
The source backup contains the audit, prepared migration and commercial scope.
