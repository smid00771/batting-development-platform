# Adaptive Results layout and reference lettering — 0.8.62.291

The reported saved layout still used Georgia, reserved the shared-opponent header after switching to different opponents, and allowed margin text into the batting figures. The previous tests did not cover this actual combination of legacy settings and neighbouring number columns.

Results now calculate header and row space from the current opponent grouping. Mixed opponents reclaim the unused header band automatically; shared opponents retain their paired header. Names, figures and margins occupy separate measured columns. Long margin text wraps and shrinks within its own area; script ink overhang is measured before clipping. Existing mixed-opponent slider adjustments and explicit AI positioning edits have a separate saved preference, so they do not move the shared-header layout.

Reference matching explicitly selects every text role instead of inheriting the previous global font. A complete matching pair of result words may reuse the actual example lettering and halo; a cached local-background removal avoids copying its panel rectangle. The pair survives the bounded rendered comparison, save and undo. Partial pairs still use one generated typeface for both words. Fonts remain supported alternatives for variable text, not arbitrary typeface reconstruction. Existing saved fonts change only through the reviewed proposal, not a direct overwrite of a club design.

No new controls, live model loops, startup font downloads, database changes, source score changes or social publishing are included. Matching still uses at most two existing style allowance units. Apply/Undo starts no model request. The existing Edge authorization and per-club scope remain intact.

## Verification

- Relevant local suite: 125 tests covered, including permissions, old clients, reference pairing, rendered preview/save/undo, actual margin boundaries, graphics recovery, preparation, all demo roles, quiet Selection Board and lazy startup. Two stale test fixtures were corrected and their checks rerun: the expected release suffix and a minimal canvas mock replaced by a real canvas.
- New renderer cases reproduce the saved Georgia layout with long names and three-digit figures, square and portrait backgrounds, multiple typefaces, large row gaps, shared and mixed opponents, DLS and innings margins. No private player data is included.
- Local visual inspection used the supplied reference privately to verify actual paired lettering extraction and a complete fictional four-row composition. The copied words match the supplied pixels; dynamic text uses the licensed supported fonts.
- `club-social-style` v12 is deployed with JWT verification enabled. Retrieved source exactly matches all four intended files; an unauthenticated POST is rejected with 401. The existing on-request provider, image inputs and allowance are unchanged.
- Demo is rebuilt deterministically from the current source. The release workflow reruns the checks and requires its generated source tree to match the locally tested tree before merge.

## Limits

Model responses in automated tests are controlled. The crop renderer and review workflow are verified; a real model must still locate the correct words in each club's uploaded image. Complex backgrounds or incomplete reference pairs may require the consistent generated-font fallback. No private signed-in browser was available for an end-to-end paid model run. Existing confirmed graphics remain immutable and must be recreated to reflect layout changes.
