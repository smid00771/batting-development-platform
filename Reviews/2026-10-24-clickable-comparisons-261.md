# Click a comparison line — 0.8.62.261

Clicking or tapping a line on the Selection Board or Compare grades now opens that exact two-player comparison. The focused dialog shows the actual figures, grades, roles, selector fielding ratings, rough grade equivalents and the reason for discussion. A player with several links opens only the pair whose line was selected. Individual form markers still open the full player guide.

Each line is a named keyboard button, supports Enter and Space, highlights its two players on hover/focus and returns focus after Close or Escape. Its transparent 24px hit stroke is clipped to the column gap so it cannot cover player or team controls. Stacked cards hide their lines and retain the existing numbered markers. Hidden, stale and removed lines cannot open a dialog; redraws clean up listeners and overlays.

No calculations, ratings, database, permissions or team selections change. This release follows the fielding profile update in 0.8.62.260. Focused regression and delivered-demo checks cover the new mouse/keyboard paths, exact-pair behaviour, fielding context, focus restoration, no selection side effects, geometry and lifecycle. The deployed fictional review page supports desktop and 390px browser verification.
