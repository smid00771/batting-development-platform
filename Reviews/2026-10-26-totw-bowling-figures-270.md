# Beta 0.8.62.270 — Team of the Week bowling figures

Basic's shortlist category previously forced a selected batter to show batting figures only. A performance of 47 and 2/8 therefore lost its bowling figures on the image, even though the shortlist displayed them. Basic now defaults to Both when the same performance contains at least 20 runs and a wicket, regardless of its reserved shortlist category. Rankings, role counts and the human XI remain unchanged. Existing explicit display choices and saved images are preserved.

The graphic assistant can now switch a selected player's display to recorded batting, bowling or both. “Show Dominic Wood's bowling figures also” proposes Both. The backend verifies the selected keys and available figures against the caller's current week, award scope and Day 1 setting. The model receives trusted names and available skills; its strict output permits only selected keys and display choices. It cannot supply scores, add players or reorder the XI. The existing Preview, Apply, Undo, stale-response guards and image-save checks cover these changes. A display-only approval does not save a reusable layout or publish an image.

No database schema, provider secrets, access rules or award scoring changed. The shared assistant remains compatible with Player of the Week and other social graphics. The demo includes a simulated figure-display request; it does not use live AI or club data.

## Verification

- 55 tests passed across Basic ranking, the assistant service, real-canvas editing and image saving, the delivered Basic/Smart screen, Team and Player of the Week, shared graphic editing, award scopes and recovery. Provider responses and social writes were simulated.
- The exact reported request changes the rendered text to `47 & 2/8`. Undo restores the original PNG pixels; Apply and image save retain Both. Source figures and row order stay unchanged. Missing records, unselected players, fabricated numeric fields, duplicate keys and stale responses are rejected.
- Chromium inspection at 1440px and 390px confirmed the rendered figures and assistant proposal. Phone width stayed at 390px with no horizontal overflow or browser errors. No new routine controls or page rows were added.
- App and generated demo are 0.8.62.270. Demo freshness, JavaScript syntax and whitespace checks passed.
- Supabase `club-social-style` version 8 is active. All four deployed source files match the tested bundle, JWT verification remains enabled, and an unauthenticated request returns 401. The previous function was version 7; unchanged files were verified before deployment. No real user AI request was submitted during verification.

The matching GitHub and Pages release is tracked in this change's pull request. Previously saved images require an explicit new save to include changed display choices.
