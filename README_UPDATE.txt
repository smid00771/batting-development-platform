CLUB BATTING / TEAMS — UPDATE .145
11 October 2026 (Sydney)

WHAT CHANGED
- Drag a selected player's six-dot handle to change batting position.
- The intervening slots shift along, including vacant places.
- Tap/click the handle to choose a position, or use keyboard arrows.
- Bracketed pairs move as a whole slot, keeping both days together.
- Moves use the existing draft save, revision check, retry and Undo flow.
- Edge scrolling supports long lists. Escape or dropping outside cancels.
- Captain/keeper assignments follow players; publication remains explicit.
- The demo and contextual help include the same controls.

INSTALL
Upload Website_Files as usual. Keep config.js, styles.css and CNAME.
Refresh and check version 0.8.62.145. No new files or database steps are
required for batting-order changes. The complete .144 social setup is included.
This delivery does not upload the website or publish any team.

VERIFICATION
11 local behavioural checks passed, including all 110 distinct moves in an
11-slot team, sparse lists, bracket pairs, role preservation, permissions,
Undo, revision conflicts, offline retries and a lost response after saving.
App and demo code match for ordering, rendering and saving; syntax checks pass.
The existing live save endpoint was inspected read-only to confirm its atomic
save, revision guard and separate publishing behaviour.

The browser interaction suite is included but NOT RUN successfully: Chromium
was unavailable, its download was inaccessible, and the cloud browser could
not reach the local preview. Mouse/touch behaviour and visual layout still
need a browser check. Earlier social-release test results are historical.
No live club data was changed by these tests.

See START_HERE.txt for the short usage guide and Tests/README.txt for checks.
