# Reference matching placement and proportions — 0.8.62.292

The latest preview was closer but still had a clipped title, overly condensed player names and undersized result lettering. The action was detached from the Previous example panel that supplies its input.

Match our example now lives in Previous example, shows its matching state there and reveals the reviewed graphic when ready. The ordinary AI editor retains Preview changes, Apply and Undo. No extra routine control is added.

Full Results matching asks for bounded normalized measurements of the actual reference: title ink bounds, typical text heights, result-word width, panel placement and name alignment/columns. The service validates those fields, derives image dimensions from the saved PNG and returns only presentation metadata. The client converts measurements using the selected font's actual ink metrics before the existing rendered comparison. Font-only edits do not invoke the composition measurement path. Older clients retain their supported schema.

The renderer now supports the reference's name alignment, keeps title ink inside a safe edge and uses actual header bounds for row placement. Extracted result words trim empty crop padding. Compact mixed-opponent rows prioritise outcome lettering over the small row logos. A clearer font specimen separates heading, name and result samples so body lettering can be assessed independently.

## Verification

- Focused tests cover proportional sizing at different source resolutions, visible title bounds, aligned names and isolated figures, crop trimming/cache, panel action placement, staged measured matching, old-client schema compatibility and rejection of factual or invalid measurement fields.
- A private local visual proof uses the supplied reference lettering with fictional names to check the renderer. The reference and private player images are not committed.
- The standalone demo is rebuilt from the application. The release workflow runs the relevant graphics, permissions, preparation, demo, quiet Selection Board and startup checks and requires its source tree to equal the tested tree.

## Limits

Tests use controlled model responses. Reference measurement and font choices still depend on model interpretation and require visual review; arbitrary typefaces are not reconstructed. This release does not overwrite the club's saved layout, alter source match data or replace confirmed graphics. Baked-in background artwork remains separately reviewed.
