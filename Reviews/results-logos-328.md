# Results header logos · .328

The shared-opponent Results header used undersized, closely spaced badges, and City's saved club logo had a white square. Match the supplied previous example with a transparent City badge and the same visible size, height and spacing for both crests.

- Fit visible alpha bounds without stretching either badge. Cache the bounded scan; unreadable sources retain their original proportions.
- Use a badge-width gap around the shared header's VS and the grade-heading font for VS. Keep mixed-opponent row spacing and all match facts intact.
- Allow a prepared same-origin image per saved design. Private uploads take priority; Replace and Use saved club logo clear the prepared selection. Arbitrary URLs and path traversal are rejected.
- City's requested Results settings: logo_size 14, logo_x 49, logo_y 14.5, logo_asset social-assets/newcastle-city-results-328.webp. The brand logo for other screens is unchanged. Apply the revision-checked settings after the runtime and image are live.
- The image is loaded only when its Results design is opened; it adds no startup request or AI call. Existing confirmed graphics are immutable.

Validation: 74 tests passed across Results geometry/outcomes/wording, artwork upload/reset/recovery, reference matching, and delivered demo navigation/roles. The native renderer was compared against the supplied 640 × 800 reference. At that scale the two badges occupy approximately 88 px, centred at x 228/404 and y 147. The actual rebuilt demo was checked in Chrome on desktop and inside a 390 px phone frame; the preview and controls fit. Demo freshness and git diff whitespace checks passed.

The demo uses fictional names and placeholder/missing logos. The private native check uses the prepared City image and placeholder opponent. Production retains the opponent loaded from the current scorecards; the reference opponent is never substituted.

Asset provenance: built-in image generation edited the supplied City badge using the user's previous Results example as the visual reference. Prompt: remove the white backing, preserve the red cricket ball, three white sabres, navy-outlined blue wordmark and all lettering; make the outer club lettering light sky blue for the dark background; output only the complete badge with transparent alpha, without poster elements or other club artwork. The generated PNG was encoded as a 512 × 496 lossless WebP (134,710 bytes) for on-demand delivery.
