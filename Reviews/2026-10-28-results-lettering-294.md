# Results lettering cleanup — 0.8.62.294

Reference rectangles sometimes included the top of an old winning margin or the bottom of a grade bar. Background removal retained every contrasting pixel in the rectangle, so those fragments appeared beside the copied result lettering and the current margin.

The shared extractor now isolates the dominant lettering components and their connected halo. It removes detached thin rules and neighbouring text fragments without depending on a club palette or white lettering. Background sampling tolerates a narrow grade-bar edge at the top of a crop. Extraction is bounded and cached per source image and crop, including rejected results; no model calls or background polling are added.

Both outcome crops are checked together before rendering. If either is empty or ambiguous, both words use the selected font and the existing preview status explains it. Legacy saved crops also pass through extraction; raw unverified source rectangles are no longer drawn. AI rendered review is told whether reference lettering was actually used. Saved layouts, match data, permissions and published posts are unchanged. The current recorded margin is still rendered once per match.

Regression checks use fictional graphics with contaminated margins and horizontal rules, separate light and dark lettering, ambiguous crops, missing pair members, legacy crops, cached failures and the real preview/export renderer. A private reproduction using the supplied reference demonstrates removal of both reported artifacts while retaining the lettering and halo; no user images or club data are included in the repository.

The release is frontend-only. The existing authenticated style service remains at v15. New previews and exports use the corrected extractor after refresh; an already exported or published image must be regenerated through the normal confirmation flow.

Validation covers 209 checks across 34 files. The only initial full-run failure was a hard-coded .293 startup assertion; that check now compares the HTML loader and core import to the actual app release version, and the focused rerun passed. Demo freshness and whitespace checks passed. CI must rerun the complete suite against the exact release tree.
