# Results reference alignment — 0.8.62.327

Player names and figures were spread across oversized columns, short lists stretched vertically, and right-aligning an entire score such as `58*` shifted its digits. The user supplied the original Results example and explicitly clarified that every figure must start at the same left edge.

The renderer uses one measured figure column across the selected grades, aligns both batting and bowling figures on their left edge, and places each not-out marker immediately after its number. Centred names use a compact adjacent column. Line spacing follows the body type size; reference templates can retain their saved panel gaps without an oversized minimum panel height. Score headings follow the centred reference composition.

The requested club design uses centred names, the supported sans body type at the measured reference size, and compact score/body positions. Its image paths, branding, result lettering, match facts and confirmed graphics are preserved. No new AI request, background download, network polling or database schema change is introduced.

Validation covers two- and three-digit scores with and without an asterisk, shared anchors across four grades, distinct name/figure/margin bounds, compact line spacing, the unchanged source facts, existing shared/mixed-opponent layouts and reference rendering. A private visual comparison uses the supplied reference and fictional match data. The downloadable demo is rebuilt from the same renderer and checked on desktop and phone.

Existing confirmed images remain unchanged. Recreate a Results image after refreshing the app to use this layout.
