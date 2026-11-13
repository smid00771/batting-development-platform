# Mirelion 0.8.62.364 — aligned bracketed player names

Bracketed players now start at the same left edge as the rest of the team. Their connecting bracket sits in the left margin. The common roster font size introduced in .363 and the aligned week labels are retained.

For layouts with the player photo on the left, a bracketed featured player's marker moves further into the margin so it does not cross the connecting bracket. Each club continues to use its saved artwork, font and heading size.

Validation: all 15 team-reference and delivered-demo tests passed, including equal name alignment across one, two, three, five and eleven bracket pairs in the supported layouts. The rebuilt demo was visually checked at desktop and 390px phone width; `build-demo.mjs --check` and `git diff --check` passed.

Phone proof: [aligned names and brackets](assets/mirelion-364-aligned-names.jpg).

This is a browser renderer update. It adds no database migration or new startup request. Draft previews are refreshed with renderer version .364.
