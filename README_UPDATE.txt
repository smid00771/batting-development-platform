CLUB BATTING / TEAMS — UPDATE .144
11 October 2026 (Sydney)

START WITH START_HERE.txt

This release makes account connection a guided club flow and moves the
one-time Club Batting activation into Platform Admin > Platform Settings.

For clubs: Connect Facebook & Instagram > sign in > choose the club Page.
The linked account and permissions are checked automatically. Missing or
expired access gets a specific instruction. Facebook-only clubs can proceed.

For the Platform Owner: the setup panel supplies copy buttons for the
required addresses and links to Meta and secure settings. It verifies saved
app details without pretending Meta approval is complete.

Upload Website_Files as usual. Keep config.js, styles.css and CNAME.
New in .144: social-platform-setup.js. Include the updated social-publishing.js,
social-connect.js and social-connect.html from .143 as well.
Refresh and check version 0.8.62.144.

The team artwork and deliberate player-photo marker are unchanged.
The private publishing backend and new connection check are installed.
Do not rerun the database scripts. Website deployment is still pending.
Meta account activation, live sign-in and a real reviewed post remain pending.

VERIFIED
24 mocked server tests passed, including account expiry, partial permissions,
Facebook-only setup, connection changes, owner-only access and post recovery.
Browser checks passed for the guided flow, automatic checks, role controls,
caption recovery, one-click publishing and history. Desktop and phone layouts
were checked. The database access checks passed; no new security advisories
were reported for the added connection-check functions.

Maintenance contains the optional technical reference. It is not a club
installation guide. No real social post was sent during this work.
