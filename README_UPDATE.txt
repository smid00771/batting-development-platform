CLUB BATTING / TEAMS — UPDATE .143
10 October 2026

REVIEW, THEN POST TO FACEBOOK & INSTAGRAM
Choose published team graphics, review the exact images and caption,
select the club accounts, then click Post once. There is no second
confirmation screen. Each destination has its own result and history.

Club Admins connect the Facebook Page and linked Instagram professional
account once. Existing authorised socials managers can review and post.
PNG downloads and the .142 artwork improvements are retained.

INSTALL THE WEBSITE
1. Unzip Club_Batting_143_Website.zip.
2. Upload the contents of Website_Files to the usual website folder,
   keeping the assets and videos subfolders.
3. Keep the existing config.js, styles.css and CNAME; they are excluded.
4. Refresh and check version 0.8.62.143.
5. Open Teams & availability > Social graphics.

IMPORTANT: INCLUDE THESE THREE NEW FILES
social-publishing.js
social-connect.html
social-connect.js

BACKEND STATUS
The database changes and club-social-publish Edge Function are already
installed in the existing Club Batting Supabase project. The private image
bucket and background runner are installed too. Do not rerun the SQL files.
The Database and supabase folders are reference/source files, not website
uploads. Only upload Website_Files to the website.

META SETUP STILL REQUIRED
META_SETUP.txt has the exact account setup, callback URLs and server secret
names. The platform needs its Meta app configured before clubs can connect.
This release has NOT been uploaded to the website by this delivery.
No real Meta account has been connected and no real post has been sent.

BEHAVIOUR
- Review up to ten JPEG images in order; edit the shared caption.
- One click approves the exact images, caption and destinations.
- Saved requests continue in the background if the browser closes.
- Retry only destinations confirmed not to have posted.
- An unconfirmed result asks the user to check the account; it is not
  automatically posted again.
- Refreshing artwork invalidates an old review before it can be posted.
- The public demo is preview only and cannot post to real accounts.

CHECKED
13 mocked server tests passed, covering encryption, request authentication,
image integrity, duplicate prevention, uncertain sends and partial failures.
Database transaction tests passed and were rolled back. They covered club
permissions, private storage, repeated approvals, worker ownership, stale
artwork and retry behaviour. No test posts remain.
Browser checks passed at desktop and phone widths: review rendering,
caption preservation, repeated clicks, partial results and posting history.
No JavaScript page errors, unexpected external requests or horizontal
page overflow were found in those checks.
Live Meta OAuth and publishing remain to be tested after app setup.
