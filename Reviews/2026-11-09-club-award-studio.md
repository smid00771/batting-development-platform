# Club award studio — .354

Social Graphics → Create posts → Club award setup collects preferred team labels and optional shared text colour/fonts. It flags conflicting saved labels instead of choosing one. City’s MASTERS/MSTRs conflict is intentionally left for the club; existing layouts and image files were not rewritten.

All five awards have direct element controls, immediate canvas previews, local undo and Save club template. A saved previous example enables side-by-side and opacity-overlay comparison. Current match data remains authoritative. New saved designs and preferences retain version history, with revision-checked restore. Existing designs are the initial history entries; earlier versions cannot be reconstructed.

Team and Player of the Week now support independent font roles and text sizes. Match previous example measures reference text/positions, renders a proposal and makes at most one further comparison request before the user applies it. Results retains its measured reference workflow; Century and Five wickets retain rendered proposal comparison. Six supported fonts are available. Unsupported exact fonts/artwork details remain explicit limitations; this is not a guarantee of a pixel-identical match to arbitrary examples. Background/image editing remains in the existing in-app artwork editor.

Validation:
- Focused graphics, server protocol, rendering, recovery, navigation and demo-role suites passed, followed by relevant checks after final corrections.
- New database test ran as the actual `authenticated` role, with synthetic records rolled back. It covers all five saves/restores, canonical preferences, idempotent retries, stale revisions, private-table protection, cross-club access and immutable source team names.
- Actual rebuilt demo checked on desktop and at 390px phone width: preferences, direct adjustment and template save succeeded.
- Tests render proposal pixels and verify the comparison request receives them. No paid live AI request was made for QA.
- New private tables deliberately have no direct-access RLS policies; access is through authenticated, club-authorised RPCs. Existing unrelated health advisories predate this migration.
