CLUB BATTING 0.8.62.127 — FIXTURE TO PLAYER OBSERVATION

THE DATABASE UPDATE HAS ALREADY BEEN APPLIED AND VERIFIED.
Only the website upload below remains. This package includes the .126 fixture
fix and all earlier .125, .124 and .123 website changes. Use this package instead
of .126. Do not run either database update again on the live project.

UPLOAD
1. Unzip Website_Files. Upload everything INSIDE that folder to the existing
   GitHub Pages root, including the videos folder. Replace matching files.
   Keep the existing config.js, styles.css and CNAME files.
2. Refresh/reopen the app and confirm version 0.8.62.127.
3. In Match Review, choose the fixture and click a player's name or Add observation.
   Save the observation to return to the match and choose another player.

WHAT CHANGED
- Fixtures are available before choosing a grade. Selecting one fills its grade,
  date, opposition and format. Those details remain together throughout the review.
- Clicking a player opens the full observation form with the match already filled
  in. A player does not need a prior innings record or quick review to open it.
- Dismissal choices become available after the match is loaded. Tomorrow's date
  does not disable them. A new form no longer silently substitutes today's date.
- Saving returns to the same fixture. Reopening edits the same observation and
  player innings; individual notes and observation IDs are retained.
- A save whose response is lost can be retried safely. The form stays protected
  until that save is confirmed, avoiding a second observation or fixture.
- If an observation/review comes first for a named Playing Group, its ordinary
  draft fixture waits in Teams for the normal selection process. It has empty
  selection slots and does not require a separate selection round.
- All players / Unassigned reviews do not invent a team fixture. Use a named
  Playing Group to share the fixture with Teams.
- Existing individual innings are matched by exact date, format, opposition
  (ignoring case and extra spaces), and innings number. Different abbreviations
  are not guessed; ambiguous innings require selection.
- Once linked, a fixture's grade, start date, format and opposition cannot be
  changed independently. Venue, time and selections remain editable. Correcting
  a genuinely mistaken linked identity needs a coordinated correction; this
  release does not add a general fixture-correction screen.

VERIFIED
22 isolated PostgreSQL checks; 60 selection integration checks; actual Chromium
checks at Australian/Sydney desktop and US/Los Angeles phone-sized settings.
Checks include save/return, edit in place, lost-response retry, reverse fixture
creation, locked identity, and no page overflow. The old quick-review flow also
passes. Screenshots use fictional players. No physical-phone or live observation
save test was performed.

The combined database migration succeeded: shared_fixtures_and_player_observations_v127,
version 20261009085203. Read-only verification confirms all four Newcastle City
fixtures remain 10 October 2026 v Toronto Workers, with their complete fixture
records and selections unchanged. No new security warning was introduced.

All 33 videos are unchanged. Pricing, Stripe payment mode, existing product
trials and Newcastle City's free terms were not changed by this release.
The unrelated .122 notification migration remains outstanding.

The Database_Update.sql is a record of what was applied, not another install
step. Source, tests, release notes and the complete project handover are included
in the accompanying source package/files.
