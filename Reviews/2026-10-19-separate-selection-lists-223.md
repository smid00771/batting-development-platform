# Separate selection lists — 0.8.62.223

Keep the existing Available, not selected button and page. It lists all active players who are available on the chosen date and outside the current teams, including new and previously selected players.

Grade drops appear immediately beside the player in their team on the Selection Board, with purple/green highlights and Mark spoken to controls. Selectors and captains can record the conversation without opening a dropdown, including on locked teams. Two-day partners retain individual controls. Available but unselected players are not shown as grade drops. Coaches without draft-board access retain their existing restricted conversation access, in an open list. Saved conversation history is retained; no database change is needed.

Validation: 38 focused UI checks passed, including separate lists, current selections, access boundaries, board navigation, inline spoken-to/undo actions, locked-team controls and two-day partners. Phone layouts were rendered and visually checked for both selector and captain views: no horizontal overflow, hidden conversation actions or targets below 44px. JavaScript syntax and diff checks passed. Demo reconstruction remains parked.
