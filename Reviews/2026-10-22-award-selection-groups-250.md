# Award selection groups — .250 beta

Provider fixtures marked abandoned without actual figures no longer require missing-score acknowledgement. Existing figures are retained. Manual no-play choices still apply.

All five awards offer All selection groups, one or more groups, or individual grades. Choices are stored per club and award, independent of Club Batting participation. The existing week controls contain the chooser; the expanded options overlay the page. Apply reloads eligible candidates and score checks. The shared weekly label is retained, with the selected group/grade names added to scoped graphics.

Saved editions retain their selection scope. Club-wide and group/grade editions coexist in the post collection; revisions replace only the corresponding scope. Player-of-the-Week winner checks, milestone duplicate checks, score freshness and post validation use the saved scope. Post score checks use the union of the selected editions. Existing clients retain All behaviour.

Validation:

- 41 automated JavaScript checks across scope controls, shared results, shared labels, award UI/recovery, Day 1 scores, posting and saved-week navigation.
- Database transaction tests cover all five award APIs, group and individual-grade filtering, no-play handling, actual-figure retention, wrong-club rejection, empty selections, reserve retries, independent preferences, stale preference revisions, multiple saved scopes, scoped post checks, score freshness and access restrictions. All synthetic records are rolled back.
- Existing Day 1, shared results, collection, score correction and shared-label database regression suites pass with the migration. The shared-results test fixture explicitly opts into Club Batting, matching the current opt-in requirement.
- JavaScript syntax and diff whitespace checks pass. No live customer identifiers, exports or credentials are included in this change.
- The local browser binary could not be downloaded, so a new phone screenshot check was not completed. The chooser interaction is covered by DOM tests; device layout remains a beta visual check.

This is a beta fix, not public-launch approval. Existing launch blockers remain unchanged.
