# Results score and player-name centres — .332

Centred Results layouts previously calculated team-total and player-name positions separately, leaving the names offset beneath the score. Both pale sides now use a shared centre for their team total and player names. Batting and bowling figures retain separate left-aligned lanes with complete not-out markers. One measured font size still applies across all grades, and the middle result/margin area stays isolated. Left- and right-aligned layouts retain their previous geometry.

Newcastle City's saved Results layout already requests centred player names, so the renderer correction takes effect without changing club settings, background artwork, logos, source scores or saved editions. Refresh the app and recreate the Results image to use the correction.

Validation: 11 checks passed across social_results_adaptive_test, social_award_reference_test, social_awards_ui_test and social_awards_refinement_test. Coordinate checks assert that every name and its team total share the exact side centre for four grades with shared or mixed opponents. Existing coverage checks full names, one common font size, number/star alignment, spacing from margins, image saves, preview/apply/undo and unchanged match facts. Shared/mixed rendered images were inspected at desktop and phone widths; the shared-module demo was rebuilt and build consistency checked.

No schema migration, saved-style update, new assistant request, background generation, posting or permissions change is required.
