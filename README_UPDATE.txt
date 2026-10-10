CLUB BATTING 0.8.62.130 — SHARED CAPTAINS AND MATCH TEAMS

The backend and Guide are already live. Upload this cumulative website update.

1. Unzip Club_Batting_130_Website.zip.
2. Upload everything INSIDE Website_Files to your existing GitHub Pages root,
   including videos. Replace matching files.
3. Keep your existing config.js, styles.css and CNAME.
4. Refresh/reopen the app and check version 0.8.62.130.
Do not rerun Database_Update.sql; it records migrations already applied.

APPOINT YOUR SEASON CAPTAINS
Club Admin: Account → Grades & season captains (also in Teams Settings).
Your existing Playing Groups are already there. Select a registered member as
each grade's season captain and Save grade & captain. The same setup serves
Batting-only, Teams-only and combined clubs. No captain has been guessed for you.
Existing separately assigned coaching permissions remain separate.

Season captains keep grade messaging/observation access when injured or absent.
If selected, they automatically become match captain. Otherwise selectors choose
a stand-in. A captain appointment does not make someone a selector or publisher.

STAND-IN ACCESS
Default: until midnight after the day following the final playing date.
Saturday → Sunday midnight; Wednesday → Thursday midnight. Two-day matches use
their last date. Club Admin can choose 1–7 days and the club time zone in shared
setup. Changes apply to current appointments. Ordinary player access continues.

CREATE A TEAM IN CLUB BATTING
Match Review → choose/create the fixture → Set match team in Club Batting.
Add players from a Playing Group, then add/remove the actual players. Choose a
stand-in captain if needed, allocate the keeper and set the final playing date.
Save match team. A group does not select anyone automatically.

This works while Teams is enabled but not yet publishing selections, as well as
for Batting-only clubs. The list uses players within your coaching edit access.
It does not fill the draft Teams selection board. If Teams later publishes the
same fixture, that published team takes over; existing observations stay attached
with their original authorship. Both captains can contribute independently.

Help, Guide and the fictional demo are updated. All earlier .129 improvements
and videos are included. Both date conventions/time zones were checked, along
with captain permissions, two-day expiry, stale saves, retry safety and the
transition from a manual list to a published team. Older tabs preserve existing
manual captain/keeper appointments when they omit those fields.

Backend: shared_season_captains_v130 and preserve_manual_match_appointments_v130.
Guide 41 is live with JWT verification. 76 integrated database checks, 10 browser
scenarios and 13 Guide checks passed. No new security warning. No live test
messages, team publication, observation save or payment was made.

Batting trial remains 60 days; Teams 21 days. Prices remain undecided.
Source, applied SQL, preview and the updated full project handover are supplied
separately. This ZIP was closed and verified before being made available.
