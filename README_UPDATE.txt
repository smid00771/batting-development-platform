CLUB BATTING 0.8.62.132 — TEAM LOADING, PUBLICATION NOTICES AND CAPTAINS

The database fixes and updated Guide are already live. Upload this cumulative
website update to see the new automatic saving and captain signup controls.

1. Unzip Club_Batting_132_Website.zip.
2. Upload everything INSIDE Website_Files to your existing GitHub Pages root,
   including videos. Replace matching files.
3. Keep your existing config.js, styles.css and CNAME.
4. Refresh/reopen the app and check version 0.8.62.132.
Do not rerun Database_Update.sql; all three migrations are already applied.

TEAM LOADING
Fixed the database read-only error behind Could not load players / Refresh team.
The live City check loads all four published teams, with all 44 selected entries
editable in Match Review, including players who have not signed up yet.

PUBLICATION MESSAGES
One notification per person for a batch of published teams. First publication
says Teams published; later changes say Teams updated. Selector wording differs
for playing and non-playing selectors. Players are told to check selection and
playing dates, or contact a selector. Notices name the grade, opposition, format
and actual playing dates, including midweek and two-day matches.
Existing messages remain in history; the change applies to future publication.

GRADES AND SEASON CAPTAINS
Existing grade/captain changes save automatically and show Saved. A grade name
saves when you leave its field; dropdown and active-grade changes save at once.
Add a captain who has not signed up by full name, with an optional email. The
appointment shows signup needed. An existing playing-list entry can be chosen.
When selected, the season captain is automatically captain in Teams. Both
products share the appointment. Verified signup/account linking attaches the
same record and captain access; a name alone does not grant account access.
Adding a new grade or a new captain still uses its explicit Add button.

All previous features and installation videos remain included. Trials remain
60 days for Club Batting and 21 days for Teams; pricing is still undecided.

Verified: 113 database checks, 12 browser scenarios and 13 isolated Guide checks.
All 23 monitored live collections retained their existing data. No test messages,
observations, appointments or publications were saved to your live club.
The website upload is still required. Source and the updated project handover
are supplied separately. The database SQL is an already-applied archive only.
