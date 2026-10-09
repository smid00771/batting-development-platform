CLUB BATTING 0.8.62.128 — THE PLAYERS FOR THIS MATCH

THE DATABASE UPDATE HAS ALREADY BEEN APPLIED AND VERIFIED.
Only the website upload remains. This cumulative package replaces .127 and
includes the earlier fixture/date fixes, phone videos and product trial changes.
Do not rerun the database SQL on the live project.

UPLOAD
1. Unzip Website_Files. Upload everything INSIDE that folder to the existing
   GitHub Pages root, including the videos folder. Replace matching files.
   Keep the existing config.js, styles.css and CNAME files.
2. Refresh/reopen the app and confirm version 0.8.62.128.

MATCH PLAYERS
- A club using Teams gets its match players ONLY from the published selection
  for that fixture. Before publication it shows Team not finalised with no
  player rows. Draft edits stay out of Match Review until republished.
- A Club Batting-only club chooses the fixture (or enters its grade, date,
  format and opposition), opens Choose players for this match, ticks the
  actual players and clicks Save match players. This is a simple match list,
  without a Teams availability/selection workflow or a Teams subscription.
- Playing Groups and name search help find names. They never select anyone.
- Click a listed player to enter their full observation, or use the quick
  review choices. Scores can only be mapped to the match's selected players.
- Where a published Teams player is not linked to an active Club Batting
  account, their name is shown with an explanation instead of guessing a link.
- A two-day published fixture includes both days' selected players once each,
  labelled by playing day.

OBSERVATION FIRST
From Players, open an individual Match Observation. Choose its fixture, or
choose its grade and enter the match details. Saving creates/reuses the same
match but DOES NOT select that player. Teams can later complete its ordinary
selection on that fixture. A Club Batting-only coach can later save the match
player list. The original observation and innings remain the same records.
The first fixture keeps its date, opposition, format and grade together.
Existing unlinked individual innings can still be edited without inventing a
team. Different opposition abbreviations are not guessed.

SAVING AND CHANGING PLAYERS
Refresh team loads a newly published or changed match list. If someone changes
the list while you are editing, stale changes stop for review. Earlier saved
observations remain in the individual player's record if they leave the list.
Lost-response retries confirm the same save without creating duplicates.
Historical Teams publications remain the source if Teams access later ends.
If a Batting-only club enables Teams, publication supplies the team from then
on; its earlier observations and shared fixture are preserved.

VERIFIED
45 isolated PostgreSQL checks and Chromium checks in Australian/Sydney desktop
and US/Los Angeles phone-sized settings. Covered unpublished teams, availability,
published/draft separation, republication, explicit manual choice, search-only
groups, stale edits, permissions, earlier observations and safe retries.
No physical Android/iPhone test or live observation save was performed.

Live migration: 20261009095149 / published_and_manual_match_players_v128.
Read-only live checks confirm all four Newcastle City fixtures are still
10 October 2026 v Toronto Workers, unpublished, with no selected Match Review
players. Complete fixture records, memberships, Teams access and existing
observation counts were unchanged. No new security warning was introduced.
The two affected Help topics are updated; Guide function remains version 39.

All 33 media files are unchanged. Prices remain unsettled; Stripe payment mode
and Newcastle City's editable free terms are unchanged. Club Batting's trial
is 60 days and Teams' trial is 21 days. The unrelated .122 notification SQL
remains outstanding.

Database_Update.sql records what was already applied. Source/tests and the
complete project handover are supplied separately.
