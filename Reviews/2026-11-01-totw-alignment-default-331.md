# Team of the Week text controls and Basic default (.331)

Team/grade labels were fixed to right alignment, and the graphic assistant had no supported alignment setting. Add saved left/centre/right alignment within the existing team column, expose a compact manual selector under Adjust layout, and support the same setting in the assistant's Preview/Apply/Undo flow. Player names, figures, order, column edges and source grades stay unchanged. Older assistant clients receive their existing schema and a refresh instruction for alignment requests.

Week/round label size was also fixed at 34 pixels. Add `week_size` (20–80 pixels) to the renderer, manual controls and assistant schema. City requested a slight enlargement, 34 to 42. Keep the label wording and coordinates unchanged. A provider response that redirects the reported week-label resize to background editing is blocked before any image generation. Older clients omit the field and are asked to refresh.

Fresh Team of the Week workspaces now start in Basic, including when an older browser preference contains Smart. Smart is still available and each mode retains its separate draft while the workspace is open. Existing saved graphics are unchanged.

Newcastle City requested centre alignment; apply only `grade_align: center` and `week_size: 42` to its current saved Team of the Week layout with a revision/hash guard, retaining DBs and every other saved field. Other clubs retain their existing right-aligned appearance until changed.

Validation: 40 checks cover the final combined change across basic_totw_test, basic_totw_ui_test, team_of_week_ui_test, team_week_figure_assistant_test, team_week_reference_test, social_graphic_assistant_test, social_awards_refine_service_test and award_match_context_ui_test. The assistant regressions check overlay-only week resizing, blocked incorrect artwork handoff, actual canvas coordinates/pixels, unchanged name/figure positions and facts, Undo, Apply, reload and the manual control. Service tests cover supported/older clients and invalid alignment. AI outputs are mocked; no claim is made about general model quality.

The rebuilt shared-module demo was operated in Chrome at desktop size and in a 390 x 844 phone frame: Basic selected on opening, eleven manual picks, centred team labels and successful layout save. Both rendered graphics were visually inspected. Build consistency and whitespace checks pass. No database schema, authentication, permissions, score processing or automatic posting changes.

Deployment: refresh the club-social-style Edge Function with unchanged JWT verification and unchanged router; publish app 0.8.62.331 through the existing GitHub Pages workflow. The live signed-in City UI is not accessible in this browser, so confirm the saved City setting through the database and the deployed static files separately.
