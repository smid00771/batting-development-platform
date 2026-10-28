# Socials loading and adaptive Results layouts — 0.8.62.293

The shared app still carried about 155 KB of post-creation and image-preparation code even though the graphics dependencies were deferred. Platform award-request administration also imported the full awards editor. Results continued to display a week/selection-group subtitle absent from the reference, and the review pass could undo measured text proportions.

The remaining socials workspace now lives in an optional module, with current socials access checked before import. Instances are scoped to the account, club and current state. Duplicate opens share a download, failed downloads can retry, and late responses cannot initialise or mount a different workspace. Existing Socials Manager, temporary-cover and Club Admin fallback permissions are preserved. Platform award requests use a separate small module. Navigation and unconfirmed-save guards remain synchronous and do not load graphics.

The main app shrank from 2,095,075 to 1,943,409 bytes: 151,666 fewer source bytes, approximately 40 KB less when gzip-compressed. Optional fonts and renderer dependencies remain excluded from initial loading. This measures payload reduction, not a promised wall-clock speedup.

Results now omits the extra subtitle by default; other awards retain their week label. The underlying week, selection scope and match data stay intact. Reference matching can explicitly follow subtitle presence. The renderer reclaims its space. Complete reference matching also resets obsolete mixed-opponent top offsets; narrow spacing edits and Undo retain their previous behaviour.

A rendered review now re-fits any revised font to the measured reference ink proportions, preventing a second AI response from silently shrinking the title, names or outcome words. Name height is fitted using visible glyph metrics rather than a fixed fraction of nominal font size. Actual typeface choice still depends on the model and needs visual review.

Verification covers access gates, delayed imports, retries, state replacement, dependency graphs, shared week metadata, subtitle space, reference-size retention through review, legacy service contracts, renderer bounds, Apply/Undo, account roles, handovers, preparation, exports and the rebuilt 64-module demo. Older focused VM tests now read the moved production source; integration tests execute the real bundled modules. No club design, member record, match result or publication is modified by this release.

Final local verification: 205 passed, 0 failed across 34 test files; demo freshness and whitespace checks passed. A rendered four-row mixed-opponent proof used fictional names and the supplied lettering privately to check readable names, result/margin separation and the missing subtitle. It is a renderer proof, not a live-model accuracy claim.


Follow-up reference feedback: mixed-opponent posts now render a prominent club / VS / opponent pair above each match panel, outside the outcome and margin column. Two, three and four selected matches scale logo and row typography proportionally; extra whitespace reduces before logos do. Old 30–40px logo settings no longer produce minuscule inline crests. Existing selection-group scoping continues to decide the matches included in each post. Shared-opponent header behaviour and manual start adjustments remain supported.

Full example setup and composition matching retain recorded margins even when an older reference omitted them. Narrow requests to hide margins remain possible. Simple BY … RUNS/WICKETS margins fit one line; long or adjusted result descriptions may wrap. No margin is derived from a generated picture. Two-match result lettering is bounded by its centre column, including reused crops.

Renderer previews for two, three and four matches were inspected with fictional data; coverage includes every recorded margin, logo-to-panel separation, club identity, aspect ratios, current and older service contracts, 1080/1350px backgrounds and unchanged source match facts. The standalone generated visual mock-up omitted margins; it is not an application export or validation of live model accuracy. The application renderer retains them.
